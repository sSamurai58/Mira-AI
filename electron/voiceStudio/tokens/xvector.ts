/**
 * Offline speaker fingerprint (x-vector stand-in) from WAV.
 * Not SpeechBrain — deterministic 512-d emb from spectral/prosody stats so
 * speaker packs work without Python. Same clip → same vector.
 */
import fs from "node:fs";
import { parseWavInfo } from "../modelPack";

const DIM = 512;

function pcmRms(slice: Int16Array): number {
  if (!slice.length) return 0;
  let s = 0;
  for (let i = 0; i < slice.length; i++) {
    const v = slice[i]! / 32768;
    s += v * v;
  }
  return Math.sqrt(s / slice.length);
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function frameStats(
  pcm: Int16Array,
  sampleRate: number,
): Float32Array {
  const frame = Math.max(256, Math.floor(sampleRate * 0.025));
  const hop = Math.max(128, Math.floor(sampleRate * 0.01));
  const feats: number[] = [];
  let globalSum = 0;
  let globalSq = 0;
  let peak = 0;
  let voiced = 0;
  let frames = 0;
  const bandLow: number[] = [];
  const bandMid: number[] = [];
  const bandHigh: number[] = [];

  for (let start = 0; start + frame <= pcm.length; start += hop) {
    const slice = pcm.subarray(start, start + frame);
    const rms = pcmRms(slice);
    globalSum += rms;
    globalSq += rms * rms;
    peak = Math.max(peak, rms);
    frames += 1;
    if (rms > 0.02) voiced += 1;

    // Crude 3-band energy via decimated abs sums
    let lo = 0;
    let mid = 0;
    let hi = 0;
    for (let i = 0; i < slice.length; i++) {
      const a = Math.abs(slice[i]! / 32768);
      if (i % 8 === 0) lo += a;
      else if (i % 3 === 0) mid += a;
      else hi += a;
    }
    const n = slice.length || 1;
    bandLow.push(lo / n);
    bandMid.push(mid / n);
    bandHigh.push(hi / n);
  }

  const mean = frames ? globalSum / frames : 0;
  const variance = frames ? Math.max(0, globalSq / frames - mean * mean) : 0;
  const median = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };

  feats.push(
    mean,
    Math.sqrt(variance),
    peak,
    frames ? voiced / frames : 0,
    median(bandLow),
    median(bandMid),
    median(bandHigh),
    sampleRate / 48000,
    Math.min(1, pcm.length / (sampleRate * 30)),
  );

  // Quantile spreads
  const sortedRms: number[] = [];
  for (let start = 0; start + frame <= pcm.length; start += hop * 4) {
    sortedRms.push(pcmRms(pcm.subarray(start, start + frame)));
  }
  sortedRms.sort((a, b) => a - b);
  const q = (p: number) =>
    sortedRms[Math.min(sortedRms.length - 1, Math.floor(p * sortedRms.length))] ?? 0;
  feats.push(q(0.1), q(0.5), q(0.9));

  return Float32Array.from(feats);
}

/** Expand compact stats into fixed 512-d unit vector via seeded projections. */
export function expandToXVector(stats: Float32Array, seed = 0x4d495241): Float32Array {
  const out = new Float32Array(DIM);
  const rnd = mulberry32(seed);
  for (let d = 0; d < DIM; d++) {
    let v = 0;
    for (let i = 0; i < stats.length; i++) {
      const w = rnd() * 2 - 1;
      v += stats[i]! * w;
    }
    // Mix nonlinearities for separability
    out[d] = Math.tanh(v + (d % 7) * 0.01);
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += out[i]! * out[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) out[i] = out[i]! / norm;
  return out;
}

export function extractXVectorFromWav(wavPath: string): {
  emb: Float32Array;
  dim: number;
  detail: string;
} | null {
  if (!fs.existsSync(wavPath)) return null;
  try {
    const info = parseWavInfo(wavPath);
    if (!info || info.channels < 1) return null;
    const buf = fs.readFileSync(wavPath);
    const dataOffset = info.dataOffset;
    const bytes = Math.min(info.dataSize, buf.length - dataOffset);
    if (info.bitsPerSample !== 16 || bytes < 512) return null;
    // Downmix to mono Int16 view
    const samples = new Int16Array(
      buf.buffer,
      buf.byteOffset + dataOffset,
      Math.floor(bytes / 2),
    );
    let pcm: Int16Array;
    if (info.channels === 1) {
      pcm = samples;
    } else {
      const frames = Math.floor(samples.length / info.channels);
      pcm = new Int16Array(frames);
      for (let i = 0; i < frames; i++) {
        let acc = 0;
        for (let c = 0; c < info.channels; c++) {
          acc += samples[i * info.channels + c]!;
        }
        pcm[i] = Math.round(acc / info.channels);
      }
    }
    if (pcm.length < 256) return null;
    const stats = frameStats(pcm, info.sampleRate);
    const emb = expandToXVector(stats);
    return {
      emb,
      dim: DIM,
      detail: `xvec-${DIM}d · ${info.sampleRate} Hz · ${Math.round(pcm.length / info.sampleRate)}s`,
    };
  } catch {
    return null;
  }
}

export function cosineSim(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export const XVEC_DIM = DIM;
