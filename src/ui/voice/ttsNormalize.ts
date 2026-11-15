/**
 * Pronunciation normalization before TTS. Does not mutate the document.
 */

const ABBR: Array<[RegExp, string]> = [
  [/\bт\.?\s*д\./gi, "так далее"],
  [/\bт\.?\s*п\./gi, "тому подобное"],
  [/\bи\s*т\.?\s*д\./gi, "и так далее"],
  [/\bAPI\b/g, "эй пи ай"],
  [/\bTTS\b/g, "ти ти эс"],
  [/\bSTT\b/g, "эс ти ти"],
  [/\bLLM\b/g, "эль эль эм"],
  [/\bCPU\b/g, "си пи ю"],
  [/\bGPU\b/g, "джи пи ю"],
  [/\bVRAM\b/g, "ви рэм"],
  [/\bOK\b/g, "окей"],
  [/\bPDF\b/g, "пи ди эф"],
];

/** Expand common technical tokens for clearer Russian TTS. */
export function normalizeForTts(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  for (const [re, repl] of ABBR) {
    text = text.replace(re, repl);
  }

  // Digits as digit-by-digit for long IDs (keep short numbers spoken as-is).
  text = text.replace(/\b(\d{5,})\b/g, (_m, digits: string) =>
    digits.split("").join(" "),
  );

  // Email-ish: user at domain
  text = text.replace(
    /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    (_m, user: string, domain: string) =>
      `${user.replace(/\./g, " точка ")} собака ${domain.replace(/\./g, " точка ")}`,
  );

  // Strip markdown markers that confuse TTS.
  text = text
    .replace(/[`*_#~>]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text;
}
