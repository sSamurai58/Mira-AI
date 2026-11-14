/**
 * Split assistant text into speakable phrases for streamed local TTS.
 * Keeps punctuation with the phrase; drops empty chunks.
 */

/** Soft max so a runaway paragraph still chunks for TTFB. */
const HARD_WRAP = 160;

/**
 * Split on sentence end / newlines without lookbehind (wider engine support).
 */
export function splitSpeakPhrases(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const raw: string[] = [];
  let buf = "";
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    buf += ch;
    const next = clean[i + 1];
    const isEnd =
      (ch === "." || ch === "!" || ch === "?" || ch === "…" || ch === ";") &&
      (next === undefined || /\s/.test(next));
    if (isEnd || ch === "\n") {
      const piece = buf.trim();
      if (piece) raw.push(piece);
      buf = "";
    }
  }
  if (buf.trim()) raw.push(buf.trim());

  const phrases: string[] = [];
  for (const part of raw.length ? raw : [clean]) {
    if (part.length <= HARD_WRAP) {
      phrases.push(part);
      continue;
    }
    let rest = part;
    while (rest.length > HARD_WRAP) {
      let cut = rest.lastIndexOf(",", HARD_WRAP);
      if (cut < HARD_WRAP * 0.4) cut = rest.lastIndexOf(" ", HARD_WRAP);
      if (cut < HARD_WRAP * 0.3) cut = HARD_WRAP;
      phrases.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).replace(/^[,;\s]+/, "").trim();
    }
    if (rest) phrases.push(rest);
  }

  const merged: string[] = [];
  for (const p of phrases) {
    if (merged.length && p.length < 8) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${p}`.trim();
    } else {
      merged.push(p);
    }
  }
  return merged.length ? merged : [clean];
}
