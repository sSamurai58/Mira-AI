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

/** Lightweight Levenshtein for short wake phrases. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i += 1) {
    let prev = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j += 1) {
      const cur = row[j + 1];
      const cost = a[i] === b[j] ? 0 : 1;
      row[j + 1] = Math.min(row[j + 1] + 1, row[j] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

function fuzzyIncludes(haystack: string, needle: string, maxDist: number): boolean {
  if (haystack.includes(needle)) return true;
  if (needle.length < 3) return false;
  const words = haystack.split(" ").filter(Boolean);
  for (const w of words) {
    if (Math.abs(w.length - needle.length) > maxDist) continue;
    if (editDistance(w, needle) <= maxDist) return true;
  }
  // sliding window for multi-word phrase glued without spaces
  if (!needle.includes(" ") && haystack.length >= needle.length) {
    for (let i = 0; i <= haystack.length - needle.length; i += 1) {
      const slice = haystack.slice(i, i + needle.length);
      if (editDistance(slice, needle) <= maxDist) return true;
    }
  }
  return false;
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
    const maxDist = Math.max(1, Math.floor(p.length / 5));
    return words.every(
      (w) => t.includes(w) || fuzzyIncludes(t, w, maxDist),
    );
  }
  // normal: exact substring or 1-edit fuzzy on short wake words
  if (t.includes(p)) return true;
  const maxDist = p.length <= 5 ? 1 : p.length <= 8 ? 1 : 2;
  return fuzzyIncludes(t, p, maxDist);
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
