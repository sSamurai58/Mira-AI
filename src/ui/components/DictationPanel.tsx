import { useEffect, useState } from "react";
import {
  exportSessionPlain,
  getActiveBody,
  getDictationSession,
  newDictationSession,
  saveDictationVersion,
  subscribeDictation,
  type DictationSession,
} from "../voice/dictationSession";
import {
  clearActionJournal,
  getActionJournal,
  subscribeActionJournal,
  type JournalEntry,
} from "../voice/actionJournal";
import {
  continueReading,
  readFirst,
  readFromParagraph,
  repeatReading,
  stopReading,
} from "../voice/readController";
import { StubBadge } from "./StubBadge";

function storedVoiceId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem("mira.activeVoiceId");
}

export function DictationPanel() {
  const [session, setSession] = useState<DictationSession>(() =>
    getDictationSession(),
  );
  const [journal, setJournal] = useState<JournalEntry[]>(() =>
    getActionJournal(),
  );
  const [note, setNote] = useState("");
  const [fromPara, setFromPara] = useState(1);

  useEffect(() => {
    const u1 = subscribeDictation(() => setSession(getDictationSession()));
    const u2 = subscribeActionJournal(() => setJournal(getActionJournal()));
    return () => {
      u1();
      u2();
    };
  }, []);

  const readHandlers = {
    voiceId: storedVoiceId(),
    onStatus: (msg: string) => setNote(msg),
  };

  function onExport() {
    const { bodyTxt, metaTxt } = exportSessionPlain();
    const blob = new Blob(
      [`# meta\n${metaTxt}\n\n# body\n${bodyTxt}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mira-${session.sessionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setNote("Экспорт: текстовый файл + метаданные");
  }

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Диктовка и версии</h2>
        <StubBadge label="voice-pipeline" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Исходник после STT не затирается правками. Версии — отдельные снимки.
        Сессия <span className="mono">{session.sessionId}</span>, версия{" "}
        <strong>{session.currentVersion}</strong>
        {session.lockedSource ? " · исходник зафиксирован" : ""}.
      </p>

      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            newDictationSession();
            setNote("Новая сессия");
          }}
        >
          Новая сессия
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const { statusPhrase } = saveDictationVersion("manual_save");
            setNote(statusPhrase);
          }}
        >
          Сохранить версию
        </button>
        <button type="button" className="btn" onClick={onExport}>
          Экспорт .txt
        </button>
      </div>

      <label className="stack">
        <span className="muted">Исходная диктовка (только чтение после фиксации)</span>
        <textarea
          readOnly
          value={session.sourceDictation}
          rows={4}
          style={{ fontFamily: "ui-monospace, monospace" }}
        />
      </label>
      <label className="stack">
        <span className="muted">Текущий текст / очищенный</span>
        <textarea
          readOnly
          value={getActiveBody()}
          rows={6}
          style={{ fontFamily: "ui-monospace, monospace" }}
        />
      </label>

      {session.versions.length ? (
        <div className="stack" style={{ gap: 6 }}>
          <span className="muted">Версии</span>
          {session.versions.map((v) => (
            <div key={v.number} className="panel" style={{ padding: "0.5rem 0.75rem" }}>
              <strong>v{v.number}</strong>
              <span className="muted"> · {v.operation} · {v.createdAt.slice(0, 19)}</span>
              <div className="mono muted" style={{ fontSize: "0.85rem" }}>
                {v.body.slice(0, 120)}
                {v.body.length > 120 ? "…" : ""}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="stack">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Чтение</h3>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setNote(readFirst(readHandlers))}
          >
            С начала
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setNote(continueReading(readHandlers))}
          >
            Продолжить
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setNote(repeatReading(readHandlers))}
          >
            Повтор
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setNote(stopReading())}
          >
            Стоп
          </button>
          <label className="row" style={{ gap: 6 }}>
            <span className="muted">Абзац</span>
            <input
              type="number"
              min={1}
              value={fromPara}
              onChange={(e) => setFromPara(Number(e.target.value) || 1)}
              style={{ width: 64 }}
            />
            <button
              type="button"
              className="btn"
              onClick={() =>
                setNote(readFromParagraph(fromPara, readHandlers))
              }
            >
              Читать
            </button>
          </label>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Позиция: абзац {session.readPosition.paragraph + 1}, статус{" "}
          {session.readPosition.status}
        </p>
      </div>

      <div className="stack">
        <div className="row">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Журнал действий</h3>
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearActionJournal();
              setNote("Журнал очищен");
            }}
          >
            Очистить
          </button>
        </div>
        {journal.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Пока пусто — говорите в Диалоге или сохраняйте версии.
          </p>
        ) : (
          <ul
            className="stack"
            style={{ listStyle: "none", padding: 0, margin: 0, gap: 4 }}
          >
            {journal.slice(0, 24).map((e) => (
              <li key={e.id} className="mono" style={{ fontSize: "0.8rem" }}>
                <span className="muted">{e.at.slice(11, 19)}</span> [{e.type}]{" "}
                {e.tool} · {e.result}
                {e.transcript ? ` · «${e.transcript.slice(0, 60)}»` : ""}
                {e.detail ? ` · ${e.detail}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {note ? (
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
