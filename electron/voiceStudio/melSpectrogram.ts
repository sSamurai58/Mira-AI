/**
 * Pure-TS mel spectrogram pipeline for Voice Studio.
 * FFT → mel filterbank → log-mel. No PyTorch/CUDA.
 * Used as training «target features» + reconstruction loss proxy.
 */
import fs from "node:fs";
import path from "node:path";
import { parseWavInfo } from "./modelPack";

export const MEL_N_FFT = 512;
export const MEL_N_MELS = 40;
export const MEL_FMIN = 80;
export const MEL_FMAX = 7600;

export type MelSpectrogram = {
  sampleRate: number;
  nFft: number;
  hopLength: number;
  nMels: number;
  /** frames × nMels, row-major log-mel (natural log of power+eps). */
  frames: Float32Array;
  frameCount: number;
  /** Mean / std per mel band (for pack storage). */
  mean: Float32Array;
  std: Float32Array;
  durationMs: number;
};

export type MelSummary = {
  frameCount: number;
  nMels: number;
  sampleRate: number;
  hopLength: number;
  mean: number[];
  std: number[];
  /** Downsampled log-mel (≤48 frames × nMels) for pack JSON. */
  preview: number[][];
  energy: number;
};

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

/** Read mono PCM as Float32 [-1,1]. */
export function readPcmMonoNormalized(filePath: string): {
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

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
  }
  return w;
}

/** In-place radix-2 Cooley–Tukey FFT (real→complex interleaved). n must be power of 2. */
function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wR = Math.cos(ang);
    const wI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < half; k++) {
        const i0 = i + k;
        const i1 = i0 + half;
        const tr = wr * re[i1]! - wi * im[i1]!;
        const ti = wr * im[i1]! + wi * re[i1]!;
        re[i1] = re[i0]! - tr;
        im[i1] = im[i0]! - ti;
        re[i0] = re[i0]! + tr;
        im[i0] = im[i0]! + ti;
        const nwr = wr * wR - wi * wI;
        wi = wr * wI + wi * wR;
        wr = nwr;
      }
    }
  }
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Build triangular mel filterbank (nMels × (nFft/2+1)). */
export function buildMelFilterbank(
  sampleRate: number,
  nFft: number,
  nMels: number,
  fMin = MEL_FMIN,
  fMax = MEL_FMAX,
): Float32Array {
  const nFreqs = Math.floor(nFft / 2) + 1;
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(Math.min(fMax, sampleRate / 2 - 1));
  const melPoints = new Float32Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) {
    melPoints[i] = melMin + ((melMax - melMin) * i) / (nMels + 1);
  }
  const hzPoints = Array.from(melPoints, (m) => melToHz(m));
  const bins = hzPoints.map((hz) =>
    Math.floor(((nFft + 1) * hz) / sampleRate),
  );
  const fb = new Float32Array(nMels * nFreqs);
  for (let m = 1; m <= nMels; m++) {
    const left = bins[m - 1]!;
    const center = bins[m]!;
    const right = bins[m + 1]!;
    const row = (m - 1) * nFreqs;
    for (let k = left; k < center; k++) {
      if (k >= 0 && k < nFreqs && center !== left) {
        fb[row + k] = (k - left) / (center - left);
      }
    }
    for (let k = center; k < right; k++) {
      if (k >= 0 && k < nFreqs && right !== center) {
        fb[row + k] = (right - k) / (right - center);
      }
    }
  }
  return fb;
}

/**
 * Extract log-mel spectrogram from mono samples.
 */
export function extractMelFromSamples(
  samples: Float32Array,
  sampleRate: number,
  opts?: { nFft?: number; hopLength?: number; nMels?: number },
): MelSpectrogram {
  const nFft = opts?.nFft ?? MEL_N_FFT;
  const hop =
    opts?.hopLength ??
    Math.max(80, Math.round(sampleRate * 0.01)); // ~10 ms
  const nMels = opts?.nMels ?? MEL_N_MELS;
  const win = hannWindow(nFft);
  const filterbank = buildMelFilterbank(sampleRate, nFft, nMels);
  const nFreqs = Math.floor(nFft / 2) + 1;
  const frameCount = Math.max(
    1,
    Math.floor(Math.max(0, samples.length - nFft) / hop) + 1,
  );
  const frames = new Float32Array(frameCount * nMels);
  const re = new Float32Array(nFft);
  const im = new Float32Array(nFft);
  const power = new Float32Array(nFreqs);
  const eps = 1e-10;

  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < nFft; i++) {
      const s = start + i < samples.length ? samples[start + i]! : 0;
      re[i] = s * win[i]!;
    }
    fftRadix2(re, im);
    for (let k = 0; k < nFreqs; k++) {
      power[k] = re[k]! * re[k]! + im[k]! * im[k]!;
    }
    for (let m = 0; m < nMels; m++) {
      let e = 0;
      const row = m * nFreqs;
      for (let k = 0; k < nFreqs; k++) {
        e += filterbank[row + k]! * power[k]!;
      }
      frames[f * nMels + m] = Math.log(e + eps);
    }
  }

  const mean = new Float32Array(nMels);
  const std = new Float32Array(nMels);
  for (let m = 0; m < nMels; m++) {
    let sum = 0;
    for (let f = 0; f < frameCount; f++) sum += frames[f * nMels + m]!;
    mean[m] = sum / frameCount;
    let varSum = 0;
    for (let f = 0; f < frameCount; f++) {
      const d = frames[f * nMels + m]! - mean[m]!;
      varSum += d * d;
    }
    std[m] = Math.sqrt(varSum / Math.max(1, frameCount)) + 1e-6;
  }

  return {
    sampleRate,
    nFft,
    hopLength: hop,
    nMels,
    frames,
    frameCount,
    mean,
    std,
    durationMs: (samples.length / sampleRate) * 1000,
  };
}

export function extractMelFromWav(filePath: string): MelSpectrogram | null {
  const pcm = readPcmMonoNormalized(filePath);
  if (!pcm || pcm.samples.length < 32) return null;
  return extractMelFromSamples(pcm.samples, pcm.sampleRate);
}

/** Compact summary for model-pack JSON storage. */
export function melToSummary(mel: MelSpectrogram, maxFrames = 48): MelSummary {
  const step = Math.max(1, Math.ceil(mel.frameCount / maxFrames));
  const preview: number[][] = [];
  let energy = 0;
  for (let f = 0; f < mel.frameCount; f += step) {
    const row: number[] = [];
    for (let m = 0; m < mel.nMels; m++) {
      const v = mel.frames[f * mel.nMels + m]!;
      row.push(Number(v.toFixed(4)));
      energy += Math.exp(v);
    }
    preview.push(row);
  }
  return {
    frameCount: mel.frameCount,
    nMels: mel.nMels,
    sampleRate: mel.sampleRate,
    hopLength: mel.hopLength,
    mean: Array.from(mel.mean, (v) => Number(v.toFixed(4))),
    std: Array.from(mel.std, (v) => Number(v.toFixed(4))),
    preview,
    energy: Number((energy / Math.max(1, preview.length)).toFixed(4)),
  };
}

/**
 * Mean absolute L1 between two mel spectrograms (time-aligned by resample).
 */
export function melL1(a: MelSpectrogram, b: MelSpectrogram): number {
  const nMels = Math.min(a.nMels, b.nMels);
  const frames = Math.max(a.frameCount, b.frameCount, 1);
  let sum = 0;
  let count = 0;
  for (let f = 0; f < frames; f++) {
    const fa = Math.min(
      a.frameCount - 1,
      Math.floor((f / frames) * a.frameCount),
    );
    const fb = Math.min(
      b.frameCount - 1,
      Math.floor((f / frames) * b.frameCount),
    );
    for (let m = 0; m < nMels; m++) {
      sum += Math.abs(
        a.frames[fa * a.nMels + m]! - b.frames[fb * b.nMels + m]!,
      );
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

/** Slice mel frames by time range (ms). */
export function sliceMelByTime(
  mel: MelSpectrogram,
  startMs: number,
  endMs: number,
): MelSpectrogram {
  const frameMs = (mel.hopLength / mel.sampleRate) * 1000;
  const startF = Math.max(0, Math.floor(startMs / frameMs));
  const endF = Math.min(
    mel.frameCount,
    Math.max(startF + 1, Math.ceil(endMs / frameMs)),
  );
  const frameCount = endF - startF;
  const frames = mel.frames.subarray(
    startF * mel.nMels,
    endF * mel.nMels,
  );
  const copy = new Float32Array(frames);
  const mean = new Float32Array(mel.nMels);
  const std = new Float32Array(mel.nMels);
  for (let m = 0; m < mel.nMels; m++) {
    let sum = 0;
    for (let f = 0; f < frameCount; f++) sum += copy[f * mel.nMels + m]!;
    mean[m] = sum / Math.max(1, frameCount);
    let varSum = 0;
    for (let f = 0; f < frameCount; f++) {
      const d = copy[f * mel.nMels + m]! - mean[m]!;
      varSum += d * d;
    }
    std[m] = Math.sqrt(varSum / Math.max(1, frameCount)) + 1e-6;
  }
  return {
    ...mel,
    frames: copy,
    frameCount,
    mean,
    std,
    durationMs: endMs - startMs,
  };
}

/** Concatenate mel frames along time. */
export function concatMels(parts: MelSpectrogram[]): MelSpectrogram | null {
  if (parts.length === 0) return null;
  const base = parts[0]!;
  const nMels = base.nMels;
  let frameCount = 0;
  for (const p of parts) frameCount += p.frameCount;
  const frames = new Float32Array(frameCount * nMels);
  let off = 0;
  for (const p of parts) {
    const take = Math.min(p.nMels, nMels);
    for (let f = 0; f < p.frameCount; f++) {
      for (let m = 0; m < take; m++) {
        frames[off * nMels + m] = p.frames[f * p.nMels + m]!;
      }
      off += 1;
    }
  }
  return extractMelStats(
    frames,
    frameCount,
    nMels,
    base.sampleRate,
    base.hopLength,
    base.nFft,
  );
}

function extractMelStats(
  frames: Float32Array,
  frameCount: number,
  nMels: number,
  sampleRate: number,
  hopLength: number,
  nFft: number,
): MelSpectrogram {
  const mean = new Float32Array(nMels);
  const std = new Float32Array(nMels);
  for (let m = 0; m < nMels; m++) {
    let sum = 0;
    for (let f = 0; f < frameCount; f++) sum += frames[f * nMels + m]!;
    mean[m] = sum / Math.max(1, frameCount);
    let varSum = 0;
    for (let f = 0; f < frameCount; f++) {
      const d = frames[f * nMels + m]! - mean[m]!;
      varSum += d * d;
    }
    std[m] = Math.sqrt(varSum / Math.max(1, frameCount)) + 1e-6;
  }
  return {
    sampleRate,
    nFft,
    hopLength,
    nMels,
    frames,
    frameCount,
    mean,
    std,
    durationMs: (frameCount * hopLength * 1000) / sampleRate,
  };
}

/**
 * Griffin-Lim-ish: iterative phase reconstruction from magnitude spectrogram
 * derived from log-mel (pseudo-inverse filterbank). Quality is limited —
 * suitable only as a short preview of structure, not production speech.
 */
export function griffinLimFromMel(
  mel: MelSpectrogram,
  iterations = 8,
): Float32Array {
  const nFft = mel.nFft;
  const nFreqs = Math.floor(nFft / 2) + 1;
  const hop = mel.hopLength;
  const filterbank = buildMelFilterbank(mel.sampleRate, nFft, mel.nMels);
  // Pseudo-inverse: distribute mel energy back to linear freqs.
  const mag = new Float32Array(mel.frameCount * nFreqs);
  for (let f = 0; f < mel.frameCount; f++) {
    for (let m = 0; m < mel.nMels; m++) {
      const power = Math.exp(mel.frames[f * mel.nMels + m]!);
      const row = m * nFreqs;
      let wSum = 0;
      for (let k = 0; k < nFreqs; k++) wSum += filterbank[row + k]!;
      const inv = wSum > 1e-12 ? 1 / wSum : 0;
      for (let k = 0; k < nFreqs; k++) {
        const w = filterbank[row + k]!;
        if (w > 0) mag[f * nFreqs + k]! += Math.sqrt(power * w * inv);
      }
    }
  }

  const phase = new Float32Array(mel.frameCount * nFreqs);
  for (let i = 0; i < phase.length; i++) {
    phase[i] = Math.random() * Math.PI * 2;
  }

  const win = hannWindow(nFft);
  const outLen = (mel.frameCount - 1) * hop + nFft;
  const re = new Float32Array(nFft);
  const im = new Float32Array(nFft);

  const istft = (usePhase: Float32Array): Float32Array => {
    const out = new Float32Array(outLen);
    const norm = new Float32Array(outLen);
    for (let f = 0; f < mel.frameCount; f++) {
      re.fill(0);
      im.fill(0);
      for (let k = 0; k < nFreqs; k++) {
        const a = mag[f * nFreqs + k]!;
        const p = usePhase[f * nFreqs + k]!;
        re[k] = a * Math.cos(p);
        im[k] = a * Math.sin(p);
        if (k > 0 && k < nFreqs - 1) {
          re[nFft - k] = re[k]!;
          im[nFft - k] = -im[k]!;
        }
      }
      // Inverse FFT via conjugate + forward FFT / n
      for (let i = 0; i < nFft; i++) im[i] = -im[i]!;
      fftRadix2(re, im);
      const start = f * hop;
      for (let i = 0; i < nFft; i++) {
        const v = (re[i]! / nFft) * win[i]!;
        out[start + i]! += v;
        norm[start + i]! += win[i]! * win[i]!;
      }
    }
    for (let i = 0; i < outLen; i++) {
      if (norm[i]! > 1e-8) out[i]! /= norm[i]!;
    }
    return out;
  };

  let signal = istft(phase);
  for (let it = 0; it < iterations; it++) {
    // STFT → replace magnitude → keep phase
    for (let f = 0; f < mel.frameCount; f++) {
      const start = f * hop;
      re.fill(0);
      im.fill(0);
      for (let i = 0; i < nFft; i++) {
        const s = start + i < signal.length ? signal[start + i]! : 0;
        re[i] = s * win[i]!;
      }
      fftRadix2(re, im);
      for (let k = 0; k < nFreqs; k++) {
        const pr = re[k]!;
        const pi = im[k]!;
        phase[f * nFreqs + k] = Math.atan2(pi, pr);
      }
    }
    signal = istft(phase);
  }

  // Soft peak normalize
  let peak = 1e-8;
  for (let i = 0; i < signal.length; i++) {
    const a = Math.abs(signal[i]!);
    if (a > peak) peak = a;
  }
  const scale = 0.9 / peak;
  for (let i = 0; i < signal.length; i++) signal[i]! *= scale;
  return signal;
}

/** Write mono float samples as 16-bit PCM WAV. */
export function writeMonoWavFile(
  outPath: string,
  samples: Float32Array,
  sampleRate: number,
): void {
  const dataSize = samples.length * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  const pcm = Buffer.alloc(dataSize);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    pcm.writeInt16LE((v * 32767) | 0, i * 2);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([header, pcm]));
}

export { nextPow2 };
