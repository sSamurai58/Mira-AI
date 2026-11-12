/** Russian labels for learned-unit kinds (not skills). */
export const LEARNED_KIND_LABEL: Record<string, string> = {
  thesis: "Тезис",
  phrase: "Фраза",
  style: "Стиль",
  logic: "Логика",
  note: "Заметка",
  term: "Термин",
};

export function learnedKindLabel(kind: string): string {
  return LEARNED_KIND_LABEL[kind] ?? kind;
}

/** True when content looks like binary / mojibake, not human language. */
export function isGarbledLearnedContent(text: string): boolean {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length < 8) return false;
  if (/^\[(pdf|epub|audio|video)/i.test(s)) return false;
  const words = s.match(/[A-Za-zА-Яа-яЁё]{3,}/g) ?? [];
  const wordChars = words.join("").length;
  const letters = (s.match(/[A-Za-zА-Яа-яЁё]/g) ?? []).length;
  if (letters / s.length < 0.35) return true;
  if (wordChars / s.length < 0.28) return true;
  // High share of latin1 noise / symbols typical of raw PDF streams
  const noise = (s.match(/[^\s\wа-яА-ЯёЁ.,;:!?«»"'()\-–—%/]/g) ?? []).length;
  return noise / s.length > 0.22;
}

export function displayLearnedContent(content: string, max = 280): string {
  const s = content.replace(/\s+/g, " ").trim();
  if (!s) return "—";
  if (isGarbledLearnedContent(s)) {
    return "Текст нечитаем (битый PDF/бинарные данные). Добавьте .md/.txt рядом с файлом или вставьте текст вручную и снова нажмите «Разобрать».";
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
