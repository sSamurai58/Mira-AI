/**
 * Voice BG learn level A: capture ElevenLabs text↔audio pairs,
 * keep durable corpus on the owner machine, rebuild unit-stitch pack.
 *
 * Clients enqueue outbound pairs; owner ingests + trains (no heavy train on clients).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../appPaths";
import {
  addCustomPhrase,
  createVoiceProject,
  getVoiceProject,
  importClipBytes,
  listClips,
  listPhrases,
  listVoiceProjects,
  trainVoiceModel,
} from "../voiceStudio/studio";
import { openStore } from "../store";

const META_NAME = "meta.json";
const PROJECT_NAME = "Mira BG Learn (EL → stitch)";
const OUTBOUND_DIR = "outbound";
const REBUILD_EVERY_NEW = 5;
const MIN_TEXT_CHARS = 8;
const MAX_QUEUE_FILES = 400;

type BgMeta = {
  version: 1;
  projectId: string;
  ownerMode: boolean;
  pendingSinceRebuild: number;
  lastRebuildAt: string | null;
  lastError: string | null;
  pairsIngested: number;
  pairsQueued: number;
  rebuilds: number;
};

type OutboundPairMeta = {
  id: string;
  text: string;
  voiceId: string;
  modelId: string;
  mimeType: string;
  bytes: number;
  createdAt: string;
  deviceId: string;
  audioFile: string;
};

let rebuildRunning = false;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

function bgRoot(...parts: string[]): string {
  const base = dataRoot("voice-bg-learn");
  fs.mkdirSync(base, { recursive: true });
  if (!parts.length) return base;
  const full = path.join(base, ...parts);
  fs.mkdirSync(full, { recursive: true });
  return full;
}

function metaPath(): string {
  return path.join(bgRoot(), META_NAME);
}

function readMeta(): BgMeta | null {
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath(), "utf8")) as BgMeta;
    if (raw?.version === 1 && raw.projectId) return raw;
  } catch {
    /* miss */
  }
  return null;
}

function writeMeta(meta: BgMeta): void {
  fs.mkdirSync(bgRoot(), { recursive: true });
  fs.writeFileSync(metaPath(), JSON.stringify(meta, null, 2), "utf8");
}

function deviceId(): string {
  const p = path.join(bgRoot(), "device-id.txt");
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  } catch {
    /* */
  }
  const id = crypto.randomUUID();
  fs.mkdirSync(bgRoot(), { recursive: true });
  fs.writeFileSync(p, id, "utf8");
  return id;
}

function ensureProject(meta: BgMeta | null): BgMeta {
  if (meta?.projectId && getVoiceProject(meta.projectId)) {
    return meta;
  }
  const existing = listVoiceProjects().find((p) => p.name === PROJECT_NAME);
  const project =
    existing ??
    createVoiceProject({
      name: PROJECT_NAME,
      lang: "ru-RU",
    });
  const next: BgMeta = {
    version: 1,
    projectId: project.id,
    ownerMode: meta?.ownerMode ?? true,
    pendingSinceRebuild: meta?.pendingSinceRebuild ?? 0,
    lastRebuildAt: meta?.lastRebuildAt ?? null,
    lastError: null,
    pairsIngested: meta?.pairsIngested ?? 0,
    pairsQueued: meta?.pairsQueued ?? 0,
    rebuilds: meta?.rebuilds ?? 0,
  };
  writeMeta(next);
  return next;
}

function forceAcceptClip(clipId: string, note: string): void {
  openStore()
    .prepare(
      `UPDATE voice_clips SET accepted = 1, qa_json = ? WHERE id = ?`,
    )
    .run(
      JSON.stringify({
        accepted: true,
        source: "elevenlabs-teacher",
        note,
        hardIssues: [],
        warnings: [],
      }),
      clipId,
    );
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function outboundDir(): string {
  const dir = bgRoot(OUTBOUND_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeOutbound(opts: {
  text: string;
  voiceId: string;
  modelId: string;
  mimeType: string;
  buf: Buffer;
}): OutboundPairMeta {
  const id = crypto.randomUUID();
  const ext = opts.mimeType.includes("wav") ? "wav" : "mp3";
  const audioFile = `${id}.${ext}`;
  const meta: OutboundPairMeta = {
    id,
    text: opts.text,
    voiceId: opts.voiceId,
    modelId: opts.modelId,
    mimeType: opts.mimeType,
    bytes: opts.buf.byteLength,
    createdAt: new Date().toISOString(),
    deviceId: deviceId(),
    audioFile,
  };
  const dir = outboundDir();
  fs.writeFileSync(path.join(dir, audioFile), opts.buf);
  fs.writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  // Cap queue size (oldest first).
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      f,
      at: fs.statSync(path.join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => a.at - b.at);
  while (files.length > MAX_QUEUE_FILES) {
    const drop = files.shift();
    if (!drop) break;
    try {
      const m = JSON.parse(
        fs.readFileSync(path.join(dir, drop.f), "utf8"),
      ) as OutboundPairMeta;
      fs.unlinkSync(path.join(dir, drop.f));
      fs.unlinkSync(path.join(dir, m.audioFile));
    } catch {
      try {
        fs.unlinkSync(path.join(dir, drop.f));
      } catch {
        /* */
      }
    }
  }
  return meta;
}

function ingestPairToCorpus(opts: {
  projectId: string;
  text: string;
  buf: Buffer;
  fileName: string;
}): { ok: boolean; detail: string } {
  const text = normalizeText(opts.text);
  if (text.length < MIN_TEXT_CHARS) {
    return { ok: false, detail: "text too short" };
  }
  const phrases = listPhrases(opts.projectId);
  const existing = phrases.find((p) => normalizeText(p.text) === text);
  if (existing) {
    const clips = listClips(opts.projectId).filter(
      (c) => c.phrase_id === existing.id && c.accepted === 1,
    );
    if (clips.length > 0) {
      return { ok: false, detail: "duplicate phrase already accepted" };
    }
    const { clip } = importClipBytes({
      projectId: opts.projectId,
      bytes: opts.buf,
      fileName: opts.fileName,
      phraseId: existing.id,
    });
    forceAcceptClip(clip.id, "EL teacher pair for unit-stitch A");
    return { ok: true, detail: clip.id };
  }
  let phraseId: string;
  try {
    phraseId = addCustomPhrase(opts.projectId, text).id;
  } catch {
    const again = listPhrases(opts.projectId).find(
      (p) => normalizeText(p.text) === text,
    );
    if (!again) return { ok: false, detail: "phrase insert failed" };
    phraseId = again.id;
  }
  const { clip } = importClipBytes({
    projectId: opts.projectId,
    bytes: opts.buf,
    fileName: opts.fileName,
    phraseId,
  });
  forceAcceptClip(clip.id, "EL teacher pair for unit-stitch A");
  return { ok: true, detail: clip.id };
}

export function getBgLearnStatus(): {
  ownerMode: boolean;
  projectId: string | null;
  pendingSinceRebuild: number;
  lastRebuildAt: string | null;
  lastError: string | null;
  pairsIngested: number;
  pairsQueued: number;
  rebuilds: number;
  outboundCount: number;
  phraseCount: number;
  acceptedClips: number;
  rebuildRunning: boolean;
} {
  const meta = ensureProject(readMeta());
  let outboundCount = 0;
  try {
    outboundCount = fs
      .readdirSync(outboundDir())
      .filter((f) => f.endsWith(".json")).length;
  } catch {
    outboundCount = 0;
  }
  const clips = meta.projectId ? listClips(meta.projectId) : [];
  const phrases = meta.projectId ? listPhrases(meta.projectId) : [];
  return {
    ownerMode: meta.ownerMode,
    projectId: meta.projectId,
    pendingSinceRebuild: meta.pendingSinceRebuild,
    lastRebuildAt: meta.lastRebuildAt,
    lastError: meta.lastError,
    pairsIngested: meta.pairsIngested,
    pairsQueued: meta.pairsQueued,
    rebuilds: meta.rebuilds,
    outboundCount,
    phraseCount: phrases.length,
    acceptedClips: clips.filter((c) => c.accepted === 1).length,
    rebuildRunning,
  };
}

export function setBgLearnOwnerMode(ownerMode: boolean): ReturnType<
  typeof getBgLearnStatus
> {
  const meta = ensureProject(readMeta());
  meta.ownerMode = Boolean(ownerMode);
  writeMeta(meta);
  return getBgLearnStatus();
}

/** Called after successful ElevenLabs synthesize (main process). */
export function captureElevenLabsPair(opts: {
  text: string;
  voiceId: string;
  modelId: string;
  mimeType: string;
  audio: Buffer;
}): { queued: boolean; ingested: boolean; detail: string } {
  const text = normalizeText(opts.text);
  if (text.length < MIN_TEXT_CHARS || opts.audio.byteLength < 256) {
    return { queued: false, ingested: false, detail: "skip short" };
  }
  const meta = ensureProject(readMeta());
  const outbound = writeOutbound({
    text,
    voiceId: opts.voiceId,
    modelId: opts.modelId,
    mimeType: opts.mimeType,
    buf: opts.audio,
  });
  meta.pairsQueued += 1;
  writeMeta(meta);

  if (!meta.ownerMode) {
    return {
      queued: true,
      ingested: false,
      detail: "queued for owner sync",
    };
  }

  const ingested = ingestPairToCorpus({
    projectId: meta.projectId,
    text,
    buf: opts.audio,
    fileName: outbound.audioFile,
  });
  if (ingested.ok) {
    meta.pairsIngested += 1;
    meta.pendingSinceRebuild += 1;
    writeMeta(meta);
    scheduleRebuildIfNeeded();
  }
  return {
    queued: true,
    ingested: ingested.ok,
    detail: ingested.detail,
  };
}

/** Owner: pull outbound queue into corpus (local folder = sync sink for v1). */
export function ingestOutboundQueue(): {
  ingested: number;
  skipped: number;
  detail: string;
} {
  const meta = ensureProject(readMeta());
  if (!meta.ownerMode) {
    return { ingested: 0, skipped: 0, detail: "ownerMode off" };
  }
  const dir = outboundDir();
  let ingested = 0;
  let skipped = 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    try {
      const m = JSON.parse(
        fs.readFileSync(path.join(dir, f), "utf8"),
      ) as OutboundPairMeta;
      const audioPath = path.join(dir, m.audioFile);
      if (!fs.existsSync(audioPath)) {
        skipped += 1;
        continue;
      }
      const buf = fs.readFileSync(audioPath);
      const res = ingestPairToCorpus({
        projectId: meta.projectId,
        text: m.text,
        buf,
        fileName: m.audioFile,
      });
      if (res.ok) {
        ingested += 1;
        meta.pairsIngested += 1;
        meta.pendingSinceRebuild += 1;
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  writeMeta(meta);
  if (ingested > 0) scheduleRebuildIfNeeded();
  return {
    ingested,
    skipped,
    detail: `ingested ${ingested}, skipped ${skipped}`,
  };
}

function scheduleRebuildIfNeeded(): void {
  const meta = readMeta();
  if (!meta || !meta.ownerMode) return;
  if (meta.pendingSinceRebuild < REBUILD_EVERY_NEW) return;
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    void rebuildBgStitchPack().catch(() => undefined);
  }, 2500);
}

export async function rebuildBgStitchPack(): Promise<{
  ok: boolean;
  detail: string;
  report?: unknown;
}> {
  if (rebuildRunning) {
    return { ok: false, detail: "rebuild already running" };
  }
  const meta = ensureProject(readMeta());
  if (!meta.ownerMode) {
    return { ok: false, detail: "ownerMode off — train only on owner machine" };
  }
  rebuildRunning = true;
  try {
    const result = await trainVoiceModel(meta.projectId);
    meta.lastRebuildAt = new Date().toISOString();
    meta.pendingSinceRebuild = 0;
    meta.rebuilds += 1;
    meta.lastError = result.report.ok ? null : result.report.detail;
    writeMeta(meta);
    return {
      ok: result.report.ok,
      detail: result.report.detail,
      report: result.report,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    meta.lastError = detail;
    writeMeta(meta);
    return { ok: false, detail };
  } finally {
    rebuildRunning = false;
  }
}
