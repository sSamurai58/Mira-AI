import fs from "node:fs";
import path from "node:path";
import { openStore } from "./store";

export type LogLevel = "info" | "warn" | "error" | "debug";

export type AppLogRow = {
  id: string;
  level: LogLevel;
  category: string;
  message: string;
  meta_json: string | null;
  created_at: string;
};

function logsDir(): string {
  const dir = path.resolve(process.cwd(), "data", "logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonlPath(): string {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(logsDir(), `mira-${day}.jsonl`);
}

export function appendAppLog(input: {
  level?: LogLevel;
  category: string;
  message: string;
  meta?: unknown;
}): AppLogRow {
  const row: AppLogRow = {
    id: crypto.randomUUID(),
    level: input.level ?? "info",
    category: input.category,
    message: input.message,
    meta_json: input.meta === undefined ? null : JSON.stringify(input.meta),
    created_at: new Date().toISOString(),
  };

  try {
    openStore()
      .prepare(
        `INSERT INTO app_logs (id, level, category, message, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.level,
        row.category,
        row.message,
        row.meta_json,
        row.created_at,
      );
  } catch {
    // store may be mid-close during backup; still write file
  }

  try {
    fs.appendFileSync(jsonlPath(), `${JSON.stringify(row)}\n`, "utf8");
  } catch {
    // ignore disk errors in logger
  }

  return row;
}

export function listAppLogs(opts?: {
  limit?: number;
  category?: string;
  level?: LogLevel;
}): AppLogRow[] {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const store = openStore();
  if (opts?.category && opts?.level) {
    return store
      .prepare(
        `SELECT id, level, category, message, meta_json, created_at
         FROM app_logs
         WHERE category = ? AND level = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(opts.category, opts.level, limit) as AppLogRow[];
  }
  if (opts?.category) {
    return store
      .prepare(
        `SELECT id, level, category, message, meta_json, created_at
         FROM app_logs WHERE category = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(opts.category, limit) as AppLogRow[];
  }
  if (opts?.level) {
    return store
      .prepare(
        `SELECT id, level, category, message, meta_json, created_at
         FROM app_logs WHERE level = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(opts.level, limit) as AppLogRow[];
  }
  return store
    .prepare(
      `SELECT id, level, category, message, meta_json, created_at
       FROM app_logs ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as AppLogRow[];
}

export function clearAppLogs(): { ok: boolean; deleted: number } {
  const store = openStore();
  const count = (
    store.prepare(`SELECT COUNT(*) AS c FROM app_logs`).get() as { c: number }
  ).c;
  store.exec(`DELETE FROM app_logs;`);
  return { ok: true, deleted: count };
}

export function getLoggingStatus() {
  const dir = logsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse();
  const dbCount = (
    openStore().prepare(`SELECT COUNT(*) AS c FROM app_logs`).get() as {
      c: number;
    }
  ).c;
  return {
    dir: "data/logs",
    files,
    dbCount,
    latestFile: files[0] ?? null,
  };
}

export function readLogFileTail(fileName: string, maxLines = 80): string {
  const safe = path.basename(fileName);
  if (!safe.endsWith(".jsonl")) throw new Error("Только .jsonl");
  const full = path.join(logsDir(), safe);
  if (!fs.existsSync(full)) throw new Error("Файл лога не найден");
  const text = fs.readFileSync(full, "utf8");
  const lines = text.trimEnd().split("\n");
  return lines.slice(-Math.max(1, maxLines)).join("\n");
}
