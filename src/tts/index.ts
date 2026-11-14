/** TTS — local VoiceEngine; Web Speech / neural pack / corpus for studio voices. */
export { isTtsAvailable, speakText, stopSpeaking } from "../ui/voice/tts";
export { VoiceEngine } from "../ui/voice/voiceEngine";
export { warmupVoiceEngine } from "../ui/voice/voiceWarmup";
export { splitSpeakPhrases } from "../ui/voice/voicePhrases";
export {
  getVoiceSettings,
  setVoiceSettings,
  applyVoicePreset,
  listVoicePresets,
} from "../ui/voice/voiceSettings";
export const ttsStatus = "partial" as const;
