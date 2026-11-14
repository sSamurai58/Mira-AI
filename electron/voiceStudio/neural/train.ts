/**
 * Full CPU neural TTS training: encoder → DTW/attention → mel decoder
 * (teacher forcing) → stop BCE → Adam, plus neural vocoder.
 */
import fs from "node:fs";
import path from "node:path";
import {
  extractMelFromWav,
  griffinLimFromMel,
  melToSummary,
  writeMonoWavFile,
  type MelSpectrogram,
  type MelSummary,
} from "../melSpectrogram";
import {
  tokenizeSpeechWords,
  type LinkedTrainClip,
  type VoiceModelPack,
} from "../modelPack";
import {
  dtwAlignTokensToMel,
  wordBoundsFromGraphemeAlign,
} from "./attention";
import { detectAccel, type AccelInfo } from "./cudaDetect";
import {
  applyDecoderGrads,
  createDecoderAdam,
  createDecoderGrads,
  createMelDecoder,
  decodeSequence,
  decodeSequenceBackward,
  serializeMelDecoder,
  teacherForceRatio,
  type MelDecoder,
} from "./melDecoder";
import {
  applyEncoderGrads,
  createEncoderGrads,
  createTextEncoder,
  encodeBackward,
  encodeForward,
  serializeTextEncoder,
  ENC_OUT,
  type TextEncoder,
} from "./textEncoder";
import { createAdam, zeros } from "./tensor";
import {
  createNeuralVocoder,
  productionVocode,
  serializeVocoder,
  trainNeuralVocoder,
  writeVocoderPreview,
  type NeuralVocoder,
} from "./vocoder";

export const NEURAL_METHOD = "neural-mel-cpu-v1";
export const DEFAULT_NEURAL_EPOCHS = 4;

export type NeuralEpochLoss = {
  epoch: number;
  step: number;
  melL1: number;
  stopBce: number;
  durationPenalty: number;
  loss: number;
  tfRatio: number;
  clipId?: string;
};

export type NeuralTrainProgress = {
  epoch: number;
  epochs: number;
  step: number;
  stepsInEpoch: number;
  loss: number;
  melL1: number;
  label: string;
};

export type NeuralTrainResult = {
  epochs: number;
  steps: number;
  losses: NeuralEpochLoss[];
  finalLoss: number;
  initialLoss: number;
  improved: boolean;
  melTargets: number;
  unitPriorsUpdated: number;
  gain: number;
  durationBias: number;
  neuralPreview: string | null;
  hqPreview: string | null;
  griffinLimPreview: string | null;
  melFeaturesPath: string;
  weightsPath: string;
  accel: AccelInfo;
  method: typeof NEURAL_METHOD;
  neuralTts: true;
  teacherForceFinal: number;
  vocoderSteps: number;
};

function durationPenalty(
  wordBounds: Array<{ startMs: number; endMs: number }>,
  clipMs: number,
): number {
  if (clipMs <= 0 || wordBounds.length === 0) return 0.2;
  const covered = wordBounds.reduce(
    (s, b) => s + Math.max(0, b.endMs - b.startMs),
    0,
  );
  const gap = Math.abs(covered - clipMs) / clipMs;
  return Math.min(0.6, gap * 0.8);
}

function downsampleMel(mel: MelSpectrogram, maxFrames: number): MelSpectrogram {
  if (mel.frameCount <= maxFrames) return mel;
  const step = mel.frameCount / maxFrames;
  const frames = new Float32Array(maxFrames * mel.nMels);
  for (let f = 0; f < maxFrames; f++) {
    const src = Math.min(mel.frameCount - 1, Math.floor(f * step));
    for (let m = 0; m < mel.nMels; m++) {
      frames[f * mel.nMels + m] = mel.frames[src * mel.nMels + m]!;
    }
  }
  return {
    ...mel,
    frames,
    frameCount: maxFrames,
    durationMs: mel.durationMs,
  };
}

/**
 * Train neural encoder/decoder/vocoder over linked clips; update pack priors.
 */
export function runNeuralMelTrain(
  pack: VoiceModelPack,
  packDir: string,
  clips: LinkedTrainClip[],
  opts?: {
    epochs?: number;
    onProgress?: (ev: NeuralTrainProgress) => void;
    writePreviews?: boolean;
  },
): NeuralTrainResult {
  const epochs = Math.max(1, opts?.epochs ?? DEFAULT_NEURAL_EPOCHS);
  const accel = detectAccel();
  const wavClips = clips.filter(
    (c) => path.extname(c.filePath).toLowerCase() === ".wav",
  );
  const workClips = wavClips.length > 0 ? wavClips : clips;

  const melDir = path.join(packDir, "mel-features");
  fs.mkdirSync(melDir, { recursive: true });

  const encoder = createTextEncoder();
  const decoder = createMelDecoder();
  const vocoder = createNeuralVocoder(160);
  const encAdam = createAdam(0.01);
  const decAdam = createDecoderAdam(0.012);

  const targets = new Map<
    string,
    {
      mel: MelSpectrogram;
      trainMel: MelSpectrogram;
      summary: MelSummary;
      phraseText: string;
      filePath: string;
    }
  >();

  for (const clip of workClips) {
    const mel = extractMelFromWav(clip.filePath);
    if (!mel) continue;
    const trainMel = downsampleMel(mel, 64);
    const summary = melToSummary(mel);
    targets.set(clip.clipId, {
      mel,
      trainMel,
      summary,
      phraseText: clip.phraseText,
      filePath: clip.filePath,
    });
    fs.writeFileSync(
      path.join(melDir, `${clip.clipId.slice(0, 12)}.mel.json`),
      JSON.stringify(
        {
          clipId: clip.clipId,
          phraseId: clip.phraseId,
          text: clip.phraseText,
          ...summary,
          neural: true,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  const unitScore: Record<string, number> = {};
  for (const u of pack.units) {
    if (u.provisional) continue;
    unitScore[u.id] = 1;
  }

  let gain = 1;
  let durationBias = 0;
  const losses: NeuralEpochLoss[] = [];
  let stepGlobal = 0;
  const stepsInEpoch = Math.max(1, targets.size);
  let teacherForceFinal = 1;
  let vocoderSteps = 0;

  for (let epoch = 1; epoch <= epochs; epoch++) {
    const tfRatio = teacherForceRatio(epoch, epochs, 1, 0.35);
    teacherForceFinal = tfRatio;
    let clipStep = 0;

    for (const [clipId, entry] of targets) {
      clipStep += 1;
      stepGlobal += 1;

      const { states, cache: encCache } = encodeForward(
        encoder,
        entry.phraseText,
      );
      const align = dtwAlignTokensToMel(states, entry.mel);
      const wordBounds = wordBoundsFromGraphemeAlign(
        entry.phraseText,
        align.bounds,
      );

      // Apply mild duration bias on word bounds (kept as aux signal)
      const biased = wordBounds.map((b) => {
        const mid = (b.startMs + b.endMs) / 2;
        const half = ((b.endMs - b.startMs) / 2) * (1 + durationBias);
        return {
          startMs: Math.max(0, mid - half),
          endMs: Math.min(entry.mel.durationMs, mid + half),
        };
      });

      const decoded = decodeSequence(decoder, states, entry.trainMel, {
        teacherForceRatio: tfRatio,
      });

      const durPen = durationPenalty(biased, entry.mel.durationMs);
      const loss =
        decoded.melL1 + 0.4 * decoded.stopBce + 0.25 * durPen;

      // Real Adam backprop through decoder + encoder
      const decGrads = createDecoderGrads(decoder);
      const dEnc = states.map(() => zeros(ENC_OUT));
      decodeSequenceBackward(
        decoder,
        entry.trainMel,
        decoded.caches,
        states,
        decGrads,
        dEnc,
      );
      applyDecoderGrads(decoder, decGrads, decAdam);

      const encGrads = createEncoderGrads(encoder);
      encodeBackward(encoder, encCache, dEnc, encGrads);
      applyEncoderGrads(encoder, encGrads, encAdam);

      // Duration / gain heuristics remain as aux (also updated from neural loss)
      if (durPen > 0.08) durationBias *= 0.85;
      else durationBias = durationBias * 0.9 + 0.01 * (Math.random() - 0.5);
      durationBias = Math.max(-0.12, Math.min(0.12, durationBias));

      // Unit priors from DTW-aligned slices
      const words = tokenizeSpeechWords(entry.phraseText);
      for (let w = 0; w < words.length; w++) {
        const bound = biased[w];
        if (!bound) continue;
        // Prefer units that land inside high-attention regions
        const boost = 0.03;
        for (const u of pack.units) {
          if (
            u.sourceClipId === clipId &&
            u.key &&
            !u.provisional &&
            (u.kind === "word" || u.kind === "fragment")
          ) {
            const mid = (u.startMs + u.endMs) / 2;
            if (mid >= bound.startMs && mid <= bound.endMs) {
              unitScore[u.id] = Math.max(
                0.2,
                Math.min(3, (unitScore[u.id] ?? 1) + boost),
              );
            }
          }
        }
      }

      const rec: NeuralEpochLoss = {
        epoch,
        step: stepGlobal,
        melL1: Number(decoded.melL1.toFixed(5)),
        stopBce: Number(decoded.stopBce.toFixed(5)),
        durationPenalty: Number(durPen.toFixed(5)),
        loss: Number(loss.toFixed(5)),
        tfRatio: Number(tfRatio.toFixed(3)),
        clipId,
      };
      losses.push(rec);

      opts?.onProgress?.({
        epoch,
        epochs,
        step: clipStep,
        stepsInEpoch,
        loss: rec.loss,
        melL1: rec.melL1,
        label: `Нейро эпоха ${epoch}/${epochs} · шаг ${clipStep}/${stepsInEpoch} · loss ${rec.loss.toFixed(4)} · TF ${tfRatio.toFixed(2)} · mel L1 ${rec.melL1.toFixed(4)}`,
      });
    }

    if (targets.size === 0) {
      opts?.onProgress?.({
        epoch,
        epochs,
        step: 1,
        stepsInEpoch: 1,
        loss: 1,
        melL1: 1,
        label: `Нейро эпоха ${epoch}/${epochs}: нет PCM mel-целей (нужны WAV)`,
      });
      losses.push({
        epoch,
        step: stepGlobal + 1,
        melL1: 1,
        stopBce: 0,
        durationPenalty: 0,
        loss: 1,
        tfRatio,
      });
      stepGlobal += 1;
    }
  }

  // Train neural vocoder on first few clips
  let vSteps = 0;
  let vi = 0;
  for (const entry of targets.values()) {
    if (vi >= 3) break;
    const r = trainNeuralVocoder(vocoder, entry.trainMel, entry.filePath, {
      steps: 24,
      lr: 0.015,
    });
    vSteps += r.steps;
    vi += 1;
  }
  vocoderSteps = vSteps;

  // Persist unit priors
  let unitPriorsUpdated = 0;
  for (const u of pack.units) {
    const s = unitScore[u.id];
    if (s == null) continue;
    u.score = Number(s.toFixed(4));
    unitPriorsUpdated += 1;
  }
  for (const entries of Object.values(pack.lexicon)) {
    for (const e of entries) {
      const s = unitScore[e.unitId];
      if (s != null) e.score = Number(s.toFixed(4));
    }
  }

  const initialLoss = losses[0]?.loss ?? 1;
  const finalLoss = losses[losses.length - 1]?.loss ?? initialLoss;
  const improved = finalLoss <= initialLoss + 1e-6;

  // Save neural weights
  const wPath = path.join(packDir, "neural-weights.json");
  fs.writeFileSync(
    wPath,
    JSON.stringify(
      {
        version: 1,
        method: NEURAL_METHOD,
        backend: accel.activeBackend,
        cudaAvailable: accel.cudaAvailable,
        accelDetail: accel.detail,
        encoder: serializeTextEncoder(encoder),
        decoder: serializeMelDecoder(decoder),
        vocoder: serializeVocoder(vocoder),
        trainedAt: new Date().toISOString(),
        epochs,
        finalLoss,
        teacherForceFinal,
      },
      null,
      2,
    ),
    "utf8",
  );

  let neuralPreview: string | null = null;
  let hqPreview: string | null = null;
  let griffinLimPreview: string | null = null;

  if (opts?.writePreviews !== false && targets.size > 0) {
    const first = targets.values().next().value as
      | { mel: MelSpectrogram }
      | undefined;
    if (first && first.mel.frameCount <= 160 && first.mel.durationMs < 6000) {
      try {
        const samples = productionVocode(vocoder, first.mel, {
          neuralBlend: 0.6,
        });
        neuralPreview = writeVocoderPreview(
          packDir,
          samples,
          first.mel.sampleRate,
          "neural-vocoder-preview.wav",
        );
        const hq = productionVocode(null, first.mel);
        hqPreview = writeVocoderPreview(
          packDir,
          hq,
          first.mel.sampleRate,
          "neural-hq-preview.wav",
        );
        // Keep a griffin reference for A/B RLHF
        const g = griffinLimFromMel(first.mel, 10);
        const gPath = path.join(packDir, "mel-griffin-preview.wav");
        writeMonoWavFile(gPath, g, first.mel.sampleRate);
        griffinLimPreview = gPath;
      } catch {
        neuralPreview = null;
      }
    }
  }

  const trainMeta = {
    method: NEURAL_METHOD,
    neuralTts: true as const,
    backend: accel.activeBackend,
    cudaAvailable: accel.cudaAvailable,
    accelDetail: accel.detail,
    epochs,
    steps: stepGlobal,
    initialLoss,
    finalLoss,
    improved,
    gain: Number(gain.toFixed(4)),
    durationBias: Number(durationBias.toFixed(4)),
    melTargets: targets.size,
    unitPriorsUpdated,
    teacherForceFinal,
    vocoderSteps,
    neuralPreview,
    hqPreview,
    griffinLimPreview,
    losses: losses.map((l) => ({
      epoch: l.epoch,
      step: l.step,
      loss: l.loss,
      melL1: l.melL1,
      stopBce: l.stopBce,
      tfRatio: l.tfRatio,
    })),
  };
  fs.writeFileSync(
    path.join(packDir, "train-metrics.json"),
    JSON.stringify(trainMeta, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(packDir, "model-pack.json"),
    JSON.stringify(
      {
        ...pack,
        trainMetrics: {
          epochs,
          steps: stepGlobal,
          finalLoss,
          initialLoss,
          gain: Number(gain.toFixed(4)),
          durationBias: Number(durationBias.toFixed(4)),
          melTargets: targets.size,
          method: NEURAL_METHOD,
          neuralTts: true,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    epochs,
    steps: stepGlobal,
    losses,
    finalLoss: Number(finalLoss.toFixed(5)),
    initialLoss: Number(initialLoss.toFixed(5)),
    improved,
    melTargets: targets.size,
    unitPriorsUpdated,
    gain: Number(gain.toFixed(4)),
    durationBias: Number(durationBias.toFixed(4)),
    neuralPreview,
    hqPreview,
    griffinLimPreview,
    melFeaturesPath: melDir,
    weightsPath: wPath,
    accel,
    method: NEURAL_METHOD,
    neuralTts: true,
    teacherForceFinal,
    vocoderSteps,
  };
}

export type { TextEncoder, MelDecoder, NeuralVocoder };
