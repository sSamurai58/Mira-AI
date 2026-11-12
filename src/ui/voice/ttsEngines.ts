export type TtsEngineId = "webspeech" | "neural-pack" | "edge-stub";

export type TtsEngineInfo = {
  id: TtsEngineId;
  label: string;
  ready: boolean;
  detail: string;
};

const KEY = "mira.ttsEngine";

export function getActiveTtsEngine(): TtsEngineId {
  const v = localStorage.getItem(KEY);
  if (v === "neural-pack" || v === "edge-stub" || v === "webspeech") return v;
  return "webspeech";
}

export function setActiveTtsEngine(id: TtsEngineId): TtsEngineId {
  localStorage.setItem(KEY, id);
  return id;
}

export function listTtsEngines(): TtsEngineInfo[] {
  const webspeechReady =
    typeof window !== "undefined" && "speechSynthesis" in window;
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
        "Студийные голоса: озвучка совпадений с корпусом вашими клипами; без совпадения — запасной Web Speech (до neural trainer)",
    },
    {
      id: "edge-stub",
      label: "Edge neural (stub)",
      ready: false,
      detail:
        "Заготовка под внешний neural TTS (edge-tts / Azure). Подключите бинарь позже.",
    },
  ];
}
