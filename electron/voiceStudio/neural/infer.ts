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

type PackCacheEntry = {
  mtimeMs: number;
  pack: LoadedNeuralPack;
};

/** In-memory pack cache — avoids re-parsing multi‑MB weights every utterance. */
const packCache = new Map<string, PackCacheEntry>();

export function loadNeuralPack(packDir: string): LoadedNeuralPack | null {
  const file = path.join(packDir, "neural-weights.json");
  if (!fs.existsSync(file)) return null;
  try {
    const mtimeMs = fs.statSync(file).mtimeMs;
    const hit = packCache.get(packDir);
    if (hit && hit.mtimeMs === mtimeMs) return hit.pack;

    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      encoder: import("./textEncoder").SerializedTextEncoder;
      decoder: import("./melDecoder").SerializedMelDecoder;
      vocoder?: import("./vocoder").SerializedVocoder;
      sampleRate?: number;
      hopLength?: number;
    };
    const pack: LoadedNeuralPack = {
      encoder: loadTextEncoder(raw.encoder),
      decoder: loadMelDecoder(raw.decoder),
      vocoder: raw.vocoder ? loadVocoder(raw.vocoder) : null,
      sampleRate: raw.sampleRate ?? 16000,
      hopLength: raw.hopLength ?? 160,
    };
    packCache.set(packDir, { mtimeMs, pack });
    return pack;
  } catch {
    return null;
  }
}

/** Force-load pack into memory (warmup). */
export function warmupNeuralPack(packDir: string): boolean {
  return loadNeuralPack(packDir) !== null;
}

function framesToMel(
  frames: Float64Array,
  frameCount: number,
  sampleRate: number,
  hopLength: number,
): MelSpectrogram {
  const raw = new Float32Array(frameCount * MEL_N_MELS);
  for (let i = 0; i < raw.length; i++) raw[i] = frames[i] ?? -8;
  // Temporal smooth (3-frame) — AR mel flicker → HF hiss after vocode.
  const f32 = new Float32Array(raw.length);
  for (let f = 0; f < frameCount; f++) {
    const f0 = Math.max(0, f - 1);
    const f2 = Math.min(frameCount - 1, f + 1);
    for (let m = 0; m < MEL_N_MELS; m++) {
      f32[f * MEL_N_MELS + m] =
        0.25 * raw[f0 * MEL_N_MELS + m]! +
        0.5 * raw[f * MEL_N_MELS + m]! +
        0.25 * raw[f2 * MEL_N_MELS + m]!;
    }
  }
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
  // Russian needs ~2.4–3 frames/char at hop 160 / 16 kHz or phonemes smear.
  const durationMul = pauseScale / speed;
  const qualityCap = quality === "fast" ? 200 : quality === "studio" ? 420 : 320;
  const framesPerChar = quality === "fast" ? 2.1 : quality === "studio" ? 3.0 : 2.55;
  const baseFrames = Math.round(clean.length * framesPerChar * durationMul);

  const { states } = encodeForward(loaded.encoder, clean);
  const maxFrames =
    opts?.maxFrames ??
    Math.min(qualityCap, Math.max(36, baseFrames));
  const decoded = decodeInfer(loaded.decoder, states, {
    maxFrames,
    // Don't cut early — truncated mel → mushy unintelligible tails.
    stopThreshold: quality === "fast" ? 0.72 : 0.78,
  });
  const mel = framesToMel(
    decoded.frames,
    decoded.frameCount,
    loaded.sampleRate,
    loaded.hopLength,
  );
  // productionVocode picks the cleanest of GL / neural / blend by speechiness.
  const blend = quality === "studio" ? 0.8 : quality === "fast" ? 0.55 : 0.7;
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
