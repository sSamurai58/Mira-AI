/**
 * Neural vocoder (mel→waveform MLP residual) + high-quality iterative
 * reconstruction. Production path prefers neural when weights are trained.
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildMelFilterbank,
  griffinLimFromMel,
  MEL_N_FFT,
  MEL_N_MELS,
  readPcmMonoNormalized,
  writeMonoWavFile,
  type MelSpectrogram,
} from "../melSpectrogram";
import {
  adamUpdateDense,
  createAdam,
  createDense,
  denseBackward,
  denseForward,
  loadDense,
  serializeDense,
  tanhArr,
  zeros,
  type AdamState,
  type Dense,
  type SerializedDense,
  zeroGrad,
} from "./tensor";

const VOC_HID = 96;

export type NeuralVocoder = {
  /** Mel frame → hop samples residual */
  net: Dense;
  out: Dense;
  hop: number;
};

export type SerializedVocoder = {
  net: SerializedDense;
  out: SerializedDense;
  hop: number;
};

export function createNeuralVocoder(hop = 160): NeuralVocoder {
  return {
    net: createDense(MEL_N_MELS, VOC_HID, 0.08),
    out: createDense(VOC_HID, hop, 0.05),
    hop,
  };
}

export function serializeVocoder(v: NeuralVocoder): SerializedVocoder {
  return {
    net: serializeDense(v.net),
    out: serializeDense(v.out),
    hop: v.hop,
  };
}

export function loadVocoder(data: SerializedVocoder): NeuralVocoder {
  return {
    net: loadDense(data.net),
    out: loadDense(data.out),
    hop: data.hop,
  };
}

/**
 * Speech intelligibility tidy:
 * - DC / rumble cut (~80 Hz)
 * - mild presence lift ~1.2–2.8 kHz (formants / consonants)
 * - stronger hiss cut above ~5.5 kHz (Griffin-Lim noise lives here)
 */
export function speechBandPostFilter(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  const out = new Float32Array(samples.length);
  if (!samples.length) return out;
  const dt = 1 / Math.max(1, sampleRate);
  const hpRc = 1 / (2 * Math.PI * 80);
  const lpHz = Math.min(5500, sampleRate * 0.34);
  const lpRc = 1 / (2 * Math.PI * lpHz);
  const hpA = hpRc / (hpRc + dt);
  const lpA = dt / (lpRc + dt);
  // Presence peaking via parallel band (approx 1.8 kHz).
  const peakHz = Math.min(1800, sampleRate * 0.12);
  const peakRc = 1 / (2 * Math.PI * peakHz);
  const peakA = dt / (peakRc + dt);
  const presenceGain = 0.28;
  let hpPrevX = 0;
  let hpPrevY = 0;
  let lpY = 0;
  let bandY = 0;
  let bandPrev = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!;
    const hpY = hpA * (hpPrevY + x - hpPrevX);
    hpPrevX = x;
    hpPrevY = hpY;
    lpY += lpA * (hpY - lpY);
    bandY += peakA * (hpY - bandY);
    const band = bandY - bandPrev;
    bandPrev = bandY;
    out[i] = lpY + presenceGain * band;
  }
  // Gentle floor on micro-hiss only — aggressive gates killed speech ZCR.
  const win = Math.max(32, Math.floor(sampleRate * 0.01));
  let run = 0;
  let envPeak = 1e-8;
  const env = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    run += out[i]! * out[i]!;
    if (i >= win) run -= out[i - win]! * out[i - win]!;
    env[i] = Math.sqrt(Math.max(0, run / win));
    if (env[i]! > envPeak) envPeak = env[i]!;
  }
  const gate = envPeak * 0.02;
  for (let i = 0; i < out.length; i++) {
    if (env[i]! < gate) {
      out[i]! *= env[i]! / Math.max(gate, 1e-8);
    }
  }

  let peak = 1e-8;
  let sumSq = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]!);
    if (a > peak) peak = a;
    sumSq += out[i]! * out[i]!;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, out.length));
  // Target healthier RMS so speech isn't a few spikes in silence.
  const targetRms = Math.min(0.22, peak * 0.35);
  const rmsScale = rms > 1e-6 ? Math.min(3.2, targetRms / rms) : 1;
  const scale = Math.min(0.92 / peak, rmsScale);
  for (let i = 0; i < out.length; i++) out[i]! *= scale;
  // Final safety peak
  peak = 1e-8;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]!);
    if (a > peak) peak = a;
  }
  if (peak > 0.95) {
    const s = 0.92 / peak;
    for (let i = 0; i < out.length; i++) out[i]! *= s;
  }
  return out;
}

/**
 * Improved multi-iteration reconstruction from mel (better than short Griffin-Lim preview).
 * Filter is applied once by productionVocode — avoid triple-filtering here.
 */
export function highQualityReconstructFromMel(
  mel: MelSpectrogram,
  iterations = 32,
): Float32Array {
  return griffinLimFromMel(mel, Math.max(24, iterations));
}

/** Neural frame synthesis: mel → hop waveform samples. */
export function vocoderFrame(
  voc: NeuralVocoder,
  melFrame: Float64Array,
): { samples: Float64Array; h: Float64Array; pre: Float64Array } {
  const { y: pre } = denseForward(voc.net, melFrame);
  const h = tanhArr(pre);
  const { y: samples } = denseForward(voc.out, h);
  return { samples, h, pre };
}

/** Crossfade width between abutting hop frames (V1: no Hann/w²). */
const HOP_XFADE = 16;

/**
 * Place one hop frame into `out` at `start` with a short linear crossfade.
 * Same placement used at infer (V1) — train targets raw hop PCM (V2).
 */
export function placeHopFrame(
  out: Float32Array,
  start: number,
  samples: ArrayLike<number>,
  hop: number,
  xfade = HOP_XFADE,
): void {
  const n = Math.min(hop, samples.length);
  const fade = Math.min(xfade, Math.floor(n / 2), start);
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= out.length) continue;
    const s = samples[i]!;
    if (i < fade && start > 0) {
      const t = i / Math.max(1, fade);
      out[idx] = out[idx]! * (1 - t) + s * t;
    } else {
      out[idx] = s;
    }
  }
}

/**
 * Mel → waveform. Abutting hops + short crossfade (no Hann of length=hop).
 * Old path did out+=s*w; out/=w² → edge gain s/w ≈ 100 Hz buzz (V1).
 */
export function vocoderSynthesize(
  voc: NeuralVocoder,
  mel: MelSpectrogram,
): Float32Array {
  const hop = voc.hop;
  const outLen = Math.max(hop, mel.frameCount * hop);
  const out = new Float32Array(outLen);
  for (let f = 0; f < mel.frameCount; f++) {
    const melFrame = new Float64Array(MEL_N_MELS);
    for (let m = 0; m < MEL_N_MELS; m++) {
      melFrame[m] = mel.frames[f * mel.nMels + m]!;
    }
    const { samples } = vocoderFrame(voc, melFrame);
    placeHopFrame(out, f * hop, samples, hop);
  }
  // Peak normalize
  let peak = 1e-8;
  for (let i = 0; i < outLen; i++) {
    const a = Math.abs(out[i]!);
    if (a > peak) peak = a;
  }
  const scale = 0.9 / peak;
  for (let i = 0; i < outLen; i++) out[i]! *= scale;
  return out;
}

function alignWaveLength(a: Float32Array, b: Float32Array): {
  a: Float32Array;
  b: Float32Array;
  n: number;
} {
  const n = Math.min(a.length, b.length);
  return {
    a: a.length === n ? a : a.subarray(0, n),
    b: b.length === n ? b : b.subarray(0, n),
    n,
  };
}

/**
 * Neural-primary vocode. Griffin-Lim is fallback only — ZCR "speechiness"
 * must not pick hissy GL over neural (V8). Lengths aligned before blend (V11).
 */
export function productionVocode(
  voc: NeuralVocoder | null,
  mel: MelSpectrogram,
  opts?: { neuralBlend?: number; vocoderReady?: boolean },
): Float32Array {
  if (!voc) {
    return speechBandPostFilter(
      highQualityReconstructFromMel(mel, 40),
      mel.sampleRate,
    );
  }
  const neural = vocoderSynthesize(voc, mel);
  const ready = opts?.vocoderReady !== false;
  // Prefer neural whenever we have weights; optional light GL mix only.
  if (ready) {
    const blendHint = Math.min(0.95, Math.max(0.85, opts?.neuralBlend ?? 0.9));
    if (blendHint >= 0.99) {
      return speechBandPostFilter(neural, mel.sampleRate);
    }
    const hq = highQualityReconstructFromMel(mel, 40);
    const { a: nWav, b: gWav, n } = alignWaveLength(neural, hq);
    const mixed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      mixed[i] = blendHint * nWav[i]! + (1 - blendHint) * gWav[i]!;
    }
    return speechBandPostFilter(mixed, mel.sampleRate);
  }
  return speechBandPostFilter(
    highQualityReconstructFromMel(mel, 40),
    mel.sampleRate,
  );
}

export type VocoderTrainResult = {
  steps: number;
  finalL1: number;
  initialL1: number;
};

function resampleMonoLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || samples.length < 2) return samples;
  const ratio = toRate / Math.max(1, fromRate);
  const n = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const t = x - i0;
    out[i] = samples[i0]! * (1 - t) + samples[i1]! * t;
  }
  return out;
}

/**
 * Train neural vocoder to match PCM from mel frames (Adam / L1).
 * Targets = raw hop PCM at f*hop — same as placeHopFrame/infer (V2).
 * `srcFrameOffset` maps crop-local frame index → original mel frame (V3).
 */
export function trainNeuralVocoder(
  voc: NeuralVocoder,
  mel: MelSpectrogram,
  wavPath: string,
  opts?: { steps?: number; lr?: number; srcFrameOffset?: number },
): VocoderTrainResult {
  const pcm = readPcmMonoNormalized(wavPath);
  if (!pcm) return { steps: 0, finalL1: 1, initialL1: 1 };
  const wave = resampleMonoLinear(pcm.samples, pcm.sampleRate, mel.sampleRate);
  const hop = voc.hop;
  const hopLen = mel.hopLength || hop;
  const frameOff = Math.max(0, opts?.srcFrameOffset ?? 0);
  const steps = opts?.steps ?? 40;
  const adam = createAdam(opts?.lr ?? 0.012);
  const dNetW = zeros(voc.net.w.length);
  const dNetB = zeros(voc.net.b.length);
  const dOutW = zeros(voc.out.w.length);
  const dOutB = zeros(voc.out.b.length);

  let initial = 0;
  let final = 0;
  let measured = false;

  for (let step = 0; step < steps; step++) {
    zeroGrad(dNetW);
    zeroGrad(dNetB);
    zeroGrad(dOutW);
    zeroGrad(dOutB);
    let loss = 0;
    let count = 0;
    const stride = Math.max(1, Math.floor(mel.frameCount / 32));
    for (let f = 0; f < mel.frameCount; f += stride) {
      const melFrame = new Float64Array(MEL_N_MELS);
      for (let m = 0; m < MEL_N_MELS; m++) {
        melFrame[m] = mel.frames[f * mel.nMels + m]!;
      }
      const { samples, h, pre } = vocoderFrame(voc, melFrame);
      const srcFrame = frameOff + f;
      const start = Math.min(
        Math.max(0, wave.length - hop),
        srcFrame * hopLen,
      );
      const dSamples = new Float64Array(hop);
      for (let i = 0; i < hop; i++) {
        const tgt = start + i < wave.length ? wave[start + i]! : 0;
        const diff = samples[i]! - tgt;
        loss += Math.abs(diff);
        dSamples[i] = diff === 0 ? 0 : diff > 0 ? 1 / hop : -1 / hop;
        count += 1;
      }
      const dH = denseBackward(voc.out, h, dSamples, {
        dw: dOutW,
        db: dOutB,
      });
      const dPre = new Float64Array(VOC_HID);
      for (let i = 0; i < VOC_HID; i++) {
        dPre[i] = dH[i]! * (1 - h[i]! * h[i]!);
      }
      denseBackward(voc.net, melFrame, dPre, { dw: dNetW, db: dNetB });
      void pre;
    }
    const stepBefore = adam.step;
    adamUpdateDense(voc.net, dNetW, dNetB, adam);
    adam.step = stepBefore;
    adamUpdateDense(voc.out, dOutW, dOutB, adam);
    const avg = count ? loss / count : 1;
    if (!measured) {
      initial = avg;
      measured = true;
    }
    final = avg;
  }
  return { steps, finalL1: final, initialL1: initial };
}

export function writeVocoderPreview(
  packDir: string,
  samples: Float32Array,
  sampleRate: number,
  name = "neural-vocoder-preview.wav",
): string {
  const out = path.join(packDir, name);
  writeMonoWavFile(out, samples, sampleRate);
  return out;
}

/** Optional: dump magnitude spectrogram helper for debugging (unused in prod). */
export function melFilterbankNorm(sampleRate: number): Float32Array {
  return buildMelFilterbank(sampleRate, MEL_N_FFT, MEL_N_MELS);
}

export function vocoderExists(packDir: string): boolean {
  return fs.existsSync(path.join(packDir, "neural-weights.json"));
}
