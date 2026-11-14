import { useEffect, useMemo, useState, type FormEvent } from "react";
import { StubBadge } from "../components/StubBadge";
import { formatChatDateLabel, formatChatTime } from "../chat/timeLabels";
import {
  displayLearnedContent,
  learnedKindLabel,
} from "../library/learnedLabels";

type Session = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type Utterance = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type MemoryHit = {
  utterance_id: string;
  session_id: string;
  session_title: string;
  role: string;
  content: string;
  created_at: string;
};

type NoteRow = {
  id: string;
  title: string;
  body: string;
  tags: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
};

type MemorySegment = "talks" | "notes" | "learned";

type MemoryPageProps = {
  onOpenSession: (sessionId: string) => void;
};

function formatWhen(iso: string): string {
  const date = formatChatDateLabel(iso);
  const time = formatChatTime(iso);
  return time ? `${date} · ${time}` : date;
}

function roleLabel(role: string): string {
  if (role === "user") return "Вы";
  if (role === "assistant") return "Mira";
  return role;
}

export function MemoryPage({ onOpenSession }: MemoryPageProps) {
  const [segment, setSegment] = useState<MemorySegment>("talks");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemoryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [learned, setLearned] = useState<MiraLearnedUnit[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [status, setStatus] = useState("Загрузка…");
  const [busy, setBusy] = useState(false);

  async function refreshAll() {
    if (!window.mira) {
      setStatus(
        "Нужен Electron для SQLite. В браузере память недоступна через IPC.",
      );
      setSessions([]);
      setNotes([]);
      setLearned([]);
      return;
    }
    const [rows, units, noteRows] = await Promise.all([
      window.mira.listSessions(),
      window.mira.listLearnedUnits(),
      window.mira.listNotes?.(80) ?? Promise.resolve([]),
    ]);
    setSessions(rows);
    setLearned(units);
    setNotes(noteRows);
    setStatus(
      rows.length || noteRows.length || units.length
        ? "Поиск по прошлым разговорам, заметкам и выдержкам из библиотеки."
        : "Память пуста — начните диалог или добавьте заметку.",
    );
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function openSession(id: string) {
    if (!window.mira) return;
    setActiveId(id);
    setSegment("talks");
    const pack = await window.mira.getSession(id);
    setUtterances(pack?.utterances ?? []);
  }

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    if (!window.mira) return;
    const q = query.trim();
    setSearching(true);
    try {
      if (segment === "talks") {
        if (!q) {
          setHits([]);
          return;
        }
        const found = await window.mira.searchMemory(q);
        setHits(found);
      } else if (segment === "notes") {
        const rows = q
          ? await (window.mira.searchNotes?.(q) ?? window.mira.listNotes?.(80))
          : await (window.mira.listNotes?.(80) ?? Promise.resolve([]));
        setNotes(rows ?? []);
      } else {
        const units = await window.mira.searchLearnedUnits(q);
        setLearned(units);
      }
    } finally {
      setSearching(false);
    }
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    if (!window.mira?.upsertNote) return;
    const body = noteDraft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await window.mira.upsertNote({
        id: editingNoteId ?? undefined,
        title: (noteTitle.trim() || body).slice(0, 72),
        body,
      });
      setNoteDraft("");
      setNoteTitle("");
      setEditingNoteId(null);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  function startEditNote(n: NoteRow) {
    setEditingNoteId(n.id);
    setNoteTitle(n.title);
    setNoteDraft(n.body);
    setSegment("notes");
  }

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || segment !== "talks" || hits.length > 0) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, query, segment, hits.length]);

  const visibleNotes = useMemo(() => {
    if (segment !== "notes") return notes;
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        (n.tags ?? "").toLowerCase().includes(q),
    );
  }, [notes, query, segment]);

  const visibleLearned = useMemo(() => {
    if (segment !== "learned") return learned;
    const q = query.trim().toLowerCase();
    if (!q) return learned;
    return learned.filter(
      (u) =>
        u.content.toLowerCase().includes(q) ||
        u.kind.toLowerCase().includes(q) ||
        (u.source_ref ?? "").toLowerCase().includes(q),
    );
  }, [learned, query, segment]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const previewUtterances = utterances.filter((u) => u.role !== "system");

  const searchPlaceholder =
    segment === "talks"
      ? "Поиск по истории разговоров…"
      : segment === "notes"
        ? "Поиск по заметкам…"
        : "Поиск по выдержкам…";

  return (
    <div className="stack paths-panel memory-hub">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Память</h2>
            <span className="muted">
              {sessions.length + notes.length + learned.length} сущностей
            </span>
            <StubBadge label="P1" />
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {status}
          </p>
        </div>
      </div>

      <div className="settings-stat-row memory-hub-stats" aria-label="Сводка">
        <button
          type="button"
          className={`settings-stat-chip memory-stat ${segment === "talks" ? "is-active" : ""}`}
          onClick={() => setSegment("talks")}
        >
          Разговоры <strong>{sessions.length}</strong>
        </button>
        <button
          type="button"
          className={`settings-stat-chip memory-stat ${segment === "notes" ? "is-active" : ""}`}
          onClick={() => setSegment("notes")}
        >
          Заметки <strong>{notes.length}</strong>
        </button>
        <button
          type="button"
          className={`settings-stat-chip memory-stat ${segment === "learned" ? "is-active" : ""}`}
          onClick={() => setSegment("learned")}
        >
          Выдержки <strong>{learned.length}</strong>
        </button>
      </div>

      <div className="row paths-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <form
          className="paths-search memory-search"
          onSubmit={(e) => void runSearch(e)}
        >
          <label className="paths-search" style={{ display: "block", width: "100%" }}>
            <span className="sr-only">Поиск</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={searching || !window.mira}
          >
            {searching ? "…" : "Найти"}
          </button>
        </form>
        <div className="paths-filters" role="tablist" aria-label="Раздел памяти">
          {(
            [
              ["talks", "Разговоры", sessions.length],
              ["notes", "Заметки", notes.length],
              ["learned", "Выученное", learned.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={segment === id}
              className={`paths-filter-btn ${segment === id ? "is-active" : ""}`}
              onClick={() => setSegment(id)}
            >
              {label} {count}
            </button>
          ))}
        </div>
      </div>

      {segment === "talks" ? (
        <div className="stack memory-talks">
          {hits.length > 0 ? (
            <section className="stack memory-hits" aria-label="Результаты поиска">
              <div className="row memory-section-head">
                <strong>Найдено в истории</strong>
                <span className="muted">{hits.length}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setHits([]);
                    setQuery("");
                  }}
                >
                  Сбросить
                </button>
              </div>
              <div className="paths-grid memory-hits-grid">
                {hits.map((h) => (
                  <button
                    key={h.utterance_id}
                    type="button"
                    className="paths-card panel memory-hit memory-hit-card"
                    onClick={() => {
                      void openSession(h.session_id);
                      onOpenSession(h.session_id);
                    }}
                  >
                    <div className="paths-card-head">
                      <span className="memory-tile memory-tile--talk" aria-hidden>
                        ⌕
                      </span>
                      <div className="paths-card-title">
                        <div className="paths-card-title-row">
                          <span className="paths-card-name">{h.session_title}</span>
                        </div>
                        <span className="paths-card-kind">
                          {roleLabel(h.role)} · {formatWhen(h.created_at)}
                        </span>
                      </div>
                    </div>
                    <p className="memory-card-snippet">
                      {h.content.slice(0, 220)}
                      {h.content.length > 220 ? "…" : ""}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="memory-split">
            <div className="panel stack memory-sessions-panel">
              <div className="row memory-section-head">
                <strong>Сессии</strong>
                <span className="muted">{filteredSessions.length}</span>
              </div>
              {filteredSessions.length === 0 ? (
                <div className="memory-empty">
                  <p className="muted" style={{ margin: 0 }}>
                    Сессий пока нет. Напишите Mira в Диалоге — разговор появится
                    здесь.
                  </p>
                </div>
              ) : (
                <div className="memory-session-list">
                  {filteredSessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`list-item memory-session-item ${activeId === s.id ? "is-selected" : ""}`}
                      onClick={() => void openSession(s.id)}
                    >
                      <span className="memory-session-title">{s.title}</span>
                      <span className="mono muted memory-session-meta">
                        {formatWhen(s.updated_at)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="panel stack memory-preview-panel">
              <div className="row memory-section-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>Содержимое</strong>
                  {activeSession ? (
                    <div className="muted memory-preview-sub">
                      {activeSession.title}
                    </div>
                  ) : null}
                </div>
                {activeId ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onOpenSession(activeId)}
                  >
                    Открыть в Диалоге
                  </button>
                ) : null}
              </div>
              {previewUtterances.length === 0 ? (
                <div className="memory-empty memory-empty--preview">
                  <span className="memory-empty-glyph" aria-hidden>
                    ◇
                  </span>
                  <p className="muted" style={{ margin: 0 }}>
                    Выберите сессию слева, чтобы просмотреть реплики.
                  </p>
                </div>
              ) : (
                <div className="memory-preview-scroll">
                  {previewUtterances.map((u) => (
                    <div key={u.id} className={`bubble ${u.role}`}>
                      <div className="memory-bubble-meta muted mono">
                        {roleLabel(u.role)} · {formatChatTime(u.created_at)}
                      </div>
                      {u.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {segment === "notes" ? (
        <div className="stack memory-notes">
          <form className="panel stack memory-note-composer" onSubmit={(e) => void saveNote(e)}>
            <div className="row memory-section-head">
              <strong>{editingNoteId ? "Редактирование" : "Новая заметка"}</strong>
              <span className="chip">F6</span>
              {editingNoteId ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setEditingNoteId(null);
                    setNoteTitle("");
                    setNoteDraft("");
                  }}
                >
                  Отмена
                </button>
              ) : null}
            </div>
            <input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Заголовок (необязательно)"
              aria-label="Заголовок заметки"
            />
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Текст заметки…"
              rows={3}
              aria-label="Текст заметки"
            />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !noteDraft.trim()}
              >
                {editingNoteId ? "Обновить" : "Сохранить"}
              </button>
            </div>
          </form>

          {visibleNotes.length === 0 ? (
            <div className="memory-empty panel">
              <p className="muted" style={{ margin: 0 }}>
                Заметок пока нет. Напишите мысль выше — она останется в локальной
                SQLite.
              </p>
            </div>
          ) : (
            <div className="paths-grid">
              {visibleNotes.map((n) => (
                <article key={n.id} className="paths-card panel memory-note-card">
                  <div className="paths-card-head">
                    <span className="memory-tile memory-tile--note" aria-hidden>
                      ✎
                    </span>
                    <div className="paths-card-title">
                      <div className="paths-card-title-row">
                        <span className="paths-card-name">{n.title}</span>
                      </div>
                      <span className="paths-card-kind">
                        {formatWhen(n.updated_at)}
                      </span>
                    </div>
                  </div>
                  <p className="memory-card-snippet">
                    {n.body.slice(0, 220)}
                    {n.body.length > 220 ? "…" : ""}
                  </p>
                  {n.tags ? (
                    <div className="paths-card-tags">
                      {n.tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .slice(0, 4)
                        .map((t) => (
                          <span key={t} className="chip">
                            {t}
                          </span>
                        ))}
                    </div>
                  ) : null}
                  <div className="paths-card-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => startEditNote(n)}
                    >
                      Изменить
                    </button>
                    {n.session_id ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          void openSession(n.session_id!);
                          onOpenSession(n.session_id!);
                        }}
                      >
                        К сессии
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {segment === "learned" ? (
        <div className="stack memory-learned">
          <p className="muted memory-learned-hint" style={{ margin: 0 }}>
            Тезисы и фразы из библиотеки — не skills. Skills создаются в
            Мастерская → Библиотека → «Предложить skill».
          </p>
          {visibleLearned.length === 0 ? (
            <div className="memory-empty panel">
              <p className="muted" style={{ margin: 0 }}>
                Пока нет единиц. Загрузите материал в Мастерская → Библиотека и
                разберите его.
              </p>
            </div>
          ) : (
            <div className="paths-grid">
              {visibleLearned.map((u) => (
                <article
                  key={u.id}
                  className="paths-card panel learned-unit-card memory-learned-card"
                >
                  <div className="paths-card-head">
                    <span className="memory-tile memory-tile--learned" aria-hidden>
                      ※
                    </span>
                    <div className="paths-card-title">
                      <div className="paths-card-title-row">
                        <span className="paths-card-name">
                          {learnedKindLabel(u.kind)}
                        </span>
                      </div>
                      <span className="paths-card-kind mono">
                        {u.source_ref || "без источника"}
                      </span>
                    </div>
                  </div>
                  <div className="learned-unit-body memory-card-snippet">
                    {displayLearnedContent(u.content)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
