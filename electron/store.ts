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

  const now = new Date().toISOString();
  const row: SessionRow = {
    id: crypto.randomUUID(),
    title: "Первый диалог",
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

export function getStoreHealth(): {
  ok: boolean;
  path: string;
  sessions: number;
  utterances: number;
} {
  const store = openStore();
  const sessions = (
    store.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }
  ).c;
  const utterances = (
    store.prepare(`SELECT COUNT(*) AS c FROM utterances`).get() as { c: number }
  ).c;

  return {
    ok: true,
    path: resolveDatabasePath(),
    sessions,
    utterances,
  };
}

export function closeStore(): void {
  if (!db) return;
  db.close();
  db = null;
}
