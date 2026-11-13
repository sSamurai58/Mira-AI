/**
 * Workshop «Кастомные команды»: voice-triggered action chains.
 * Persist in SQLite; run open URL / launch / keys / type / click / clipboard /
 * paths / folder / pause / say / notify / window / terminal.
 */
import fs from "node:fs";
import { openStore } from "../store";
import {
  getAppPath,
  listAppPaths,
  openAppPathById,
  openPathTarget,
  type AppPathRow,
} from "./appPaths";
import { openBrowserUrl } from "../tools/browser";
import { clickAt, pressKeys, typeText } from "../tools/screen";
import { executeTerminalFromChat } from "../tools/terminal";

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
  | "window_close"
  | "terminal";

export type CustomCommandStep = {
  id: string;
  type: CustomCommandActionType;
  value: string;
};

export type CustomCommandRow = {
  id: string;
  name: string;
  phrases: string[];
  steps: CustomCommandStep[];
  reply: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type CustomCommandDbRow = {
  id: string;
  name: string;
  phrases_json: string;
  steps_json: string;
  reply: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

export type StepRunResult = {
  index: number;
  type: CustomCommandActionType;
  value: string;
  ok: boolean;
  detail: string;
};

export type CommandRunResult = {
  ok: boolean;
  command: CustomCommandRow;
  steps: StepRunResult[];
  spoken: string[];
  reply: string;
  detail: string;
  dryRun: boolean;
};

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
  "window_close",
  "terminal",
];

function ensureTable(): void {
  const store = openStore();
  store.exec(`
    CREATE TABLE IF NOT EXISTS custom_commands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phrases_json TEXT NOT NULL DEFAULT '[]',
      steps_json TEXT NOT NULL DEFAULT '[]',
      reply TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_custom_commands_enabled ON custom_commands(enabled);
  `);
}

function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeActionType(raw: unknown): CustomCommandActionType {
  const t = String(raw ?? "");
  if ((ACTION_TYPES as string[]).includes(t)) {
    return t as CustomCommandActionType;
  }
  return "say";
}

function normalizeSteps(raw: unknown[]): CustomCommandStep[] {
  return raw
    .map((item, i) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const type = normalizeActionType(o.type);
      const value = String(o.value ?? "").trim();
      const id =
        String(o.id ?? "").trim() ||
        `step-${i}-${Math.random().toString(36).slice(2, 8)}`;
      return { id, type, value } satisfies CustomCommandStep;
    })
    .filter((s): s is CustomCommandStep => s !== null);
}

function normalizePhrases(raw: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    const t = String(p ?? "").trim();
    if (!t) continue;
    const key = normalizePhrase(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function rowFromDb(row: CustomCommandDbRow): CustomCommandRow {
  return {
    id: row.id,
    name: row.name,
    phrases: normalizePhrases(parseJsonArray(row.phrases_json)),
    steps: normalizeSteps(parseJsonArray(row.steps_json)),
    reply: row.reply ?? "",
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listCustomCommands(): CustomCommandRow[] {
  ensureTable();
  const rows = openStore()
    .prepare(
      `SELECT id, name, phrases_json, steps_json, reply, enabled, created_at, updated_at
       FROM custom_commands ORDER BY name COLLATE NOCASE ASC`,
    )
    .all() as CustomCommandDbRow[];
  return rows.map(rowFromDb);
}

export function getCustomCommand(id: string): CustomCommandRow | null {
  ensureTable();
  const row = openStore()
    .prepare(
      `SELECT id, name, phrases_json, steps_json, reply, enabled, created_at, updated_at
       FROM custom_commands WHERE id = ?`,
    )
    .get(id) as CustomCommandDbRow | undefined;
  return row ? rowFromDb(row) : null;
}

export function upsertCustomCommand(input: {
  id?: string;
  name: string;
  phrases?: string[];
  steps?: CustomCommandStep[];
  reply?: string;
  enabled?: boolean;
}): CustomCommandRow {
  ensureTable();
  const store = openStore();
  const now = new Date().toISOString();
  const id = (input.id?.trim() || crypto.randomUUID()).slice(0, 80);
  const name = input.name.trim() || "Команда";
  const phrases = normalizePhrases(input.phrases ?? []);
  const steps = normalizeSteps((input.steps ?? []) as unknown[]);
  const reply = (input.reply ?? "").trim();
  const enabled = input.enabled !== false ? 1 : 0;

  const existing = store
    .prepare(`SELECT id, created_at FROM custom_commands WHERE id = ?`)
    .get(id) as { id: string; created_at: string } | undefined;

  if (existing) {
    store
      .prepare(
        `UPDATE custom_commands
         SET name = ?, phrases_json = ?, steps_json = ?, reply = ?, enabled = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        name,
        JSON.stringify(phrases),
        JSON.stringify(steps),
        reply,
        enabled,
        now,
        id,
      );
  } else {
    store
      .prepare(
        `INSERT INTO custom_commands
         (id, name, phrases_json, steps_json, reply, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        JSON.stringify(phrases),
        JSON.stringify(steps),
        reply,
        enabled,
        now,
        now,
      );
  }
  return getCustomCommand(id)!;
}

export function deleteCustomCommand(id: string): { ok: boolean } {
  ensureTable();
  openStore().prepare(`DELETE FROM custom_commands WHERE id = ?`).run(id);
  return { ok: true };
}

export function setCustomCommandEnabled(
  id: string,
  enabled: boolean,
): CustomCommandRow | null {
  ensureTable();
  const now = new Date().toISOString();
  openStore()
    .prepare(
      `UPDATE custom_commands SET enabled = ?, updated_at = ? WHERE id = ?`,
    )
    .run(enabled ? 1 : 0, now, id);
  return getCustomCommand(id);
}

/** Longest matching enabled phrase (phrase ⊆ utterance). */
export function matchCustomCommandByPhrase(
  text: string,
): CustomCommandRow | null {
  const norm = normalizePhrase(text);
  if (!norm) return null;
  const commands = listCustomCommands().filter((c) => c.enabled);
  let best: { row: CustomCommandRow; len: number } | null = null;
  for (const row of commands) {
    for (const phrase of row.phrases) {
      const t = normalizePhrase(phrase);
      if (!t || t.length < 2) continue;
      if (norm === t || norm.includes(t)) {
        const len = t.length;
        if (!best || len > best.len) best = { row, len };
      }
    }
  }
  return best?.row ?? null;
}

export function looksLikeCustomCommandIntent(text: string): boolean {
  return matchCustomCommandByPhrase(text) !== null;
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) return `https://${t}`;
  return t;
}

/** Pause value is seconds by default; suffix ms/мс for milliseconds. */
function parsePauseMs(raw: string): number {
  const t = String(raw ?? "").trim();
  if (!t) return 1000;
  const asMs = /(?:ms|мс)\s*$/i.test(t);
  const numRaw = t
    .replace(/,/g, ".")
    .replace(/\s*(мс|ms|s|сек|секунд[аы]?)\s*$/i, "")
    .trim();
  const n = Number.parseFloat(numRaw);
  if (!Number.isFinite(n) || n < 0) return 1000;
  if (asMs) return Math.min(Math.round(n), 120_000);
  return Math.min(Math.round(n * 1000), 120_000);
}

function parseClickCoordsValue(raw: string): { x: number; y: number } | null {
  const m = String(raw)
    .trim()
    .match(/^(\d{1,5})\s*[,;\s]\s*(\d{1,5})$/);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

function resolveAppPathRef(raw: string): AppPathRow | null {
  const key = raw.trim();
  if (!key) return null;
  const byId = getAppPath(key);
  if (byId) return byId;
  const norm = normalizePhrase(key);
  const rows = listAppPaths().filter((p) => p.enabled);
  let best: AppPathRow | null = null;
  for (const row of rows) {
    if (normalizePhrase(row.name) === norm) return row;
    if (normalizePhrase(row.name).includes(norm) || norm.includes(normalizePhrase(row.name))) {
      if (!best || row.name.length < best.name.length) best = row;
    }
  }
  return best;
}

function isElectronRuntime(): boolean {
  return typeof process.versions.electron === "string";
}

async function clipboardWrite(
  text: string,
  opts: { dryRun: boolean },
): Promise<{ ok: boolean; detail: string }> {
  if (!text) return { ok: false, detail: "Текст для буфера пуст" };
  if (opts.dryRun) {
    return {
      ok: true,
      detail: `Проверка: копировать «${text.slice(0, 60)}${text.length > 60 ? "…" : ""}»`,
    };
  }
  if (!isElectronRuntime()) {
    return {
      ok: true,
      detail: `Зафиксировано без GUI: буфер «${text.slice(0, 40)}»`,
    };
  }
  try {
    const { clipboard } = await import("electron");
    clipboard.writeText(text);
    return { ok: true, detail: `Скопировано в буфер (${text.length} симв.)` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function showNotify(
  title: string,
  body: string,
  opts: { dryRun: boolean },
): Promise<{ ok: boolean; detail: string }> {
  if (!body.trim() && !title.trim()) {
    return { ok: false, detail: "Текст уведомления пуст" };
  }
  const t = title.trim() || "Mira";
  const b = body.trim() || title.trim();
  if (opts.dryRun) {
    return { ok: true, detail: `Проверка: уведомление «${t}» — ${b.slice(0, 80)}` };
  }
  try {
    if (isElectronRuntime()) {
      const { Notification } = await import("electron");
      if (Notification.isSupported()) {
        new Notification({ title: t, body: b }).show();
        return { ok: true, detail: `Уведомление: ${t}` };
      }
    }
  } catch {
    /* headless */
  }
  return { ok: true, detail: `Уведомление зафиксировано (без GUI): ${t}` };
}

function parseNotifyValue(raw: string): { title: string; body: string } {
  const t = raw.trim();
  const sep = t.indexOf("|");
  if (sep >= 0) {
    return {
      title: t.slice(0, sep).trim() || "Mira",
      body: t.slice(sep + 1).trim(),
    };
  }
  return { title: "Mira", body: t };
}

async function openFolderInExplorer(
  target: string,
  opts: { dryRun: boolean },
): Promise<{ ok: boolean; detail: string }> {
  const path = target.trim();
  if (!path) return { ok: false, detail: "Папка не задана" };
  if (opts.dryRun) {
    const exists = fs.existsSync(path);
    return {
      ok: exists,
      detail: exists
        ? `Проверка: открыть папку «${path}»`
        : `Папка не найдена: ${path}`,
    };
  }
  if (!fs.existsSync(path)) {
    return { ok: false, detail: `Папка не найдена: ${path}` };
  }
  if (!isElectronRuntime()) {
    return { ok: true, detail: `Зафиксировано без GUI: папка ${path}` };
  }
  try {
    const { shell } = await import("electron");
    const st = fs.statSync(path);
    if (st.isDirectory()) {
      const err = await shell.openPath(path);
      return { ok: !err, detail: err || `Открыта папка: ${path}` };
    }
    shell.showItemInFolder(path);
    return { ok: true, detail: `Показано в проводнике: ${path}` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function windowAction(
  kind: "minimize" | "close",
  opts: { dryRun: boolean },
): Promise<{ ok: boolean; detail: string }> {
  const label = kind === "minimize" ? "свернуть окно" : "закрыть окно";
  if (opts.dryRun) {
    return { ok: true, detail: `Проверка: ${label} (best-effort)` };
  }
  // Best-effort OS shortcut on the focused desktop app (Mira aside).
  const combo = kind === "minimize" ? "win+down" : "alt+f4";
  const res = await pressKeys(combo, { dryRun: false });
  return {
    ok: res.ok,
    detail: res.ok
      ? `${label[0]!.toUpperCase()}${label.slice(1)}: ${res.detail}`
      : res.detail,
  };
}

async function runStep(
  step: CustomCommandStep,
  index: number,
  opts: { dryRun: boolean },
): Promise<StepRunResult> {
  const base = {
    index,
    type: step.type,
    value: step.value,
  };

  if (step.type === "open_url") {
    const url = normalizeUrl(step.value);
    if (!url) {
      return { ...base, ok: false, detail: "URL не задан" };
    }
    if (opts.dryRun) {
      return { ...base, ok: true, detail: `Проверка: открыть сайт ${url}` };
    }
    try {
      const res = await openBrowserUrl(url, { skipConfirm: true });
      return { ...base, ok: res.ok, detail: res.detail };
    } catch (err) {
      return {
        ...base,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (step.type === "launch") {
    const target = step.value.trim();
    if (!target) {
      return { ...base, ok: false, detail: "Путь не задан" };
    }
    if (opts.dryRun) {
      const exists = fs.existsSync(target);
      return {
        ...base,
        ok: exists,
        detail: exists
          ? `Проверка: запустить «${target}»`
          : `Путь не найден: ${target}`,
      };
    }
    const res = await openPathTarget(target);
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "open_path") {
    const ref = step.value.trim();
    if (!ref) {
      return { ...base, ok: false, detail: "Путь из «Пути» не выбран" };
    }
    const row = resolveAppPathRef(ref);
    if (!row) {
      return { ...base, ok: false, detail: `Путь «${ref}» не найден в Путях` };
    }
    if (opts.dryRun) {
      const exists = fs.existsSync(row.path);
      return {
        ...base,
        ok: exists,
        detail: exists
          ? `Проверка: открыть путь «${row.name}» (${row.path})`
          : `Файл пути не найден: ${row.path}`,
      };
    }
    const res = await openAppPathById(row.id);
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "open_folder") {
    const res = await openFolderInExplorer(step.value, opts);
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "keys") {
    const combo = step.value.trim();
    if (!combo) {
      return { ...base, ok: false, detail: "Комбинация клавиш не задана" };
    }
    const res = await pressKeys(combo, { dryRun: opts.dryRun });
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "type") {
    const text = step.value;
    if (!text.trim()) {
      return { ...base, ok: false, detail: "Текст для ввода пуст" };
    }
    const res = await typeText(text, {
      dryRun: opts.dryRun,
      skipConfirm: true,
    });
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "click") {
    const coords = parseClickCoordsValue(step.value);
    if (!coords) {
      return {
        ...base,
        ok: false,
        detail: "Координаты клика: укажите «x, y» (например 100, 200)",
      };
    }
    const res = await clickAt(coords.x, coords.y, {
      dryRun: opts.dryRun,
      skipConfirm: true,
    });
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "clipboard_copy") {
    const res = await clipboardWrite(step.value, opts);
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "clipboard_paste") {
    const text = step.value.trim();
    if (text) {
      const wrote = await clipboardWrite(text, opts);
      if (!wrote.ok) return { ...base, ok: false, detail: wrote.detail };
    }
    const paste = await pressKeys(
      process.platform === "darwin" ? "cmd+v" : "ctrl+v",
      { dryRun: opts.dryRun },
    );
    return {
      ...base,
      ok: paste.ok,
      detail: text
        ? `Вставить из буфера (${text.length} симв.): ${paste.detail}`
        : `Вставить: ${paste.detail}`,
    };
  }

  if (step.type === "pause") {
    const ms = parsePauseMs(step.value || "1");
    if (opts.dryRun) {
      return {
        ...base,
        ok: true,
        detail: `Проверка: задержка ${ms} мс (${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 2)} с)`,
      };
    }
    await new Promise((r) => setTimeout(r, ms));
    return {
      ...base,
      ok: true,
      detail: `Задержка ${ms} мс`,
    };
  }

  if (step.type === "notify") {
    const { title, body } = parseNotifyValue(step.value);
    const res = await showNotify(title, body, opts);
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "hud_say") {
    const text = step.value.trim();
    if (!text) {
      return { ...base, ok: false, detail: "Текст для HUD пуст" };
    }
    if (opts.dryRun) {
      return { ...base, ok: true, detail: `Проверка: HUD «${text}»` };
    }
    try {
      const { createOrFocusHud } = await import("../hud");
      await createOrFocusHud();
    } catch {
      /* optional */
    }
    const note = await showNotify("Mira HUD", text, { dryRun: false });
    return {
      ...base,
      ok: true,
      detail: note.ok ? `HUD: «${text}»` : `HUD (без уведомления): «${text}»`,
    };
  }

  if (step.type === "window_minimize") {
    const res = await windowAction("minimize", opts);
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "window_close") {
    const res = await windowAction("close", opts);
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "terminal") {
    const cmd = step.value.trim();
    if (!cmd) {
      return { ...base, ok: false, detail: "Команда терминала не задана" };
    }
    if (opts.dryRun) {
      return { ...base, ok: true, detail: `Проверка: терминал «${cmd}»` };
    }
    const res = await executeTerminalFromChat(cmd);
    return {
      ...base,
      ok: res.ok,
      detail: res.detail + (res.output ? `\n${res.output.slice(0, 400)}` : ""),
    };
  }

  // say
  const text = step.value.trim();
  if (!text) {
    return { ...base, ok: false, detail: "Текст для озвучки пуст" };
  }
  return {
    ...base,
    ok: true,
    detail: opts.dryRun ? `Проверка: сказать «${text}»` : `Сказать: «${text}»`,
  };
}

export async function runCustomCommand(
  command: CustomCommandRow,
  opts?: { dryRun?: boolean },
): Promise<CommandRunResult> {
  const dryRun = Boolean(opts?.dryRun);
  const stepResults: StepRunResult[] = [];
  const spoken: string[] = [];

  for (let i = 0; i < command.steps.length; i++) {
    const step = command.steps[i]!;
    const res = await runStep(step, i, { dryRun });
    stepResults.push(res);
    if (
      (step.type === "say" || step.type === "hud_say") &&
      res.ok &&
      step.value.trim()
    ) {
      spoken.push(step.value.trim());
    }
  }

  const allOk = stepResults.every((s) => s.ok);
  const reply =
    command.reply.trim() ||
    spoken.join(" ") ||
    (dryRun
      ? `Проверка «${command.name}»: ${allOk ? "ок" : "есть ошибки"}`
      : `Команда «${command.name}» ${allOk ? "выполнена" : "выполнена с ошибками"}`);

  const detailLines = stepResults.map(
    (s) => `${s.index + 1}. ${s.type}: ${s.detail}`,
  );

  return {
    ok: allOk,
    command,
    steps: stepResults,
    spoken,
    reply,
    detail: detailLines.join("\n") || "Нет шагов",
    dryRun,
  };
}

export async function runCustomCommandById(
  id: string,
  opts?: { dryRun?: boolean },
): Promise<CommandRunResult | { ok: false; detail: string }> {
  const command = getCustomCommand(id);
  if (!command) return { ok: false, detail: "Команда не найдена" };
  return runCustomCommand(command, opts);
}

export async function handleCustomCommandsFromChat(text: string): Promise<{
  used: string;
  block: string;
  reply: string;
  matched: CustomCommandRow;
}> {
  const matched = matchCustomCommandByPhrase(text);
  if (!matched) {
    return {
      used: "custom:none",
      block: "[Кастомные команды] Совпадение по фразе не найдено.",
      reply: "",
      matched: {
        id: "",
        name: "",
        phrases: [],
        steps: [],
        reply: "",
        enabled: false,
        created_at: "",
        updated_at: "",
      },
    };
  }
  const res = await runCustomCommand(matched, { dryRun: false });
  return {
    used: `custom:run:${matched.id}:${res.ok ? "ok" : "fail"}`,
    block: `[Кастомные команды] «${matched.name}»\n${res.detail}`,
    reply: res.reply,
    matched,
  };
}
