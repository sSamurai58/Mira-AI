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
 * Speech-band post-filter: DC block (~80 Hz) + low-pass (~3.4 kHz).
 * Griffin-Lim residuals are hissy (high ZCR); without this the renderer
 * speech-likeness gate rejects synth and used to fall back to clip stitching.
 */
export function speechBandPostFilter(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  const out = new Float32Array(samples.length);
  if (!samples.length) return out;
  const dt = 1 / Math.max(1, sampleRate);
  const hpRc = 1 / (2 * Math.PI * 80);
  const lpRc = 1 / (2 * Math.PI * 3400);
  const hpA = hpRc / (hpRc + dt);
  const lpA = dt / (lpRc + dt);
  let hpPrevX = 0;
  let hpPrevY = 0;
  let lpY = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!;
    const hpY = hpA * (hpPrevY + x - hpPrevX);
    hpPrevX = x;
    hpPrevY = hpY;
    lpY += lpA * (hpY - lpY);
    out[i] = lpY;
  }
  let peak = 1e-8;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]!);
    if (a > peak) peak = a;
  }
  const scale = 0.92 / peak;
  for (let i = 0; i < out.length; i++) out[i]! *= scale;
  return out;
}

/**
 * Improved multi-iteration reconstruction from mel (better than short Griffin-Lim preview).
 * Uses more iterations + speech-band post-filter (not a muddy one-pole).
 */
export function highQualityReconstructFromMel(
  mel: MelSpectrogram,
  iterations = 24,
): Float32Array {
  const base = griffinLimFromMel(mel, Math.max(12, iterations));
  return speechBandPostFilter(base, mel.sampleRate);
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

export function vocoderSynthesize(
  voc: NeuralVocoder,
  mel: MelSpectrogram,
): Float32Array {
  const hop = voc.hop;
  const outLen = Math.max(hop, (mel.frameCount - 1) * hop + hop);
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const win = hann(hop);
  for (let f = 0; f < mel.frameCount; f++) {
    const melFrame = new Float64Array(MEL_N_MELS);
    for (let m = 0; m < MEL_N_MELS; m++) {
      melFrame[m] = mel.frames[f * mel.nMels + m]!;
    }
    const { samples } = vocoderFrame(voc, melFrame);
    const start = f * hop;
    for (let i = 0; i < hop; i++) {
      const w = win[i]!;
      out[start + i]! += samples[i]! * w;
      norm[start + i]! += w * w;
    }
  }
  for (let i = 0; i < outLen; i++) {
    if (norm[i]! > 1e-8) out[i]! /= norm[i]!;
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

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
  }
  return w;
}

/**
 * Blend neural vocoder residual with high-quality iterative reconstruction.
 * Production path: neural carries fine detail; HQ base carries phase structure.
 */
export function productionVocode(
  voc: NeuralVocoder | null,
  mel: MelSpectrogram,
  opts?: { neuralBlend?: number },
): Float32Array {
  // More Griffin-Lim iterations → stabler phase; neural residual is detail only.
  const hq = highQualityReconstructFromMel(mel, 28);
  if (!voc) return hq;
  const neural = speechBandPostFilter(
    vocoderSynthesize(voc, mel),
    mel.sampleRate,
  );
  // Cap neural blend — residual MLP is noisy; HQ carries intelligibility.
  const blend = Math.min(0.45, opts?.neuralBlend ?? 0.35);
  const n = Math.min(hq.length, neural.length);
  const mixed = new Float32Array(Math.max(hq.length, neural.length));
  for (let i = 0; i < n; i++) {
    mixed[i] = (1 - blend) * hq[i]! + blend * neural[i]!;
  }
  if (hq.length > n) mixed.set(hq.subarray(n), n);
  else if (neural.length > n) {
    for (let i = n; i < neural.length; i++) mixed[i] = neural[i]!;
  }
  return speechBandPostFilter(mixed, mel.sampleRate);
}

export type VocoderTrainResult = {
  steps: number;
  finalL1: number;
  initialL1: number;
};

/**
 * Train neural vocoder to match PCM from mel frames (Adam / L1).
 */
export function trainNeuralVocoder(
  voc: NeuralVocoder,
  mel: MelSpectrogram,
  wavPath: string,
  opts?: { steps?: number; lr?: number },
): VocoderTrainResult {
  const pcm = readPcmMonoNormalized(wavPath);
  if (!pcm) return { steps: 0, finalL1: 1, initialL1: 1 };
  const hop = voc.hop;
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
    // Subsample frames for speed
    const stride = Math.max(1, Math.floor(mel.frameCount / 24));
    for (let f = 0; f < mel.frameCount; f += stride) {
      const melFrame = new Float64Array(MEL_N_MELS);
      for (let m = 0; m < MEL_N_MELS; m++) {
        melFrame[m] = mel.frames[f * mel.nMels + m]!;
      }
      const { samples, h, pre } = vocoderFrame(voc, melFrame);
      const start = Math.min(
        pcm.samples.length - hop,
        Math.floor((f * mel.hopLength * pcm.sampleRate) / mel.sampleRate),
      );
      const safeStart = Math.max(0, start);
      const dSamples = new Float64Array(hop);
      for (let i = 0; i < hop; i++) {
        const tgt =
          safeStart + i < pcm.samples.length
            ? pcm.samples[safeStart + i]!
            : 0;
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
