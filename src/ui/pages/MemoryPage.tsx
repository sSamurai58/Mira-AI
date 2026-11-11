import { useEffect, useState, type FormEvent } from "react";
import { StubBadge } from "../components/StubBadge";

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

type MemoryPageProps = {
  onOpenSession: (sessionId: string) => void;
};

export function MemoryPage({ onOpenSession }: MemoryPageProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemoryHit[]>([]);
  const [note, setNote] = useState("Загрузка…");

  async function refreshSessions() {
    if (!window.mira) {
      setNote(
        "Нужен Electron для SQLite. В браузере память недоступна через IPC.",
      );
      setSessions([]);
      return;
    }
    const rows = await window.mira.listSessions();
    setSessions(rows);
    setNote(
      rows.length
        ? "Сессии из SQLite. Откройте чат или найдите «о чём говорили»."
        : "Сессий пока нет.",
    );
  }

  useEffect(() => {
    void refreshSessions();
  }, []);

  async function openSession(id: string) {
    if (!window.mira) return;
    setActiveId(id);
    const pack = await window.mira.getSession(id);
    setUtterances(pack?.utterances ?? []);
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!window.mira) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const found = await window.mira.searchMemory(q);
    setHits(found);
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="row">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Память</h2>
          <StubBadge label="P1" />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>

        <form className="composer" onSubmit={(e) => void handleSearch(e)}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по истории…"
          />
          <button type="submit" className="btn btn-primary">
            Найти
          </button>
        </form>

        {hits.length > 0 ? (
          <div className="stack">
            <strong>Результаты поиска</strong>
            {hits.map((h) => (
              <button
                key={h.utterance_id}
                type="button"
                className="panel memory-hit"
                onClick={() => {
                  void openSession(h.session_id);
                  onOpenSession(h.session_id);
                }}
              >
                <div className="row">
                  <strong>{h.session_title}</strong>
                  <span className="muted mono">{h.created_at}</span>
                </div>
                <div className="muted">
                  ({h.role}) {h.content.slice(0, 220)}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="memory-split">
        <div className="panel stack">
          <strong>Сессии</strong>
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`btn ${activeId === s.id ? "btn-primary" : ""}`}
              style={{ textAlign: "left" }}
              onClick={() => void openSession(s.id)}
            >
              <div>{s.title}</div>
              <div className="mono muted" style={{ fontSize: "0.75rem" }}>
                {s.updated_at}
              </div>
            </button>
          ))}
        </div>

        <div className="panel stack">
          <div className="row">
            <strong>Содержимое</strong>
            {activeId ? (
              <button
                type="button"
                className="btn"
                onClick={() => onOpenSession(activeId)}
              >
                Открыть в Диалоге
              </button>
            ) : null}
          </div>
          {utterances.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Выберите сессию слева.
            </p>
          ) : (
            utterances
              .filter((u) => u.role !== "system")
              .map((u) => (
                <div key={u.id} className={`bubble ${u.role}`}>
                  {u.content}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
