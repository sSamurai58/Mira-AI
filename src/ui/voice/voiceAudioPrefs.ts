/** TTS playback prefs (Web Speech rate / pitch / volume). */

export type VoiceAudioPrefs = {
  /** 0.7 … 1.4 */
  rate: number;
  /** 0.7 … 1.4 */
  pitch: number;
  /** 0 … 1 */
  volume: number;
};

const KEYS = {
  rate: "mira.tts.rate",
  pitch: "mira.tts.pitch",
  volume: "mira.tts.volume",
} as const;

export const DEFAULT_VOICE_AUDIO_PREFS: VoiceAudioPrefs = {
  rate: 1,
  pitch: 1,
  volume: 1,
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function getVoiceAudioPrefs(): VoiceAudioPrefs {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_VOICE_AUDIO_PREFS };
  }
  return {
    rate: clamp(Number(localStorage.getItem(KEYS.rate) ?? "1"), 0.7, 1.4),
    pitch: clamp(Number(localStorage.getItem(KEYS.pitch) ?? "1"), 0.7, 1.4),
    volume: clamp(Number(localStorage.getItem(KEYS.volume) ?? "1"), 0, 1),
  };
}

export function setVoiceAudioPrefs(
  patch: Partial<VoiceAudioPrefs>,
): VoiceAudioPrefs {
  const cur = getVoiceAudioPrefs();
  const next: VoiceAudioPrefs = {
    rate: clamp(patch.rate ?? cur.rate, 0.7, 1.4),
    pitch: clamp(patch.pitch ?? cur.pitch, 0.7, 1.4),
    volume: clamp(patch.volume ?? cur.volume, 0, 1),
  };
  localStorage.setItem(KEYS.rate, String(next.rate));
  localStorage.setItem(KEYS.pitch, String(next.pitch));
  localStorage.setItem(KEYS.volume, String(next.volume));
  return next;
}
