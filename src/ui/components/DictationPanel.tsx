import { useEffect, useState } from "react";
import {
  clearActionJournal,
  getActionJournal,
  subscribeActionJournal,
  type JournalEntry,
} from "../voice/actionJournal";
import {
  exportSessionPlain,
  getActiveBody,
  getDictationSession,
  newDictationSession,
  saveDictationVersion,
  setCleanedText,
  subscribeDictation,
  type DictationSession,
} from "../voice/dictationSession";
import {
  getExternalPolicy,
  setExternalPolicy,
} from "../voice/externalPolicy";
import {
  listNameDictionary,
  listReplacementLog,
  removeNameEntry,
  upsertNameEntry,
} from "../voice/nameDictionary";
import { proofreadLocal } from "../voice/proofreadLocal";
import {
  continueReading,
  readFirst,
  readFromParagraph,
  repeatReading,
  stopReading,
} from "../voice/readController";
import { formatSegmentsPlain, listVadSegments, subscribeVad } from "../voice/vadSegments";
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
  const [dictFrom, setDictFrom] = useState("");
  const [dictTo, setDictTo] = useState("");
  const [dictEntries, setDictEntries] = useState(() => listNameDictionary());
  const [repLog, setRepLog] = useState(() => listReplacementLog());
  const [proofNote, setProofNote] = useState("");
  const [vadPlain, setVadPlain] = useState(() => formatSegmentsPlain());
  const [extPolicy, setExtPolicy] = useState(() => getExternalPolicy());
  const [backupPath, setBackupPath] = useState("");

  useEffect(() => {
    const u1 = subscribeDictation(() => setSession(getDictationSession()));
    const u2 = subscribeActionJournal(() => setJournal(getActionJournal()));
    const u3 = subscribeVad(() => setVadPlain(formatSegmentsPlain(listVadSegments())));
    return () => {
      u1();
      u2();
      u3();
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
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Сегменты VAD / STT</h3>
        <pre className="mono muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {vadPlain ||
            session.segments.map((s) => `[${s.index}] ${s.text}`).join("\n") ||
            "Пока нет сегментов — говорите в режиме диктовки."}
        </pre>
      </div>

      <div className="stack">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Вычитка (без LLM)</h3>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const report = proofreadLocal(getActiveBody());
            setProofNote(
              report.issues.length
                ? `${report.issues.length} замечаний · ${report.issues
                    .slice(0, 4)
                    .map((i) => i.message)
                    .join("; ")}`
                : "Замечаний нет",
            );
            setCleanedText(report.autoFixed);
            setNote("Применены безопасные авто-правки вычитки");
          }}
        >
          Проверить и поправить пробелы/повторы
        </button>
        {proofNote ? (
          <p className="muted" style={{ margin: 0 }}>
            {proofNote}
          </p>
        ) : null}
      </div>

      <div className="stack">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Словарь имён</h3>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <input
            placeholder="как услышала"
            value={dictFrom}
            onChange={(e) => setDictFrom(e.target.value)}
          />
          <input
            placeholder="как надо"
            value={dictTo}
            onChange={(e) => setDictTo(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDictEntries(upsertNameEntry(dictFrom, dictTo));
              setRepLog(listReplacementLog());
              setDictFrom("");
              setDictTo("");
            }}
          >
            Добавить
          </button>
        </div>
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 4 }}>
          {dictEntries.map((e) => (
            <li key={e.from} className="row" style={{ gap: 8 }}>
              <span className="mono">
                {e.from} → {e.to}
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => setDictEntries(removeNameEntry(e.from))}
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
        {repLog.length ? (
          <p className="muted mono" style={{ margin: 0, fontSize: "0.8rem" }}>
            Журнал замен:{" "}
            {repLog
              .slice(0, 5)
              .map((r) => `${r.from}→${r.to}`)
              .join("; ")}
          </p>
        ) : null}
      </div>

      <div className="stack">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Политика «наружу»</h3>
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={extPolicy.blockExternal}
            onChange={(e) =>
              setExtPolicy(setExternalPolicy({ blockExternal: e.target.checked }))
            }
          />
          Запретить облачный TTS
        </label>
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={extPolicy.confirmEachExternal}
            onChange={(e) =>
              setExtPolicy(
                setExternalPolicy({ confirmEachExternal: e.target.checked }),
              )
            }
          />
          Спрашивать подтверждение перед облаком
        </label>
      </div>

      <div className="stack">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Бэкап диктовки</h3>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void window.mira?.exportDictationBackup?.().then((r) => {
                setBackupPath(r.packagePath);
                setNote(r.detail);
              });
            }}
          >
            Сделать бэкап
          </button>
          <button
            type="button"
            className="btn"
            disabled={!backupPath}
            onClick={() => {
              void window.mira?.verifyDictationBackup?.(backupPath).then((r) => {
                setNote(`${r.detail}${r.sampleSource ? ` · «${r.sampleSource.slice(0, 60)}»` : ""}`);
              });
            }}
          >
            Проверить восстановление
          </button>
          <button
            type="button"
            className="btn"
            disabled={!backupPath}
            onClick={() => {
              void window.mira?.restoreDictationBackup?.(backupPath).then((r) => {
                setNote(r.detail);
              });
            }}
          >
            Восстановить
          </button>
        </div>
        {backupPath ? (
          <p className="mono muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            {backupPath}
          </p>
        ) : null}
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
