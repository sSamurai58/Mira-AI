import { isAsrAvailable } from "./asr";
import { isTtsAvailable } from "./tts";
import { getActiveTtsEngine, listTtsEngines } from "./ttsEngines";
import type { VoiceEngineStatus } from "./types";

export function getVoiceEngineStatus(): VoiceEngineStatus {
  const asr = isAsrAvailable() ? "ready" : "unavailable";
  const tts = isTtsAvailable() ? "ready" : "unavailable";
  const engine = getActiveTtsEngine();
  const info = listTtsEngines().find((e) => e.id === engine);
  const parts = [
    `ASR: ${asr}`,
    `TTS: ${tts}`,
    `Engine: ${engine}${info ? ` (${info.label})` : ""}`,
    "Wake: fuzzy Web Speech (+ optional Porcupine via env later)",
  ];
  return { asr, tts, detail: parts.join(" · ") };
}

