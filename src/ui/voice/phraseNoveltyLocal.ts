/**
 * Browser-demo mirror of electron/voiceStudio/phraseNovelty.ts —
 * keep Electron as source of truth; this stays dependency-free for Vite.
 */

const FUNCTION_WORDS_RU = [
  "в",
  "на",
  "с",
  "со",
  "у",
  "к",
  "ко",
  "о",
  "об",
  "от",
  "до",
  "из",
  "за",
  "по",
  "под",
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
  "кроме",
  "помимо",
  "и",
  "а",
  "но",
  "или",
  "либо",
  "же",
  "ли",
  "бы",
  "не",
  "ни",
  "что",
  "чтобы",
  "если",
  "когда",
  "пока",
  "хотя",
  "потому",
  "поэтому",
  "однако",
  "ведь",
  "уже",
  "ещё",
  "еще",
  "только",
  "даже",
  "пусть",
  "также",
  "тоже",
];

const COVERAGE_SEEDS = [
  "Положи книгу на стол и поставь чашку рядом с окном.",
  "Выйди из комнаты без шума и зайди к соседу за ключом.",
  "Пройди через двор вдоль забора вокруг дома до калитки.",
  "Вопрос: что сделать, если дождь пойдёт до вечера?",
  "Команда: открой файл про отчёт и сохрани его без ошибок.",
  "Перечисление: хлеб, молоко, сыр, яйца и зелень для салата.",
  "Номер: плюс семь девятьсот одиннадцать двадцать два тридцать три.",
  "Мягкий тон: пожалуйста, говори чуть тише, чтобы не разбудить.",
  "Уточнение: неужели нельзя перенести встречу хотя бы на час?",
  "Объяснение: я звоню, потому что нужна помощь по маршруту.",
];

function norm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function tokens(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[«»„"'(（\[]+|[»„"'.,!?;:…)）\]]+$/g, ""))
    .filter((t) => t.length > 0);
}

export type LocalCorpusLexStats = {
  freq: Map<string, number>;
  totalTokens: number;
  phraseCount: number;
  saturated: Set<string>;
  missingFunctionKeys: string[];
};

function fnSet(): Set<string> {
  return new Set(FUNCTION_WORDS_RU.map(norm).filter(Boolean));
}

function saturatedThreshold(totalTokens: number, phraseCount: number): number {
  if (phraseCount <= 2 || totalTokens < 20) return 99_999;
  if (totalTokens < 80) return 6;
  if (totalTokens < 200) return 8;
  if (totalTokens < 600) return 12;
  return 16;
}

export function localBuildCorpusLexStats(texts: string[]): LocalCorpusLexStats {
  const freq = new Map<string, number>();
  let totalTokens = 0;
  for (const text of texts) {
    for (const raw of tokens(text)) {
      const key = norm(raw);
      if (!key) continue;
      freq.set(key, (freq.get(key) ?? 0) + 1);
      totalTokens += 1;
    }
  }
  const phraseCount = texts.length;
  const thr = saturatedThreshold(totalTokens, phraseCount);
  const saturated = new Set<string>();
  for (const [key, count] of freq) {
    if (count >= thr) saturated.add(key);
  }
  const missingFunctionKeys: string[] = [];
  for (const key of fnSet()) {
    if (!freq.has(key)) missingFunctionKeys.push(key);
  }
  return { freq, totalTokens, phraseCount, saturated, missingFunctionKeys };
}

export function localScorePhraseNovelty(
  text: string,
  stats: LocalCorpusLexStats,
): {
  score: number;
  tooRepetitive: boolean;
  missingFunctionHits: number;
  novelCount: number;
} {
  const fn = fnSet();
  const missing = new Set(stats.missingFunctionKeys);
  const toks = tokens(text);
  let novelCount = 0;
  let saturatedContentHits = 0;
  let contentCount = 0;
  let missingFunctionHits = 0;
  for (const raw of toks) {
    const key = norm(raw);
    if (!key) continue;
    const count = stats.freq.get(key) ?? 0;
    if (count === 0) novelCount += 1;
    if (fn.has(key)) {
      if (missing.has(key)) missingFunctionHits += 1;
      continue;
    }
    contentCount += 1;
    if (stats.saturated.has(key) || count >= 8) saturatedContentHits += 1;
  }
  const tokenCount = toks.length || 1;
  const novelRatio = novelCount / tokenCount;
  const satRatio =
    contentCount > 0 ? saturatedContentHits / contentCount : 0;
  const score =
    novelCount * 40 +
    Math.round(novelRatio * 80) +
    missingFunctionHits * 120 -
    saturatedContentHits * 35;
  const tooRepetitive =
    stats.phraseCount >= 5 &&
    contentCount >= 3 &&
    satRatio >= 0.55 &&
    novelCount < 2 &&
    missingFunctionHits === 0;
  return { score, tooRepetitive, missingFunctionHits, novelCount };
}

export function localRankByNovelty(
  seeds: string[],
  stats: LocalCorpusLexStats,
): string[] {
  return [...seeds]
    .map((text) => ({ text, nov: localScorePhraseNovelty(text, stats) }))
    .sort(
      (a, b) =>
        b.nov.score - a.nov.score ||
        b.nov.missingFunctionHits - a.nov.missingFunctionHits ||
        b.nov.novelCount - a.nov.novelCount,
    )
    .map((x) => x.text);
}

export function localCoverageSeeds(stats: LocalCorpusLexStats): string[] {
  const missing = stats.missingFunctionKeys;
  const packed: string[] = [];
  for (let i = 0; i < missing.length; i += 6) {
    const part = missing.slice(i, i + 6);
    packed.push(
      `Произнесите спокойно связку с предлогами и частицами: ${part.join(", ")}.`,
    );
    if (packed.length >= 12) break;
  }
  return localRankByNovelty([...packed, ...COVERAGE_SEEDS], stats);
}

export function localAccumulatePhrase(
  stats: LocalCorpusLexStats,
  text: string,
): LocalCorpusLexStats {
  const freq = new Map(stats.freq);
  let totalTokens = stats.totalTokens;
  for (const raw of tokens(text)) {
    const key = norm(raw);
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
  const missingFunctionKeys: string[] = [];
  for (const key of fnSet()) {
    if (!freq.has(key)) missingFunctionKeys.push(key);
  }
  return { freq, totalTokens, phraseCount, saturated, missingFunctionKeys };
}
