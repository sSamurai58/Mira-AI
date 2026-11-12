/**
 * Lightweight iterative pack refinement over mel targets.
 * Gradient-free numeric updates — NOT Adam / neural backprop.
 * Maps neural TTS curriculum concepts onto unit-selection steps.
 */
import fs from "node:fs";
import path from "node:path";
import {
  concatMels,
  extractMelFromWav,
  griffinLimFromMel,
  melL1,
  melToSummary,
  sliceMelByTime,
  writeMonoWavFile,
  type MelSpectrogram,
  type MelSummary,
} from "./melSpectrogram";
import { estimateWordBoundariesByEnergy } from "./audioFeatures";
import {
  tokenizeSpeechWords,
  type LinkedTrainClip,
  type VoiceModelPack,
} from "./modelPack";

export const DEFAULT_TRAIN_EPOCHS = 4;

export type CurriculumRow = {
  concept: string;
  neural: string;
  mira: string;
  status: "mapped" | "proxy" | "deferred";
};

/** Honest neural TTS → Mira mapping shown in Studio. */
export const NEURAL_TTS_CURRICULUM: CurriculumRow[] = [
  {
    concept: "spectrogram / mel target",
    neural: "Целевой mel-спектрограмм из речи",
    mira: "FFT→mel filterbank (JS) на PCM WAV; mel summary в pack",
    status: "mapped",
  },
  {
    concept: "encoder",
    neural: "Текстовый encoder (символы→скрытые состояния)",
    mira: "Токенизация фраз + нормализация ключей лексикона",
    status: "proxy",
  },
  {
    concept: "attention",
    neural: "Attention текст↔mel кадры",
    mira: "Spectral-flux + energy valley выравнивание слов (zero-cross slice)",
    status: "proxy",
  },
  {
    concept: "decoder (frame-by-frame mel)",
    neural: "Авторегрессивный mel-decoder",
    mira: "Склейка unit mel-срезов → proxy mel по времени",
    status: "proxy",
  },
  {
    concept: "stop token",
    neural: "Предсказание конца высказывания",
    mira: "Штраф за тишину/длительность на хвосте клипа",
    status: "proxy",
  },
  {
    concept: "teacher forcing",
    neural: "Подстановка ground-truth mel на train",
    mira: "Целевой mel всегда из записи; proxy только для loss",
    status: "proxy",
  },
  {
    concept: "L1/L2 mel loss",
    neural: "Скалярный loss mel pred vs target",
    mira: "Mel L1 + duration/stop penalty по эпохам",
    status: "mapped",
  },
  {
    concept: "backprop + Adam",
    neural: "Градиенты по миллионам весов",
    mira: "Gradient-free обновление priors/gain/duration bias",
    status: "proxy",
  },
  {
    concept: "epochs / steps",
    neural: "Проходы по датасету",
    mira: "Несколько эпох refinement над корпусом (реальный CPU)",
    status: "mapped",
  },
  {
    concept: "vocoder",
    neural: "HiFi-GAN / WaveNet",
    mira: "Опциональный Griffin-Lim preview (не prod речь)",
    status: "proxy",
  },
  {
    concept: "data quality",
    neural: "Чистый корпус без шума/клиппинга",
    mira: "QA: тишина, RMS, клиппинг, noise, text↔audio mismatch",
    status: "mapped",
  },
  {
    concept: "ASR / LLM / TTS separation",
    neural: "Раздельные модули пайплайна",
    mira: "Студия только TTS pack; ASR и LLM отдельно",
    status: "mapped",
  },
  {
    concept: "inference path",
    neural: "text→encoder→decoder→vocoder",
    mira: "text→lexicon lookup→unit stitch (+ system TTS fallback)",
    status: "mapped",
  },
  {
    concept: "full neural net + CUDA",
    neural: "Tacotron/FastSpeech на GPU",
    mira: "Не в Electron desktop — отложено",
    status: "deferred",
  },
  {
    concept: "neural vocoder / RLHF voice",
    neural: "HiFi-GAN + RLHF",
    mira: "Отложено",
    status: "deferred",
  },
];

export type EpochLossRecord = {
  epoch: number;
  step: number;
  melL1: number;
  durationPenalty: number;
  stopPenalty: number;
  loss: number;
  clipId?: string;
};

export type MelTrainResult = {
  epochs: number;
  steps: number;
  losses: EpochLossRecord[];
  finalLoss: number;
  initialLoss: number;
  improved: boolean;
  melTargets: number;
  unitPriorsUpdated: number;
  gain: number;
  durationBias: number;
  griffinLimPreview: string | null;
  melFeaturesPath: string;
  curriculum: CurriculumRow[];
};

export type MelTrainProgress = {
  epoch: number;
  epochs: number;
  step: number;
  stepsInEpoch: number;
  loss: number;
  melL1: number;
  label: string;
};

function stopPenaltyFromMel(mel: MelSpectrogram): number {
  // Low energy in last ~12% of frames should be moderate (natural stop);
  // very high end-energy OR dead silence whole clip → penalty.
  if (mel.frameCount < 4) return 0.15;
  const tailStart = Math.floor(mel.frameCount * 0.88);
  let tail = 0;
  let mid = 0;
  const midEnd = Math.max(1, tailStart);
  for (let f = 0; f < midEnd; f++) {
    for (let m = 0; m < mel.nMels; m++) {
      mid += Math.exp(mel.frames[f * mel.nMels + m]!);
    }
  }
  for (let f = tailStart; f < mel.frameCount; f++) {
    for (let m = 0; m < mel.nMels; m++) {
      tail += Math.exp(mel.frames[f * mel.nMels + m]!);
    }
  }
  const midAvg = mid / Math.max(1, midEnd * mel.nMels);
  const tailAvg = tail / Math.max(1, (mel.frameCount - tailStart) * mel.nMels);
  const ratio = midAvg > 1e-12 ? tailAvg / midAvg : 1;
  // Ideal soft stop ~0.15–0.55 of mid energy.
  if (ratio < 0.05) return 0.08; // abrupt cut / missing stop energy shape
  if (ratio > 1.2) return Math.min(0.45, (ratio - 1.2) * 0.5);
  return 0;
}

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

/**
 * Build proxy «decoded» mel by concatenating per-word mel slices
 * (unit-selection stand-in for frame-by-frame decoder output).
 */
function reconstructProxyMel(
  target: MelSpectrogram,
  filePath: string,
  phraseText: string,
  durationBias: number,
): {
  proxy: MelSpectrogram;
  bounds: Array<{ startMs: number; endMs: number }>;
} {
  const words = tokenizeSpeechWords(phraseText);
  const bounds = estimateWordBoundariesByEnergy(
    filePath,
    Math.max(1, words.length),
    target.durationMs,
  );
  // Apply duration bias: stretch/shrink slots slightly around mean.
  const biased = bounds.map((b) => {
    const mid = (b.startMs + b.endMs) / 2;
    const half = ((b.endMs - b.startMs) / 2) * (1 + durationBias);
    return {
      startMs: Math.max(0, mid - half),
      endMs: Math.min(target.durationMs, mid + half),
    };
  });
  const parts = biased.map((b) =>
    sliceMelByTime(target, b.startMs, Math.max(b.startMs + 8, b.endMs)),
  );
  const proxy = concatMels(parts) ?? target;
  return { proxy, bounds: biased };
}

/**
 * Run multi-epoch mel refinement over linked clips; update pack priors.
 */
export function runMelRefinement(
  pack: VoiceModelPack,
  packDir: string,
  clips: LinkedTrainClip[],
  opts?: {
    epochs?: number;
    onProgress?: (ev: MelTrainProgress) => void;
    writeGriffinLimPreview?: boolean;
  },
): MelTrainResult {
  const epochs = Math.max(1, opts?.epochs ?? DEFAULT_TRAIN_EPOCHS);
  const wavClips = clips.filter((c) =>
    path.extname(c.filePath).toLowerCase() === ".wav",
  );
  const workClips = wavClips.length > 0 ? wavClips : clips;

  const melDir = path.join(packDir, "mel-features");
  fs.mkdirSync(melDir, { recursive: true });

  const targets = new Map<
    string,
    { mel: MelSpectrogram; summary: MelSummary; phraseText: string; filePath: string }
  >();
  for (const clip of workClips) {
    const mel = extractMelFromWav(clip.filePath);
    if (!mel) continue;
    const summary = melToSummary(mel);
    targets.set(clip.clipId, {
      mel,
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
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  // Unit selection priors (score) — higher = preferred at inference.
  const unitScore: Record<string, number> = {};
  for (const u of pack.units) {
    if (u.provisional) continue;
    unitScore[u.id] = 1;
  }

  let gain = 1;
  let durationBias = 0;
  const losses: EpochLossRecord[] = [];
  let stepGlobal = 0;
  const stepsInEpoch = Math.max(1, targets.size);

  for (let epoch = 1; epoch <= epochs; epoch++) {
    let epochLossSum = 0;
    let epochN = 0;
    let clipStep = 0;
    for (const [clipId, entry] of targets) {
      clipStep += 1;
      stepGlobal += 1;
      const { proxy, bounds } = reconstructProxyMel(
        entry.mel,
        entry.filePath,
        entry.phraseText,
        durationBias,
      );
      const l1 = melL1(proxy, entry.mel);
      const durPen = durationPenalty(bounds, entry.mel.durationMs);
      const stopPen = stopPenaltyFromMel(entry.mel);
      // Soft gain: compare mean energy
      let targetE = 0;
      let proxyE = 0;
      for (let i = 0; i < entry.mel.mean.length; i++) {
        targetE += Math.exp(entry.mel.mean[i]!);
        proxyE += Math.exp(proxy.mean[i]!);
      }
      const gainErr =
        targetE > 1e-12
          ? Math.abs(Math.log((proxyE + 1e-12) / (targetE + 1e-12)))
          : 0;
      const loss = l1 + 0.35 * durPen + 0.25 * stopPen + 0.15 * gainErr;

      // Gradient-free updates: nudge duration bias & gain toward lower loss.
      if (durPen > 0.08) {
        durationBias *= 0.85;
      } else {
        durationBias = durationBias * 0.9 + 0.02 * (Math.random() - 0.5);
      }
      durationBias = Math.max(-0.12, Math.min(0.12, durationBias));
      if (gainErr > 0.05) {
        const ratio = (targetE + 1e-12) / (proxyE + 1e-12);
        gain = Math.max(0.7, Math.min(1.4, gain * (0.7 + 0.3 * Math.sqrt(ratio))));
      }

      // Update word-unit priors from this clip: lower local mel variance → boost.
      const words = tokenizeSpeechWords(entry.phraseText);
      for (let w = 0; w < words.length; w++) {
        const bound = bounds[w];
        if (!bound) continue;
        const slice = sliceMelByTime(entry.mel, bound.startMs, bound.endMs);
        let bandVar = 0;
        for (let m = 0; m < slice.nMels; m++) bandVar += slice.std[m]!;
        bandVar /= Math.max(1, slice.nMels);
        // Prefer stable speech slices.
        const boost = bandVar < 1.8 ? 0.04 : bandVar > 3.5 ? -0.03 : 0.01;
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

      const rec: EpochLossRecord = {
        epoch,
        step: stepGlobal,
        melL1: Number(l1.toFixed(5)),
        durationPenalty: Number(durPen.toFixed(5)),
        stopPenalty: Number(stopPen.toFixed(5)),
        loss: Number(loss.toFixed(5)),
        clipId,
      };
      losses.push(rec);
      epochLossSum += loss;
      epochN += 1;

      opts?.onProgress?.({
        epoch,
        epochs,
        step: clipStep,
        stepsInEpoch,
        loss: rec.loss,
        melL1: rec.melL1,
        label: `Эпоха ${epoch}/${epochs} · шаг ${clipStep}/${stepsInEpoch} · loss ${rec.loss.toFixed(4)} (mel L1 ${rec.melL1.toFixed(4)})`,
      });
    }
    // Tiny deterministic work so epochs aren't free no-ops when corpus is tiny.
    if (epochN === 0) {
      opts?.onProgress?.({
        epoch,
        epochs,
        step: 1,
        stepsInEpoch: 1,
        loss: 1,
        melL1: 1,
        label: `Эпоха ${epoch}/${epochs}: нет PCM mel-целей (нужны WAV)`,
      });
      losses.push({
        epoch,
        step: stepGlobal + 1,
        melL1: 1,
        durationPenalty: 0,
        stopPenalty: 0,
        loss: 1,
      });
      stepGlobal += 1;
    } else {
      void epochLossSum;
    }
  }

  // Persist priors onto pack lexicon entries + training metrics.
  let unitPriorsUpdated = 0;
  for (const u of pack.units) {
    const s = unitScore[u.id];
    if (s == null) continue;
    (u as { score?: number }).score = Number(s.toFixed(4));
    unitPriorsUpdated += 1;
  }
  for (const entries of Object.values(pack.lexicon)) {
    for (const e of entries) {
      const s = unitScore[e.unitId];
      if (s != null) {
        (e as { score?: number }).score = Number(s.toFixed(4));
      }
    }
  }

  const initialLoss = losses[0]?.loss ?? 1;
  const finalLoss = losses[losses.length - 1]?.loss ?? initialLoss;
  const improved = finalLoss <= initialLoss + 1e-6;

  let griffinLimPreview: string | null = null;
  if (opts?.writeGriffinLimPreview !== false && targets.size > 0) {
    const first = targets.values().next().value as
      | { mel: MelSpectrogram }
      | undefined;
    if (first && first.mel.frameCount <= 120 && first.mel.durationMs < 4000) {
      try {
        const wav = griffinLimFromMel(first.mel, 6);
        // Rough quality gate: RMS must be non-trivial and not clipped.
        let sumSq = 0;
        let peak = 0;
        for (let i = 0; i < wav.length; i++) {
          const a = Math.abs(wav[i]!);
          sumSq += wav[i]! * wav[i]!;
          if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sumSq / Math.max(1, wav.length));
        if (rms > 0.02 && rms < 0.45 && peak > 0.1) {
          const out = path.join(packDir, "mel-griffin-preview.wav");
          writeMonoWavFile(out, wav, first.mel.sampleRate);
          griffinLimPreview = out;
        }
      } catch {
        griffinLimPreview = null;
      }
    }
  }

  const trainMeta = {
    method: "mel-unit-refinement-v1",
    neuralTts: false,
    epochs,
    steps: stepGlobal,
    initialLoss,
    finalLoss,
    improved,
    gain: Number(gain.toFixed(4)),
    durationBias: Number(durationBias.toFixed(4)),
    melTargets: targets.size,
    unitPriorsUpdated,
    griffinLimPreview,
    curriculum: NEURAL_TTS_CURRICULUM,
    losses: losses.map((l) => ({
      epoch: l.epoch,
      step: l.step,
      loss: l.loss,
      melL1: l.melL1,
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
    griffinLimPreview,
    melFeaturesPath: melDir,
    curriculum: NEURAL_TTS_CURRICULUM,
  };
}
