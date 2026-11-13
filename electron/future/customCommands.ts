/**
 * Workshop «Кастомные команды»: voice-triggered action chains.
 * Persist in SQLite; run open URL / launch path / keys / pause / say.
 */
import fs from "node:fs";
import { openStore } from "../store";
import { openPathTarget } from "./appPaths";
import { openBrowserUrl } from "../tools/browser";
import { pressKeys } from "../tools/screen";

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

const ACTION_TYPES: CustomCommandActionType[] = [
  "open_url",
  "launch",
  "keys",
  "pause",
  "say",
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

function parsePauseMs(raw: string): number {
  const n = Number.parseFloat(String(raw).replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return 1000;
  // Allow "1.5" as seconds if value looks small, else treat as ms.
  if (n > 0 && n < 30 && !/ms/i.test(raw) && !String(raw).includes("мс")) {
    // Heuristic: bare "2" → 2s; "500" → 500ms; "1500" → 1500ms
    if (n <= 60 && !/^\d{3,}$/.test(String(raw).trim())) {
      return Math.round(n * 1000);
    }
  }
  return Math.min(Math.round(n), 120_000);
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

  if (step.type === "keys") {
    const combo = step.value.trim();
    if (!combo) {
      return { ...base, ok: false, detail: "Комбинация клавиш не задана" };
    }
    const res = await pressKeys(combo, { dryRun: opts.dryRun });
    return { ...base, ok: res.ok, detail: res.detail };
  }

  if (step.type === "pause") {
    const ms = parsePauseMs(step.value || "1");
    if (opts.dryRun) {
      return { ...base, ok: true, detail: `Проверка: пауза ${ms} мс` };
    }
    await new Promise((r) => setTimeout(r, ms));
    return { ...base, ok: true, detail: `Пауза ${ms} мс` };
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
    if (step.type === "say" && res.ok && step.value.trim()) {
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
