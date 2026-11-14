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
  // Unset: prefer local neural when a studio voice is the active selection.
  try {
    const voice = localStorage.getItem("mira.activeVoiceId");
    if (voice && voice.startsWith("mira-studio-")) {
      localStorage.setItem(KEY, "neural-pack");
      return "neural-pack";
    }
  } catch {
    /* ignore */
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
        "На машине: нейро-синтез Voice Studio (encoder→mel→vocoder) или склейка клипов + FX характера; без облачных API",
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
