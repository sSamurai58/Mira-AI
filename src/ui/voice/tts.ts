import { resolveSpeechVoice } from "./catalog";

export type SpeakHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

export function isTtsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  if (!isTtsAvailable()) return;
  window.speechSynthesis.cancel();
}

export function speakText(
  text: string,
  voiceId: string | null,
  handlers: SpeakHandlers = {},
): void {
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
  utter.rate = 1.02;
  utter.pitch = 1;
  utter.onstart = () => handlers.onStart?.();
  utter.onend = () => handlers.onEnd?.();
  utter.onerror = (ev) => handlers.onError?.(ev.error || "TTS error");
  window.speechSynthesis.speak(utter);
}
