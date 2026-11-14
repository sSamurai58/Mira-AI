/**
 * Voice Studio neural TTS train façade.
 * Real CPU neural path: encoder → DTW/attention → mel decoder (TF) →
 * stop BCE → Adam + neural vocoder. Unit-selection priors still updated.
 */
import type { LinkedTrainClip, VoiceModelPack } from "./modelPack";
import {
  DEFAULT_NEURAL_EPOCHS,
  NEURAL_METHOD,
  type NeuralTrainProgress,
  type NeuralTrainResult,
} from "./neural/train";
import { runNeuralMelTrainOffThread } from "./neural/trainWorkerHost";

export const DEFAULT_TRAIN_EPOCHS = DEFAULT_NEURAL_EPOCHS;
export { NEURAL_METHOD };

/** UI grouping for the plain-language Studio report. */
export type CurriculumGroup = "record_train" | "speak" | "later";

export const CURRICULUM_GROUP_LABEL: Record<CurriculumGroup, string> = {
  record_train: "Запись и обучение",
  speak: "Сборка речи",
  later: "Ускорение и донастройка",
};

export type CurriculumRow = {
  /** Stable technical id (kept for docs / smoke). */
  concept: string;
  /** Short neural-TTS jargon line (collapsed «для разработчиков»). */
  neural: string;
  /** Short Mira jargon line (collapsed «для разработчиков»). */
  mira: string;
  status: "mapped" | "proxy" | "deferred";
  /** Plain RU title shown first. */
  title: string;
  /** One-line: what this means for a non-ML user. */
  meaning: string;
  /** Plain RU: what Mira does today. */
  miraPlain: string;
  group: CurriculumGroup;
};

/** Honest neural TTS → Mira mapping shown in Studio (plain-first + tech detail). */
export const NEURAL_TTS_CURRICULUM: CurriculumRow[] = [
  {
    concept: "spectrogram / mel target",
    neural: "Целевой mel-спектрограмм из речи",
    mira: "FFT→mel filterbank (JS) на PCM WAV; mel summary в pack",
    status: "mapped",
    title: "Картина звука",
    meaning: "Как Mira «видит» вашу запись по частотам",
    miraPlain:
      "Берёт WAV и строит частотную карту; краткую сводку кладёт в голос-пак",
    group: "record_train",
  },
  {
    concept: "encoder",
    neural: "Текстовый encoder (символы→скрытые состояния)",
    mira: "Grapheme embeddings + phone-ish feats → MLP hidden (Adam)",
    status: "mapped",
    title: "Разбор текста",
    meaning: "Как фраза превращается в числовые признаки для нейросети",
    miraPlain:
      "Каждый символ получает embedding и фонетические признаки, сеть строит скрытые состояния",
    group: "record_train",
  },
  {
    concept: "attention",
    neural: "Attention текст↔mel кадры",
    mira: "DTW grapheme↔mel + soft attention weights в decoder",
    status: "mapped",
    title: "Где в записи каждое слово",
    meaning: "Выравнивает текст с частотной картой записи",
    miraPlain:
      "DTW по энергии encoder/mel и мягкое внимание decoder к символам",
    group: "record_train",
  },
  {
    concept: "decoder (frame-by-frame mel)",
    neural: "Авторегрессивный mel-decoder",
    mira: "Frame MLP: context+prev mel → next mel (реальный цикл по кадрам)",
    status: "mapped",
    title: "Сборка частотной карты",
    meaning: "Нейросеть предсказывает частотную карту кадр за кадром",
    miraPlain:
      "Decoder на каждом кадре предсказывает mel; склейка кусков остаётся запасным путём",
    group: "record_train",
  },
  {
    concept: "stop token",
    neural: "Предсказание конца высказывания",
    mira: "Stop-head (sigmoid) + BCE по energy/duration хвосту",
    status: "mapped",
    title: "Чистый конец фразы",
    meaning: "Сеть учится, когда фраза должна закончиться",
    miraPlain:
      "Отдельная голова stop-токена с BCE-лоссом по энергии и длительности хвоста",
    group: "record_train",
  },
  {
    concept: "teacher forcing",
    neural: "Подстановка ground-truth mel на train",
    mira: "TF schedule 1.0→0.35: GT vs free-running prev mel",
    status: "mapped",
    title: "Сверка с настоящей записью",
    meaning: "На обучении подмешивает эталонные кадры, затем учится сама",
    miraPlain:
      "Расписание teacher forcing: сначала эталонные кадры, к концу — свободный прогон",
    group: "record_train",
  },
  {
    concept: "L1/L2 mel loss",
    neural: "Скалярный loss mel pred vs target",
    mira: "Mel L1 + stop BCE + duration penalty по эпохам",
    status: "mapped",
    title: "Оценка похожести",
    meaning: "Насколько предсказанный звук близок к оригиналу",
    miraPlain:
      "Считает mel L1, BCE stop и штраф длительности за несколько проходов",
    group: "record_train",
  },
  {
    concept: "backprop + Adam",
    neural: "Градиенты по весам сети",
    mira: "Реальный Adam по encoder/decoder/vocoder MLP (CPU)",
    status: "mapped",
    title: "Обучение сети",
    meaning: "Градиентный спуск обновляет веса нейросети",
    miraPlain:
      "Adam обновляет embeddings, decoder и вокодер по градиентам — не только приоритеты кусков",
    group: "record_train",
  },
  {
    concept: "epochs / steps",
    neural: "Проходы по датасету",
    mira: "Несколько эпох neural refinement над корпусом (реальный CPU)",
    status: "mapped",
    title: "Несколько проходов",
    meaning: "Повторные просмотры всех записей для улучшения",
    miraPlain: "Несколько эпох обучения нейросети на CPU по вашим клипам",
    group: "record_train",
  },
  {
    concept: "data quality",
    neural: "Чистый корпус без шума/клиппинга",
    mira: "QA: тишина, RMS, клиппинг, noise, text↔audio mismatch",
    status: "mapped",
    title: "Проверка записей",
    meaning: "Отсев плохих клипов до сборки голоса",
    miraPlain: "Тишина, громкость, клиппинг, шум, несовпадение текста и аудио",
    group: "record_train",
  },
  {
    concept: "ASR / LLM / TTS separation",
    neural: "Раздельные модули пайплайна",
    mira: "Студия только TTS pack; ASR и LLM отдельно",
    status: "mapped",
    title: "Голос отдельно от чата",
    meaning: "Студия делает только голос; распознавание и чат — другие модули",
    miraPlain: "Здесь только голос-пак; ASR и LLM живут отдельно",
    group: "record_train",
  },
  {
    concept: "vocoder",
    neural: "HiFi-GAN / WaveNet-style",
    mira: "Neural mel→wave MLP + HQ iterative reconstr. (prod path)",
    status: "mapped",
    title: "Синтез волны",
    meaning: "Как частотная карта становится слышимой речью",
    miraPlain:
      "Нейро-вокодер (mel→волна) плюс улучшенная реконструкция — в рабочем пути, не только preview",
    group: "speak",
  },
  {
    concept: "inference path",
    neural: "text→encoder→decoder→vocoder",
    mira: "text→encoder→mel decoder→neural/HQ vocoder (+ unit stitch fallback)",
    status: "mapped",
    title: "Как говорит готовый голос",
    meaning: "Что происходит, когда Mira произносит фразу",
    miraPlain:
      "Текст → encoder → mel decoder → нейро-вокодер; нет весов — склейка кусков / системный TTS",
    group: "speak",
  },
  {
    concept: "full neural net + CUDA",
    neural: "Tacotron/FastSpeech на GPU",
    mira: "CPU TS-MLP в бандле (mapped); CUDA kernels не бандлятся — только детект",
    status: "mapped",
    title: "Нейросеть на CPU (CUDA не в бандле)",
    meaning: "Рабочий CPU neural path; GPU kernels — не часть релиза",
    miraPlain:
      "Обучение и синтез идут на CPU внутри Electron. CUDA на ПК лишь отмечается в Doctor — отдельных CUDA-ядер в релизе нет (честно CPU-only curriculum)",
    group: "later",
  },
  {
    concept: "neural vocoder / RLHF voice",
    neural: "HiFi-GAN + RLHF",
    mira: "Neural vocoder + A/B preference loop (обновляет веса/priors)",
    status: "mapped",
    title: "Нейро-синтез и донастройка голоса",
    meaning: "Качественный синтез и подстройка под то, что вам больше нравится",
    miraPlain:
      "Нейро-вокодер в паке; A/B прослушивание пишет предпочтение и двигает веса сети и приоритеты кусков",
    group: "later",
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
  neuralPreview?: string | null;
  hqPreview?: string | null;
  melFeaturesPath: string;
  curriculum: CurriculumRow[];
  method?: string;
  neuralTts?: boolean;
  teacherForceFinal?: number;
  vocoderSteps?: number;
  accelDetail?: string;
  cudaAvailable?: boolean;
  weightsPath?: string;
};

export type MelTrainProgress = NeuralTrainProgress;

/**
 * Run multi-epoch neural mel training over linked clips; update pack priors.
 */
export async function runMelRefinement(
  pack: VoiceModelPack,
  packDir: string,
  clips: LinkedTrainClip[],
  opts?: {
    epochs?: number;
    onProgress?: (ev: MelTrainProgress) => void;
    writeGriffinLimPreview?: boolean;
  },
): Promise<MelTrainResult> {
  // Off main UI thread via worker_threads when possible (0.1.11).
  const neural: NeuralTrainResult = await runNeuralMelTrainOffThread(
    {
      pack,
      packDir,
      clips,
      epochs: opts?.epochs ?? DEFAULT_TRAIN_EPOCHS,
      writePreviews: opts?.writeGriffinLimPreview !== false,
    },
    opts?.onProgress,
  );

  return {
    epochs: neural.epochs,
    steps: neural.steps,
    losses: neural.losses.map((l) => ({
      epoch: l.epoch,
      step: l.step,
      melL1: l.melL1,
      durationPenalty: l.durationPenalty,
      stopPenalty: l.stopBce,
      loss: l.loss,
      clipId: l.clipId,
    })),
    finalLoss: neural.finalLoss,
    initialLoss: neural.initialLoss,
    improved: neural.improved,
    melTargets: neural.melTargets,
    unitPriorsUpdated: neural.unitPriorsUpdated,
    gain: neural.gain,
    durationBias: neural.durationBias,
    griffinLimPreview: neural.griffinLimPreview,
    neuralPreview: neural.neuralPreview,
    hqPreview: neural.hqPreview,
    melFeaturesPath: neural.melFeaturesPath,
    curriculum: NEURAL_TTS_CURRICULUM,
    method: NEURAL_METHOD,
    neuralTts: true,
    teacherForceFinal: neural.teacherForceFinal,
    vocoderSteps: neural.vocoderSteps,
    accelDetail: neural.accel.detail,
    cudaAvailable: neural.accel.cudaAvailable,
    weightsPath: neural.weightsPath,
  };
}
