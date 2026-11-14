/**
 * VoiceEngine facade — one entry for local Mira speech.
 * Backends (neural pack synth / Web Speech) stay behind speakText;
 * corpus clip-stitch is retired for playback (opt-in debug only).
 * settings + presets + FX + warmup/stream/cache are the product contract.
 */
import { getActiveVoiceId, listCatalogVoices } from "./catalog";
import { speakText, stopSpeaking, type SpeakHandlers } from "./tts";
import {
  applyVoicePreset,
  getVoiceSettings,
  listVoicePresets,
  setVoiceSettings,
  type VoicePreset,
  type VoiceSettings,
} from "./voiceSettings";
import { warmupVoiceEngine } from "./voiceWarmup";

export type VoiceEngineStatus = {
  settings: VoiceSettings;
  activeVoiceId: string | null;
  presets: VoicePreset[];
};

export const VoiceEngine = {
  getSettings(): VoiceSettings {
    return getVoiceSettings();
  },

  setSettings(patch: Partial<VoiceSettings>): VoiceSettings {
    return setVoiceSettings(patch);
  },

  listPresets(): VoicePreset[] {
    return listVoicePresets();
  },

  applyPreset(presetId: string): VoiceSettings {
    return applyVoicePreset(presetId);
  },

  async status(): Promise<VoiceEngineStatus> {
    const voices = await listCatalogVoices();
    return {
      settings: getVoiceSettings(),
      activeVoiceId: getActiveVoiceId(voices),
      presets: listVoicePresets(),
    };
  },

  warmup(voiceId?: string | null) {
    return warmupVoiceEngine(voiceId);
  },

  /**
   * Speak with current VoiceSettings (FX applied on local buffers).
   * Custom studio voices always GENERATE on-device (neural pack) — never cloud,
   * never cut/stitched recording clips.
   * Long text is spoken phrase-by-phrase with prefetch.
   */
  speak(
    text: string,
    voiceId?: string | null,
    handlers: SpeakHandlers = {},
  ): void {
    if (voiceId !== undefined) {
      speakText(text, voiceId, handlers);
      return;
    }
    void listCatalogVoices().then((voices) => {
      speakText(text, getActiveVoiceId(voices), handlers);
    });
  },

  stop(): void {
    stopSpeaking();
  },

  /** Short character check after settings change. */
  preview(voiceId?: string | null): void {
    this.speak(
      "Проверка голоса Mira. Звучу ли я достаточно естественно?",
      voiceId,
      { preferPreview: true },
    );
  },
};

export type { VoiceSettings, VoicePreset, SpeakHandlers };
