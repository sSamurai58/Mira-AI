import { useEffect, useState } from "react";
import { StubBadge } from "../components/StubBadge";

type Session = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export function MemoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [note, setNote] = useState("Загрузка сессий…");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!window.mira) {
        if (!cancelled) {
          setNote(
            "Запуск в браузере (vite): IPC к SQLite недоступен. Откройте через Electron (`npm run dev:electron`) или проверьте `npm run db:check`.",
          );
          setSessions([]);
        }
        return;
      }

      try {
        const rows = await window.mira.listSessions();
        if (!cancelled) {
          setSessions(rows);
          setNote(
            rows.length
              ? "Сессии из SQLite (поиск по истории — P1)."
              : "Сессий пока нет.",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setNote(
            err instanceof Error ? err.message : "Не удалось прочитать сессии",
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="row">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Память</h2>
          <StubBadge label="P1 search" />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>
        <div className="stack">
          {sessions.map((s) => (
            <div key={s.id} className="panel" style={{ padding: 14 }}>
              <strong>{s.title}</strong>
              <div className="mono muted">{s.id}</div>
              <div className="muted">обновлено {s.updated_at}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
