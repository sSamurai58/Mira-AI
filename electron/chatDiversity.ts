/**
 * Chat reply diversity — stop Mira recycling the same spoken menu of ideas
 * (мини-проект / план дня / Хабаровск / разбор / «что ближе»).
 *
 * Voice Studio phrase novelty (0.1.6) does NOT touch chat LLM replies.
 * This module injects anti-repeat guidance into the dialog path.
 */

export type DiversityUtterance = {
  role: string;
  content: string;
};

/** Sticky canned-offer fingerprints that users hear as "nothing changed". */
const STICKY_TOPIC_RE: Array<{ id: string; re: RegExp }> = [
  { id: "хабаровск/погода/что надеть", re: /хабаровск|что\s+надеть|погод[аеуы]/i },
  {
    id: "план дня (утро/дела/вечер)",
    re: /план\s+дня|утро[,.]?\s*дела|разложить\s+по\s+шагам/i,
  },
  {
    id: "мини-проект / скрипт python",
    re: /мини[-\s]?проект|скрипт\s+на\s+python|игра,\s*бот/i,
  },
  {
    id: "разбор материала (камера/текст)",
    re: /пришл[её]шь\s+материал|разбер[её]м\s+вместе|камера,\s*текст/i,
  },
  {
    id: "меню «что ближе»",
    re: /что\s+ближе\s*:|код,\s*планы\s+или\s+просто\s+разговор/i,
  },
  {
    id: "завтра поболтать / сделать руками",
    re: /завтра\s+можем|поболтать|сделать\s+что[-\s]?то\s+руками/i,
  },
];

const MENU_MARKERS_RE =
  /вот\s+несколько\s+идей|что\s+ближе\s*:|варианты\s+на\s+завтра|могу\s+предложить\s+несколько/i;

/** Extra system rules appended to the base Mira persona. */
export const CHAT_DIVERSITY_SYSTEM_RULES = [
  "Не повторяй одно и то же «меню идей» из прошлых ответов (мини-проект / план дня / погода в городе / разбор материала / «что ближе»).",
  "Если пользователь не просил список вариантов — ответь по сути одним конкретным шагом или коротким живым ответом, без брошюры из четырёх пунктов.",
  "Если предлагаешь варианты — сделай их свежими и привязанными к ЭТОМУ ходу; не копируй прошлый шаблон слово в слово.",
  "Город, погоду и «что надеть» поднимай только когда пользователь сам спросил или это прямо нужно сейчас — не как вечный пункт меню.",
].join(" ");

export function looksLikeCannedIdeaMenu(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (MENU_MARKERS_RE.test(t)) return true;
  let stickyHits = 0;
  for (const { re } of STICKY_TOPIC_RE) {
    if (re.test(t)) stickyHits += 1;
  }
  // Classic recycled brochure: ≥3 sticky topics in one assistant turn.
  return stickyHits >= 3;
}

export function extractStickyTopics(text: string): string[] {
  const out: string[] = [];
  for (const { id, re } of STICKY_TOPIC_RE) {
    if (re.test(text)) out.push(id);
  }
  return out;
}

/**
 * Scan recent assistant turns (+ optional memory snippets) and build a
 * system block that forbids recycling the same spoken brochure.
 */
export function buildReplyDiversityBlock(
  utterances: DiversityUtterance[],
  opts?: { memorySnippets?: string[]; lookback?: number },
): string | null {
  const lookback = Math.max(1, Math.min(opts?.lookback ?? 12, 40));
  const recentAssistant = utterances
    .filter((u) => u.role === "assistant")
    .slice(-lookback);

  const topicCounts = new Map<string, number>();
  const cannedExcerpts: string[] = [];

  const consider = (text: string) => {
    for (const id of extractStickyTopics(text)) {
      topicCounts.set(id, (topicCounts.get(id) ?? 0) + 1);
    }
    if (looksLikeCannedIdeaMenu(text)) {
      const excerpt = text.replace(/\s+/g, " ").trim().slice(0, 160);
      if (excerpt && !cannedExcerpts.includes(excerpt)) {
        cannedExcerpts.push(excerpt);
      }
    }
  };

  for (const u of recentAssistant) consider(u.content);
  for (const snip of opts?.memorySnippets ?? []) consider(snip);

  if (!topicCounts.size && !cannedExcerpts.length) return null;

  const lines: string[] = [
    "[Разнообразие ответов — обязательно]",
    "В недавних ответах уже встречались шаблоны/темы ниже. НЕ повторяй их тем же меню и теми же формулировками.",
  ];

  if (topicCounts.size) {
    const ranked = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]);
    lines.push(
      `Запрещённые к повтору темы этого хода: ${ranked
        .map(([id, n]) => `${id} (×${n})`)
        .join("; ")}.`,
    );
  }

  if (cannedExcerpts.length) {
    lines.push("Примеры уже сказанного меню (не копировать):");
    for (const ex of cannedExcerpts.slice(0, 3)) {
      lines.push(`- «${ex}${ex.length >= 160 ? "…" : ""}»`);
    }
  }

  lines.push(
    "Сделай ответ другим: без того же списка из четырёх пунктов, без «Что ближе: код, планы или разговор?».",
  );

  return lines.join("\n");
}
