import { openStore } from "../store";

export type NoteRow = {
  id: string;
  title: string;
  body: string;
  tags: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
};

export function looksLikeNotesIntent(text: string): boolean {
  return /(заметк|note|запиши в замет|найди замет)/i.test(text);
}

export function listNotes(limit = 50): NoteRow[] {
  return openStore()
    .prepare(
      `SELECT id, title, body, tags, session_id, created_at, updated_at
       FROM notes ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as NoteRow[];
}

export function searchNotes(query: string, limit = 20): NoteRow[] {
  const q = `%${query.trim()}%`;
  return openStore()
    .prepare(
      `SELECT id, title, body, tags, session_id, created_at, updated_at
       FROM notes
       WHERE title LIKE ? OR body LIKE ? OR IFNULL(tags,'') LIKE ?
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(q, q, q, limit) as NoteRow[];
}

export function upsertNote(input: {
  id?: string;
  title: string;
  body: string;
  tags?: string;
  sessionId?: string | null;
}): NoteRow {
  const now = new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();
  const store = openStore();
  const existing = store
    .prepare(`SELECT id FROM notes WHERE id = ?`)
    .get(id) as { id: string } | undefined;
  if (existing) {
    store
      .prepare(
        `UPDATE notes SET title = ?, body = ?, tags = ?, session_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.title.trim(),
        input.body,
        input.tags ?? null,
        input.sessionId ?? null,
        now,
        id,
      );
  } else {
    store
      .prepare(
        `INSERT INTO notes (id, title, body, tags, session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.title.trim() || "Заметка",
        input.body,
        input.tags ?? null,
        input.sessionId ?? null,
        now,
        now,
      );
  }
  return store
    .prepare(
      `SELECT id, title, body, tags, session_id, created_at, updated_at FROM notes WHERE id = ?`,
    )
    .get(id) as NoteRow;
}

export function handleNotesFromChat(text: string): {
  used: string;
  block: string;
} {
  const create = text.match(
    /(?:заметк[ауе]|note)[:\s]+(.+)/i,
  );
  if (/найди|поиск|search/i.test(text)) {
    const q = text
      .replace(/найди|поиск|search|заметк\w*/gi, " ")
      .trim();
    const hits = searchNotes(q || "", 8);
    return {
      used: `notes:search:${hits.length}`,
      block: `[Заметки]\n${hits.map((n) => `• ${n.title}: ${n.body.slice(0, 120)}`).join("\n") || "(пусто)"}`,
    };
  }
  const body = create?.[1]?.trim() || text.replace(/запиши в заметк\w*/i, "").trim();
  const note = upsertNote({
    title: body.slice(0, 48) || "Заметка",
    body: body || text,
  });
  return {
    used: `notes:create:${note.id}`,
    block: `[Заметки] Сохранено «${note.title}» (${note.id.slice(0, 8)}…)`,
  };
}
