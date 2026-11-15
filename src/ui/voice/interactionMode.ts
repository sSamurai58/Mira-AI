/**
 * Voice interaction modes: dictation (everything → draft) vs command (route).
 * Dangerous ops require spoken confirmation in a short window.
 */

export type InteractionMode = "dictation" | "command";

export type PendingConfirm = {
  id: string;
  action: DangerousAction;
  label: string;
  /** Object description spoken to the user */
  objectLabel: string;
  expiresAt: number;
  payload?: Record<string, string>;
};

export type DangerousAction =
  | "delete_note"
  | "clear_note"
  | "replace_version"
  | "send_external"
  | "mass_move";

const MODE_KEY = "mira.interactionMode.v1";
const CONFIRM_WINDOW_MS = 12_000;

let mode: InteractionMode = loadMode();
let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function loadMode(): InteractionMode {
  if (typeof localStorage === "undefined") return "command";
  const raw = localStorage.getItem(MODE_KEY);
  return raw === "dictation" ? "dictation" : "command";
}

export function getInteractionMode(): InteractionMode {
  return mode;
}

export function setInteractionMode(next: InteractionMode): void {
  mode = next;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(MODE_KEY, next);
  }
  // Switching mode clears pending confirm (avoid stale «да»).
  pending = null;
  notify();
}

export function subscribeInteractionMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingConfirm(): PendingConfirm | null {
  if (pending && Date.now() > pending.expiresAt) {
    pending = null;
  }
  return pending;
}

export function clearPendingConfirm(): void {
  pending = null;
  notify();
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cfm-${Date.now()}`;
}

/** Ask for confirmation; returns spoken prompt text. */
export function requestConfirm(input: {
  action: DangerousAction;
  objectLabel: string;
  payload?: Record<string, string>;
}): { prompt: string; pending: PendingConfirm } {
  const entry: PendingConfirm = {
    id: makeId(),
    action: input.action,
    label: confirmActionLabel(input.action),
    objectLabel: input.objectLabel,
    expiresAt: Date.now() + CONFIRM_WINDOW_MS,
    payload: input.payload,
  };
  pending = entry;
  notify();
  return {
    prompt: `${entry.label} «${entry.objectLabel}»? Скажите «подтверждаю» или «нет».`,
    pending: entry,
  };
}

export function confirmActionLabel(action: DangerousAction): string {
  switch (action) {
    case "delete_note":
      return "Удалить заметку";
    case "clear_note":
      return "Очистить заметку";
    case "replace_version":
      return "Заменить версию";
    case "send_external":
      return "Отправить наружу";
    case "mass_move":
      return "Массово переместить";
    default:
      return "Выполнить опасное действие";
  }
}

// Avoid \\b — Cyrillic is not a JS "word" char, so \\b breaks on RU tokens.
const YES =
  /^(да|подтверждаю|подтвердить|согласен|ок|okay|yes)(?:\s|$|[.,!?])/i;
const NO =
  /^(нет|отмена|отменить|не надо|стоп|no)(?:\s|$|[.,!?])/i;

export type ConfirmAnswer = "yes" | "no" | "unrelated";

/** Parse reply while a confirm is pending. Outside window → unrelated. */
export function answerPendingConfirm(transcript: string): {
  answer: ConfirmAnswer;
  pending: PendingConfirm | null;
} {
  const cur = getPendingConfirm();
  if (!cur) return { answer: "unrelated", pending: null };
  const t = transcript.trim();
  if (YES.test(t)) {
    pending = null;
    notify();
    return { answer: "yes", pending: cur };
  }
  if (NO.test(t)) {
    pending = null;
    notify();
    return { answer: "no", pending: cur };
  }
  return { answer: "unrelated", pending: cur };
}

/** Classify a command-mode utterance into a rough intent. */
export type CommandIntent =
  | { kind: "stop" }
  | { kind: "continue_read" }
  | { kind: "repeat_read" }
  | { kind: "read_from"; paragraph: number }
  | { kind: "read_first" }
  | { kind: "next_paragraph" }
  | { kind: "save_version" }
  | { kind: "create_note"; title?: string }
  | { kind: "delete_note"; title?: string }
  | { kind: "switch_dictation" }
  | { kind: "switch_command" }
  | { kind: "chat"; text: string };

const END = String.raw`(?:\s|$|[.,!?])`;

export function classifyCommand(raw: string): CommandIntent {
  const text = raw.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();

  if (new RegExp(`^(стоп|останови|хватит|stop)${END}`).test(lower)) {
    return { kind: "stop" };
  }
  if (new RegExp(`^(продолжи|продолжить|дальше)${END}`).test(lower)) {
    return { kind: "continue_read" };
  }
  if (new RegExp(`^(повтори|повтор|ещё раз)${END}`).test(lower)) {
    return { kind: "repeat_read" };
  }
  if (new RegExp(`^(следующий абзац)${END}`).test(lower)) {
    return { kind: "next_paragraph" };
  }
  if (
    new RegExp(`^(прочитай сначала|читай сначала|с начала)${END}`).test(lower)
  ) {
    return { kind: "read_first" };
  }
  const fromDigit = lower.match(
    /(?:читай|прочитай)\s+(?:с\s+)?(?:абзац[ае]?\s+)?(\d+)/i,
  );
  if (fromDigit) {
    return { kind: "read_from", paragraph: Number(fromDigit[1]) };
  }
  const ORDINAL: Record<string, number> = {
    первого: 1,
    первым: 1,
    второго: 2,
    вторым: 2,
    третьего: 3,
    третьим: 3,
    четвертого: 4,
    четвёртого: 4,
    пятого: 5,
  };
  const fromWord = lower.match(
    /(?:читай|прочитай)\s+с\s+(\S+?)(?:\s+абзац|\s*$)/i,
  );
  if (fromWord) {
    const n = ORDINAL[fromWord[1]!] ?? Number(fromWord[1]);
    if (Number.isFinite(n) && n > 0) {
      return { kind: "read_from", paragraph: n };
    }
  }
  if (
    new RegExp(`^(сохрани версию|сохранить версию|новая версия)${END}`).test(
      lower,
    )
  ) {
    return { kind: "save_version" };
  }
  if (
    new RegExp(`^(режим диктовки|диктовка|включи диктовку)${END}`).test(lower)
  ) {
    return { kind: "switch_dictation" };
  }
  if (
    new RegExp(`^(режим команд|командный режим|включи команды)${END}`).test(
      lower,
    )
  ) {
    return { kind: "switch_command" };
  }
  const createMatch = text.match(
    /^(?:создай|создать)\s+(?:заметку|заметка)(?:\s+(.+))?$/i,
  );
  if (createMatch) {
    return { kind: "create_note", title: createMatch[1]?.trim() };
  }
  const delMatch = text.match(
    /^(?:удали|удалить)\s+(?:заметку|заметка)(?:\s+(.+))?$/i,
  );
  if (delMatch) {
    return { kind: "delete_note", title: delMatch[1]?.trim() };
  }

  return { kind: "chat", text };
}

export const CONFIRM_WINDOW_MS_EXPORT = CONFIRM_WINDOW_MS;
