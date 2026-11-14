/**
 * Neural TTS inference: text → encoder → mel decoder → neural/HQ vocoder.
 */
import fs from "node:fs";
import path from "node:path";
import {
  writeMonoWavFile,
  type MelSpectrogram,
  MEL_N_FFT,
  MEL_N_MELS,
} from "../melSpectrogram";
import { decodeInfer, loadMelDecoder, type MelDecoder } from "./melDecoder";
import {
  encodeForward,
  loadTextEncoder,
  type TextEncoder,
} from "./textEncoder";
import {
  loadVocoder,
  productionVocode,
  type NeuralVocoder,
} from "./vocoder";

export type LoadedNeuralPack = {
  encoder: TextEncoder;
  decoder: MelDecoder;
  vocoder: NeuralVocoder | null;
  sampleRate: number;
  hopLength: number;
};

export function loadNeuralPack(packDir: string): LoadedNeuralPack | null {
  const file = path.join(packDir, "neural-weights.json");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      encoder: import("./textEncoder").SerializedTextEncoder;
      decoder: import("./melDecoder").SerializedMelDecoder;
      vocoder?: import("./vocoder").SerializedVocoder;
      sampleRate?: number;
      hopLength?: number;
    };
    return {
      encoder: loadTextEncoder(raw.encoder),
      decoder: loadMelDecoder(raw.decoder),
      vocoder: raw.vocoder ? loadVocoder(raw.vocoder) : null,
      sampleRate: raw.sampleRate ?? 16000,
      hopLength: raw.hopLength ?? 160,
    };
  } catch {
    return null;
  }
}

function framesToMel(
  frames: Float64Array,
  frameCount: number,
  sampleRate: number,
  hopLength: number,
): MelSpectrogram {
  const f32 = new Float32Array(frameCount * MEL_N_MELS);
  for (let i = 0; i < f32.length; i++) f32[i] = frames[i] ?? -8;
  const mean = new Float32Array(MEL_N_MELS);
  const std = new Float32Array(MEL_N_MELS);
  for (let m = 0; m < MEL_N_MELS; m++) {
    let sum = 0;
    for (let f = 0; f < frameCount; f++) sum += f32[f * MEL_N_MELS + m]!;
    mean[m] = sum / Math.max(1, frameCount);
    let v = 0;
    for (let f = 0; f < frameCount; f++) {
      const d = f32[f * MEL_N_MELS + m]! - mean[m]!;
      v += d * d;
    }
    std[m] = Math.sqrt(v / Math.max(1, frameCount)) + 1e-6;
  }
  return {
    sampleRate,
    nFft: MEL_N_FFT,
    hopLength,
    nMels: MEL_N_MELS,
    frames: f32,
    frameCount,
    mean,
    std,
    durationMs: (frameCount * hopLength * 1000) / sampleRate,
  };
}

export type NeuralSynthResult = {
  wavPath: string;
  frameCount: number;
  durationMs: number;
  method: "neural-mel-cpu-v1";
};

/** Local prosody prior — no cloud; affects duration + sample energy. */
export type NeuralProsody = {
  speed?: number;
  pauseScale?: number;
  energy?: number;
  quality?: "fast" | "balanced" | "studio";
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function scaleSamplesInPlace(samples: Float32Array, gain: number): void {
  const g = clamp(gain, 0.4, 1.6);
  if (Math.abs(g - 1) < 0.02) return;
  const ceiling = 0.95;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]! * g;
    samples[i] = v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  if (peak > ceiling) {
    const s = ceiling / peak;
    for (let i = 0; i < samples.length; i++) samples[i]! *= s;
  }
}

/**
 * Synthesize speech for `text` using trained neural pack weights.
 */
export function synthesizeNeuralSpeech(
  packDir: string,
  text: string,
  opts?: { outName?: string; maxFrames?: number; prosody?: NeuralProsody },
): NeuralSynthResult | null {
  const clean = text.trim();
  if (!clean) return null;
  const loaded = loadNeuralPack(packDir);
  if (!loaded) return null;

  const speed = clamp(opts?.prosody?.speed ?? 1, 0.75, 1.35);
  const pauseScale = clamp(opts?.prosody?.pauseScale ?? 1, 0.75, 1.4);
  const energy = clamp(opts?.prosody?.energy ?? 1, 0.55, 1.35);
  const quality = opts?.prosody?.quality ?? "balanced";
  // Slower / more pauses → more mel frames; fast quality caps ceiling.
  const durationMul = pauseScale / speed;
  const qualityCap = quality === "fast" ? 160 : quality === "studio" ? 320 : 240;
  const baseFrames = Math.round(clean.length * 1.8 * durationMul);

  const { states } = encodeForward(loaded.encoder, clean);
  const maxFrames =
    opts?.maxFrames ??
    Math.min(qualityCap, Math.max(24, baseFrames));
  const decoded = decodeInfer(loaded.decoder, states, {
    maxFrames,
    stopThreshold: quality === "fast" ? 0.62 : 0.55,
  });
  const mel = framesToMel(
    decoded.frames,
    decoded.frameCount,
    loaded.sampleRate,
    loaded.hopLength,
  );
  const blend = quality === "studio" ? 0.78 : quality === "fast" ? 0.5 : 0.65;
  const samples = productionVocode(loaded.vocoder, mel, { neuralBlend: blend });
  scaleSamplesInPlace(samples, energy);
  const outName = opts?.outName ?? `neural-synth-${Date.now().toString(36)}.wav`;
  const outDir = path.join(packDir, "synth");
  fs.mkdirSync(outDir, { recursive: true });
  const wavPath = path.join(outDir, outName);
  writeMonoWavFile(wavPath, samples, loaded.sampleRate);
  return {
    wavPath,
    frameCount: decoded.frameCount,
    durationMs: mel.durationMs,
    method: "neural-mel-cpu-v1",
  };
}
