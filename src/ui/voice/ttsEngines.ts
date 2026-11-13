export type TtsEngineId = "webspeech" | "neural-pack" | "elevenlabs";

export type TtsEngineInfo = {
  id: TtsEngineId;
  label: string;
  ready: boolean;
  detail: string;
};

const KEY = "mira.ttsEngine";

/** Preset ElevenLabs voice from user — not an API key. */
export const DEFAULT_ELEVENLABS_VOICE_ID = "YjESejviApN7SHrbfnA2";

export function getActiveTtsEngine(): TtsEngineId {
  const v = localStorage.getItem(KEY);
  // Migrate retired edge-stub → ElevenLabs cloud engine.
  if (v === "edge-stub") {
    localStorage.setItem(KEY, "elevenlabs");
    return "elevenlabs";
  }
  if (
    v === "neural-pack" ||
    v === "elevenlabs" ||
    v === "webspeech"
  ) {
    return v;
  }
  return "webspeech";
}

export function setActiveTtsEngine(id: TtsEngineId | "edge-stub"): TtsEngineId {
  const next: TtsEngineId = id === "edge-stub" ? "elevenlabs" : id;
  localStorage.setItem(KEY, next);
  return next;
}

function hasElevenLabsBridge(): boolean {
  return Boolean(
    typeof window !== "undefined" && window.mira?.synthesizeElevenLabs,
  );
}

export function listTtsEngines(): TtsEngineInfo[] {
  const webspeechReady =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const elevenReady = hasElevenLabsBridge();
  return [
    {
      id: "webspeech",
      label: "Web Speech API",
      ready: webspeechReady,
      detail: webspeechReady
        ? "Системные голоса Chromium/Electron"
        : "speechSynthesis недоступен",
    },
    {
      id: "neural-pack",
      label: "Neural pack (локальный)",
      ready: true,
      detail:
        "Студийные голоса: склейка слов/фрагментов из обученных клипов (unit selection); непокрытые токены — запасной Web Speech",
    },
    {
      id: "elevenlabs",
      label: "ElevenLabs (облако)",
      ready: elevenReady,
      detail: elevenReady
        ? "Облачный neural TTS · ключ только в Electron main · голос по умолчанию уже прописан"
        : "Нужен Electron: API-ключ не вызывается из браузера",
    },
  ];
}
