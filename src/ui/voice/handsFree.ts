export type WakeSensitivity = "strict" | "normal" | "loose";

export type HandsFreePrefs = {
  enabled: boolean;
  wakePhrase: string;
  bargeIn: boolean;
  sensitivity: WakeSensitivity;
};

const KEYS = {
  enabled: "mira.handsFree",
  wakePhrase: "mira.wakePhrase",
  bargeIn: "mira.bargeIn",
  sensitivity: "mira.wakeSensitivity",
} as const;

export const DEFAULT_WAKE_PHRASE = "мира";

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pure wake-word matcher (testable without Web Speech). */
export function matchWakeWord(
  transcript: string,
  phrase: string,
  sensitivity: WakeSensitivity = "normal",
): boolean {
  const t = normalizeSpeech(transcript);
  const p = normalizeSpeech(phrase || DEFAULT_WAKE_PHRASE);
  if (!t || !p) return false;
  if (sensitivity === "strict") {
    return t === p || t.startsWith(`${p} `) || t.endsWith(` ${p}`);
  }
  if (sensitivity === "loose") {
    const words = p.split(" ").filter(Boolean);
    return words.every((w) => t.includes(w));
  }
  return t.includes(p);
}

/** Strip leading wake phrase from a command transcript. */
export function stripWakePhrase(
  transcript: string,
  phrase: string,
): string {
  const raw = transcript.trim();
  const p = normalizeSpeech(phrase || DEFAULT_WAKE_PHRASE);
  const lower = normalizeSpeech(raw);
  if (!p || !lower.startsWith(p)) return raw;
  // map back approximately by slicing original length of first words
  const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i");
  const stripped = normalizeSpeech(raw).replace(re, "").trim();
  // Prefer original casing when possible: find index after wake in raw
  const idx = lower.indexOf(p);
  if (idx === 0) {
    const cut = raw.length >= p.length ? raw.slice(p.length).replace(/^[\s,.:;-]+/, "") : stripped;
    return cut.trim() || stripped;
  }
  return stripped;
}

export function getHandsFreePrefs(): HandsFreePrefs {
  if (typeof localStorage === "undefined") {
    return {
      enabled: false,
      wakePhrase: DEFAULT_WAKE_PHRASE,
      bargeIn: true,
      sensitivity: "normal",
    };
  }
  const sens = localStorage.getItem(KEYS.sensitivity);
  return {
    enabled: localStorage.getItem(KEYS.enabled) === "1",
    wakePhrase:
      localStorage.getItem(KEYS.wakePhrase)?.trim() || DEFAULT_WAKE_PHRASE,
    bargeIn: localStorage.getItem(KEYS.bargeIn) !== "0",
    sensitivity:
      sens === "strict" || sens === "loose" || sens === "normal"
        ? sens
        : "normal",
  };
}

export function setHandsFreePrefs(patch: Partial<HandsFreePrefs>): HandsFreePrefs {
  const cur = getHandsFreePrefs();
  const next: HandsFreePrefs = {
    enabled: patch.enabled ?? cur.enabled,
    wakePhrase: (patch.wakePhrase ?? cur.wakePhrase).trim() || DEFAULT_WAKE_PHRASE,
    bargeIn: patch.bargeIn ?? cur.bargeIn,
    sensitivity: patch.sensitivity ?? cur.sensitivity,
  };
  localStorage.setItem(KEYS.enabled, next.enabled ? "1" : "0");
  localStorage.setItem(KEYS.wakePhrase, next.wakePhrase);
  localStorage.setItem(KEYS.bargeIn, next.bargeIn ? "1" : "0");
  localStorage.setItem(KEYS.sensitivity, next.sensitivity);
  return next;
}
