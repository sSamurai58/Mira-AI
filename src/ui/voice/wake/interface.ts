/**
 * Pluggable wake-word interface (0.1.11).
 * Web Speech remains the default engine; Porcupine (or others) can plug in later
 * without breaking hands-free prefs / barge-in.
 */

import {
  DEFAULT_WAKE_PHRASE,
  getHandsFreePrefs,
  matchWakeWord,
  type HandsFreePrefs,
  type WakeSensitivity,
} from "../handsFree";

export type WakeEngineId = "webspeech" | "porcupine-stub";

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

export function getWakeEngineId(): WakeEngineId {
  if (typeof localStorage === "undefined") return "webspeech";
  const v = localStorage.getItem(KEY_ENGINE);
  if (v === "porcupine-stub") return "porcupine-stub";
  return "webspeech";
}

export function setWakeEngineId(id: WakeEngineId): WakeEngineId {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY_ENGINE, id);
  }
  return id;
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

/** Stub for future Picovoice Porcupine — settings visible, does not break Web Speech. */
const porcupineStub: WakeEngine = {
  id: "porcupine-stub",
  label: "Porcupine (скоро)",
  ready: false,
  detail:
    "Заготовка под Picovoice Porcupine. Пока используется Web Speech matcher; выбор не ломает hands-free.",
  match(transcript, phrase, sensitivity) {
    // Fall through to the same phrase matcher so prefs stay consistent.
    const matched = matchWakeWord(transcript, phrase, sensitivity);
    return {
      matched,
      engine: "porcupine-stub",
      transcript,
      confidence: matched ? 0.5 : 0,
      };
  },
};

const ENGINES: Record<WakeEngineId, WakeEngine> = {
  webspeech: webSpeechEngine,
  "porcupine-stub": porcupineStub,
};

export function listWakeEngines(): WakeEngine[] {
  return [webSpeechEngine, porcupineStub];
}

export function getActiveWakeEngine(): WakeEngine {
  const id = getWakeEngineId();
  // Porcupine not ready → keep Web Speech behavior while preserving selection.
  if (id === "porcupine-stub" && !porcupineStub.ready) {
    return {
      ...webSpeechEngine,
      detail:
        "Выбран Porcupine (скоро) — сейчас работает Web Speech, пока SDK не подключён.",
    };
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
