/**
 * T3 discrete acoustic tokens — lightweight VQ over mel frames.
 * Real codebook ints we can save/load (CosyVoice speech-tokenizer idea,
 * implemented offline without Python). VocabRev-gated.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  extractMelFromWav,
  MEL_N_MELS,
  type MelSpectrogram,
} from "../melSpectrogram";

export const ACOUSTIC_CODEBOOK_SIZE = 256;
export const ACOUSTIC_DIM = MEL_N_MELS; // 40

export type AcousticCodebook = {
  version: 1;
  vocabRev: string;
  size: number;
  dim: number;
  /** Row-major centroids [size × dim] */
  centroids: Float32Array;
};

function hashCentroids(c: Float32Array): string {
  return crypto.createHash("sha256").update(Buffer.from(c.buffer)).digest("hex").slice(0, 16);
}

function nearest(centroids: Float32Array, size: number, dim: number, vec: Float32Array): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < size; k++) {
    let d = 0;
    const base = k * dim;
    for (let j = 0; j < dim; j++) {
      const diff = vec[j]! - centroids[base + j]!;
      d += diff * diff;
    }
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Mini-batch k-means on mel frames (few iterations — studio-scale). */
export function trainAcousticCodebook(
  mels: MelSpectrogram[],
  size = ACOUSTIC_CODEBOOK_SIZE,
): AcousticCodebook {
  const dim = ACOUSTIC_DIM;
  const frames: Float32Array[] = [];
  for (const mel of mels) {
    for (let t = 0; t < mel.frameCount; t++) {
      const row = new Float32Array(dim);
      for (let m = 0; m < dim; m++) {
        row[m] = mel.frames[t * mel.nMels + m] ?? 0;
      }
      frames.push(row);
    }
  }
  if (frames.length < size) {
    // Pad by repeating
    while (frames.length < size) {
      frames.push(frames[frames.length % Math.max(1, frames.length)] ?? new Float32Array(dim));
    }
  }

  const centroids = new Float32Array(size * dim);
  // Init: random sample
  const used = new Set<number>();
  for (let k = 0; k < size; k++) {
    let idx = Math.floor(Math.random() * frames.length);
    let guard = 0;
    while (used.has(idx) && guard++ < 20) idx = Math.floor(Math.random() * frames.length);
    used.add(idx);
    centroids.set(frames[idx]!, k * dim);
  }

  const assign = new Int32Array(frames.length);
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < frames.length; i++) {
      assign[i] = nearest(centroids, size, dim, frames[i]!);
    }
    const sums = new Float32Array(size * dim);
    const counts = new Int32Array(size);
    for (let i = 0; i < frames.length; i++) {
      const k = assign[i]!;
      counts[k] += 1;
      const base = k * dim;
      const f = frames[i]!;
      for (let j = 0; j < dim; j++) sums[base + j] += f[j]!;
    }
    for (let k = 0; k < size; k++) {
      const c = counts[k]!;
      const base = k * dim;
      if (c <= 0) continue;
      for (let j = 0; j < dim; j++) centroids[base + j] = sums[base + j]! / c;
    }
  }

  return {
    version: 1,
    vocabRev: hashCentroids(centroids),
    size,
    dim,
    centroids,
  };
}

export function encodeMelToTokens(
  mel: MelSpectrogram,
  book: AcousticCodebook,
): Uint16Array {
  const out = new Uint16Array(mel.frameCount);
  const vec = new Float32Array(book.dim);
  for (let t = 0; t < mel.frameCount; t++) {
    for (let m = 0; m < book.dim; m++) {
      vec[m] = mel.frames[t * mel.nMels + m] ?? 0;
    }
    out[t] = nearest(book.centroids, book.size, book.dim, vec);
  }
  return out;
}

/** Reconstruct approx mel from tokens (centroid lookup). */
export function decodeTokensToMel(
  tokens: Uint16Array,
  book: AcousticCodebook,
  sampleRate = 16000,
  hopLength = 160,
): MelSpectrogram {
  const frameCount = tokens.length;
  const frames = new Float32Array(frameCount * book.dim);
  for (let t = 0; t < frameCount; t++) {
    const k = Math.min(book.size - 1, tokens[t]!);
    frames.set(
      book.centroids.subarray(k * book.dim, (k + 1) * book.dim),
      t * book.dim,
    );
  }
  const mean = new Float32Array(book.dim);
  const std = new Float32Array(book.dim);
  std.fill(1);
  return {
    sampleRate,
    nFft: 512,
    hopLength,
    nMels: book.dim,
    frames,
    frameCount,
    mean,
    std,
    durationMs: (frameCount * hopLength * 1000) / sampleRate,
  };
}

export function saveCodebook(file: string, book: AcousticCodebook): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const header = {
    version: book.version,
    vocabRev: book.vocabRev,
    size: book.size,
    dim: book.dim,
  };
  fs.writeFileSync(
    file,
    JSON.stringify({
      ...header,
      centroids: Array.from(book.centroids),
    }),
  );
}

export function loadCodebook(file: string): AcousticCodebook | null {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      version: 1;
      vocabRev: string;
      size: number;
      dim: number;
      centroids: number[];
    };
    return {
      version: 1,
      vocabRev: raw.vocabRev,
      size: raw.size,
      dim: raw.dim,
      centroids: Float32Array.from(raw.centroids),
    };
  } catch {
    return null;
  }
}

export function buildCodebookFromWavs(wavPaths: string[]): AcousticCodebook | null {
  const mels: MelSpectrogram[] = [];
  for (const p of wavPaths) {
    try {
      const mel = extractMelFromWav(p);
      if (mel && mel.frameCount > 0) mels.push(mel);
    } catch {
      /* skip */
    }
  }
  if (!mels.length) return null;
  return trainAcousticCodebook(mels);
}
