import { isAsrAvailable } from "./asr";
import { isTtsAvailable } from "./tts";
import type { VoiceEngineStatus } from "./types";

export function getVoiceEngineStatus(): VoiceEngineStatus {
  const asr = isAsrAvailable() ? "ready" : "unavailable";
  const tts = isTtsAvailable() ? "ready" : "unavailable";
  const parts = [
    `ASR: ${asr}`,
    `TTS: ${tts}`,
    "Движок P2: Web Speech API (Chromium/Electron)",
  ];
  return { asr, tts, detail: parts.join(" · ") };
}
