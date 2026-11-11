type AsrHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

type RecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window &
    typeof globalThis & {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isAsrAvailable(): boolean {
  return Boolean(getRecognitionCtor());
}

export function createAsrSession(handlers: AsrHandlers) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    return {
      available: false as const,
      start: () =>
        handlers.onError?.(
          "ASR недоступен (Web Speech Recognition). Введите текст или используйте Demo PTT.",
        ),
      stop: () => undefined,
    };
  }

  const recognition = new Ctor();
  recognition.lang = "ru-RU";
  recognition.interimResults = true;
  recognition.continuous = true;

  let finalBuffer = "";

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const res = event.results[i];
      const piece = res[0]?.transcript ?? "";
      if (res.isFinal) finalBuffer += `${piece} `;
      else interim += piece;
    }
    if (interim) handlers.onInterim?.(interim);
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    handlers.onError?.(event.error || "ASR error");
  };

  recognition.onend = () => {
    const text = finalBuffer.trim();
    finalBuffer = "";
    if (text) handlers.onFinal?.(text);
    handlers.onEnd?.();
  };

  return {
    available: true as const,
    start: () => {
      finalBuffer = "";
      try {
        recognition.start();
      } catch {
        // already started
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {
        recognition.abort();
      }
    },
  };
}
