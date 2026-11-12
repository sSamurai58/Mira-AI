/**
 * Local voice model pack (mira-voice-pack-v1).
 *
 * Unit-selection / concatenative TTS (NOT neural mel encoder→decoder).
 * Training builds phrase units + word/fragment slices + a lexicon index so
 * runtime TTS can stitch novel replies from trained units instead of only
 * replaying exact phrases. Uncovered words fall back to system TTS.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { estimateWordBoundariesByEnergy } from "./audioFeatures";

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
  /**
   * Text-only / system-TTS placeholder — not used for corpus stitching.
   * Runtime falls back to system TTS until the user records the word.
   */
  provisional?: boolean;
  /** Unit-selection prior from mel refinement. */
  score?: number;
};

export type VoicePackLexiconEntry = {
  unitId: string;
  file: string;
  text: string;
  startMs: number;
  endMs: number;
  sourcePhraseId: string;
  /** See VoicePackUnit.provisional */
  provisional?: boolean;
  /** Unit-selection prior from mel refinement (higher = preferred). */
  score?: number;
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
  /** Unique lexicon keys (recorded + provisional from all phrase texts). */
  lexiconSize: number;
  /** Keys that have at least one real audio unit. */
  audioLexiconSize: number;
  /** Keys only covered by provisional (system TTS until recorded). */
  provisionalLexiconSize: number;
  units: VoicePackUnit[];
  /** word-key → candidate units (prefer shorter/cleaner later). */
  lexicon: Record<string, VoicePackLexiconEntry[]>;
  phrases: Array<{
    id: string;
    text: string;
    clipPath: string;
    unitId: string;
  }>;
  /** Mel refinement metrics (filled after iterative train epochs). */
  trainMetrics?: {
    epochs: number;
    steps: number;
    finalLoss: number;
    initialLoss: number;
    gain: number;
    durationBias: number;
    melTargets: number;
  };
};

export type TrainProgressEvent = {
  projectId: string;
  step:
    | "validate"
    | "features"
    | "segment"
    | "lexicon"
    | "epochs"
    | "pack"
    | "publish"
    | "done"
    | "error";
  pct: number;
  label: string;
  detail?: string;
  epoch?: number;
  epochs?: number;
  loss?: number;
  melL1?: number;
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
 * Soft edge fade on sliced units. Keep shorter than stitch crossfade so
 * overlap-add (not double-mute) does the real join.
 */
export const SLICE_EDGE_FADE_MS = 6;
/** Search window for quiet zero-crossing snap around cut points. */
export const SLICE_ZERO_CROSS_MS = 14;
/** Reject / skip word slices shorter than this after snap (truncated crumb). */
export const MIN_SLICE_MS = 70;

function readPcmInt16MonoFrame(
  pcm: Buffer,
  frame: number,
  channels: number,
): number {
  let sum = 0;
  for (let c = 0; c < channels; c++) {
    sum += pcm.readInt16LE((frame * channels + c) * 2);
  }
  return sum / channels;
}

function writePcmInt16MonoFrame(
  pcm: Buffer,
  frame: number,
  channels: number,
  sample: number,
): void {
  const v = Math.max(-32768, Math.min(32767, Math.round(sample)));
  for (let c = 0; c < channels; c++) {
    pcm.writeInt16LE(v, (frame * channels + c) * 2);
  }
}

/**
 * Snap a frame index to the nearest quiet zero-crossing within ±windowFrames.
 * Prefers true polarity flips with low |sample| (not mid-phoneme loud ZCs).
 */
export function snapToZeroCrossing(
  pcm: Buffer,
  frame: number,
  frameCount: number,
  channels: number,
  bitsPerSample: number,
  windowFrames: number,
): number {
  if (bitsPerSample !== 16 || frameCount <= 1) {
    return Math.max(0, Math.min(frameCount, frame));
  }
  const lo = Math.max(1, frame - windowFrames);
  const hi = Math.min(frameCount - 1, frame + windowFrames);
  let best = frame;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let f = lo; f <= hi; f++) {
    const a = readPcmInt16MonoFrame(pcm, f - 1, channels);
    const b = readPcmInt16MonoFrame(pcm, f, channels);
    const crosses = (a <= 0 && b >= 0) || (a >= 0 && b <= 0);
    const mag = Math.min(Math.abs(a), Math.abs(b));
    // Local loudness over ±2 samples — avoid snapping onto a voiced crest.
    let local = Math.abs(b);
    for (let k = -2; k <= 2; k++) {
      const idx = f + k;
      if (idx < 0 || idx >= frameCount) continue;
      local = Math.max(local, Math.abs(readPcmInt16MonoFrame(pcm, idx, channels)));
    }
    const dist = Math.abs(f - frame);
    const score =
      (crosses ? 0 : 1400) + mag * 1.1 + local * 0.35 + dist * 0.2;
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

function applyEdgeFadeInt16(
  pcm: Buffer,
  frameCount: number,
  channels: number,
  fadeFrames: number,
): void {
  if (fadeFrames <= 0 || frameCount < 4) return;
  const fade = Math.min(fadeFrames, Math.floor(frameCount / 3));
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / Math.max(1, fade));
    const s0 = readPcmInt16MonoFrame(pcm, i, channels);
    writePcmInt16MonoFrame(pcm, i, channels, s0 * g);
    const j = frameCount - 1 - i;
    const s1 = readPcmInt16MonoFrame(pcm, j, channels);
    writePcmInt16MonoFrame(pcm, j, channels, s1 * g);
  }
}

/**
 * Slice a PCM WAV by millisecond range into a new WAV file.
 * Snaps cuts to nearby quiet zero-crossings and applies short cosine edge
 * fades so unit-selection reassembly does not click/buzz at joins.
 * Rejects tiny / truncated crumbs (caller keeps phrase fragment instead).
 * Returns false if source is not slicable PCM (caller should fall back).
 */
export function sliceWavToFile(
  srcPath: string,
  outPath: string,
  startMs: number,
  endMs: number,
  opts?: { fadeMs?: number; zeroCrossMs?: number; minMs?: number },
): boolean {
  const info = parseWavInfo(srcPath);
  if (!info) return false;
  const bytesPerSample = (info.bitsPerSample / 8) * info.channels;
  const frameCountTotal = Math.floor(info.dataSize / bytesPerSample);
  if (frameCountTotal <= 0) return false;

  const minMs = opts?.minMs ?? MIN_SLICE_MS;
  if (endMs - startMs < minMs * 0.55) return false;

  let startFrame = Math.floor((startMs / 1000) * info.sampleRate);
  let endFrame = Math.ceil((endMs / 1000) * info.sampleRate);
  startFrame = Math.max(0, Math.min(frameCountTotal - 1, startFrame));
  endFrame = Math.max(startFrame + 1, Math.min(frameCountTotal, endFrame));

  const fd = fs.openSync(srcPath, "r");
  try {
    // Read a padded region so zero-crossing search can look past the cut.
    const zcMs = opts?.zeroCrossMs ?? SLICE_ZERO_CROSS_MS;
    const zcFrames = Math.max(
      1,
      Math.floor((zcMs / 1000) * info.sampleRate),
    );
    const readStart = Math.max(0, startFrame - zcFrames);
    const readEnd = Math.min(frameCountTotal, endFrame + zcFrames);
    const readFrames = readEnd - readStart;
    const region = Buffer.alloc(readFrames * bytesPerSample);
    fs.readSync(
      fd,
      region,
      0,
      region.length,
      info.dataOffset + readStart * bytesPerSample,
    );

    if (info.bitsPerSample === 16) {
      const localStart = startFrame - readStart;
      const localEnd = endFrame - readStart;
      startFrame =
        readStart +
        snapToZeroCrossing(
          region,
          localStart,
          readFrames,
          info.channels,
          info.bitsPerSample,
          zcFrames,
        );
      endFrame =
        readStart +
        snapToZeroCrossing(
          region,
          localEnd,
          readFrames,
          info.channels,
          info.bitsPerSample,
          zcFrames,
        );
      if (endFrame <= startFrame) {
        endFrame = Math.min(frameCountTotal, startFrame + 1);
      }
    }

    const frameLen = endFrame - startFrame;
    const durationMs = (frameLen / info.sampleRate) * 1000;
    if (durationMs < minMs * 0.55) return false;

    const length = frameLen * bytesPerSample;
    if (length <= 0) return false;
    const pcm = Buffer.alloc(length);
    fs.readSync(fd, pcm, 0, length, info.dataOffset + startFrame * bytesPerSample);

    if (info.bitsPerSample === 16) {
      // Reject units that still look truncated: hot energy right at both
      // edges with almost no interior (chopped mid-phoneme crumb).
      if (frameLen >= 32) {
        const edge = Math.max(4, Math.floor(frameLen * 0.08));
        let edgeAcc = 0;
        let midAcc = 0;
        let midN = 0;
        for (let f = 0; f < frameLen; f++) {
          const a = Math.abs(readPcmInt16MonoFrame(pcm, f, info.channels));
          if (f < edge || f >= frameLen - edge) edgeAcc += a;
          else {
            midAcc += a;
            midN += 1;
          }
        }
        const edgeMean = edgeAcc / Math.max(1, edge * 2);
        const midMean = midAcc / Math.max(1, midN);
        if (midMean > 200 && edgeMean > midMean * 1.35 && durationMs < minMs * 1.2) {
          return false;
        }
      }

      const fadeMs = opts?.fadeMs ?? SLICE_EDGE_FADE_MS;
      const fadeFrames = Math.max(
        1,
        Math.floor((fadeMs / 1000) * info.sampleRate),
      );
      applyEdgeFadeInt16(pcm, frameLen, info.channels, fadeFrames);
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    writePcmWav(outPath, pcm, info);
    return true;
  } finally {
    fs.closeSync(fd);
  }
}

/** Mono float RMS of int16 interleaved PCM. */
export function pcmInt16Rms(
  pcm: Buffer,
  channels: number,
  fromFrame = 0,
  frameCount?: number,
): number {
  const totalFrames = Math.floor(pcm.length / (2 * channels));
  const n = Math.min(totalFrames - fromFrame, frameCount ?? totalFrames);
  if (n <= 0) return 0;
  let sum = 0;
  for (let f = 0; f < n; f++) {
    const s = readPcmInt16MonoFrame(pcm, fromFrame + f, channels) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}

function snapFloatZeroCross(
  samples: Float32Array,
  around: number,
  window: number,
): number {
  const lo = Math.max(1, around - window);
  const hi = Math.min(samples.length - 1, around + window);
  let best = around;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = lo; i <= hi; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const crosses = (a <= 0 && b >= 0) || (a >= 0 && b <= 0);
    const mag = Math.min(Math.abs(a), Math.abs(b));
    const score = (crosses ? 0 : 2) + mag + Math.abs(i - around) * 0.0005;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Overlap-add stitch for int16 mono/multi PCM units (Node / smoke mirror of
 * browser concatenateWithCrossfade). Adaptive crossfade length, RMS match
 * between adjacent units, zero-crossing aligned overlap.
 */
export function stitchPcmInt16OverlapAdd(
  parts: Array<{ pcm: Buffer; sampleRate: number; channels: number }>,
  opts?: { minCrossfadeMs?: number; maxCrossfadeMs?: number },
): { pcm: Buffer; sampleRate: number; channels: number } | null {
  if (!parts.length) return null;
  const sampleRate = parts[0]!.sampleRate;
  const channels = parts[0]!.channels;
  const minXf = Math.max(8, Math.floor(((opts?.minCrossfadeMs ?? 22) / 1000) * sampleRate));
  const maxXf = Math.max(
    minXf,
    Math.floor(((opts?.maxCrossfadeMs ?? 55) / 1000) * sampleRate),
  );

  const toFloat = (pcm: Buffer, ch: number): Float32Array => {
    const frames = Math.floor(pcm.length / (2 * ch));
    const out = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      out[f] = readPcmInt16MonoFrame(pcm, f, ch) / 32768;
    }
    return out;
  };

  let acc = toFloat(parts[0]!.pcm, parts[0]!.channels);
  let refRms = Math.max(1e-5, pcmInt16Rms(parts[0]!.pcm, parts[0]!.channels));

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.sampleRate !== sampleRate) continue;
    let next = toFloat(part.pcm, part.channels);
    const nextRms = Math.max(1e-5, pcmInt16Rms(part.pcm, part.channels));
    // Level-match next unit toward running reference (avoid stepped loudness).
    const gain = Math.max(0.65, Math.min(1.45, refRms / nextRms));
    if (Math.abs(gain - 1) > 0.04) {
      for (let s = 0; s < next.length; s++) next[s]! *= gain;
    }
    refRms = refRms * 0.7 + nextRms * gain * 0.3;

    const edgePrev = pcmInt16Rms(
      parts[i - 1]!.pcm,
      parts[i - 1]!.channels,
      Math.max(
        0,
        Math.floor(parts[i - 1]!.pcm.length / (2 * parts[i - 1]!.channels)) -
          minXf,
      ),
      minXf,
    );
    const edgeNext = pcmInt16Rms(part.pcm, part.channels, 0, minXf);
    const edge = Math.max(edgePrev, edgeNext);
    // Louder / mismatched joins → longer adaptive crossfade.
    const t = Math.max(0, Math.min(1, (edge - 0.02) / 0.12));
    let xf = Math.round(minXf + (maxXf - minXf) * (0.35 + 0.65 * t));
    xf = Math.min(
      xf,
      Math.floor(acc.length * 0.45),
      Math.floor(next.length * 0.45),
    );
    xf = Math.max(1, xf);

    // Snap the overlap *start* near acc.length - xf (do not subtract xf twice).
    const start = snapFloatZeroCross(
      acc,
      Math.max(0, acc.length - xf),
      Math.min(48, xf),
    );
    const useOverlap = Math.min(xf, acc.length - start, next.length);

    const out = new Float32Array(start + next.length);
    out.set(acc.subarray(0, start + useOverlap), 0);
    for (let n = 0; n < useOverlap; n++) {
      const u = useOverlap <= 1 ? 1 : n / (useOverlap - 1);
      const a = Math.cos(u * 0.5 * Math.PI);
      const b = Math.sin(u * 0.5 * Math.PI);
      out[start + n] = (acc[start + n] ?? 0) * a + next[n]! * b;
    }
    if (next.length > useOverlap) {
      out.set(next.subarray(useOverlap), start + useOverlap);
    }
    acc = out;
  }

  const pcm = Buffer.alloc(acc.length * channels * 2);
  for (let f = 0; f < acc.length; f++) {
    writePcmInt16MonoFrame(pcm, f, channels, acc[f]! * 32767);
  }
  return { pcm, sampleRate, channels };
}

/**
 * Transcode compressed / non-PCM audio to mono 24 kHz PCM WAV via ffmpeg.
 * Returns the wav path on success, or null if ffmpeg is missing / fails.
 */
export function convertAudioToPcmWav(
  srcPath: string,
  outPath?: string,
): string | null {
  const dest =
    outPath ??
    path.join(
      path.dirname(srcPath),
      `${path.basename(srcPath, path.extname(srcPath))}.pcm16.wav`,
    );
  if (fs.existsSync(dest)) {
    const existing = parseWavInfo(dest);
    if (existing) return dest;
  }
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        srcPath,
        "-ac",
        "1",
        "-ar",
        "24000",
        "-c:a",
        "pcm_s16le",
        dest,
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: 120_000 },
    );
    return parseWavInfo(dest) ? dest : null;
  } catch {
    try {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** Ensure a clip path is slicable PCM WAV (convert in place beside source). */
export function ensureSlicableWav(filePath: string): string {
  if (parseWavInfo(filePath)) return filePath;
  const converted = convertAudioToPcmWav(filePath);
  return converted ?? filePath;
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

export type TrainPhraseText = {
  phraseId: string;
  text: string;
};

/**
 * Build a model pack directory: phrase units, word/fragment slices, lexicon.
 * Work scales with linked clips × words (real file IO + CPU).
 * All project phrases contribute to lexicon size; words without audio are
 * indexed as provisional (system TTS until the user records them).
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
  /** Full phrase corpus — grows lexicon even when audio is missing. */
  allPhrases?: TrainPhraseText[];
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
  const clipTotal = Math.max(1, opts.clips.length);
  const allPhrases = opts.allPhrases?.length
    ? opts.allPhrases
    : opts.clips.map((c) => ({ phraseId: c.phraseId, text: c.phraseText }));
  const workTotal = Math.max(1, clipTotal + allPhrases.length);

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
        Math.round(((idx + 1) / workTotal) * 70),
        `Выравнивание ${idx + 1}/${clipTotal}`,
      );
      return;
    }

    // Text-weighted + valley/silence alignment when PCM WAV is available;
    // else text-weighted equal-time. (Not neural attention — unit-selection.)
    const bounds = estimateWordBoundariesByEnergy(
      clip.filePath,
      words.length,
      durationMs,
      words,
    );

    words.forEach((word, wIdx) => {
      const bound = bounds[wIdx] ?? {
        startMs: (durationMs * wIdx) / words.length,
        endMs: (durationMs * (wIdx + 1)) / words.length,
      };
      const startMs = bound.startMs;
      const endMs = bound.endMs;
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
        // Non-WAV, tiny, or truncated crumb: keep phrase span as fragment.
        kind = "fragment";
        file = phrasePath;
        try {
          if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
        } catch {
          /* ignore */
        }
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
      // Prefer real audio: drop provisional placeholders for this key.
      lexicon[key] = lexicon[key]!.filter((e) => !e.provisional);
      lexicon[key]!.push(entry);
    });

    // CPU proportional to word count so long passages make training non-instant.
    const rounds = Math.max(1, Math.min(64, Math.ceil(words.length / 8)));
    for (let r = 0; r < rounds; r++) {
      crypto
        .createHash("sha256")
        .update(clip.phraseText)
        .update(String(durationMs))
        .update(String(words.length + r))
        .digest("hex");
    }

    opts.onProgress?.(
      Math.round(((idx + 1) / workTotal) * 70),
      `Выравнивание клипа ${idx + 1}/${clipTotal} · ${words.length} слов (unit-selection)`,
    );
  });

  // Index every project phrase into the lexicon. Missing audio → provisional
  // entries (system TTS at runtime until the user records that word).
  let provisionalAdded = 0;
  allPhrases.forEach((phrase, pIdx) => {
    const words = tokenizeSpeechWords(phrase.text);
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const word = words[wIdx]!;
      const key = normalizeLexKey(word);
      if (!key) continue;
      const existing = lexicon[key];
      if (existing?.some((e) => !e.provisional)) continue;
      if (existing?.length) continue;

      const unitId = `p-${phrase.phraseId.slice(0, 6)}-${wIdx}-${crypto
        .createHash("sha1")
        .update(`${phrase.phraseId}:${wIdx}:${key}:prov`)
        .digest("hex")
        .slice(0, 10)}`;
      const unit: VoicePackUnit = {
        id: unitId,
        kind: "fragment",
        text: word,
        file: "",
        sourcePhraseId: phrase.phraseId,
        sourceClipId: "provisional",
        startMs: 0,
        endMs: 0,
        key,
        provisional: true,
      };
      units.push(unit);
      lexicon[key] = [
        {
          unitId,
          file: "",
          text: word,
          startMs: 0,
          endMs: 0,
          sourcePhraseId: phrase.phraseId,
          provisional: true,
        },
      ];
      provisionalAdded += 1;
    }

    // Hash work scales with long pending texts too.
    const rounds = Math.max(1, Math.min(48, Math.ceil(words.length / 10)));
    for (let r = 0; r < rounds; r++) {
      crypto
        .createHash("sha256")
        .update(phrase.text)
        .update(String(words.length + r))
        .digest("hex");
    }

    opts.onProgress?.(
      Math.round(((clipTotal + pIdx + 1) / workTotal) * 100),
      `Лексикон текстов ${pIdx + 1}/${allPhrases.length} · +${provisionalAdded} пока TTS`,
    );
  });

  const wordUnitCount = units.filter(
    (u) => u.kind === "word" && !u.provisional,
  ).length;
  const fragmentUnitCount = units.filter(
    (u) => u.kind === "fragment" && !u.provisional,
  ).length;
  const lexiconSize = Object.keys(lexicon).length;
  let audioLexiconSize = 0;
  let provisionalLexiconSize = 0;
  for (const entries of Object.values(lexicon)) {
    if (entries.some((e) => !e.provisional)) audioLexiconSize += 1;
    else provisionalLexiconSize += 1;
  }

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
    lexiconSize,
    audioLexiconSize,
    provisionalLexiconSize,
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
    // Backfill lexicon stats for packs trained before 0.1.1.
    if (raw.lexicon && raw.lexiconSize == null) {
      const keys = Object.keys(raw.lexicon);
      raw.lexiconSize = keys.length;
      let audio = 0;
      let provisional = 0;
      for (const key of keys) {
        const entries = raw.lexicon[key] ?? [];
        if (entries.some((e) => !e.provisional && e.file)) audio += 1;
        else provisional += 1;
      }
      raw.audioLexiconSize = audio;
      raw.provisionalLexiconSize = provisional;
    }
    return raw;
  } catch {
    return null;
  }
}

function rewriteLexiconStats(pack: VoiceModelPack): void {
  const keys = Object.keys(pack.lexicon ?? {});
  pack.lexiconSize = keys.length;
  let audio = 0;
  let provisional = 0;
  for (const key of keys) {
    const entries = pack.lexicon[key] ?? [];
    if (entries.some((e) => !e.provisional && e.file)) audio += 1;
    else provisional += 1;
  }
  pack.audioLexiconSize = audio;
  pack.provisionalLexiconSize = provisional;
}

/**
 * Drop phrase/word/fragment units for one source phrase so TTS does not keep
 * orphaned audio after the user clears that phrase's clips. Writes pack JSON.
 */
export function prunePhraseFromVoicePack(
  packDir: string,
  phraseId: string,
): { removedUnits: number; pack: VoiceModelPack | null } {
  const pack = readVoiceModelPack(packDir);
  if (!pack) return { removedUnits: 0, pack: null };

  const keepUnits: VoicePackUnit[] = [];
  const removedFiles = new Set<string>();
  let removedUnits = 0;
  for (const unit of pack.units) {
    if (unit.sourcePhraseId !== phraseId) {
      keepUnits.push(unit);
      continue;
    }
    removedUnits += 1;
    if (unit.file && unit.file.startsWith(packDir)) {
      removedFiles.add(unit.file);
    }
  }
  if (removedUnits === 0) return { removedUnits: 0, pack };

  pack.units = keepUnits;
  pack.phrases = (pack.phrases ?? []).filter((p) => p.id !== phraseId);

  const nextLexicon: Record<string, VoicePackLexiconEntry[]> = {};
  for (const [key, entries] of Object.entries(pack.lexicon ?? {})) {
    const kept = entries.filter((e) => e.sourcePhraseId !== phraseId);
    if (kept.length) nextLexicon[key] = kept;
  }
  pack.lexicon = nextLexicon;
  rewriteLexiconStats(pack);

  pack.wordUnitCount = keepUnits.filter((u) => u.kind === "word").length;
  pack.fragmentUnitCount = keepUnits.filter((u) => u.kind === "fragment").length;
  pack.linkedAccepted = pack.phrases.length;
  // phraseCount stays as corpus size from last train; full rebuild refreshes it.

  for (const file of removedFiles) {
    // Keep files still referenced by remaining units (shared paths).
    const stillUsed = keepUnits.some((u) => u.file === file);
    if (stillUsed) continue;
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // best-effort
    }
  }

  fs.writeFileSync(
    path.join(packDir, "model-pack.json"),
    JSON.stringify(pack, null, 2),
    "utf8",
  );
  return { removedUnits, pack };
}
