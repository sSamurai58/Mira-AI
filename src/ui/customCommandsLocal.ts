/**
 * Browser-demo fallback for Мастерская → Кастомные команды (localStorage).
 * Electron uses SQLite via window.mira.*CustomCommand*.
 */

export type CustomCommandActionType =
  | "open_url"
  | "launch"
  | "open_path"
  | "open_folder"
  | "keys"
  | "type"
  | "click"
  | "clipboard_copy"
  | "clipboard_paste"
  | "pause"
  | "say"
  | "notify"
  | "hud_say"
  | "window_minimize"
  | "window_minimize_all"
  | "window_close"
  | "window_snap"
  | "desktop_new"
  | "desktop_close"
  | "desktop_switch"
  | "terminal";

export const ACTION_TYPES: CustomCommandActionType[] = [
  "open_url",
  "launch",
  "open_path",
  "open_folder",
  "keys",
  "type",
  "click",
  "clipboard_copy",
  "clipboard_paste",
  "pause",
  "say",
  "notify",
  "hud_say",
  "window_minimize",
  "window_minimize_all",
  "window_close",
  "window_snap",
  "desktop_new",
  "desktop_close",
  "desktop_switch",
  "terminal",
];

/** Shared RU labels — used by Commands + Protocols editors. */
export const ACTION_LABEL: Record<CustomCommandActionType, string> = {
  open_url: "Открыть в браузере",
  launch: "Запустить",
  open_path: "Открыть путь",
  open_folder: "Открыть папку",
  keys: "Нажать клавиши",
  type: "Ввести текст",
  click: "Клик",
  clipboard_copy: "Копировать в буфер",
  clipboard_paste: "Вставить",
  pause: "Задержка (сек)",
  say: "Сказать",
  notify: "Уведомление",
  hud_say: "Сказать в HUD",
  window_minimize: "Свернуть окно",
  window_minimize_all: "Свернуть все",
  window_close: "Закрыть окно",
  window_snap: "Раскладка окна",
  desktop_new: "Новый рабочий стол",
  desktop_close: "Закрыть рабочий стол",
  desktop_switch: "Переключить стол",
  terminal: "Команда терминала",
};

/** Quick-add pills — identical action set for Commands and Protocols. */
export const ACTION_QUICK_ADD: CustomCommandActionType[] = [
  "open_url",
  "launch",
  "open_path",
  "open_folder",
  "type",
  "click",
  "keys",
  "clipboard_copy",
  "clipboard_paste",
  "pause",
  "say",
  "notify",
  "hud_say",
  "window_minimize",
  "window_minimize_all",
  "window_close",
  "window_snap",
  "desktop_new",
  "desktop_close",
  "desktop_switch",
  "terminal",
];

export const ACTION_VALUELESS: CustomCommandActionType[] = [
  "window_minimize",
  "window_minimize_all",
  "window_close",
  "desktop_new",
  "desktop_close",
];

/** Default step value when switching type / quick-adding. */
export function defaultActionValue(type: CustomCommandActionType): string {
  if (type === "pause") return "1";
  if (type === "click") return "100, 200";
  if (type === "window_snap") return "left";
  if (type === "desktop_switch") return "next";
  return "";
}

export type CustomCommandStep = {
  id: string;
  type: CustomCommandActionType;
  value: string;
};

export type CustomCommandItem = {
  id: string;
  name: string;
  phrases: string[];
  steps: CustomCommandStep[];
  reply: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

const STORAGE_KEY = "mira.customCommands.v1";

function nowIso(): string {
  return new Date().toISOString();
}

function readAll(): CustomCommandItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomCommandItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: CustomCommandItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function listLocalCustomCommands(): CustomCommandItem[] {
  return [...readAll()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function upsertLocalCustomCommand(input: {
  id?: string;
  name: string;
  phrases?: string[];
  steps?: CustomCommandStep[];
  reply?: string;
  enabled?: boolean;
}): CustomCommandItem {
  const items = listLocalCustomCommands();
  const ts = nowIso();
  const id = (input.id?.trim() || crypto.randomUUID()).slice(0, 80);
  const idx = items.findIndex((i) => i.id === id);
  const next: CustomCommandItem = {
    id,
    name: input.name.trim() || "Команда",
    phrases: (input.phrases ?? []).map((t) => t.trim()).filter(Boolean),
    steps: (input.steps ?? []).map((s, i) => ({
      id: s.id || `step-${i}`,
      type: s.type,
      value: s.value ?? "",
    })),
    reply: (input.reply ?? "").trim(),
    enabled: input.enabled !== false,
    created_at: idx >= 0 ? items[idx]!.created_at : ts,
    updated_at: ts,
  };
  if (idx >= 0) items[idx] = next;
  else items.push(next);
  writeAll(items);
  return next;
}

export function deleteLocalCustomCommand(id: string): { ok: boolean } {
  writeAll(listLocalCustomCommands().filter((i) => i.id !== id));
  return { ok: true };
}

export function setLocalCustomCommandEnabled(
  id: string,
  enabled: boolean,
): CustomCommandItem | null {
  const items = listLocalCustomCommands();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  items[idx] = { ...items[idx]!, enabled, updated_at: nowIso() };
  writeAll(items);
  return items[idx]!;
}

function dryLine(s: CustomCommandStep, i: number): string {
  const v = s.value || "(пусто)";
  switch (s.type) {
    case "open_url":
      return `${i + 1}. open_url: Проверка: открыть сайт ${v}`;
    case "launch":
      return `${i + 1}. launch: Проверка: запустить «${v}» (Пути или файл)`;
    case "open_path":
      return `${i + 1}. open_path: Проверка: путь из Путей «${v}»`;
    case "open_folder":
      return `${i + 1}. open_folder: Проверка: открыть папку «${v}»`;
    case "keys":
      return `${i + 1}. keys: Проверка: нажать ${v}`;
    case "type":
      return `${i + 1}. type: Проверка: ввести «${v}»`;
    case "click":
      return `${i + 1}. click: Проверка: клик ${v}`;
    case "clipboard_copy":
      return `${i + 1}. clipboard_copy: Проверка: копировать «${v}»`;
    case "clipboard_paste":
      return `${i + 1}. clipboard_paste: Проверка: вставить`;
    case "pause":
      return `${i + 1}. pause: Проверка: задержка ${s.value || "1"} с`;
    case "say":
      return `${i + 1}. say: Проверка: сказать «${v}»`;
    case "notify":
      return `${i + 1}. notify: Проверка: уведомление «${v}»`;
    case "hud_say":
      return `${i + 1}. hud_say: Проверка: HUD «${v}»`;
    case "window_minimize":
      return `${i + 1}. window_minimize: Проверка: свернуть окно`;
    case "window_minimize_all":
      return `${i + 1}. window_minimize_all: Проверка: свернуть все окна`;
    case "window_close":
      return `${i + 1}. window_close: Проверка: закрыть окно`;
    case "window_snap":
      return `${i + 1}. window_snap: Проверка: раскладка окна «${v || "maximize"}»`;
    case "desktop_new":
      return `${i + 1}. desktop_new: Проверка: новый рабочий стол`;
    case "desktop_close":
      return `${i + 1}. desktop_close: Проверка: закрыть рабочий стол`;
    case "desktop_switch":
      return `${i + 1}. desktop_switch: Проверка: переключить стол (${v || "next"})`;
    case "terminal":
      return `${i + 1}. terminal: Проверка: терминал «${v}»`;
    default:
      return `${i + 1}. ${s.type}: Проверка`;
  }
}

export function runLocalCustomCommandDry(
  id: string,
): {
  ok: boolean;
  detail: string;
  reply: string;
  dryRun: boolean;
} {
  const item = listLocalCustomCommands().find((c) => c.id === id);
  if (!item) return { ok: false, detail: "Команда не найдена", reply: "", dryRun: true };
  const lines = item.steps.map((s, i) => dryLine(s, i));
  const spoken = item.steps
    .filter(
      (s) =>
        (s.type === "say" || s.type === "hud_say") && s.value.trim(),
    )
    .map((s) => s.value.trim());
  const reply =
    item.reply.trim() ||
    spoken.join(" ") ||
    `Проверка «${item.name}»: ок`;
  return {
    ok: true,
    detail: lines.join("\n") || "Нет шагов",
    reply,
    dryRun: true,
  };
}
