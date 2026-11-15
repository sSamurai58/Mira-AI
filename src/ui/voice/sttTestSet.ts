/**
 * Fixed STT evaluation phrases — run before wiring LLM / editor.
 */

export type SttTestPhrase = {
  id: string;
  category:
    | "paragraph"
    | "names"
    | "dates"
    | "numbers"
    | "email"
    | "command"
    | "multi";
  expected: string;
  hint: string;
};

export type SttTestResult = {
  phraseId: string;
  expected: string;
  actual: string;
  misses: string[];
  extras: string[];
  wrong: string[];
  ok: boolean;
  at: string;
};

export const STT_TEST_PHRASES: SttTestPhrase[] = [
  {
    id: "p1",
    category: "paragraph",
    expected:
      "Сегодня я диктую короткий абзац для проверки распознавания речи.",
    hint: "Обычный абзац",
  },
  {
    id: "n1",
    category: "names",
    expected: "Встреча с Анной Сергеевой в Казани и Иваном Петровым.",
    hint: "Имена и места",
  },
  {
    id: "d1",
    category: "dates",
    expected: "Назначь встречу на пятнадцатое сентября две тысячи двадцать шестого года.",
    hint: "Даты",
  },
  {
    id: "num1",
    category: "numbers",
    expected: "Номер заказа один два три четыре пять, сумма девятьсот восемьдесят рублей.",
    hint: "Числа",
  },
  {
    id: "e1",
    category: "email",
    expected: "Мой адрес почты mira тест собака example точка com.",
    hint: "Email в диктовочной форме",
  },
  {
    id: "c1",
    category: "command",
    expected: "Сохрани версию",
    hint: "Команда сохранения",
  },
  {
    id: "c2",
    category: "command",
    expected: "Прочитай последний абзац",
    hint: "Команда чтения",
  },
  {
    id: "m1",
    category: "multi",
    expected:
      "Первое предложение. Второе предложение про архив. Третье про заметки.",
    hint: "Несколько предложений",
  },
];

const RESULTS_KEY = "mira.sttTestResults.v1";

function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[.,!?;:«»"'()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Compare expected vs actual: misses / extras / wrong (order-insensitive bag). */
export function scoreSttResult(expected: string, actual: string): Omit<
  SttTestResult,
  "phraseId" | "at"
> {
  const exp = normalizeTokens(expected);
  const act = normalizeTokens(actual);
  const expBag = new Map<string, number>();
  const actBag = new Map<string, number>();
  for (const t of exp) expBag.set(t, (expBag.get(t) ?? 0) + 1);
  for (const t of act) actBag.set(t, (actBag.get(t) ?? 0) + 1);

  const misses: string[] = [];
  const wrong: string[] = [];
  const extras: string[] = [];

  for (const [t, n] of expBag) {
    const have = actBag.get(t) ?? 0;
    for (let i = 0; i < n - have; i += 1) misses.push(t);
  }
  for (const [t, n] of actBag) {
    const need = expBag.get(t) ?? 0;
    for (let i = 0; i < n - need; i += 1) extras.push(t);
  }

  // Tokens present but in different form counted as wrong if edit distance high — keep simple:
  if (misses.length && extras.length) {
    wrong.push(...misses.slice(0, Math.min(misses.length, extras.length)));
  }

  const ok = misses.length === 0 && extras.length === 0;
  return { expected, actual, misses, extras, wrong, ok };
}

export function recordSttTest(
  phraseId: string,
  expected: string,
  actual: string,
): SttTestResult {
  const scored = scoreSttResult(expected, actual);
  const row: SttTestResult = {
    phraseId,
    at: new Date().toISOString(),
    ...scored,
  };
  const prev = listSttTestResults().filter((r) => r.phraseId !== phraseId);
  const next = [row, ...prev].slice(0, 40);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(next));
  }
  return row;
}

export function listSttTestResults(): SttTestResult[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SttTestResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearSttTestResults(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(RESULTS_KEY);
  }
}
