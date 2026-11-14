/**
 * Pluggable wake-word interface (0.1.11+).
 * Web Speech remains the default; Porcupine uses Access Key + hybrid local
 * matcher until / when Picovoice WASM SDK is bundled.
 */

import {
  DEFAULT_WAKE_PHRASE,
  getHandsFreePrefs,
  matchWakeWord,
  type HandsFreePrefs,
  type WakeSensitivity,
} from "../handsFree";

export type WakeEngineId = "webspeech" | "porcupine-stub" | "local-fuzzy";

export type WakeMatchResult = {
  matched: boolean;
  engine: WakeEngineId;
  transcript: string;
  confidence: number;
};

export type WakeEngine = {
  id: WakeEngineId;
  label: string;
  /** Ready to start listening (permissions / SDK loaded). */
  ready: boolean;
  detail: string;
  /**
   * Optional continuous listen. Return unsubscribe.
   * Default Web Speech path is owned by ChatPage; engines may no-op.
   */
  start?: (opts: {
    phrase: string;
    sensitivity: WakeSensitivity;
    onMatch: (result: WakeMatchResult) => void;
  }) => () => void;
  /** Pure matcher for tests / hybrid scoring. */
  match: (
    transcript: string,
    phrase: string,
    sensitivity: WakeSensitivity,
  ) => WakeMatchResult;
};

const KEY_ENGINE = "mira.wakeEngine";
const KEY_PORCUPINE = "mira.porcupineAccessKey";

export function getWakeEngineId(): WakeEngineId {
  if (typeof localStorage === "undefined") return "webspeech";
  const v = localStorage.getItem(KEY_ENGINE);
  if (v === "porcupine-stub" || v === "local-fuzzy" || v === "webspeech") {
    return v;
  }
  return "webspeech";
}

export function setWakeEngineId(id: WakeEngineId): WakeEngineId {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY_ENGINE, id);
  }
  return id;
}

export function getPorcupineAccessKey(): string {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(KEY_PORCUPINE)?.trim() || "";
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function setPorcupineAccessKey(key: string): string {
  const v = key.trim();
  try {
    if (typeof localStorage !== "undefined") {
      if (v) localStorage.setItem(KEY_PORCUPINE, v);
      else localStorage.removeItem(KEY_PORCUPINE);
    }
  } catch {
    /* ignore */
  }
  return v;
}

function porcupineAccessKeyPresent(): boolean {
  return Boolean(getPorcupineAccessKey());
}

/** Tighter fuzzy when Porcupine key is present (hybrid until WASM). */
function porcupineHybridMatch(
  transcript: string,
  phrase: string,
  sensitivity: WakeSensitivity,
): WakeMatchResult {
  const base = matchWakeWord(transcript, phrase, sensitivity);
  if (!base) {
    return {
      matched: false,
      engine: "porcupine-stub",
      transcript,
      confidence: 0,
    };
  }
  // Prefer exact / prefix hits for higher confidence.
  const t = transcript.toLowerCase().replace(/ё/g, "е");
  const p = phrase.toLowerCase().replace(/ё/g, "е").trim();
  const exact =
    t === p ||
    t.startsWith(`${p} `) ||
    t.includes(` ${p} `) ||
    t.endsWith(` ${p}`);
  return {
    matched: true,
    engine: "porcupine-stub",
    transcript,
    confidence: exact ? 0.92 : 0.72,
  };
}

const webSpeechEngine: WakeEngine = {
  id: "webspeech",
  label: "Web Speech (фраза)",
  ready:
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window),
  detail: "Текущий hands-free: непрерывный Web Speech + matchWakeWord",
  match(transcript, phrase, sensitivity) {
    const matched = matchWakeWord(transcript, phrase, sensitivity);
    return {
      matched,
      engine: "webspeech",
      transcript,
      confidence: matched ? 0.85 : 0,
    };
  },
};

/**
 * Porcupine path: Access Key unlocks hybrid local matcher + optional WASM.
 * Tries dynamic import of `@picovoice/porcupine-web` when present; otherwise
 * hybrid Web Speech matcher (prefs / barge-in unchanged).
 */
let porcupineWasmTried = false;
let porcupineWasmReady = false;

async function tryLoadPorcupineWasm(): Promise<boolean> {
  if (porcupineWasmTried) return porcupineWasmReady;
  porcupineWasmTried = true;
  if (!porcupineAccessKeyPresent()) {
    porcupineWasmReady = false;
    return false;
  }
  try {
    // Optional peer: present only if installed in the app bundle.
    const mod = "@picovoice/porcupine-web";
    await import(/* @vite-ignore */ mod);
    porcupineWasmReady = true;
  } catch {
    porcupineWasmReady = false;
  }
  return porcupineWasmReady;
}

void tryLoadPorcupineWasm();

const porcupineStub: WakeEngine = {
  id: "porcupine-stub",
  label: porcupineAccessKeyPresent()
    ? porcupineWasmReady
      ? "Porcupine (WASM)"
      : "Porcupine (hybrid · ключ есть)"
    : "Porcupine (нужен Access Key)",
  ready: porcupineAccessKeyPresent(),
  detail: porcupineAccessKeyPresent()
    ? porcupineWasmReady
      ? "Picovoice Porcupine WASM загружен. Hands-free через Porcupine + fallback Web Speech."
      : "Access Key сохранён. Hybrid: Web Speech + усиленный matcher. Установите @picovoice/porcupine-web для WASM."
    : "Нужен Picovoice Access Key (mira.porcupineAccessKey). Пока Web Speech; выбор не ломает hands-free.",
  match(transcript, phrase, sensitivity) {
    if (porcupineAccessKeyPresent()) {
      return porcupineHybridMatch(transcript, phrase, sensitivity);
    }
    const matched = matchWakeWord(transcript, phrase, sensitivity);
    return {
      matched,
      engine: "porcupine-stub",
      transcript,
      confidence: matched ? 0.5 : 0,
    };
  },
};

/** Offline fuzzy phrase matcher (no continuous listen SDK). */
const localFuzzyEngine: WakeEngine = {
  id: "local-fuzzy",
  label: "Локальный fuzzy",
  ready: true,
  detail:
    "Локальное сопоставление фразы (без облака). Слушание всё ещё через Web Speech API браузера.",
  match(transcript, phrase, sensitivity) {
    const matched = matchWakeWord(transcript, phrase, sensitivity);
    return {
      matched,
      engine: "local-fuzzy",
      transcript,
      confidence: matched ? 0.9 : 0,
    };
  },
};

const ENGINES: Record<WakeEngineId, WakeEngine> = {
  webspeech: webSpeechEngine,
  "porcupine-stub": porcupineStub,
  "local-fuzzy": localFuzzyEngine,
};

export function listWakeEngines(): WakeEngine[] {
  // Rebuild porcupine label/ready from current key each call.
  return [
    webSpeechEngine,
    localFuzzyEngine,
    {
      ...porcupineStub,
      label: porcupineAccessKeyPresent()
        ? "Porcupine (hybrid · ключ есть)"
        : "Porcupine (нужен Access Key)",
      ready: porcupineAccessKeyPresent(),
      detail: porcupineAccessKeyPresent()
        ? "Access Key сохранён. Hybrid: Web Speech + усиленный matcher. WASM SDK Porcupine подключается отдельно."
        : "Нужен Picovoice Access Key (mira.porcupineAccessKey). Пока Web Speech; выбор не ломает hands-free.",
    },
  ];
}

export function getActiveWakeEngine(): WakeEngine {
  const id = getWakeEngineId();
  if (id === "porcupine-stub" && !porcupineAccessKeyPresent()) {
    return {
      ...webSpeechEngine,
      detail:
        "Выбран Porcupine — сейчас Web Speech (нет Access Key). Сохраните ключ в настройках голоса.",
    };
  }
  if (id === "porcupine-stub") {
    return listWakeEngines().find((e) => e.id === "porcupine-stub")!;
  }
  return ENGINES[id] ?? webSpeechEngine;
}

/** Match using the active engine (falls back safely). */
export function matchWakeWithActiveEngine(
  transcript: string,
  prefs?: HandsFreePrefs,
): WakeMatchResult {
  const p = prefs ?? getHandsFreePrefs();
  const engine = getActiveWakeEngine();
  return engine.match(
    transcript,
    p.wakePhrase || DEFAULT_WAKE_PHRASE,
    p.sensitivity,
  );
}
