import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SessionRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type UtteranceRow = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export type MemoryHit = {
  utterance_id: string;
  session_id: string;
  session_title: string;
  role: string;
  content: string;
  created_at: string;
};

export type BrowserVisitRow = {
  id: string;
  url: string;
  title: string;
  source: string;
  visited_at: string;
};

let db: DatabaseSync | null = null;

function resolveDatabasePath(): string {
  const fromEnv = process.env.DATABASE_PATH?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }
  return path.resolve(process.cwd(), "data", "mira.db");
}

export function getDatabasePath(): string {
  return resolveDatabasePath();
}

export function openStore(): DatabaseSync {
  if (db) return db;

  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS utterances (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_utterances_session
      ON utterances(session_id, created_at);
    CREATE TABLE IF NOT EXISTS browser_visits (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      visited_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_browser_visits_visited
      ON browser_visits(visited_at DESC);
  `);

  return db;
}

export function listSessions(limit = 50): SessionRow[] {
  const store = openStore();
  return store
    .prepare(
      `SELECT id, title, created_at, updated_at
       FROM sessions
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as SessionRow[];
}

export function getSession(id: string): SessionRow | null {
  const store = openStore();
  const row = store
    .prepare(
      `SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?`,
    )
    .get(id) as SessionRow | undefined;
  return row ?? null;
}

export function createSession(title = "Новый диалог"): SessionRow {
  const store = openStore();
  const now = new Date().toISOString();
  const row: SessionRow = {
    id: crypto.randomUUID(),
    title,
    created_at: now,
    updated_at: now,
  };
  store
    .prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(row.id, row.title, row.created_at, row.updated_at);
  return row;
}

export function touchSession(id: string, title?: string): void {
  const store = openStore();
  const now = new Date().toISOString();
  if (title) {
    store
      .prepare(
        `UPDATE sessions SET updated_at = ?, title = ? WHERE id = ?`,
      )
      .run(now, title, id);
  } else {
    store
      .prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
      .run(now, id);
  }
}

export function ensureBootstrapSession(): SessionRow {
  const store = openStore();
  const existing = store
    .prepare(
      `SELECT id, title, created_at, updated_at
       FROM sessions
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get() as SessionRow | undefined;

  if (existing) return existing;
  return createSession("Первый диалог");
}

export function listUtterances(sessionId: string): UtteranceRow[] {
  const store = openStore();
  return store
    .prepare(
      `SELECT id, session_id, role, content, created_at
       FROM utterances
       WHERE session_id = ?
       ORDER BY created_at ASC`,
    )
    .all(sessionId) as UtteranceRow[];
}

export function addUtterance(
  sessionId: string,
  role: UtteranceRow["role"],
  content: string,
): UtteranceRow {
  const store = openStore();
  const row: UtteranceRow = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    role,
    content,
    created_at: new Date().toISOString(),
  };
  store
    .prepare(
      `INSERT INTO utterances (id, session_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.session_id, row.role, row.content, row.created_at);
  touchSession(sessionId);
  return row;
}

/** Simple LIKE search across past utterances (P1). */
export function searchMemory(
  query: string,
  opts?: { limit?: number; excludeSessionId?: string },
): MemoryHit[] {
  const q = query.trim();
  if (!q) return [];
  const store = openStore();
  const limit = opts?.limit ?? 6;
  const like = `%${q.replace(/[%_]/g, "")}%`;

  if (opts?.excludeSessionId) {
    return store
      .prepare(
        `SELECT u.id AS utterance_id, u.session_id, s.title AS session_title,
                u.role, u.content, u.created_at
         FROM utterances u
         JOIN sessions s ON s.id = u.session_id
         WHERE u.content LIKE ? AND u.session_id != ?
         ORDER BY u.created_at DESC
         LIMIT ?`,
      )
      .all(like, opts.excludeSessionId, limit) as MemoryHit[];
  }

  return store
    .prepare(
      `SELECT u.id AS utterance_id, u.session_id, s.title AS session_title,
              u.role, u.content, u.created_at
       FROM utterances u
       JOIN sessions s ON s.id = u.session_id
       WHERE u.content LIKE ?
       ORDER BY u.created_at DESC
       LIMIT ?`,
    )
    .all(like, limit) as MemoryHit[];
}

export function addBrowserVisit(
  url: string,
  source = "mira-open",
  title?: string,
): BrowserVisitRow {
  const store = openStore();
  const row: BrowserVisitRow = {
    id: crypto.randomUUID(),
    url,
    title: title || url,
    source,
    visited_at: new Date().toISOString(),
  };
  store
    .prepare(
      `INSERT INTO browser_visits (id, url, title, source, visited_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.url, row.title, row.source, row.visited_at);
  return row;
}

export function searchBrowserVisits(
  query: string,
  limit = 20,
): BrowserVisitRow[] {
  const store = openStore();
  const q = query.trim();
  if (!q) {
    return store
      .prepare(
        `SELECT id, url, title, source, visited_at
         FROM browser_visits
         ORDER BY visited_at DESC
         LIMIT ?`,
      )
      .all(limit) as BrowserVisitRow[];
  }
  const like = `%${q.replace(/[%_]/g, "")}%`;
  return store
    .prepare(
      `SELECT id, url, title, source, visited_at
       FROM browser_visits
       WHERE url LIKE ? OR title LIKE ?
       ORDER BY visited_at DESC
       LIMIT ?`,
    )
    .all(like, like, limit) as BrowserVisitRow[];
}

export function getStoreHealth(): {
  ok: boolean;
  path: string;
  sessions: number;
  utterances: number;
  browserVisits: number;
} {
  const store = openStore();
  const sessions = (
    store.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }
  ).c;
  const utterances = (
    store.prepare(`SELECT COUNT(*) AS c FROM utterances`).get() as { c: number }
  ).c;
  const browserVisits = (
    store.prepare(`SELECT COUNT(*) AS c FROM browser_visits`).get() as {
      c: number;
    }
  ).c;

  return {
    ok: true,
    path: resolveDatabasePath(),
    sessions,
    utterances,
    browserVisits,
  };
}

export function closeStore(): void {
  if (!db) return;
  db.close();
  db = null;
}
