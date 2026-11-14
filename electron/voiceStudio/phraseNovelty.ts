/**
 * Lexical novelty + function-word coverage for Voice Studio phrase generation.
 * New batches should expand Mira’s spoken vocabulary instead of recycling
 * high-frequency content words already present dozens/hundreds of times.
 */
import { normalizeLexKey, tokenizeSpeechWords } from "./modelPack";

/** Common Russian prepositions, particles, conjunctions — aim for full coverage. */
export const FUNCTION_WORDS_RU: readonly string[] = [
  // Prepositions
  "в",
  "на",
  "с",
  "со",
  "у",
  "к",
  "ко",
  "о",
  "об",
  "обо",
  "от",
  "до",
  "из",
  "изо",
  "за",
  "по",
  "под",
  "подо",
  "над",
  "при",
  "про",
  "без",
  "для",
  "между",
  "через",
  "около",
  "возле",
  "вместо",
  "после",
  "перед",
  "среди",
  "ради",
  "сквозь",
  "вдоль",
  "вокруг",
  "напротив",
  "внутри",
  "вне",
  "сверх",
  "благодаря",
  "согласно",
  "навстречу",
  "насчёт",
  "ввиду",
  "вследствие",
  "вопреки",
  "кроме",
  "помимо",
  "относительно",
  "касательно",
  // Particles / conjunctions / discourse
  "и",
  "а",
  "но",
  "или",
  "либо",
  "да",
  "же",
  "ли",
  "бы",
  "не",
  "ни",
  "то",
  "чем",
  "что",
  "чтобы",
  "если",
  "когда",
  "пока",
  "хотя",
  "потому",
  "поэтому",
  "однако",
  "зато",
  "ведь",
  "уже",
  "ещё",
  "еще",
  "только",
  "даже",
  "именно",
  "разве",
  "неужели",
  "пусть",
  "пускай",
  "будто",
  "словно",
  "также",
  "тоже",
];

export const FUNCTION_WORDS_EN: readonly string[] = [
  "in",
  "on",
  "at",
  "to",
  "for",
  "from",
  "with",
  "without",
  "about",
  "into",
  "onto",
  "over",
  "under",
  "between",
  "among",
  "through",
  "across",
  "along",
  "around",
  "before",
  "after",
  "during",
  "against",
  "toward",
  "towards",
  "within",
  "beyond",
  "beside",
  "despite",
  "except",
  "and",
  "but",
  "or",
  "nor",
  "yet",
  "so",
  "if",
  "when",
  "while",
  "although",
  "because",
  "since",
  "unless",
  "until",
  "whether",
  "than",
  "that",
  "which",
  "who",
  "not",
  "only",
  "even",
  "also",
  "just",
  "still",
  "already",
  "perhaps",
];

/** Natural seed sentences that exercise missing function words + intonation. */
export const COVERAGE_SEEDS_RU: readonly string[] = [
  "Положи книгу на стол и поставь чашку рядом с окном.",
  "Выйди из комнаты без шума и зайди к соседу за ключом.",
  "Пройди через двор вдоль забора вокруг дома до калитки.",
  "Положи письмо в ящик для документов между папками после обеда.",
  "Скажи мягко: благодаря вам задача стала яснее относительно сроков.",
  "Вопрос: что сделать, если дождь пойдёт до вечера?",
  "Команда: открой файл про отчёт и сохрани его без ошибок.",
  "Перечисление: хлеб, молоко, сыр, яйца и зелень для салата.",
  "Номер: плюс семь девятьсот одиннадцать двадцать два тридцать три.",
  "Уточнение: неужели нельзя перенести встречу хотя бы на час?",
  "Просьба: пусть свет останется включённым, пока я не вернусь.",
  "Сравнение: лучше медленно, чем быстро и неаккуратно.",
  "Объяснение: я звоню, потому что нужна помощь по маршруту.",
  "Навигация: иди навстречу ветру мимо площади напротив театра.",
  "Осторожно: не ставь кружку над клавиатурой вопреки привычке.",
  "Деталь: внутри коробки лежат кабели, а снаружи — наклейка.",
  "Время: после полудня и перед ужином проверь список дел.",
  "Связка: либо сейчас, либо завтра утром — выбери удобный вариант.",
  "Мягкий тон: пожалуйста, говори чуть тише, чтобы не разбудить.",
  "Жёсткий тон: остановись и проверь статус перед отправкой.",
];

export const COVERAGE_SEEDS_EN: readonly string[] = [
  "Put the book on the table and the cup beside the window.",
  "Walk through the yard along the fence around the house to the gate.",
  "Question: what should we do if rain starts before evening?",
  "Command: open the report file and save it without errors.",
  "Listing: bread, milk, cheese, eggs, and greens for a salad.",
  "Soft tone: please speak a little quieter so we do not wake anyone.",
  "Clarify: maybe we can move the meeting until after lunch.",
  "Explain: I am calling because I need help with the route.",
];

export const INTONATION_SEEDS_RU: readonly string[] = [
  "Вопросительная интонация: куда лучше свернуть на перекрёстке?",
  "Повелительная: закрой вкладку и вернись к черновику сразу.",
  "Мягкая просьба: не могла бы ты повторить адрес ещё раз?",
  "Перечисление с паузами: один — два — три — четыре — пять.",
  "Телефонный стиль: наберите девять восемь семь, затем шесть пять четыре.",
  "Радостная реплика: замечательно, получилось с первой попытки!",
  "Спокойное подтверждение: поняла, продолжаю по шагам.",
  "Предупреждение: осторожно, под ногами мокрый порог.",
];

export const INTONATION_SEEDS_EN: readonly string[] = [
  "Question tone: which turn should we take at the crossroads?",
  "Command tone: close the tab and return to the draft now.",
  "Soft request: could you please repeat the address once more?",
  "Listing with pauses: one — two — three — four — five.",
  "Phone style: dial nine eight seven, then six five four.",
];

export type WordFreqMap = Map<string, number>;

export type CorpusLexStats = {
  freq: WordFreqMap;
  totalTokens: number;
  phraseCount: number;
  /** Keys with count >= saturatedThreshold (content + function). */
  saturated: Set<string>;
  /** Missing function-word keys for the project language. */
  missingFunctionKeys: string[];
};

export function functionWordSet(lang: string): Set<string> {
  const list = lang.toLowerCase().startsWith("en")
    ? FUNCTION_WORDS_EN
    : FUNCTION_WORDS_RU;
  const out = new Set<string>();
  for (const w of list) {
    const key = normalizeLexKey(w);
    if (key) out.add(key);
  }
  return out;
}

export function isFunctionWordKey(key: string, fnSet: Set<string>): boolean {
  return fnSet.has(key);
}

/** Content words: non-function tokens (short function words still tracked separately). */
export function isContentWordKey(
  key: string,
  fnSet: Set<string>,
): boolean {
  if (!key) return false;
  if (fnSet.has(key)) return false;
  // Keep short non-function tokens (e.g. names/abbrev) as content.
  return true;
}

export function countWordsInTexts(texts: Iterable<string>): {
  freq: WordFreqMap;
  totalTokens: number;
} {
  const freq: WordFreqMap = new Map();
  let totalTokens = 0;
  for (const text of texts) {
    for (const raw of tokenizeSpeechWords(text)) {
      const key = normalizeLexKey(raw);
      if (!key) continue;
      freq.set(key, (freq.get(key) ?? 0) + 1);
      totalTokens += 1;
    }
  }
  return { freq, totalTokens };
}

export function saturatedThreshold(totalTokens: number, phraseCount: number): number {
  // Soft: words already used many times in a growing corpus.
  if (phraseCount <= 2 || totalTokens < 20) return 99_999; // almost nothing saturated yet
  if (totalTokens < 80) return 6;
  if (totalTokens < 200) return 8;
  if (totalTokens < 600) return 12;
  return 16;
}

export function buildCorpusLexStats(
  texts: string[],
  lang: string,
): CorpusLexStats {
  const { freq, totalTokens } = countWordsInTexts(texts);
  const phraseCount = texts.length;
  const thr = saturatedThreshold(totalTokens, phraseCount);
  const saturated = new Set<string>();
  for (const [key, count] of freq) {
    if (count >= thr) saturated.add(key);
  }
  const fnSet = functionWordSet(lang);
  const missingFunctionKeys: string[] = [];
  for (const key of fnSet) {
    if (!freq.has(key)) missingFunctionKeys.push(key);
  }
  missingFunctionKeys.sort((a, b) => a.localeCompare(b));
  return {
    freq,
    totalTokens,
    phraseCount,
    saturated,
    missingFunctionKeys,
  };
}

export type NoveltyBreakdown = {
  tokenCount: number;
  novelCount: number;
  saturatedContentHits: number;
  contentCount: number;
  missingFunctionHits: number;
  /** Higher is better. */
  score: number;
  /** True when the candidate overuses already-saturated content words. */
  tooRepetitive: boolean;
};

/**
 * Score a candidate relative to corpus frequency.
 * Prefer novel tokens + missing function words; soft-reject heavy saturated reuse.
 */
export function scorePhraseNovelty(
  text: string,
  stats: CorpusLexStats,
  lang: string,
  opts?: { missingFunctionKeys?: string[] },
): NoveltyBreakdown {
  const fnSet = functionWordSet(lang);
  const missing = new Set(
    opts?.missingFunctionKeys ?? stats.missingFunctionKeys,
  );
  const tokens = tokenizeSpeechWords(text);
  let novelCount = 0;
  let saturatedContentHits = 0;
  let contentCount = 0;
  let missingFunctionHits = 0;
  for (const raw of tokens) {
    const key = normalizeLexKey(raw);
    if (!key) continue;
    const count = stats.freq.get(key) ?? 0;
    if (count === 0) novelCount += 1;
    if (fnSet.has(key)) {
      if (missing.has(key)) missingFunctionHits += 1;
      continue;
    }
    contentCount += 1;
    if (stats.saturated.has(key) || count >= 8) saturatedContentHits += 1;
  }
  const tokenCount = tokens.length || 1;
  const novelRatio = novelCount / tokenCount;
  const satRatio =
    contentCount > 0 ? saturatedContentHits / contentCount : 0;
  const score =
    novelCount * 40 +
    Math.round(novelRatio * 80) +
    missingFunctionHits * 120 -
    saturatedContentHits * 35;
  // Soft reject: mostly saturated content and almost no novelty.
  const tooRepetitive =
    stats.phraseCount >= 5 &&
    contentCount >= 3 &&
    satRatio >= 0.55 &&
    novelCount < 2 &&
    missingFunctionHits === 0;
  return {
    tokenCount,
    novelCount,
    saturatedContentHits,
    contentCount,
    missingFunctionHits,
    score,
    tooRepetitive,
  };
}

export function coverageSeedPool(lang: string): string[] {
  if (lang.toLowerCase().startsWith("en")) {
    return [...COVERAGE_SEEDS_EN, ...INTONATION_SEEDS_EN];
  }
  return [...COVERAGE_SEEDS_RU, ...INTONATION_SEEDS_RU];
}

/**
 * Rank seeds that mention still-missing function words first,
 * then by novelty score.
 */
export function rankSeedsByNovelty(
  seeds: string[],
  stats: CorpusLexStats,
  lang: string,
): string[] {
  return [...seeds]
    .map((text) => ({
      text,
      nov: scorePhraseNovelty(text, stats, lang),
    }))
    .sort(
      (a, b) =>
        b.nov.score - a.nov.score ||
        b.nov.missingFunctionHits - a.nov.missingFunctionHits ||
        b.nov.novelCount - a.nov.novelCount,
    )
    .map((x) => x.text);
}

/**
 * Prefer filler sentences that introduce novel / missing-function words
 * and avoid saturated content — used when stretching short seeds.
 */
export function rankFillersForNovelty(
  fillers: string[],
  stats: CorpusLexStats,
  lang: string,
  alreadyInPassage: WordFreqMap,
): string[] {
  const mergedFreq: WordFreqMap = new Map(stats.freq);
  for (const [k, v] of alreadyInPassage) {
    mergedFreq.set(k, (mergedFreq.get(k) ?? 0) + v);
  }
  const mergedStats: CorpusLexStats = {
    ...stats,
    freq: mergedFreq,
  };
  return rankSeedsByNovelty(fillers, mergedStats, lang);
}

/** Build speakable seeds that pack still-missing function words. */
export function buildMissingFunctionSeeds(
  missingKeys: string[],
  lang: string,
): string[] {
  if (!missingKeys.length) return [];
  const looksEn = lang.toLowerCase().startsWith("en");
  const seeds: string[] = [];
  const chunk = 6;
  for (let i = 0; i < missingKeys.length; i += chunk) {
    const part = missingKeys.slice(i, i + chunk);
    if (looksEn) {
      seeds.push(
        `Please include these linking words clearly in one calm sentence: ${part.join(", ")}.`,
      );
    } else {
      seeds.push(
        `Произнесите спокойно связку с предлогами и частицами: ${part.join(", ")}.`,
      );
    }
    if (seeds.length >= 16) break;
  }
  return seeds;
}

/** Incrementally add a chosen phrase into live freq maps for the batch. */
export function accumulatePhraseIntoStats(
  stats: CorpusLexStats,
  text: string,
  lang: string,
): CorpusLexStats {
  const freq = new Map(stats.freq);
  let totalTokens = stats.totalTokens;
  for (const raw of tokenizeSpeechWords(text)) {
    const key = normalizeLexKey(raw);
    if (!key) continue;
    freq.set(key, (freq.get(key) ?? 0) + 1);
    totalTokens += 1;
  }
  const phraseCount = stats.phraseCount + 1;
  const thr = saturatedThreshold(totalTokens, phraseCount);
  const saturated = new Set<string>();
  for (const [key, count] of freq) {
    if (count >= thr) saturated.add(key);
  }
  const fnSet = functionWordSet(lang);
  const missingFunctionKeys: string[] = [];
  for (const key of fnSet) {
    if (!freq.has(key)) missingFunctionKeys.push(key);
  }
  return {
    freq,
    totalTokens,
    phraseCount,
    saturated,
    missingFunctionKeys,
  };
}
