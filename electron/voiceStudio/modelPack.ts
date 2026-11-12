/**
 * Local voice model pack (mira-voice-pack-v1).
 *
 * Training builds phrase units + word/fragment slices + a lexicon index so
 * runtime TTS can stitch novel replies from trained units instead of only
 * replaying exact phrases.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const VOICE_PACK_ENGINE = "mira-voice-pack-v1";

export type VoicePackUnitKind = "phrase" | "word" | "fragment";

export type VoicePackUnit = {
  id: string;
  kind: VoicePackUnitKind;
  text: string;
  file: string;
  sourcePhraseId: string;
  sourceClipId: string;
  startMs: number;
  endMs: number;
  /** Normalized key for lexicon lookup (words only). */
  key?: string;
};

export type VoicePackLexiconEntry = {
  unitId: string;
  file: string;
  text: string;
  startMs: number;
  endMs: number;
  sourcePhraseId: string;
};

export type VoiceModelPack = {
  version: 1;
  engine: typeof VOICE_PACK_ENGINE;
  projectId: string;
  voiceId: string;
  lang: string;
  name: string;
  trainedAt: string;
  quality: "draft" | "medium" | "high";
  phraseCount: number;
  linkedAccepted: number;
  coveragePct: number;
  wordUnitCount: number;
  fragmentUnitCount: number;
  units: VoicePackUnit[];
  /** word-key → candidate units (prefer shorter/cleaner later). */
  lexicon: Record<string, VoicePackLexiconEntry[]>;
  phrases: Array<{
    id: string;
    text: string;
    clipPath: string;
    unitId: string;
  }>;
};

export type TrainProgressEvent = {
  projectId: string;
  step:
    | "validate"
    | "segment"
    | "lexicon"
    | "pack"
    | "publish"
    | "done"
    | "error";
  pct: number;
  label: string;
  detail?: string;
};

export function normalizeLexKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/** Split phrase text into speakable tokens (words). */
export function tokenizeSpeechWords(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[«»„"'(（\[]+|[»„"'.,!?;:…)）\]]+$/g, ""))
    .filter((t) => t.length > 0);
}

type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
  durationMs: number;
};

function readUInt16LE(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

function readUInt32LE(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}

/** Parse PCM WAV header; returns null if not a supported PCM wav. */
export function parseWavInfo(filePath: string): WavInfo | null {
  let buf: Buffer;
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const header = Buffer.alloc(12);
      if (fs.readSync(fd, header, 0, 12, 0) < 12) return null;
      if (header.toString("ascii", 0, 4) !== "RIFF") return null;
      if (header.toString("ascii", 8, 12) !== "WAVE") return null;
      // Read up to 256KB header region for chunk walk.
      const probe = Buffer.alloc(Math.min(262144, fs.fstatSync(fd).size));
      fs.readSync(fd, probe, 0, probe.length, 0);
      buf = probe;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = readUInt32LE(buf, offset + 4);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= buf.length) {
      const format = readUInt16LE(buf, body);
      channels = readUInt16LE(buf, body + 2);
      sampleRate = readUInt32LE(buf, body + 4);
      bitsPerSample = readUInt16LE(buf, body + 14);
      if (format !== 1) return null; // PCM only
    } else if (id === "data") {
      dataOffset = body;
      dataSize = size;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!sampleRate || !channels || !bitsPerSample || dataOffset < 0) return null;
  const bytesPerSample = (bitsPerSample / 8) * channels;
  if (bytesPerSample <= 0) return null;
  const durationMs = (dataSize / bytesPerSample / sampleRate) * 1000;
  return {
    sampleRate,
    channels,
    bitsPerSample,
    dataOffset,
    dataSize,
    durationMs,
  };
}

function writePcmWav(
  outPath: string,
  pcm: Buffer,
  info: Pick<WavInfo, "sampleRate" | "channels" | "bitsPerSample">,
): void {
  const dataSize = pcm.length;
  const byteRate =
    (info.sampleRate * info.channels * info.bitsPerSample) / 8;
  const blockAlign = (info.channels * info.bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(info.channels, 22);
  header.writeUInt32LE(info.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(info.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(outPath, Buffer.concat([header, pcm]));
}

/**
 * Slice a PCM WAV by millisecond range into a new WAV file.
 * Returns false if source is not slicable PCM (caller should fall back).
 */
export function sliceWavToFile(
  srcPath: string,
  outPath: string,
  startMs: number,
  endMs: number,
): boolean {
  const info = parseWavInfo(srcPath);
  if (!info) return false;
  const bytesPerSample = (info.bitsPerSample / 8) * info.channels;
  const startByte =
    Math.floor((startMs / 1000) * info.sampleRate) * bytesPerSample;
  const endByte =
    Math.ceil((endMs / 1000) * info.sampleRate) * bytesPerSample;
  const clampedStart = Math.max(0, Math.min(info.dataSize, startByte));
  const clampedEnd = Math.max(
    clampedStart,
    Math.min(info.dataSize, endByte),
  );
  const length = clampedEnd - clampedStart;
  if (length <= 0) return false;
  const fd = fs.openSync(srcPath, "r");
  try {
    const pcm = Buffer.alloc(length);
    fs.readSync(fd, pcm, 0, length, info.dataOffset + clampedStart);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    writePcmWav(outPath, pcm, info);
    return true;
  } finally {
    fs.closeSync(fd);
  }
}

export function estimateClipDurationMs(filePath: string): number {
  const wav = parseWavInfo(filePath);
  if (wav) return Math.max(80, wav.durationMs);
  try {
    const size = fs.statSync(filePath).size;
    // Compressed speech heuristic ~16 kB/s
    return Math.max(200, (size / 16000) * 1000);
  } catch {
    return 800;
  }
}

export type LinkedTrainClip = {
  clipId: string;
  phraseId: string;
  phraseText: string;
  filePath: string;
};

/**
 * Build a model pack directory: phrase units, word/fragment slices, lexicon.
 * Work scales with linked clips × words (real file IO + CPU).
 */
export function buildVoiceModelPack(opts: {
  packDir: string;
  projectId: string;
  voiceId: string;
  name: string;
  lang: string;
  quality: "draft" | "medium" | "high";
  linkedAccepted: number;
  phraseCount: number;
  coveragePct: number;
  clips: LinkedTrainClip[];
  onProgress?: (pct: number, label: string) => void;
}): VoiceModelPack {
  const stamp = new Date().toISOString();
  const unitsDir = path.join(opts.packDir, "units");
  fs.mkdirSync(unitsDir, { recursive: true });

  // Clear previous pack units so retrain is clean.
  for (const name of fs.readdirSync(unitsDir)) {
    try {
      fs.unlinkSync(path.join(unitsDir, name));
    } catch {
      /* ignore */
    }
  }

  const units: VoicePackUnit[] = [];
  const phrases: VoiceModelPack["phrases"] = [];
  const lexicon: Record<string, VoicePackLexiconEntry[]> = {};
  const total = Math.max(1, opts.clips.length);

  opts.clips.forEach((clip, idx) => {
    const durationMs = estimateClipDurationMs(clip.filePath);
    const words = tokenizeSpeechWords(clip.phraseText);
    const phraseUnitId = `phrase-${clip.phraseId.slice(0, 8)}-${idx}`;
    // Copy / link full phrase audio into pack for stable runtime paths.
    const phraseExt = path.extname(clip.filePath) || ".wav";
    const phraseFile = path.join(unitsDir, `${phraseUnitId}${phraseExt}`);
    try {
      fs.copyFileSync(clip.filePath, phraseFile);
    } catch {
      // Fall back to original path reference if copy fails.
    }
    const phrasePath = fs.existsSync(phraseFile) ? phraseFile : clip.filePath;

    units.push({
      id: phraseUnitId,
      kind: "phrase",
      text: clip.phraseText,
      file: phrasePath,
      sourcePhraseId: clip.phraseId,
      sourceClipId: clip.clipId,
      startMs: 0,
      endMs: durationMs,
    });
    phrases.push({
      id: clip.phraseId,
      text: clip.phraseText,
      clipPath: phrasePath,
      unitId: phraseUnitId,
    });

    if (words.length === 0) {
      opts.onProgress?.(
        Math.round(((idx + 1) / total) * 100),
        `Сегментация ${idx + 1}/${total}`,
      );
      return;
    }

    // Equal-time forced alignment proxy (no neural aligner in-app yet).
    const padMs = Math.min(40, durationMs * 0.04);
    const usable = Math.max(80, durationMs - padMs * 2);
    const slot = usable / words.length;

    words.forEach((word, wIdx) => {
      const startMs = padMs + slot * wIdx;
      const endMs = padMs + slot * (wIdx + 1);
      const key = normalizeLexKey(word);
      if (!key) return;

      const unitId = `w-${clip.phraseId.slice(0, 6)}-${wIdx}-${crypto
        .createHash("sha1")
        .update(`${clip.clipId}:${wIdx}:${key}`)
        .digest("hex")
        .slice(0, 10)}`;
      const outFile = path.join(unitsDir, `${unitId}.wav`);
      let file = phrasePath;
      let kind: VoicePackUnitKind = "word";

      if (sliceWavToFile(clip.filePath, outFile, startMs, endMs)) {
        file = outFile;
      } else {
        // Non-WAV (webm/mp3): keep phrase file + time metadata; still index word.
        kind = "fragment";
        file = phrasePath;
      }

      const unit: VoicePackUnit = {
        id: unitId,
        kind,
        text: word,
        file,
        sourcePhraseId: clip.phraseId,
        sourceClipId: clip.clipId,
        startMs,
        endMs,
        key,
      };
      units.push(unit);
      const entry: VoicePackLexiconEntry = {
        unitId,
        file,
        text: word,
        startMs,
        endMs,
        sourcePhraseId: clip.phraseId,
      };
      if (!lexicon[key]) lexicon[key] = [];
      lexicon[key]!.push(entry);
    });

    // Cheap CPU proportional to corpus (hash + checksum) so train isn't a no-op flip.
    crypto
      .createHash("sha256")
      .update(clip.phraseText)
      .update(String(durationMs))
      .update(String(words.length))
      .digest("hex");

    opts.onProgress?.(
      Math.round(((idx + 1) / total) * 100),
      `Сегментация клипа ${idx + 1}/${total} · ${words.length} слов`,
    );
  });

  const wordUnitCount = units.filter((u) => u.kind === "word").length;
  const fragmentUnitCount = units.filter((u) => u.kind === "fragment").length;

  const pack: VoiceModelPack = {
    version: 1,
    engine: VOICE_PACK_ENGINE,
    projectId: opts.projectId,
    voiceId: opts.voiceId,
    lang: opts.lang,
    name: opts.name,
    trainedAt: stamp,
    quality: opts.quality,
    phraseCount: opts.phraseCount,
    linkedAccepted: opts.linkedAccepted,
    coveragePct: opts.coveragePct,
    wordUnitCount,
    fragmentUnitCount,
    units,
    lexicon,
    phrases,
  };

  fs.writeFileSync(
    path.join(opts.packDir, "model-pack.json"),
    JSON.stringify(pack, null, 2),
    "utf8",
  );
  return pack;
}

export function readVoiceModelPack(packDir: string): VoiceModelPack | null {
  const file = path.join(packDir, "model-pack.json");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as VoiceModelPack;
    if (raw?.version !== 1 || !raw.engine) return null;
    return raw;
  } catch {
    return null;
  }
}
