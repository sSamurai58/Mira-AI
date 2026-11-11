import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getOwnerId } from "./owner";

export type SessionRow = {
  id: string;
  title: string;
  owner_id: string;
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

export type MessengerContactRow = {
  id: string;
  provider: string;
  display_name: string;
  handle: string;
  chat_id: string;
  enabled: number;
  created_at: string;
};

export type MessengerMessageRow = {
  id: string;
  provider: string;
  contact_id: string | null;
  chat_id: string;
  direction: "out" | "in";
  body: string;
  status: string;
  external_id: string | null;
  created_at: string;
};

export type LibraryItemRow = {
  id: string;
  title: string;
  kind: string;
  source_path: string;
  status: string;
  media_type: string;
  extracted_text: string | null;
  analysis_json: string | null;
  skill_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type LearnedUnitRow = {
  id: string;
  library_item_id: string;
  kind: string;
  title: string;
  content: string;
  source_ref: string;
  created_at: string;
};

export type LearnPlanRow = {
  id: string;
  library_item_id: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
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
      owner_id TEXT NOT NULL DEFAULT 'local',
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
    CREATE TABLE IF NOT EXISTS messenger_contacts (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      handle TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messenger_contacts_provider
      ON messenger_contacts(provider, display_name);
    CREATE TABLE IF NOT EXISTS messenger_messages (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      contact_id TEXT,
      chat_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      external_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messenger_messages_created
      ON messenger_messages(created_at DESC);
    CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      source_path TEXT NOT NULL,
      status TEXT NOT NULL,
      media_type TEXT NOT NULL,
      extracted_text TEXT,
      analysis_json TEXT,
      skill_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_library_items_updated
      ON library_items(updated_at DESC);
    CREATE TABLE IF NOT EXISTS learned_units (
      id TEXT PRIMARY KEY,
      library_item_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (library_item_id) REFERENCES library_items(id)
    );
    CREATE INDEX IF NOT EXISTS idx_learned_units_item
      ON learned_units(library_item_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS learn_plans (
      id TEXT PRIMARY KEY,
      library_item_id TEXT NOT NULL UNIQUE,
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (library_item_id) REFERENCES library_items(id)
    );
  `);

  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'local'`);
  } catch {
    // column already exists
  }
  ensureMessengerSeeds(db);
  return db;
}

function ensureMessengerSeeds(store: DatabaseSync): void {
  const count = (
    store.prepare(`SELECT COUNT(*) AS c FROM messenger_contacts`).get() as {
      c: number;
    }
  ).c;
  if (count > 0) return;

  const now = new Date().toISOString();
  const seeds = [
    {
      id: "tg-ivan",
      provider: "telegram",
      display_name: "Иван",
      handle: "@ivan_demo",
      chat_id: process.env.TELEGRAM_DEFAULT_CHAT_ID?.trim() || "100001",
    },
    {
      id: "tg-anna",
      provider: "telegram",
      display_name: "Анна",
      handle: "@anna_demo",
      chat_id: "100002",
    },
    {
      id: "wa-stub",
      provider: "whatsapp",
      display_name: "WA Demo",
      handle: "+10000000000",
      chat_id: "wa-stub",
    },
    {
      id: "ig-stub",
      provider: "instagram",
      display_name: "IG Demo",
      handle: "@ig_demo",
      chat_id: "ig-stub",
    },
  ];
  const insert = store.prepare(
    `INSERT INTO messenger_contacts
      (id, provider, display_name, handle, chat_id, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  );
  for (const s of seeds) {
    insert.run(
      s.id,
      s.provider,
      s.display_name,
      s.handle,
      s.chat_id,
      now,
    );
  }
}

export function listSessions(limit = 50): SessionRow[] {
  const store = openStore();
  const owner = getOwnerId();
  return store
    .prepare(
      `SELECT id, title, owner_id, created_at, updated_at
       FROM sessions
       WHERE owner_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(owner, limit) as SessionRow[];
}

export function getSession(id: string): SessionRow | null {
  const store = openStore();
  const owner = getOwnerId();
  const row = store
    .prepare(
      `SELECT id, title, owner_id, created_at, updated_at
       FROM sessions WHERE id = ? AND owner_id = ?`,
    )
    .get(id, owner) as SessionRow | undefined;
  return row ?? null;
}

export function createSession(title = "Новый диалог"): SessionRow {
  const store = openStore();
  const now = new Date().toISOString();
  const row: SessionRow = {
    id: crypto.randomUUID(),
    title,
    owner_id: getOwnerId(),
    created_at: now,
    updated_at: now,
  };
  store
    .prepare(
      `INSERT INTO sessions (id, title, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.title, row.owner_id, row.created_at, row.updated_at);
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
  const owner = getOwnerId();
  const existing = store
    .prepare(
      `SELECT id, title, owner_id, created_at, updated_at
       FROM sessions
       WHERE owner_id = ?
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get(owner) as SessionRow | undefined;

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

  const owner = getOwnerId();
  if (opts?.excludeSessionId) {
    return store
      .prepare(
        `SELECT u.id AS utterance_id, u.session_id, s.title AS session_title,
                u.role, u.content, u.created_at
         FROM utterances u
         JOIN sessions s ON s.id = u.session_id
         WHERE s.owner_id = ? AND u.content LIKE ? AND u.session_id != ?
         ORDER BY u.created_at DESC
         LIMIT ?`,
      )
      .all(owner, like, opts.excludeSessionId, limit) as MemoryHit[];
  }

  return store
    .prepare(
      `SELECT u.id AS utterance_id, u.session_id, s.title AS session_title,
              u.role, u.content, u.created_at
       FROM utterances u
       JOIN sessions s ON s.id = u.session_id
       WHERE s.owner_id = ? AND u.content LIKE ?
       ORDER BY u.created_at DESC
       LIMIT ?`,
    )
    .all(owner, like, limit) as MemoryHit[];
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

export function listMessengerContacts(
  provider?: string,
): MessengerContactRow[] {
  const store = openStore();
  if (provider) {
    return store
      .prepare(
        `SELECT id, provider, display_name, handle, chat_id, enabled, created_at
         FROM messenger_contacts
         WHERE provider = ? AND enabled = 1
         ORDER BY display_name ASC`,
      )
      .all(provider) as MessengerContactRow[];
  }
  return store
    .prepare(
      `SELECT id, provider, display_name, handle, chat_id, enabled, created_at
       FROM messenger_contacts
       WHERE enabled = 1
       ORDER BY provider ASC, display_name ASC`,
    )
    .all() as MessengerContactRow[];
}

function normalizePersonToken(raw: string): string {
  const q = raw.trim().toLowerCase().replace(/^@/, "").replace(/[.,!?:;]+$/g, "");
  // Rough RU case fold for demo contacts (Ивану/Ивана → иван).
  const stemmed = q.replace(/(у|ю|а|я|е|ой|ою|ом|ем|ы|и)$/u, "");
  return stemmed.length >= 2 ? stemmed : q;
}

export function findMessengerContact(
  provider: string,
  query: string,
): MessengerContactRow | null {
  const store = openStore();
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const stem = normalizePersonToken(query);
  if (!q) return null;
  const rows = store
    .prepare(
      `SELECT id, provider, display_name, handle, chat_id, enabled, created_at
       FROM messenger_contacts
       WHERE provider = ? AND enabled = 1`,
    )
    .all(provider) as MessengerContactRow[];
  return (
    rows.find(
      (r) =>
        r.display_name.toLowerCase() === q ||
        r.handle.toLowerCase().replace(/^@/, "") === q ||
        r.chat_id === q,
    ) ??
    rows.find((r) => {
      const nameStem = normalizePersonToken(r.display_name);
      const handleStem = normalizePersonToken(r.handle);
      return nameStem === stem || handleStem === stem;
    }) ??
    rows.find(
      (r) =>
        r.display_name.toLowerCase().includes(stem) ||
        r.handle.toLowerCase().includes(stem) ||
        stem.includes(normalizePersonToken(r.display_name)),
    ) ??
    null
  );
}

export function upsertMessengerContact(input: {
  id?: string;
  provider: string;
  displayName: string;
  handle: string;
  chatId: string;
  enabled?: boolean;
}): MessengerContactRow {
  const store = openStore();
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const existing = store
    .prepare(`SELECT id FROM messenger_contacts WHERE id = ?`)
    .get(id) as { id: string } | undefined;
  if (existing) {
    store
      .prepare(
        `UPDATE messenger_contacts
         SET provider = ?, display_name = ?, handle = ?, chat_id = ?, enabled = ?
         WHERE id = ?`,
      )
      .run(
        input.provider,
        input.displayName,
        input.handle,
        input.chatId,
        input.enabled === false ? 0 : 1,
        id,
      );
  } else {
    store
      .prepare(
        `INSERT INTO messenger_contacts
          (id, provider, display_name, handle, chat_id, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.provider,
        input.displayName,
        input.handle,
        input.chatId,
        input.enabled === false ? 0 : 1,
        now,
      );
  }
  return store
    .prepare(
      `SELECT id, provider, display_name, handle, chat_id, enabled, created_at
       FROM messenger_contacts WHERE id = ?`,
    )
    .get(id) as MessengerContactRow;
}

export function addMessengerMessage(input: {
  provider: string;
  contactId?: string | null;
  chatId: string;
  direction: "out" | "in";
  body: string;
  status: string;
  externalId?: string | null;
}): MessengerMessageRow {
  const store = openStore();
  const row: MessengerMessageRow = {
    id: crypto.randomUUID(),
    provider: input.provider,
    contact_id: input.contactId ?? null,
    chat_id: input.chatId,
    direction: input.direction,
    body: input.body,
    status: input.status,
    external_id: input.externalId ?? null,
    created_at: new Date().toISOString(),
  };
  store
    .prepare(
      `INSERT INTO messenger_messages
        (id, provider, contact_id, chat_id, direction, body, status, external_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.provider,
      row.contact_id,
      row.chat_id,
      row.direction,
      row.body,
      row.status,
      row.external_id,
      row.created_at,
    );
  return row;
}

export function listMessengerMessages(limit = 20): MessengerMessageRow[] {
  const store = openStore();
  return store
    .prepare(
      `SELECT id, provider, contact_id, chat_id, direction, body, status, external_id, created_at
       FROM messenger_messages
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as MessengerMessageRow[];
}

const LIBRARY_SELECT = `SELECT id, title, kind, source_path, status, media_type,
  extracted_text, analysis_json, skill_id, version, created_at, updated_at
  FROM library_items`;

export function listLibraryItems(limit = 100): LibraryItemRow[] {
  const store = openStore();
  return store
    .prepare(`${LIBRARY_SELECT} ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as LibraryItemRow[];
}

export function getLibraryItem(id: string): LibraryItemRow | null {
  const store = openStore();
  return (
    (store.prepare(`${LIBRARY_SELECT} WHERE id = ?`).get(id) as
      | LibraryItemRow
      | undefined) ?? null
  );
}

export function insertLibraryItem(input: {
  id?: string;
  title: string;
  kind: string;
  sourcePath: string;
  status?: string;
  mediaType: string;
  extractedText?: string | null;
}): LibraryItemRow {
  const store = openStore();
  const now = new Date().toISOString();
  const row: LibraryItemRow = {
    id: input.id ?? crypto.randomUUID(),
    title: input.title,
    kind: input.kind,
    source_path: input.sourcePath,
    status: input.status ?? "new",
    media_type: input.mediaType,
    extracted_text: input.extractedText ?? null,
    analysis_json: null,
    skill_id: null,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  store
    .prepare(
      `INSERT INTO library_items
        (id, title, kind, source_path, status, media_type, extracted_text,
         analysis_json, skill_id, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.title,
      row.kind,
      row.source_path,
      row.status,
      row.media_type,
      row.extracted_text,
      row.analysis_json,
      row.skill_id,
      row.version,
      row.created_at,
      row.updated_at,
    );
  return row;
}

export function updateLibraryItem(
  id: string,
  patch: Partial<{
    title: string;
    status: string;
    extractedText: string | null;
    analysisJson: string | null;
    skillId: string | null;
    version: number;
  }>,
): LibraryItemRow | null {
  const store = openStore();
  const current = getLibraryItem(id);
  if (!current) return null;
  const next: LibraryItemRow = {
    ...current,
    title: patch.title ?? current.title,
    status: patch.status ?? current.status,
    extracted_text:
      patch.extractedText !== undefined
        ? patch.extractedText
        : current.extracted_text,
    analysis_json:
      patch.analysisJson !== undefined
        ? patch.analysisJson
        : current.analysis_json,
    skill_id: patch.skillId !== undefined ? patch.skillId : current.skill_id,
    version: patch.version ?? current.version,
    updated_at: new Date().toISOString(),
  };
  store
    .prepare(
      `UPDATE library_items
       SET title = ?, status = ?, extracted_text = ?, analysis_json = ?,
           skill_id = ?, version = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.title,
      next.status,
      next.extracted_text,
      next.analysis_json,
      next.skill_id,
      next.version,
      next.updated_at,
      id,
    );
  return next;
}

export function deleteLearnedUnitsForItem(libraryItemId: string): void {
  const store = openStore();
  store
    .prepare(`DELETE FROM learned_units WHERE library_item_id = ?`)
    .run(libraryItemId);
}

export function addLearnedUnit(input: {
  libraryItemId: string;
  kind: string;
  title: string;
  content: string;
  sourceRef: string;
}): LearnedUnitRow {
  const store = openStore();
  const row: LearnedUnitRow = {
    id: crypto.randomUUID(),
    library_item_id: input.libraryItemId,
    kind: input.kind,
    title: input.title,
    content: input.content,
    source_ref: input.sourceRef,
    created_at: new Date().toISOString(),
  };
  store
    .prepare(
      `INSERT INTO learned_units
        (id, library_item_id, kind, title, content, source_ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.library_item_id,
      row.kind,
      row.title,
      row.content,
      row.source_ref,
      row.created_at,
    );
  return row;
}

export function listLearnedUnits(opts?: {
  libraryItemId?: string;
  limit?: number;
}): LearnedUnitRow[] {
  const store = openStore();
  const limit = opts?.limit ?? 50;
  if (opts?.libraryItemId) {
    return store
      .prepare(
        `SELECT id, library_item_id, kind, title, content, source_ref, created_at
         FROM learned_units
         WHERE library_item_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(opts.libraryItemId, limit) as LearnedUnitRow[];
  }
  return store
    .prepare(
      `SELECT id, library_item_id, kind, title, content, source_ref, created_at
       FROM learned_units
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as LearnedUnitRow[];
}

export function searchLearnedUnits(
  query: string,
  limit = 8,
): LearnedUnitRow[] {
  const q = query.trim();
  if (!q) return listLearnedUnits({ limit });
  const store = openStore();
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[%_]/g, "").replace(/[.,!?:;]+$/g, ""))
    .filter((t) => t.length >= 3)
    .slice(0, 6);
  if (!tokens.length) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    return store
      .prepare(
        `SELECT id, library_item_id, kind, title, content, source_ref, created_at
         FROM learned_units
         WHERE title LIKE ? OR content LIKE ? OR source_ref LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(like, like, like, limit) as LearnedUnitRow[];
  }

  const scored = new Map<string, LearnedUnitRow>();
  for (const token of tokens) {
    const like = `%${token}%`;
    const rows = store
      .prepare(
        `SELECT id, library_item_id, kind, title, content, source_ref, created_at
         FROM learned_units
         WHERE title LIKE ? OR content LIKE ? OR source_ref LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(like, like, like, limit) as LearnedUnitRow[];
    for (const row of rows) scored.set(row.id, row);
  }
  return [...scored.values()].slice(0, limit);
}

export function upsertLearnPlan(
  libraryItemId: string,
  steps: string[],
): LearnPlanRow {
  const store = openStore();
  const now = new Date().toISOString();
  const existing = store
    .prepare(`SELECT id FROM learn_plans WHERE library_item_id = ?`)
    .get(libraryItemId) as { id: string } | undefined;
  const stepsJson = JSON.stringify(steps);
  if (existing) {
    store
      .prepare(
        `UPDATE learn_plans SET steps_json = ?, updated_at = ? WHERE id = ?`,
      )
      .run(stepsJson, now, existing.id);
    return store
      .prepare(
        `SELECT id, library_item_id, steps_json, created_at, updated_at
         FROM learn_plans WHERE id = ?`,
      )
      .get(existing.id) as LearnPlanRow;
  }
  const row: LearnPlanRow = {
    id: crypto.randomUUID(),
    library_item_id: libraryItemId,
    steps_json: stepsJson,
    created_at: now,
    updated_at: now,
  };
  store
    .prepare(
      `INSERT INTO learn_plans (id, library_item_id, steps_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.library_item_id, row.steps_json, row.created_at, row.updated_at);
  return row;
}

export function getLearnPlan(libraryItemId: string): LearnPlanRow | null {
  const store = openStore();
  return (
    (store
      .prepare(
        `SELECT id, library_item_id, steps_json, created_at, updated_at
         FROM learn_plans WHERE library_item_id = ?`,
      )
      .get(libraryItemId) as LearnPlanRow | undefined) ?? null
  );
}

export function getStoreHealth(): {
  ok: boolean;
  path: string;
  sessions: number;
  utterances: number;
  browserVisits: number;
  messengerContacts: number;
  messengerMessages: number;
  libraryItems: number;
  learnedUnits: number;
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
  const messengerContacts = (
    store.prepare(`SELECT COUNT(*) AS c FROM messenger_contacts`).get() as {
      c: number;
    }
  ).c;
  const messengerMessages = (
    store.prepare(`SELECT COUNT(*) AS c FROM messenger_messages`).get() as {
      c: number;
    }
  ).c;
  const libraryItems = (
    store.prepare(`SELECT COUNT(*) AS c FROM library_items`).get() as {
      c: number;
    }
  ).c;
  const learnedUnits = (
    store.prepare(`SELECT COUNT(*) AS c FROM learned_units`).get() as {
      c: number;
    }
  ).c;

  return {
    ok: true,
    path: resolveDatabasePath(),
    sessions,
    utterances,
    browserVisits,
    messengerContacts,
    messengerMessages,
    libraryItems,
    learnedUnits,
  };
}

export function closeStore(): void {
  if (!db) return;
  db.close();
  db = null;
}
