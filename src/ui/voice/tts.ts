import { resolveSpeechVoice } from "./catalog";
import { getActiveTtsEngine } from "./ttsEngines";

export type SpeakHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

export function isTtsAvailable(): boolean {
  const engine = getActiveTtsEngine();
  if (engine === "edge-stub") return false;
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

export function speakText(
  text: string,
  voiceId: string | null,
  handlers: SpeakHandlers = {},
): void {
  const engine = getActiveTtsEngine();
  if (engine === "edge-stub") {
    handlers.onError?.(
      "Edge neural TTS — stub. Выберите Web Speech или Neural pack в Настройках.",
    );
    return;
  }
  if (!isTtsAvailable()) {
    handlers.onError?.("TTS недоступен в этой среде (speechSynthesis).");
    return;
  }
  const clean = text.trim();
  if (!clean) {
    handlers.onEnd?.();
    return;
  }

  stopSpeaking();
  const utter = new SpeechSynthesisUtterance(clean);
  const voice = resolveSpeechVoice(voiceId);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = "ru-RU";
  }
  // neural-pack: slight pacing tweak; clip preview stays in Voice Studio UI
  utter.rate = engine === "neural-pack" ? 0.98 : 1.02;
  utter.pitch = engine === "neural-pack" ? 1.02 : 1;
  utter.onstart = () => handlers.onStart?.();
  utter.onend = () => handlers.onEnd?.();
  utter.onerror = (ev) => handlers.onError?.(ev.error || "TTS error");
  window.speechSynthesis.speak(utter);
}

