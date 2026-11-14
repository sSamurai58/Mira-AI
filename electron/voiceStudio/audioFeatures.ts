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
/** Pad cuts into silence so consonants at word edges are not truncated. */
export const BOUNDARY_PAD_MS = 18;
/** Absolute floor for a keepable word unit (rejects mid-phoneme crumbs). */
export const MIN_WORD_MS = 90;
/** Soften equal-energy bias with text length / syllable proxies when provided. */
export const MIN_RELATIVE_WORD_WEIGHT = 0.55;

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
  return padMs + (frame / Math.max(1, frameCount)) * usable;
}

/** Relative duration prior from orthography (letters + vowel/syllable proxy). */
export function relativeWordDurationWeights(words: string[]): number[] {
  if (!words.length) return [];
  return words.map((raw) => {
    const letters = raw.replace(/[^\p{L}\p{N}]+/gu, "");
    const vowels =
      letters.match(/[аеёиоуыэюяaeiouyáéíóúäöü]/gi)?.length ?? 0;
    const len = Math.max(1, letters.length);
    return Math.max(
      MIN_RELATIVE_WORD_WEIGHT,
      len * 0.55 + vowels * 0.95 + (len <= 2 ? -0.15 : 0),
    );
  });
}

/**
 * Speech / silence mask with hysteresis so brief dips mid-phoneme do not
 * open a cut window, and brief spikes in noise do not look like onsets.
 */
function speechMaskHysteresis(
  energies: number[],
  floor: number,
  dyn: number,
): boolean[] {
  const enter = floor + dyn * 0.3;
  const leave = floor + dyn * 0.12;
  let inSpeech = false;
  return energies.map((e) => {
    if (!inSpeech && e >= enter) inSpeech = true;
    else if (inSpeech && e <= leave) inSpeech = false;
    return inSpeech;
  });
}

type SpeechIsland = { start: number; end: number };

/** Contiguous speech runs from a hysteresis mask; merge tiny gaps. */
function findSpeechIslands(
  mask: boolean[],
  minFrames: number,
  mergeGapFrames: number,
): SpeechIsland[] {
  const raw: SpeechIsland[] = [];
  let i = 0;
  while (i < mask.length) {
    while (i < mask.length && !mask[i]) i += 1;
    if (i >= mask.length) break;
    const start = i;
    while (i < mask.length && mask[i]) i += 1;
    raw.push({ start, end: i });
  }
  if (!raw.length) return raw;
  const merged: SpeechIsland[] = [{ ...raw[0]! }];
  for (let k = 1; k < raw.length; k++) {
    const prev = merged[merged.length - 1]!;
    const cur = raw[k]!;
    if (cur.start - prev.end <= mergeGapFrames) {
      prev.end = cur.end;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged.filter((isl) => isl.end - isl.start >= minFrames);
}

/** Local valley depth: how much quieter this frame is vs ±radius neighbors. */
function valleyDepth(energies: number[], i: number, radius: number): number {
  const e = energies[i]!;
  let peak = e;
  const lo = Math.max(0, i - radius);
  const hi = Math.min(energies.length - 1, i + radius);
  for (let j = lo; j <= hi; j++) {
    if (energies[j]! > peak) peak = energies[j]!;
  }
  return Math.max(0, peak - e);
}

/**
 * Enforce minimum unit duration by nudging internal cuts (never shrink the
 * whole phrase). Tiny / truncated crumbs are merged into neighbors.
 */
function enforceMinWordMs(
  bounds: WordBoundary[],
  minMs: number,
  windowStart: number,
  windowEnd: number,
): WordBoundary[] {
  if (bounds.length <= 1) return bounds;
  const out = bounds.map((b) => ({ ...b }));
  for (let i = 0; i < out.length; i++) {
    const b = out[i]!;
    if (b.endMs - b.startMs >= minMs) continue;
    const need = minMs - (b.endMs - b.startMs);
    if (i < out.length - 1) {
      const next = out[i + 1]!;
      const give = Math.min(need, Math.max(0, next.endMs - next.startMs - minMs));
      const take = give > 0 ? give : need * 0.5;
      b.endMs += take;
      next.startMs = b.endMs;
    } else if (i > 0) {
      const prev = out[i - 1]!;
      const take = Math.min(
        need,
        Math.max(0, prev.endMs - prev.startMs - minMs * 0.5),
      );
      b.startMs -= take;
      prev.endMs = b.startMs;
    }
  }
  out[0]!.startMs = Math.max(windowStart, out[0]!.startMs);
  out[out.length - 1]!.endMs = Math.min(
    windowEnd,
    Math.max(out[out.length - 1]!.endMs, windowEnd),
  );
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.startMs < out[i - 1]!.endMs) out[i]!.startMs = out[i - 1]!.endMs;
    if (out[i]!.endMs <= out[i]!.startMs) {
      out[i]!.endMs = Math.min(windowEnd, out[i]!.startMs + minMs);
    }
  }
  return out;
}

/**
 * Pad onsets earlier / offsets later into silence valleys so cuts do not sit
 * on phoneme attacks. Does not cross neighboring cuts.
 */
function applyBoundaryPadding(
  bounds: WordBoundary[],
  energies: number[],
  speechMask: boolean[],
  padMs: number,
  usablePadMs: number,
  usable: number,
  frameCount: number,
): WordBoundary[] {
  if (!bounds.length || padMs <= 0) return bounds;
  const out = bounds.map((b) => ({ ...b }));
  const msPerFrame = usable / Math.max(1, frameCount);
  const padFrames = Math.max(1, Math.round(padMs / Math.max(1e-6, msPerFrame)));

  for (let i = 0; i < out.length; i++) {
    const b = out[i]!;
    const startFrame = Math.round(
      ((b.startMs - usablePadMs) / usable) * frameCount,
    );
    const endFrame = Math.round(
      ((b.endMs - usablePadMs) / usable) * frameCount,
    );
    if (i > 0) {
      let s = Math.max(0, Math.min(frameCount - 1, startFrame));
      const limit = Math.max(
        0,
        Math.round(((out[i - 1]!.endMs - usablePadMs) / usable) * frameCount) +
          1,
      );
      let walkedSilence = 0;
      for (let step = 0; step < padFrames && s - 1 >= limit; step++) {
        const prev = s - 1;
        if (speechMask[prev] && energies[prev]! > energies[s]! * 1.2) break;
        s = prev;
        if (!speechMask[prev]) {
          walkedSilence += 1;
          if (walkedSilence >= Math.ceil(padFrames * 0.6)) break;
        }
      }
      b.startMs = frameIndexToMs(s, frameCount, usablePadMs, usable);
    }
    if (i < out.length - 1) {
      let e = Math.max(0, Math.min(frameCount, endFrame));
      const limit = Math.min(
        frameCount,
        Math.round(
          ((out[i + 1]!.startMs - usablePadMs) / usable) * frameCount,
        ) - 1,
      );
      let walkedSilence = 0;
      for (let step = 0; step < padFrames && e + 1 <= limit; step++) {
        const next = e + 1;
        if (speechMask[next] && energies[next]! > energies[e]! * 1.2) break;
        e = next;
        if (!speechMask[next]) {
          walkedSilence += 1;
          if (walkedSilence >= Math.ceil(padFrames * 0.6)) break;
        }
      }
      b.endMs = frameIndexToMs(e, frameCount, usablePadMs, usable);
    }
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.startMs < out[i - 1]!.endMs) {
      const mid = (out[i]!.startMs + out[i - 1]!.endMs) / 2;
      out[i - 1]!.endMs = mid;
      out[i]!.startMs = mid;
    }
  }
  return out;
}

/**
 * Spectral/energy word boundaries (forced-alignment proxy) — v0.1.7.
 *
 * Why 0.1.4 still cut early/crooked: equal-energy slots ignore that short
 * function words ≠ long content words; valley search was narrow; no
 * hysteresis (mid-phoneme dips looked like pauses); no onset/offset margin;
 * 12 ms crumbs survived into the lexicon.
 *
 * 1) Relative duration prior from word text (letters/vowels) blended with
 *    cumulative speech energy — not pure equal-energy.
 * 2) Snap each internal cut with a wide window: silence (hysteresis mask),
 *    energy valley depth, spectral flux, penalty for rising energy (attack).
 * 3) Pad onsets/offsets into silence; enforce min word duration.
 * Falls back to equal-time if energy is flat / unusable.
 */
export function estimateWordBoundariesByEnergy(
  filePath: string,
  wordCount: number,
  durationMsHint?: number,
  wordTexts?: string[],
): WordBoundary[] {
  const n = Math.max(1, wordCount);
  const pcm = readPcmMonoNormalized(filePath);
  const durationMs = pcm?.durationMs ?? durationMsHint ?? 800;
  const padMs = Math.min(40, durationMs * 0.04);
  const usable = Math.max(80, durationMs - padMs * 2);
  const minWordMs = Math.min(
    MIN_WORD_MS,
    Math.max(45, usable / Math.max(2, n * 1.35)),
  );

  const equal = (): WordBoundary[] => {
    const texts =
      wordTexts && wordTexts.length === n
        ? wordTexts
        : Array.from({ length: n }, () => "x");
    const rel = relativeWordDurationWeights(texts);
    const relSum = rel.reduce((a, b) => a + b, 0) || n;
    const bounds: WordBoundary[] = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const startMs = padMs + (acc / relSum) * usable;
      acc += rel[i]!;
      const endMs = padMs + (acc / relSum) * usable;
      bounds.push({
        startMs,
        endMs: Math.max(startMs + minWordMs * 0.5, endMs),
      });
    }
    const last = bounds[bounds.length - 1];
    if (last) last.endMs = padMs + usable;
    return enforceMinWordMs(bounds, minWordMs, padMs, padMs + usable);
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
  const energyWeights = energies.map((e) => Math.max(1e-6, e - floor * 0.5));
  const energyTotal = energyWeights.reduce((a, b) => a + b, 0);
  if (energyTotal <= 1e-5) return equal();

  const texts =
    wordTexts && wordTexts.length === n
      ? wordTexts
      : Array.from({ length: n }, () => "xx");
  const rel = relativeWordDurationWeights(texts);
  const relSum = rel.reduce((a, b) => a + b, 0) || n;

  const targetShares: number[] = [];
  {
    let accShare = 0;
    for (let w = 0; w < n - 1; w++) {
      accShare += rel[w]! / relSum;
      targetShares.push(accShare);
    }
  }

  const speechMask = speechMaskHysteresis(energies, floor, dyn);
  const minGapFrames = Math.max(3, Math.round(minWordMs / HOP_MS));
  const islands = findSpeechIslands(
    speechMask,
    Math.max(2, Math.round(40 / HOP_MS)),
    Math.max(2, Math.round(40 / HOP_MS)),
  );

  // When clear speech islands match word count, map 1:1 (best anti-chop path).
  let bounds: WordBoundary[];
  if (islands.length === n) {
    bounds = islands.map((isl, idx) => {
      const startMs = frameIndexToMs(isl.start, energyWeights.length, padMs, usable);
      const endMs = frameIndexToMs(isl.end, energyWeights.length, padMs, usable);
      // Share silence midpoint with neighbors so pads have room.
      let s = startMs;
      let e = endMs;
      if (idx > 0) {
        const prevEnd = frameIndexToMs(
          islands[idx - 1]!.end,
          energyWeights.length,
          padMs,
          usable,
        );
        s = (prevEnd + startMs) / 2;
      } else {
        s = padMs;
      }
      if (idx < n - 1) {
        const nextStart = frameIndexToMs(
          islands[idx + 1]!.start,
          energyWeights.length,
          padMs,
          usable,
        );
        e = (endMs + nextStart) / 2;
      } else {
        e = padMs + usable;
      }
      return { startMs: s, endMs: Math.max(s + minWordMs * 0.4, e) };
    });
  } else {
    const maxFlux = Math.max(...flux, 1e-9);
    // Keep snap local (~40–150 ms). A wide window jumps to the *next* silence
    // valley and steals whole words.
    const searchRadius = Math.max(
      4,
      Math.min(15, Math.floor(energies.length / Math.max(4, n * 4))),
    );

    const cutScore = (i: number, nominal: number): number => {
      const eNorm = Math.max(0, (energies[i]! - floor * 0.5) / dyn);
      const fNorm = flux[i]! / maxFlux;
      const valley = valleyDepth(energies, i, 3) / dyn;
      const silent = speechMask[i] ? 0 : 1;
      const prev = energies[Math.max(0, i - 1)]!;
      const next = energies[Math.min(energies.length - 1, i + 1)]!;
      const rising = Math.max(0, next - prev) / dyn;
      const dist = Math.abs(i - nominal) / Math.max(1, searchRadius);
      // Prefer cutting at/after nominal (end of allotted share) over early chops.
      const early = Math.max(0, nominal - i) / Math.max(1, searchRadius);
      return (
        eNorm * 1.35 -
        fNorm * 0.65 -
        valley * 0.9 -
        silent * 1.25 +
        rising * 1.1 +
        dist * 0.85 +
        early * 0.55
      );
    };

    const cutFrames: number[] = [];
    let energyAcc = 0;
    let shareIdx = 0;
    for (
      let i = 0;
      i < energyWeights.length && shareIdx < targetShares.length;
      i++
    ) {
      energyAcc += energyWeights[i]!;
      const energyShare = energyAcc / energyTotal;
      if (energyShare < targetShares[shareIdx]!) continue;
      const nominal = i;
      const prevCut = cutFrames.length ? cutFrames[cutFrames.length - 1]! : 0;
      const lo = Math.max(prevCut + minGapFrames, nominal - searchRadius);
      const hi = Math.min(
        energyWeights.length -
          2 -
          (targetShares.length - shareIdx - 1) * minGapFrames,
        nominal + searchRadius,
      );
      let best = Math.max(lo, Math.min(hi, nominal));
      let bestScore = Number.POSITIVE_INFINITY;
      if (lo <= hi) {
        for (let f = lo; f <= hi; f++) {
          const s = cutScore(f, nominal);
          if (s < bestScore) {
            bestScore = s;
            best = f;
          }
        }
      }
      cutFrames.push(best);
      shareIdx += 1;
    }
    while (cutFrames.length < n - 1) {
      const prev = cutFrames[cutFrames.length - 1] ?? 0;
      const rem = n - 1 - cutFrames.length;
      const step = Math.max(
        minGapFrames,
        Math.floor((energyWeights.length - prev - 1) / (rem + 1)),
      );
      cutFrames.push(Math.min(energyWeights.length - 2, prev + step));
    }

    bounds = [];
    let startFrame = 0;
    for (let w = 0; w < n; w++) {
      const endFrame = w === n - 1 ? energyWeights.length : cutFrames[w]!;
      const startMs = frameIndexToMs(
        startFrame,
        energyWeights.length,
        padMs,
        usable,
      );
      const endMs = frameIndexToMs(
        endFrame,
        energyWeights.length,
        padMs,
        usable,
      );
      bounds.push({
        startMs,
        endMs: Math.max(startMs + minWordMs * 0.4, endMs),
      });
      startFrame = endFrame;
    }
  }
  for (let i = 1; i < bounds.length; i++) {
    if (bounds[i]!.startMs < bounds[i - 1]!.endMs) {
      bounds[i]!.startMs = bounds[i - 1]!.endMs;
    }
    if (bounds[i]!.endMs <= bounds[i]!.startMs) {
      bounds[i]!.endMs = bounds[i]!.startMs + minWordMs * 0.4;
    }
  }
  const last = bounds[bounds.length - 1];
  if (last) last.endMs = Math.max(last.endMs, padMs + usable);

  const padded = applyBoundaryPadding(
    bounds,
    energies,
    speechMask,
    BOUNDARY_PAD_MS,
    padMs,
    usable,
    energyWeights.length,
  );
  return enforceMinWordMs(
    padded.slice(0, n),
    minWordMs,
    padMs,
    padMs + usable,
  );
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
