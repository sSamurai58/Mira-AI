/**
 * Legacy TTS playback prefs — thin bridge onto VoiceSettings.
 * Prefer `voiceSettings.ts` / VoiceEngine for new code.
 */
import {
  getVoiceSettings,
  setVoiceSettings,
  type VoiceSettings,
} from "./voiceSettings";

export type VoiceAudioPrefs = {
  /** 0.7 … 1.4 */
  rate: number;
  /** 0.7 … 1.4 */
  pitch: number;
  /** 0 … 1 */
  volume: number;
};

export const DEFAULT_VOICE_AUDIO_PREFS: VoiceAudioPrefs = {
  rate: 1,
  pitch: 1,
  volume: 1,
};

function settingsToPrefs(s: VoiceSettings): VoiceAudioPrefs {
  return {
    rate: s.speed,
    pitch: Math.pow(2, s.pitchSemitones / 12),
    volume: s.gain,
  };
}

export function getVoiceAudioPrefs(): VoiceAudioPrefs {
  return settingsToPrefs(getVoiceSettings());
}

export function setVoiceAudioPrefs(
  patch: Partial<VoiceAudioPrefs>,
): VoiceAudioPrefs {
  const cur = getVoiceSettings();
  const next = setVoiceSettings({
    speed: patch.rate ?? cur.speed,
    pitchSemitones:
      patch.pitch !== undefined
        ? 12 * Math.log2(Math.max(0.5, patch.pitch))
        : cur.pitchSemitones,
    gain: patch.volume ?? cur.gain,
  });
  return settingsToPrefs(next);
}
