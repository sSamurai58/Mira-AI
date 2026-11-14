export type TtsEngineId =
  | "parametric"
  | "webspeech"
  | "neural-pack"
  | "elevenlabs";

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
  // Old default webspeech without explicit choice → parametric (settings-only).
  if (v === null || v === "") {
    localStorage.setItem(KEY, "parametric");
    return "parametric";
  }
  if (
    v === "parametric" ||
    v === "neural-pack" ||
    v === "elevenlabs" ||
    v === "webspeech"
  ) {
    return v;
  }
  // Unset/unknown: studio voice → neural-pack; else parametric.
  try {
    const voice = localStorage.getItem("mira.activeVoiceId");
    if (voice && voice.startsWith("mira-studio-")) {
      localStorage.setItem(KEY, "neural-pack");
      return "neural-pack";
    }
  } catch {
    /* ignore */
  }
  localStorage.setItem(KEY, "parametric");
  return "parametric";
}

export function setActiveTtsEngine(
  id: TtsEngineId | "edge-stub",
): TtsEngineId {
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
      id: "parametric",
      label: "Параметрический (настройки)",
      ready: true,
      detail:
        "Синтез из текста + высота/скорость/энергия/паузы — без записи аудио и без облака",
    },
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
      label: "Neural pack (Voice Studio)",
      ready: true,
      detail:
        "Локальный нейро-синтез после сборки голоса в студии; иначе параметрический fallback",
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
