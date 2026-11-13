/**
 * Browser-demo fallback for Мастерская → Кастомные команды (localStorage).
 * Electron uses SQLite via window.mira.*CustomCommand*.
 */

export type CustomCommandActionType =
  | "open_url"
  | "launch"
  | "keys"
  | "pause"
  | "say";

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
  const lines = item.steps.map((s, i) => {
    if (s.type === "open_url") return `${i + 1}. open_url: Проверка: открыть сайт ${s.value || "(пусто)"}`;
    if (s.type === "launch") return `${i + 1}. launch: Проверка: запустить «${s.value || "(пусто)"}»`;
    if (s.type === "keys") return `${i + 1}. keys: Проверка: нажать ${s.value || "(пусто)"}`;
    if (s.type === "pause") return `${i + 1}. pause: Проверка: пауза ${s.value || "1"}`;
    return `${i + 1}. say: Проверка: сказать «${s.value || "(пусто)"}»`;
  });
  const spoken = item.steps
    .filter((s) => s.type === "say" && s.value.trim())
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
