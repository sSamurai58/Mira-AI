import { openStore } from "../store";

export type StopwatchRow = {
  id: string;
  label: string;
  started_at: string | null;
  accumulated_ms: number;
  status: "running" | "paused" | "stopped";
  created_at: string;
  updated_at: string;
};

export function ensureStopwatchTable(): void {
  openStore().exec(`
    CREATE TABLE IF NOT EXISTS stopwatches (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      started_at TEXT,
      accumulated_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function rowFromDb(r: Record<string, unknown>): StopwatchRow {
  return {
    id: String(r.id),
    label: String(r.label),
    started_at: r.started_at == null ? null : String(r.started_at),
    accumulated_ms: Number(r.accumulated_ms) || 0,
    status: (String(r.status) as StopwatchRow["status"]) || "stopped",
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export function listStopwatches(limit = 10): StopwatchRow[] {
  ensureStopwatchTable();
  const rows = openStore()
    .prepare(
      `SELECT id, label, started_at, accumulated_ms, status, created_at, updated_at
       FROM stopwatches ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(rowFromDb);
}

export function getActiveStopwatch(): StopwatchRow | null {
  ensureStopwatchTable();
  const row = openStore()
    .prepare(
      `SELECT id, label, started_at, accumulated_ms, status, created_at, updated_at
       FROM stopwatches
       WHERE status IN ('running', 'paused')
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  return row ? rowFromDb(row) : null;
}

export function elapsedMs(sw: StopwatchRow, now = Date.now()): number {
  let ms = Math.max(0, sw.accumulated_ms);
  if (sw.status === "running" && sw.started_at) {
    const started = Date.parse(sw.started_at);
    if (Number.isFinite(started)) ms += Math.max(0, now - started);
  }
  return ms;
}

export function startStopwatch(label = "Секундомер"): StopwatchRow {
  ensureStopwatchTable();
  const store = openStore();
  const active = getActiveStopwatch();
  const nowIso = new Date().toISOString();
  if (active) {
    if (active.status === "paused") {
      store
        .prepare(
          `UPDATE stopwatches SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(nowIso, nowIso, active.id);
      return { ...active, status: "running", started_at: nowIso, updated_at: nowIso };
    }
    if (active.status === "running") return active;
  }
  const row: StopwatchRow = {
    id: crypto.randomUUID(),
    label: label.trim() || "Секундомер",
    started_at: nowIso,
    accumulated_ms: 0,
    status: "running",
    created_at: nowIso,
    updated_at: nowIso,
  };
  store
    .prepare(
      `INSERT INTO stopwatches (id, label, started_at, accumulated_ms, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.label,
      row.started_at,
      row.accumulated_ms,
      row.status,
      row.created_at,
      row.updated_at,
    );
  return row;
}

export function pauseStopwatch(id?: string): StopwatchRow | null {
  ensureStopwatchTable();
  const store = openStore();
  const row = id
    ? (store
        .prepare(`SELECT * FROM stopwatches WHERE id = ?`)
        .get(id) as Record<string, unknown> | undefined)
    : (store
        .prepare(
          `SELECT * FROM stopwatches WHERE status = 'running' ORDER BY updated_at DESC LIMIT 1`,
        )
        .get() as Record<string, unknown> | undefined);
  if (!row) return null;
  const sw = rowFromDb(row);
  if (sw.status !== "running") return sw;
  const now = Date.now();
  const acc = elapsedMs(sw, now);
  const nowIso = new Date(now).toISOString();
  store
    .prepare(
      `UPDATE stopwatches SET status = 'paused', started_at = NULL, accumulated_ms = ?, updated_at = ? WHERE id = ?`,
    )
    .run(acc, nowIso, sw.id);
  return {
    ...sw,
    status: "paused",
    started_at: null,
    accumulated_ms: acc,
    updated_at: nowIso,
  };
}

export function resetStopwatch(id?: string): StopwatchRow | null {
  ensureStopwatchTable();
  const store = openStore();
  const row = id
    ? (store
        .prepare(`SELECT * FROM stopwatches WHERE id = ?`)
        .get(id) as Record<string, unknown> | undefined)
    : (store
        .prepare(
          `SELECT * FROM stopwatches WHERE status IN ('running','paused') ORDER BY updated_at DESC LIMIT 1`,
        )
        .get() as Record<string, unknown> | undefined);
  if (!row) return null;
  const sw = rowFromDb(row);
  const nowIso = new Date().toISOString();
  store
    .prepare(
      `UPDATE stopwatches SET status = 'stopped', started_at = NULL, accumulated_ms = 0, updated_at = ? WHERE id = ?`,
    )
    .run(nowIso, sw.id);
  return {
    ...sw,
    status: "stopped",
    started_at: null,
    accumulated_ms: 0,
    updated_at: nowIso,
  };
}
