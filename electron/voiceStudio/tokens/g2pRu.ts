/**
 * T1 Russian G2P (rule-based, offline). Not full IPA — practical phoneme inventory
 * for TokenStore + coverage. Stress mark: preceding '+' on vowel (e.g. молок+о).
 */

export const PHONEME_VOCAB = [
  "<pad>",
  "<sil>",
  "<sp>",
  "<breath>",
  "a",
  "e",
  "i",
  "o",
  "u",
  "y", // ы
  "p",
  "b",
  "t",
  "d",
  "k",
  "g",
  "f",
  "v",
  "s",
  "z",
  "sh",
  "zh",
  "sch", // щ
  "h", // х
  "c", // ц
  "ch",
  "m",
  "n",
  "l",
  "r",
  "j", // й / soft glide
  "soft", // soft marker for previous consonant
] as const;

export type PhonemeId = number;

export type PhonemeToken = {
  id: PhonemeId;
  symbol: string;
  stressed: boolean;
  charStart: number;
  charEnd: number;
};

const VOWELS = new Set(["а", "е", "ё", "и", "о", "у", "ы", "э", "ю", "я"]);

function phonemeId(symbol: string): number {
  const i = PHONEME_VOCAB.indexOf(symbol as (typeof PHONEME_VOCAB)[number]);
  return i >= 0 ? i : 1; // <sil>
}

/** Map one Russian letter (+ optional stress) to phoneme symbols. */
function letterToPhones(ch: string, nextSoftHint: boolean): string[] {
  switch (ch) {
    case "а":
      return ["a"];
    case "е":
      return nextSoftHint ? ["j", "e"] : ["e"];
    case "ё":
      return ["j", "o"];
    case "и":
      return ["i"];
    case "о":
      return ["o"];
    case "у":
      return ["u"];
    case "ы":
      return ["y"];
    case "э":
      return ["e"];
    case "ю":
      return ["j", "u"];
    case "я":
      return ["j", "a"];
    case "б":
      return ["b"];
    case "в":
      return ["v"];
    case "г":
      return ["g"];
    case "д":
      return ["d"];
    case "ж":
      return ["zh"];
    case "з":
      return ["z"];
    case "й":
      return ["j"];
    case "к":
      return ["k"];
    case "л":
      return ["l"];
    case "м":
      return ["m"];
    case "н":
      return ["n"];
    case "п":
      return ["p"];
    case "р":
      return ["r"];
    case "с":
      return ["s"];
    case "т":
      return ["t"];
    case "ф":
      return ["f"];
    case "х":
      return ["h"];
    case "ц":
      return ["c"];
    case "ч":
      return ["ch"];
    case "ш":
      return ["sh"];
    case "щ":
      return ["sch"];
    case "ъ":
      return [];
    case "ь":
      return ["soft"];
    default:
      return [];
  }
}

/**
 * Grapheme → phoneme tokens. Stress: optional '+' before stressed vowel in input
 * (e.g. "молок+о") — CosyVoice-safe alternative to CAPS.
 */
export function g2pRussian(text: string): PhonemeToken[] {
  const out: PhonemeToken[] = [];
  const s = text.toLocaleLowerCase("ru-RU");
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === " " || ch === "\t" || ch === "\n") {
      out.push({
        id: phonemeId("<sp>"),
        symbol: "<sp>",
        stressed: false,
        charStart: i,
        charEnd: i + 1,
      });
      i += 1;
      continue;
    }
    if (ch === "." || ch === "!" || ch === "?" || ch === ";" || ch === ",") {
      out.push({
        id: phonemeId("<sil>"),
        symbol: "<sil>",
        stressed: false,
        charStart: i,
        charEnd: i + 1,
      });
      i += 1;
      continue;
    }
    let stressed = false;
    let letter = ch;
    let start = i;
    if (ch === "+" && i + 1 < s.length && VOWELS.has(s[i + 1]!)) {
      stressed = true;
      letter = s[i + 1]!;
      start = i;
      i += 2;
    } else {
      i += 1;
    }
    if (!/[а-яё]/.test(letter)) continue;
    const softHint = letter === "е" || letter === "ё" || letter === "ю" || letter === "я";
    // Soft after ь already handled; iotated vowels get j+vowel at word start / after vowel
    const phones = letterToPhones(letter, softHint && (start === 0 || /[\sаеёиоуыэюя]/.test(s[start - 1] ?? " ")));
    for (const p of phones) {
      out.push({
        id: phonemeId(p),
        symbol: p,
        stressed: stressed && (p === "a" || p === "e" || p === "i" || p === "o" || p === "u" || p === "y"),
        charStart: start,
        charEnd: i,
      });
    }
  }
  return out;
}

export function phonemeCoverage(
  tokens: PhonemeToken[],
): { symbol: string; count: number }[] {
  const map = new Map<string, number>();
  for (const t of tokens) {
    if (t.symbol.startsWith("<")) continue;
    map.set(t.symbol, (map.get(t.symbol) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count);
}
