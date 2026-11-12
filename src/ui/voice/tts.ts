import { isCustomVoiceId, resolveSpeechVoice } from "./catalog";
import {
  loadCustomVoiceCorpus,
  planCorpusSpeech,
  type CorpusSpeechPlan,
} from "./corpusTts";
import { getActiveTtsEngine } from "./ttsEngines";

export type SpeakHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  /** Honest status for studio / hybrid synthesis. */
  onStatus?: (message: string) => void;
  /**
   * For custom voices: if corpus has no match, play the trained preview clip
   * instead of silently using a system voice (Settings / catalog listen).
   */
  preferPreview?: boolean;
};

let speakGeneration = 0;
let activeCustomAudio: HTMLAudioElement | null = null;

export function isTtsAvailable(): boolean {
  const engine = getActiveTtsEngine();
  if (engine === "edge-stub") return false;
  // Corpus / neural-pack is selected as ready even without speechSynthesis
  // (Electron clip playback; headless smoke still reports engine ready).
  if (engine === "neural-pack") return true;
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  speakGeneration += 1;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (activeCustomAudio) {
    try {
      activeCustomAudio.pause();
      activeCustomAudio.src = "";
    } catch {
      /* ignore */
    }
    activeCustomAudio = null;
  }
}

function speakWebSpeech(
  text: string,
  voiceId: string | null,
  handlers: SpeakHandlers,
  isCurrent: () => boolean,
): void {
  if (!isCurrent()) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    handlers.onError?.("TTS недоступен в этой среде (speechSynthesis).");
    return;
  }
  const clean = text.trim();
  if (!clean) {
    handlers.onEnd?.();
    return;
  }

  const engine = getActiveTtsEngine();
  const utter = new SpeechSynthesisUtterance(clean);
  // Never bind a system SpeechSynthesisVoice for custom studio ids —
  // resolveSpeechVoice would pick a RU system stub and sound "wrong".
  const resolvedId = isCustomVoiceId(voiceId) ? null : voiceId;
  const voice = resolveSpeechVoice(resolvedId);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = "ru-RU";
  }
  utter.rate = engine === "neural-pack" ? 0.98 : 1.02;
  utter.pitch = engine === "neural-pack" ? 1.02 : 1;
  utter.onstart = () => {
    if (!isCurrent()) {
      window.speechSynthesis.cancel();
      return;
    }
    handlers.onStart?.();
  };
  utter.onend = () => {
    if (!isCurrent()) return;
    handlers.onEnd?.();
  };
  utter.onerror = (ev) => {
    if (!isCurrent()) return;
    const code = ev.error || "TTS error";
    if (
      code === "synthesis-failed" ||
      code === "synthesis-unavailable" ||
      code === "language-unavailable" ||
      code === "voice-unavailable" ||
      code === "not-allowed" ||
      code === "interrupted" ||
      code === "canceled"
    ) {
      handlers.onEnd?.();
      return;
    }
    handlers.onError?.(code);
  };
  window.speechSynthesis.speak(utter);
}

async function playClipDataUrl(
  dataUrl: string,
  isCurrent: () => boolean,
): Promise<void> {
  if (!isCurrent()) return;
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(dataUrl);
    activeCustomAudio = audio;
    const done = () => {
      if (activeCustomAudio === audio) activeCustomAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = () => {
      if (activeCustomAudio === audio) activeCustomAudio = null;
      reject(new Error("Не удалось воспроизвести клип студии"));
    };
    void audio.play().catch((err) => {
      if (activeCustomAudio === audio) activeCustomAudio = null;
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

async function readClipDataUrl(filePath: string): Promise<string> {
  if (!window.mira?.readVoicePreview) {
    throw new Error("Превью клипов доступно в Electron");
  }
  return window.mira.readVoicePreview(filePath);
}

async function speakCustomVoice(
  text: string,
  voiceId: string,
  handlers: SpeakHandlers,
  isCurrent: () => boolean,
): Promise<void> {
  const clean = text.trim();
  if (!clean) {
    handlers.onEnd?.();
    return;
  }

  let plan: CorpusSpeechPlan;
  try {
    const corpus = await loadCustomVoiceCorpus(voiceId);
    if (!isCurrent()) return;
    plan = planCorpusSpeech(clean, corpus.units, {
      preferPreview: handlers.preferPreview,
      previewPath: corpus.voice.preview_path,
    });
  } catch (err) {
    if (!isCurrent()) return;
    handlers.onStatus?.(
      err instanceof Error
        ? `Студийный голос: ${err.message}`
        : "Студийный голос недоступен",
    );
    speakWebSpeech(clean, null, handlers, isCurrent);
    return;
  }

  handlers.onStatus?.(plan.status);

  // Pure system fallback (no matching clips / no preview preference).
  if (plan.mode === "webspeech-fallback") {
    speakWebSpeech(clean, null, handlers, isCurrent);
    return;
  }

  // Electron clip playback for corpus / hybrid / preview.
  const canPlayClips = Boolean(window.mira?.readVoicePreview);
  if (!canPlayClips) {
    handlers.onStatus?.(
      "Browser-demo: клипы студии без файлов — запасной Web Speech",
    );
    speakWebSpeech(clean, null, handlers, isCurrent);
    return;
  }

  let started = false;
  const markStart = () => {
    if (!started) {
      started = true;
      handlers.onStart?.();
    }
  };

  try {
    for (const segment of plan.segments) {
      if (!isCurrent()) return;
      if (segment.kind === "clip") {
        const dataUrl = await readClipDataUrl(segment.filePath);
        if (!isCurrent()) return;
        markStart();
        await playClipDataUrl(dataUrl, isCurrent);
      } else {
        // Hybrid leftover: speak unmatched sentence via Web Speech, wait for end.
        await new Promise<void>((resolve) => {
          speakWebSpeech(
            segment.text,
            null,
            {
              onStart: markStart,
              onEnd: resolve,
              onError: () => resolve(),
            },
            isCurrent,
          );
        });
      }
    }
    if (!isCurrent()) return;
    if (!started) handlers.onStart?.();
    handlers.onEnd?.();
  } catch (err) {
    if (!isCurrent()) return;
    handlers.onStatus?.(
      err instanceof Error
        ? `Студия: ${err.message}; запасной системный TTS`
        : "Студия: ошибка клипа; запасной системный TTS",
    );
    speakWebSpeech(clean, null, handlers, isCurrent);
  }
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

  const gen = ++speakGeneration;
  const isCurrent = () => gen === speakGeneration;

  // Cancel any prior utterance / clip before starting.
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (activeCustomAudio) {
    try {
      activeCustomAudio.pause();
      activeCustomAudio.src = "";
    } catch {
      /* ignore */
    }
    activeCustomAudio = null;
  }

  if (isCustomVoiceId(voiceId) && voiceId) {
    // Studio / custom trained voice → corpus engine (not silent system stub).
    void speakCustomVoice(text, voiceId, handlers, isCurrent);
    return;
  }

  if (!isTtsAvailable()) {
    handlers.onError?.("TTS недоступен в этой среде (speechSynthesis).");
    return;
  }
  speakWebSpeech(text, voiceId, handlers, isCurrent);
}
