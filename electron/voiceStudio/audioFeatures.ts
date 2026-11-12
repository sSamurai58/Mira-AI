/**
 * Lightweight PCM / mel-band features for Voice Studio QA + alignment.
 * Pure JS — no PyTorch/CUDA. Used by unit-selection training, not neural TTS.
 */
import fs from "node:fs";
import { parseWavInfo } from "./modelPack";

export type ClipAudioFeatures = {
  format: "pcm-wav" | "compressed-or-unknown";
  durationMs: number;
  sampleRate: number;
  channels: number;
  /** Peak absolute sample (0..1). */
  peak: number;
  /** RMS energy (0..1). */
  rms: number;
  /** Fraction of frames below silence threshold. */
  silenceRatio: number;
  /** Fraction of samples near full-scale (clipping risk). */
  clipRatio: number;
  /** Relative energy in low / mid / high mel-ish bands (sum ≈ 1). */
  bandEnergies: [number, number, number];
  /** Rough speech-likeness 0..1 from band balance + activity. */
  speechScore: number;
};

export type WordBoundary = {
  startMs: number;
  endMs: number;
};

const FRAME_MS = 20;
const HOP_MS = 10;

function readPcmMonoNormalized(filePath: string): {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
  durationMs: number;
} | null {
  const info = parseWavInfo(filePath);
  if (!info) return null;
  const bytesPerSample = (info.bitsPerSample / 8) * info.channels;
  if (bytesPerSample <= 0) return null;
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const pcm = Buffer.alloc(info.dataSize);
      fs.readSync(fd, pcm, 0, info.dataSize, info.dataOffset);
      const frames = Math.floor(info.dataSize / bytesPerSample);
      const samples = new Float32Array(frames);
      const ch = info.channels;
      if (info.bitsPerSample === 16) {
        for (let i = 0; i < frames; i++) {
          let sum = 0;
          for (let c = 0; c < ch; c++) {
            sum += pcm.readInt16LE((i * ch + c) * 2) / 32768;
          }
          samples[i] = sum / ch;
        }
      } else if (info.bitsPerSample === 8) {
        for (let i = 0; i < frames; i++) {
          let sum = 0;
          for (let c = 0; c < ch; c++) {
            sum += (pcm[i * ch + c]! - 128) / 128;
          }
          samples[i] = sum / ch;
        }
      } else if (info.bitsPerSample === 32) {
        for (let i = 0; i < frames; i++) {
          let sum = 0;
          for (let c = 0; c < ch; c++) {
            sum += pcm.readInt32LE((i * ch + c) * 4) / 2147483648;
          }
          samples[i] = sum / ch;
        }
      } else {
        return null;
      }
      return {
        samples,
        sampleRate: info.sampleRate,
        channels: info.channels,
        durationMs: info.durationMs,
      };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** Tiny real DFT magnitude at one frequency bin (Goertzel-friendly). */
function goertzelPower(
  frame: Float32Array,
  sampleRate: number,
  freqHz: number,
): number {
  const n = frame.length;
  if (n < 4) return 0;
  const w = (2 * Math.PI * freqHz) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    s0 = frame[i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const real = s1 - s2 * Math.cos(w);
  const imag = s2 * Math.sin(w);
  return real * real + imag * imag;
}

function frameRms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, frame.length));
}

/**
 * Extract QA features from a clip. PCM WAV gets real analysis;
 * other formats fall back to size heuristics.
 */
export function extractClipAudioFeatures(
  filePath: string,
  sizeBytes: number,
): ClipAudioFeatures {
  const pcm = readPcmMonoNormalized(filePath);
  if (!pcm) {
    const approxSec = sizeBytes / 16000;
    return {
      format: "compressed-or-unknown",
      durationMs: Math.max(200, approxSec * 1000),
      sampleRate: 0,
      channels: 0,
      peak: 0,
      rms: 0,
      silenceRatio: 0,
      clipRatio: 0,
      bandEnergies: [0.33, 0.34, 0.33],
      speechScore: 0.45,
    };
  }

  const { samples, sampleRate, channels, durationMs } = pcm;
  const frameLen = Math.max(8, Math.floor((FRAME_MS / 1000) * sampleRate));
  const hop = Math.max(4, Math.floor((HOP_MS / 1000) * sampleRate));
  let peak = 0;
  let sumSq = 0;
  let clipHits = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!);
    if (a > peak) peak = a;
    sumSq += samples[i]! * samples[i]!;
    if (a >= 0.98) clipHits += 1;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, samples.length));
  const clipRatio = clipHits / Math.max(1, samples.length);

  let silentFrames = 0;
  let totalFrames = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  const silenceThresh = Math.max(0.008, rms * 0.18);
  for (let start = 0; start + frameLen <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + frameLen);
    const fr = frameRms(frame);
    totalFrames += 1;
    if (fr < silenceThresh) silentFrames += 1;
    // Mel-ish bands via Goertzel at ~300 / 1200 / 3200 Hz (speech formants).
    low += goertzelPower(frame, sampleRate, 300);
    mid += goertzelPower(frame, sampleRate, 1200);
    high += goertzelPower(frame, sampleRate, 3200);
  }
  const silenceRatio = totalFrames ? silentFrames / totalFrames : 1;
  const bandSum = low + mid + high || 1;
  const bandEnergies: [number, number, number] = [
    low / bandSum,
    mid / bandSum,
    high / bandSum,
  ];
  // Speech usually has mid energy + limited silence + non-tiny RMS.
  const activity = 1 - silenceRatio;
  const midBias = bandEnergies[1];
  const speechScore = Math.max(
    0,
    Math.min(
      1,
      activity * 0.45 +
        Math.min(1, rms * 8) * 0.3 +
        midBias * 0.25 -
        (clipRatio > 0.02 ? 0.2 : 0),
    ),
  );

  return {
    format: "pcm-wav",
    durationMs,
    sampleRate,
    channels,
    peak,
    rms,
    silenceRatio,
    clipRatio,
    bandEnergies,
    speechScore,
  };
}

/**
 * Frame-wise RMS + spectral flux (band-vector change) for cut scoring.
 * Flux peaks mark frequency-content transitions; energy valleys mark pauses.
 */
function frameEnergyAndFlux(
  samples: Float32Array,
  sampleRate: number,
): { energies: number[]; flux: number[]; hop: number; frameLen: number } {
  const frameLen = Math.max(8, Math.floor((FRAME_MS / 1000) * sampleRate));
  const hop = Math.max(4, Math.floor((HOP_MS / 1000) * sampleRate));
  const energies: number[] = [];
  const bandSeries: Array<[number, number, number]> = [];
  for (let start = 0; start + frameLen <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + frameLen);
    energies.push(frameRms(frame));
    bandSeries.push([
      goertzelPower(frame, sampleRate, 300),
      goertzelPower(frame, sampleRate, 1200),
      goertzelPower(frame, sampleRate, 3200),
    ]);
  }
  const flux: number[] = new Array(energies.length).fill(0);
  for (let i = 1; i < bandSeries.length; i++) {
    const a = bandSeries[i - 1]!;
    const b = bandSeries[i]!;
    const sa = a[0] + a[1] + a[2] || 1;
    const sb = b[0] + b[1] + b[2] || 1;
    // L1 change of normalized band mix = frequency-content shift.
    flux[i] =
      Math.abs(a[0]! / sa - b[0]! / sb) +
      Math.abs(a[1]! / sa - b[1]! / sb) +
      Math.abs(a[2]! / sa - b[2]! / sb);
  }
  return { energies, flux, hop, frameLen };
}

function frameIndexToMs(
  frame: number,
  frameCount: number,
  padMs: number,
  usable: number,
): number {
  if (frameCount <= 0) return padMs;
  return padMs + (frame / frameCount) * usable;
}

/**
 * Spectral/energy word boundaries (forced-alignment proxy).
 *
 * 1) Partition by cumulative speech energy (rough equal-energy slots).
 * 2) Snap each internal cut to the best nearby frame: low RMS (pause) and
 *    high spectral flux (frequency-band transition) — avoids mid-vowel chops.
 * Falls back to equal-time if energy is flat / unusable.
 */
export function estimateWordBoundariesByEnergy(
  filePath: string,
  wordCount: number,
  durationMsHint?: number,
): WordBoundary[] {
  const n = Math.max(1, wordCount);
  const pcm = readPcmMonoNormalized(filePath);
  const durationMs = pcm?.durationMs ?? durationMsHint ?? 800;
  const padMs = Math.min(40, durationMs * 0.04);
  const usable = Math.max(80, durationMs - padMs * 2);

  const equal = (): WordBoundary[] => {
    const slot = usable / n;
    return Array.from({ length: n }, (_, i) => ({
      startMs: padMs + slot * i,
      endMs: padMs + slot * (i + 1),
    }));
  };

  if (!pcm || n === 1) {
    if (n === 1) {
      return [{ startMs: padMs, endMs: padMs + usable }];
    }
    return equal();
  }

  const { samples, sampleRate } = pcm;
  const { energies, flux } = frameEnergyAndFlux(samples, sampleRate);
  if (energies.length < n * 2) return equal();

  const sorted = [...energies].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.15)] ?? 0;
  const ceiling = sorted[Math.floor(sorted.length * 0.85)] ?? floor + 1e-6;
  const dyn = Math.max(1e-6, ceiling - floor * 0.5);
  const weights = energies.map((e) => Math.max(1e-6, e - floor * 0.5));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 1e-5) return equal();

  const maxFlux = Math.max(...flux, 1e-9);
  // Lower score = better cut: prefer quiet frames with a band-mix jump.
  const cutScore = (i: number): number => {
    const eNorm = Math.max(0, (energies[i]! - floor * 0.5) / dyn);
    const fNorm = flux[i]! / maxFlux;
    return eNorm * 1.15 - fNorm * 0.55;
  };

  const searchRadius = Math.max(
    2,
    Math.min(18, Math.floor(energies.length / (n * 3))),
  );

  // Nominal cut frames from cumulative energy, then snap to best valley/flux.
  const cutFrames: number[] = [];
  let acc = 0;
  let nextTarget = 1;
  for (let i = 0; i < weights.length && nextTarget < n; i++) {
    acc += weights[i]!;
    if (acc < (total / n) * nextTarget) continue;
    const nominal = i;
    const lo = Math.max(
      cutFrames.length ? cutFrames[cutFrames.length - 1]! + 2 : 1,
      nominal - searchRadius,
    );
    const hi = Math.min(weights.length - 2, nominal + searchRadius);
    let best = nominal;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let f = lo; f <= hi; f++) {
      const s = cutScore(f);
      if (s < bestScore) {
        bestScore = s;
        best = f;
      }
    }
    cutFrames.push(best);
    nextTarget += 1;
  }
  while (cutFrames.length < n - 1) {
    const prev = cutFrames[cutFrames.length - 1] ?? 0;
    const rem = n - 1 - cutFrames.length;
    const step = Math.max(
      2,
      Math.floor((weights.length - prev - 1) / (rem + 1)),
    );
    cutFrames.push(Math.min(weights.length - 2, prev + step));
  }

  const bounds: WordBoundary[] = [];
  let startFrame = 0;
  for (let w = 0; w < n; w++) {
    const endFrame = w === n - 1 ? weights.length : cutFrames[w]!;
    const startMs = frameIndexToMs(startFrame, weights.length, padMs, usable);
    const endMs = frameIndexToMs(endFrame, weights.length, padMs, usable);
    bounds.push({
      startMs,
      endMs: Math.max(startMs + 12, endMs),
    });
    startFrame = endFrame;
  }
  // Ensure monotonic non-overlapping coverage of the usable window.
  for (let i = 1; i < bounds.length; i++) {
    if (bounds[i]!.startMs < bounds[i - 1]!.endMs) {
      bounds[i]!.startMs = bounds[i - 1]!.endMs;
    }
    if (bounds[i]!.endMs <= bounds[i]!.startMs) {
      bounds[i]!.endMs = bounds[i]!.startMs + 12;
    }
  }
  const last = bounds[bounds.length - 1];
  if (last) last.endMs = Math.max(last.endMs, padMs + usable);
  return bounds.slice(0, n);
}

/**
 * Heuristic text↔audio mismatch: expected speaking rate ~2–4 syllables/word,
 * ~2.5 words/sec conversational. Flag extreme outliers.
 * Also char-length vs duration (neural TTS data table: wrong text length).
 */
export function textAudioMismatch(
  phraseText: string | null,
  durationMs: number,
): string[] {
  const issues: string[] = [];
  if (!phraseText?.trim() || durationMs <= 0) return issues;
  const words = phraseText
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (words < 1) return issues;
  const chars = phraseText.trim().length;
  const sec = durationMs / 1000;
  const wordsPerSec = words / Math.max(0.05, sec);
  const charsPerSec = chars / Math.max(0.05, sec);
  // Extremely rushed / truncated recording vs long text.
  if (words >= 8 && wordsPerSec > 8) issues.push("text_too_long_for_clip");
  // Char density way above conversational RU/EN speech (~12–18 chars/s).
  if (chars >= 40 && charsPerSec > 28) issues.push("text_length_mismatch");
  // Very long silence-like stretch for a short phrase.
  if (words <= 4 && sec > 12) issues.push("clip_too_long_for_text");
  // Near-empty vs any text.
  if (words >= 2 && sec < 0.25) issues.push("clip_too_short_for_text");
  // Too slow for long text (possible wrong/empty take linked to long phrase).
  if (words >= 12 && wordsPerSec < 0.6) issues.push("clip_too_slow_for_text");
  return issues;
}

/**
 * Broadband noise / hiss heuristic from band balance + floor energy.
 * High high-band share with low mid speech → likely noise floor.
 */
export function noiseLikeness(features: ClipAudioFeatures): string[] {
  const issues: string[] = [];
  if (features.format !== "pcm-wav") return issues;
  const [low, mid, high] = features.bandEnergies;
  // Hiss / fan: elevated high band, weak mid formants.
  if (high > 0.48 && mid < 0.28 && features.rms > 0.008) {
    issues.push("likely_broadband_noise");
  }
  // Rumbling noise: low-band dominant with high silence ratio.
  if (low > 0.55 && mid < 0.25 && features.silenceRatio > 0.45) {
    issues.push("likely_low_frequency_noise");
  }
  // Constant noise floor: decent RMS but poor speech score.
  if (
    features.rms >= 0.015 &&
    features.speechScore < 0.28 &&
    features.silenceRatio < 0.35
  ) {
    issues.push("noisy_or_non_speech");
  }
  return issues;
}
