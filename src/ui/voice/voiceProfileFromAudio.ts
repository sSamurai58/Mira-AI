/**
 * Extract parametric VoiceSettings from a reference audio sample.
 * Matches F0 / energy / tempo / pauses — not full timbre cloning.
 */
import {
  clampVoiceSettings,
  DEFAULT_VOICE_SETTINGS,
  VOICE_LIMITS,
  type VoiceEmotion,
  type VoiceSettings,
} from "./voiceSettings";

export type VoiceProfileAnalysis = {
  /** Median fundamental frequency (Hz). */
  f0Hz: number;
  /** F0 samples used for median. */
  f0Frames: number;
  rms: number;
  peak: number;
  /** Fraction of frames below silence threshold. */
  silenceRatio: number;
  /** Energy onsets per second (speech-rate proxy). */
  onsetRateHz: number;
  /** Spectral band mix low/mid/high. */
  bandEnergies: [number, number, number];
  durationMs: number;
  sampleRate: number;
  /** Suggested settings for parametric synth. */
  suggested: VoiceSettings;
  /** Human-readable rows for the UI. */
  rows: Array<{ key: string; label: string; value: string }>;
  detail: string;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function frameRms(frame: Float32Array): number {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i]! * frame[i]!;
  return Math.sqrt(s / Math.max(1, frame.length));
}

function goertzelPower(
  frame: Float32Array,
  sampleRate: number,
  freq: number,
): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < frame.length; i++) {
    s0 = frame[i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return Math.max(0, power);
}

/** Autocorrelation F0 estimate for one frame (Hz), or 0 if unvoiced. */
function estimateFrameF0(
  frame: Float32Array,
  sampleRate: number,
): number {
  const n = frame.length;
  if (n < 64) return 0;
  const rms = frameRms(frame);
  if (rms < 0.02) return 0;

  let zc = 0;
  for (let i = 1; i < n; i++) {
    if ((frame[i - 1]! >= 0) !== (frame[i]! >= 0)) zc += 1;
  }
  const zcr = zc / n;
  // Unvoiced / noise-like
  if (zcr > 0.35) return 0;

  const minF = 80;
  const maxF = 400;
  const minLag = Math.floor(sampleRate / maxF);
  const maxLag = Math.min(n - 2, Math.floor(sampleRate / minF));
  if (maxLag <= minLag + 2) return 0;

  let bestLag = 0;
  let bestCorr = -1;
  let energy0 = 0;
  for (let i = 0; i < n; i++) energy0 += frame[i]! * frame[i]!;
  if (energy0 < 1e-8) return 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    const lim = n - lag;
    for (let i = 0; i < lim; i++) corr += frame[i]! * frame[i + lag]!;
    const norm = corr / energy0;
    if (norm > bestCorr) {
      bestCorr = norm;
      bestLag = lag;
    }
  }
  if (bestCorr < 0.25 || bestLag <= 0) return 0;
  return sampleRate / bestLag;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function pickEmotion(
  f0: number,
  rms: number,
  onsetRate: number,
  bands: [number, number, number],
): VoiceEmotion {
  if (onsetRate > 5.2 && rms > 0.08) return "energetic";
  if (rms < 0.045 && bands[2]! < 0.28) return "soft";
  if (f0 < 160 && bands[0]! > 0.38) return "warm";
  if (onsetRate < 3.2 && rms < 0.07) return "calm";
  return "neutral";
}

function mapToSettings(input: {
  f0Hz: number;
  rms: number;
  peak: number;
  silenceRatio: number;
  onsetRateHz: number;
  bandEnergies: [number, number, number];
}): VoiceSettings {
  const baseHz = clamp(
    input.f0Hz || DEFAULT_VOICE_SETTINGS.baseHz,
    VOICE_LIMITS.baseHz.min,
    VOICE_LIMITS.baseHz.max,
  );
  // Reference Russian speech ~4.2 onsets/s at speed=1.
  const speed = clamp(
    input.onsetRateHz / 4.2,
    VOICE_LIMITS.speed.min,
    VOICE_LIMITS.speed.max,
  );
  // More silence → wider pauses.
  const pauseScale = clamp(
    0.85 + input.silenceRatio * 0.9,
    VOICE_LIMITS.pauseScale.min,
    VOICE_LIMITS.pauseScale.max,
  );
  // Map RMS ~0.03…0.18 → energy band.
  const energy = clamp(
    0.55 + (input.rms - 0.03) * 5.5,
    VOICE_LIMITS.energy.min,
    VOICE_LIMITS.energy.max,
  );
  const gain = clamp(
    input.peak > 0.15 ? Math.min(1, 0.55 / Math.max(0.2, input.peak)) : 0.95,
    VOICE_LIMITS.gain.min,
    VOICE_LIMITS.gain.max,
  );
  const emotion = pickEmotion(
    baseHz,
    input.rms,
    input.onsetRateHz,
    input.bandEnergies,
  );

  return clampVoiceSettings({
    presetId: null,
    baseHz,
    // Absolute F0 already in baseHz — keep semitone offset neutral.
    pitchSemitones: 0,
    speed,
    pauseScale,
    energy,
    gain,
    emotion,
    quality: "balanced",
  });
}

/**
 * Analyze mono PCM and propose VoiceSettings for 1:1 parametric match
 * of pitch / tempo / energy / pauses.
 */
export function analyzeVoiceProfile(
  samples: Float32Array,
  sampleRate: number,
): VoiceProfileAnalysis {
  const n = samples.length;
  const durationMs = (n * 1000) / Math.max(1, sampleRate);
  const frameMs = 40;
  const hopMs = 15;
  const frameLen = Math.max(64, Math.floor((frameMs / 1000) * sampleRate));
  const hop = Math.max(16, Math.floor((hopMs / 1000) * sampleRate));

  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i]!;
    sumSq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n));
  const silenceThresh = Math.max(0.01, rms * 0.22);

  const f0s: number[] = [];
  let silent = 0;
  let frames = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  const energies: number[] = [];

  for (let start = 0; start + frameLen <= n; start += hop) {
    const frame = samples.subarray(start, start + frameLen);
    const fr = frameRms(frame);
    frames += 1;
    energies.push(fr);
    if (fr < silenceThresh) silent += 1;
    low += goertzelPower(frame, sampleRate, 300);
    mid += goertzelPower(frame, sampleRate, 1200);
    high += goertzelPower(frame, sampleRate, 3200);
    const f0 = estimateFrameF0(frame, sampleRate);
    if (f0 >= 80 && f0 <= 400) f0s.push(f0);
  }

  const silenceRatio = frames ? silent / frames : 1;
  const bandSum = low + mid + high || 1;
  const bandEnergies: [number, number, number] = [
    low / bandSum,
    mid / bandSum,
    high / bandSum,
  ];

  // Onset rate: local energy peaks above neighbors.
  let onsets = 0;
  for (let i = 2; i < energies.length - 2; i++) {
    const e = energies[i]!;
    if (
      e > silenceThresh * 1.8 &&
      e >= energies[i - 1]! &&
      e >= energies[i + 1]! &&
      e > energies[i - 2]! * 1.15 &&
      e > energies[i + 2]! * 1.15
    ) {
      onsets += 1;
    }
  }
  const onsetRateHz = onsets / Math.max(0.2, durationMs / 1000);
  const f0Hz = median(f0s) || DEFAULT_VOICE_SETTINGS.baseHz;

  const suggested = mapToSettings({
    f0Hz,
    rms,
    peak,
    silenceRatio,
    onsetRateHz,
    bandEnergies,
  });

  const rows: VoiceProfileAnalysis["rows"] = [
    {
      key: "f0",
      label: "Базовая частота F0",
      value: `${Math.round(suggested.baseHz)} Гц (медиана ${Math.round(f0Hz)} · ${f0s.length} кадров)`,
    },
    {
      key: "pitch",
      label: "Высота (полутона)",
      value: `${suggested.pitchSemitones >= 0 ? "+" : ""}${suggested.pitchSemitones.toFixed(1)} (F0 уже в базе)`,
    },
    {
      key: "speed",
      label: "Скорость",
      value: suggested.speed.toFixed(2),
    },
    {
      key: "pause",
      label: "Паузы",
      value: `${suggested.pauseScale.toFixed(2)} (тишина ${(silenceRatio * 100).toFixed(0)}%)`,
    },
    {
      key: "energy",
      label: "Энергия",
      value: `${suggested.energy.toFixed(2)} (RMS ${rms.toFixed(3)})`,
    },
    {
      key: "gain",
      label: "Громкость",
      value: `${Math.round(suggested.gain * 100)}% (пик ${peak.toFixed(2)})`,
    },
    {
      key: "emotion",
      label: "Характер",
      value: suggested.emotion,
    },
    {
      key: "bands",
      label: "Спектр low/mid/high",
      value: bandEnergies.map((b) => `${Math.round(b * 100)}%`).join(" / "),
    },
  ];

  return {
    f0Hz,
    f0Frames: f0s.length,
    rms,
    peak,
    silenceRatio,
    onsetRateHz,
    bandEnergies,
    durationMs,
    sampleRate,
    suggested,
    rows,
    detail:
      f0s.length < 8
        ? "Мало звонких кадров — загрузите более длинную речь (лучше 3–10 с)."
        : "Параметры сняты с образца. Примените их, чтобы параметрический голос совпал по частоте, темпу и энергии.",
  };
}

/** Decode a File / Blob to mono Float32 samples. */
export async function decodeAudioFileToMono(
  file: Blob,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const Ctx =
    window.AudioContext ||
    (
      window as unknown as {
        webkitAudioContext: typeof AudioContext;
      }
    ).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const raw = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(raw.slice(0));
    const ch0 = buf.getChannelData(0);
    const samples = new Float32Array(buf.length);
    if (buf.numberOfChannels === 1) {
      samples.set(ch0);
    } else {
      for (let i = 0; i < buf.length; i++) {
        let sum = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) {
          sum += buf.getChannelData(c)[i]!;
        }
        samples[i] = sum / buf.numberOfChannels;
      }
    }
    return { samples, sampleRate: buf.sampleRate };
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** Record from mic for `ms` milliseconds, return mono PCM. */
export async function recordMicMono(
  ms: number,
  deviceId?: string,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Микрофон недоступен в этой среде");
  }
  const constraints: MediaStreamConstraints = {
    audio: deviceId
      ? {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
        }
      : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const mime =
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
  try {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder недоступен");
    }
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("Ошибка MediaRecorder"));
    });
    recorder.start(200);
    await new Promise((r) => window.setTimeout(r, Math.max(800, ms)));
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    if (!chunks.length) {
      throw new Error("Пустая запись — говорите громче / дольше");
    }
    const blob = new Blob(chunks, {
      type: recorder.mimeType || mime || "audio/webm",
    });
    return decodeAudioFileToMono(blob);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
