import { useCallback, useEffect, useState } from "react";
import { StubBadge } from "./StubBadge";

type Note = {
  id: string;
  title: string;
  body: string;
  tags: string | null;
  updated_at: string;
};

export function NotesFilesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [fileQuery, setFileQuery] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refreshNotes = useCallback(async () => {
    if (!window.mira?.listNotes) return;
    const rows = await window.mira.listNotes(40);
    setNotes(rows);
  }, []);

  const refreshFiles = useCallback(async (q: string) => {
    if (!window.mira?.searchFiles) return;
    const hits = await window.mira.searchFiles(q);
    setFiles(hits);
  }, []);

  useEffect(() => {
    void refreshNotes();
    void refreshFiles("");
  }, [refreshNotes, refreshFiles]);

  async function saveNote() {
    if (!window.mira?.upsertNote) return;
    const saved = await window.mira.upsertNote({
      id: editId ?? undefined,
      title: title.trim() || "Заметка",
      body,
    });
    setEditId(saved.id);
    setTitle(saved.title);
    setBody(saved.body);
    setNote(`Сохранено «${saved.title}»`);
    await refreshNotes();
  }

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Заметки и файлы</h2>
        <StubBadge label="F2/F5" />
      </div>

      <div className="stack">
        <label className="stack">
          <span className="muted">Заголовок</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название заметки"
          />
        </label>
        <label className="stack">
          <span className="muted">Markdown / текст</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="# Заметка&#10;&#10;Текст…"
            style={{ fontFamily: "ui-monospace, monospace", minHeight: 140 }}
          />
        </label>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => void saveNote()}>
            Сохранить
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEditId(null);
              setTitle("");
              setBody("");
            }}
          >
            Новая
          </button>
        </div>
        {note ? <p className="muted" style={{ margin: 0 }}>{note}</p> : null}
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 6 }}>
          {notes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="btn"
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => {
                  setEditId(n.id);
                  setTitle(n.title);
                  setBody(n.body);
                }}
              >
                <strong>{n.title}</strong>
                <span className="muted"> · {n.updated_at.slice(0, 16)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="stack">
        <label className="stack">
          <span className="muted">Поиск файлов (workspace / data / seed)</span>
          <div className="row">
            <input
              value={fileQuery}
              onChange={(e) => setFileQuery(e.target.value)}
              placeholder="часть имени"
            />
            <button
              type="button"
              className="btn"
              onClick={() => void refreshFiles(fileQuery)}
            >
              Найти
            </button>
          </div>
        </label>
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 4 }}>
          {files.slice(0, 24).map((f) => (
            <li key={f} className="muted" style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>
              {f}
            </li>
          ))}
          {!files.length ? <li className="muted">Нет совпадений</li> : null}
        </ul>
      </div>
    </div>
  );
}
