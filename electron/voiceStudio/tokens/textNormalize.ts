/**
 * T0 text normalization for TTS — numbers→words, remaps, no CAPS-stress hacks.
 * Grounded in SpeechT5 lesson: unsupported chars/digits become silence/junk.
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
  [/\bURL\b/g, "ю эр эль"],
  [/\bHTTP\b/gi, "эйч ти ти пи"],
  [/\bHTTPS\b/gi, "эйч ти ти пи эс"],
];

/** Map rare/latin-lookalike chars to RU-friendly phones (SpeechT5 remap lesson). */
const CHAR_REMAP: Record<string, string> = {
  ё: "е",
  Ё: "е",
  "\u00AB": "",
  "\u00BB": "",
  "\u201E": "",
  "\u201C": "",
  "\u201D": "",
  "'": "",
  "\u2019": "",
  "\u2014": " ",
  "\u2013": " ",
  "\u2026": " ",
  ü: "у",
  ö: "о",
  ä: "а",
  ß: "сс",
  ç: "ч",
  ş: "ш",
  ğ: "г",
  ı: "и",
  İ: "и",
};

const ONES = [
  "",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];
const ONES_F = [
  "",
  "одна",
  "две",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];
const TEENS = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const TENS = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];
const HUNDREDS = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

function triadToWords(n: number, feminine: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]!);
  if (t === 1) {
    parts.push(TEENS[o]!);
  } else {
    if (t) parts.push(TENS[t]!);
    if (o) parts.push((feminine ? ONES_F : ONES)[o]!);
  }
  return parts.filter(Boolean).join(" ");
}

function pluralForm(n: number, one: string, few: string, many: string): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

/** Integer 0…999_999_999_999 → Russian words. */
export function numberToRussianWords(raw: number): string {
  if (!Number.isFinite(raw)) return "";
  const n = Math.trunc(Math.abs(raw));
  if (n === 0) return "ноль";
  const sign = raw < 0 ? "минус " : "";

  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (billions) {
    parts.push(triadToWords(billions, false));
    parts.push(pluralForm(billions, "миллиард", "миллиарда", "миллиардов"));
  }
  if (millions) {
    parts.push(triadToWords(millions, false));
    parts.push(pluralForm(millions, "миллион", "миллиона", "миллионов"));
  }
  if (thousands) {
    parts.push(triadToWords(thousands, true));
    parts.push(pluralForm(thousands, "тысяча", "тысячи", "тысяч"));
  }
  if (rest) parts.push(triadToWords(rest, false));
  return sign + parts.filter(Boolean).join(" ");
}

function expandNumberToken(token: string): string {
  if (/^\d{5,}$/.test(token)) {
    // Long IDs: digit-by-digit for clarity.
    return token
      .split("")
      .map((d) => numberToRussianWords(Number(d)))
      .join(" ");
  }
  if (/^\d+[.,]\d+$/.test(token)) {
    const [a, b] = token.replace(",", ".").split(".");
    return `${numberToRussianWords(Number(a))} точка ${b!
      .split("")
      .map((d) => numberToRussianWords(Number(d)))
      .join(" ")}`;
  }
  if (/^\d+$/.test(token)) {
    const n = Number(token);
    if (!Number.isSafeInteger(n) || Math.abs(n) > 999_999_999_999) {
      return token
        .split("")
        .map((d) => numberToRussianWords(Number(d)))
        .join(" ");
    }
    return numberToRussianWords(n);
  }
  // 12% → двенадцать процентов
  const pct = token.match(/^(\d+(?:[.,]\d+)?)%$/);
  if (pct) return `${expandNumberToken(pct[1]!)} процентов`;
  return token;
}

export type TextNormalizeResult = {
  text: string;
  changed: boolean;
  steps: string[];
};

/**
 * Full T0 pipeline for Mira TTS (RU-first).
 * Does NOT use CAPS for stress — CosyVoice lesson: caps isolate letters.
 */
export function normalizeSpeechText(raw: string): TextNormalizeResult {
  const steps: string[] = [];
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { text: "", changed: false, steps };

  const original = text;

  for (const [re, repl] of ABBR) {
    const next = text.replace(re, repl);
    if (next !== text) steps.push("abbr");
    text = next;
  }

  // Remap chars
  let remapped = "";
  for (const ch of text) {
    remapped += CHAR_REMAP[ch] ?? ch;
  }
  if (remapped !== text) steps.push("char-remap");
  text = remapped;

  // Emails
  text = text.replace(
    /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    (_m, user: string, domain: string) => {
      steps.push("email");
      return `${user.replace(/\./g, " точка ")} собака ${domain.replace(/\./g, " точка ")}`;
    },
  );

  // Numbers / percents (% is non-word — do not require trailing \b after %)
  text = text.replace(/\b\d+(?:[.,]\d+)?%?/g, (m) => {
    steps.push("number");
    return expandNumberToken(m);
  });

  // Strip markdown / keep letters digits spaces basic punct for pauses
  text = text
    .replace(/[`*_#~>|[\]{}()]+/g, " ")
    .replace(/[^\p{L}\p{N}\s.,!?;:\-]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Lowercase — stress must come from T2 marks, not CAPS
  const lower = text.toLocaleLowerCase("ru-RU");
  if (lower !== text) steps.push("lowercase");
  text = lower;

  return {
    text,
    changed: text !== original.toLocaleLowerCase("ru-RU").trim() || steps.length > 0,
    steps: [...new Set(steps)],
  };
}
