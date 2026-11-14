/**
 * Unified local VoiceSettings — timbre character knobs for Mira's on-device TTS.
 * Maps onto FX (renderer) + neural duration priors (main). No cloud APIs.
 */

export type VoiceQuality = "fast" | "balanced" | "studio";
export type VoiceEmotion =
  | "neutral"
  | "calm"
  | "warm"
  | "energetic"
  | "soft";

export type VoiceSettings = {
  /** Active preset id, or null when sliders were edited manually. */
  presetId: string | null;
  /** Base fundamental frequency Hz for parametric synth (before semitone shift). */
  baseHz: number;
  /** Playback / synthesis speed. Soft-limited 0.75…1.35 */
  speed: number;
  /** Pitch shift in semitones. Soft-limited −3.5…3.5 */
  pitchSemitones: number;
  /** Loudness / presence. Soft-limited 0.55…1.35 */
  energy: number;
  /** Stretch pauses / overall pacing. Soft-limited 0.75…1.4 */
  pauseScale: number;
  /** Output gain 0…1 */
  gain: number;
  emotion: VoiceEmotion;
  quality: VoiceQuality;
};

export type VoicePreset = {
  id: string;
  title: string;
  description: string;
  settings: Omit<VoiceSettings, "presetId">;
};

const KEY = "mira.voiceSettings.v1";

/** Soft limits — anti-chipmunk / anti-distortion (doc §15). */
export const VOICE_LIMITS = {
  baseHz: { min: 110, max: 280 },
  speed: { min: 0.75, max: 1.35 },
  pitchSemitones: { min: -3.5, max: 3.5 },
  energy: { min: 0.55, max: 1.35 },
  pauseScale: { min: 0.75, max: 1.4 },
  gain: { min: 0, max: 1 },
} as const;

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  presetId: "mira",
  baseHz: 178,
  speed: 1,
  pitchSemitones: 0,
  energy: 1,
  pauseScale: 1,
  gain: 1,
  emotion: "neutral",
  quality: "balanced",
};

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "mira",
    title: "Mira",
    description: "Базовый характер помощника",
    settings: {
      baseHz: 178,
      speed: 1,
      pitchSemitones: 0,
      energy: 1,
      pauseScale: 1,
      gain: 1,
      emotion: "neutral",
      quality: "balanced",
    },
  },
  {
    id: "calm",
    title: "Спокойный",
    description: "Тише, чуть ниже, шире паузы",
    settings: {
      baseHz: 165,
      speed: 0.95,
      pitchSemitones: -1,
      energy: 0.85,
      pauseScale: 1.15,
      gain: 1,
      emotion: "calm",
      quality: "balanced",
    },
  },
  {
    id: "warm",
    title: "Тёплый",
    description: "Мягче энергия, чуть ниже тон",
    settings: {
      baseHz: 170,
      speed: 0.98,
      pitchSemitones: -0.5,
      energy: 0.92,
      pauseScale: 1.08,
      gain: 1,
      emotion: "warm",
      quality: "balanced",
    },
  },
  {
    id: "energetic",
    title: "Энергичный",
    description: "Быстрее, выше тон, плотнее",
    settings: {
      baseHz: 190,
      speed: 1.08,
      pitchSemitones: 0.8,
      energy: 1.12,
      pauseScale: 0.9,
      gain: 1,
      emotion: "energetic",
      quality: "fast",
    },
  },
  {
    id: "soft",
    title: "Мягкий",
    description: "Тише и медленнее",
    settings: {
      baseHz: 172,
      speed: 0.92,
      pitchSemitones: -0.3,
      energy: 0.78,
      pauseScale: 1.2,
      gain: 0.92,
      emotion: "soft",
      quality: "balanced",
    },
  },
];

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function clampVoiceSettings(
  raw: Partial<VoiceSettings> & { presetId?: string | null },
): VoiceSettings {
  const emotion = (
    ["neutral", "calm", "warm", "energetic", "soft"] as VoiceEmotion[]
  ).includes(raw.emotion as VoiceEmotion)
    ? (raw.emotion as VoiceEmotion)
    : DEFAULT_VOICE_SETTINGS.emotion;
  const quality = (["fast", "balanced", "studio"] as VoiceQuality[]).includes(
    raw.quality as VoiceQuality,
  )
    ? (raw.quality as VoiceQuality)
    : DEFAULT_VOICE_SETTINGS.quality;

  return {
    presetId:
      typeof raw.presetId === "string" || raw.presetId === null
        ? raw.presetId
        : DEFAULT_VOICE_SETTINGS.presetId,
    baseHz: clamp(
      Number(raw.baseHz ?? DEFAULT_VOICE_SETTINGS.baseHz),
      VOICE_LIMITS.baseHz.min,
      VOICE_LIMITS.baseHz.max,
    ),
    speed: clamp(
      Number(raw.speed ?? DEFAULT_VOICE_SETTINGS.speed),
      VOICE_LIMITS.speed.min,
      VOICE_LIMITS.speed.max,
    ),
    pitchSemitones: clamp(
      Number(raw.pitchSemitones ?? DEFAULT_VOICE_SETTINGS.pitchSemitones),
      VOICE_LIMITS.pitchSemitones.min,
      VOICE_LIMITS.pitchSemitones.max,
    ),
    energy: clamp(
      Number(raw.energy ?? DEFAULT_VOICE_SETTINGS.energy),
      VOICE_LIMITS.energy.min,
      VOICE_LIMITS.energy.max,
    ),
    pauseScale: clamp(
      Number(raw.pauseScale ?? DEFAULT_VOICE_SETTINGS.pauseScale),
      VOICE_LIMITS.pauseScale.min,
      VOICE_LIMITS.pauseScale.max,
    ),
    gain: clamp(
      Number(raw.gain ?? DEFAULT_VOICE_SETTINGS.gain),
      VOICE_LIMITS.gain.min,
      VOICE_LIMITS.gain.max,
    ),
    emotion,
    quality,
  };
}

/** Migrate legacy rate/pitch/volume keys once into VoiceSettings. */
function migrateLegacyPrefs(): VoiceSettings | null {
  if (typeof localStorage === "undefined") return null;
  if (localStorage.getItem(KEY)) return null;
  const rate = Number(localStorage.getItem("mira.tts.rate"));
  const pitch = Number(localStorage.getItem("mira.tts.pitch"));
  const volume = Number(localStorage.getItem("mira.tts.volume"));
  if (![rate, pitch, volume].some((n) => Number.isFinite(n) && n !== 0)) {
    return null;
  }
  // Legacy pitch was 0.7…1.4 ratio ≈ map to semitones: 12*log2(ratio)
  const pitchRatio = Number.isFinite(pitch) && pitch > 0 ? pitch : 1;
  const semitones = 12 * Math.log2(pitchRatio);
  return clampVoiceSettings({
    presetId: null,
    speed: Number.isFinite(rate) && rate > 0 ? rate : 1,
    pitchSemitones: semitones,
    gain: Number.isFinite(volume) ? volume : 1,
    energy: 1,
    pauseScale: 1,
    emotion: "neutral",
    quality: "balanced",
  });
}

export function getVoiceSettings(): VoiceSettings {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const migrated = migrateLegacyPrefs();
      if (migrated) {
        localStorage.setItem(KEY, JSON.stringify(migrated));
        return migrated;
      }
      return { ...DEFAULT_VOICE_SETTINGS };
    }
    return clampVoiceSettings(JSON.parse(raw) as Partial<VoiceSettings>);
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function setVoiceSettings(
  patch: Partial<VoiceSettings>,
): VoiceSettings {
  const cur = getVoiceSettings();
  const next = clampVoiceSettings({
    ...cur,
    ...patch,
    // Manual slider edits clear preset unless presetId is explicitly set.
    presetId:
      patch.presetId !== undefined
        ? patch.presetId
        : patch.speed !== undefined ||
            patch.baseHz !== undefined ||
            patch.pitchSemitones !== undefined ||
            patch.energy !== undefined ||
            patch.pauseScale !== undefined ||
            patch.gain !== undefined ||
            patch.emotion !== undefined ||
            patch.quality !== undefined
          ? null
          : cur.presetId,
  });
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(next));
    // Keep legacy keys in sync for Web Speech path / older readers.
    localStorage.setItem("mira.tts.rate", String(next.speed));
    localStorage.setItem(
      "mira.tts.pitch",
      String(Math.pow(2, next.pitchSemitones / 12)),
    );
    localStorage.setItem("mira.tts.volume", String(next.gain));
  }
  return next;
}

export function applyVoicePreset(presetId: string): VoiceSettings {
  const preset =
    VOICE_PRESETS.find((p) => p.id === presetId) ?? VOICE_PRESETS[0]!;
  return setVoiceSettings({
    ...preset.settings,
    presetId: preset.id,
  });
}

export function listVoicePresets(): VoicePreset[] {
  return VOICE_PRESETS.map((p) => ({ ...p, settings: { ...p.settings } }));
}

/** Prosody knobs forwarded to local neural infer (duration prior). */
export type NeuralProsodyOpts = {
  speed: number;
  pauseScale: number;
  energy: number;
  quality: VoiceQuality;
};

export function neuralProsodyFromSettings(
  s: VoiceSettings = getVoiceSettings(),
): NeuralProsodyOpts {
  // Energy/pitch/gain are applied once in renderer FX — neural only gets
  // duration priors so we do not double-loudness.
  return {
    speed: s.speed,
    pauseScale: s.pauseScale,
    energy: 1,
    quality: s.quality,
  };
}
