import { useState } from "react";
import { createAsrSession, isAsrAvailable } from "../voice/asr";
import {
  clearSttTestResults,
  listSttTestResults,
  recordSttTest,
  STT_TEST_PHRASES,
  type SttTestResult,
} from "../voice/sttTestSet";
import { StubBadge } from "./StubBadge";

export function SttTestPanel() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  const [results, setResults] = useState<SttTestResult[]>(() =>
    listSttTestResults(),
  );
  const [note, setNote] = useState("");

  function refresh() {
    setResults(listSttTestResults());
  }

  function runPhrase(id: string) {
    const phrase = STT_TEST_PHRASES.find((p) => p.id === id);
    if (!phrase) return;
    if (!isAsrAvailable()) {
      setNote("ASR недоступен в этой среде");
      return;
    }
    setActiveId(id);
    setInterim("");
    setNote(`Скажите: «${phrase.expected}»`);
    const session = createAsrSession({
      onInterim: setInterim,
      onFinal: (text) => {
        const row = recordSttTest(phrase.id, phrase.expected, text);
        setNote(
          row.ok
            ? `OK · ${phrase.hint}`
            : `Ошибки: пропуски [${row.misses.join(", ")}] лишнее [${row.extras.join(", ")}]`,
        );
        refresh();
        setActiveId(null);
        setInterim("");
      },
      onError: (msg) => {
        setNote(msg);
        setActiveId(null);
      },
      onEnd: () => {
        setActiveId(null);
      },
    });
    session.start();
    window.setTimeout(() => session.stop(), 12_000);
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Тест STT (без LLM)</h3>
        <StubBadge label="stt-bench" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Фикс-набор фраз. Сначала проверьте микрофон и VAD здесь — потом
        подключайте редактуру.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            clearSttTestResults();
            refresh();
            setNote("Результаты сброшены");
          }}
        >
          Сбросить результаты
        </button>
      </div>
      <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
        {STT_TEST_PHRASES.map((p) => {
          const last = results.find((r) => r.phraseId === p.id);
          return (
            <li key={p.id} className="panel stack" style={{ padding: "0.6rem 0.75rem" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{p.hint}</strong>
                  <div className="muted mono" style={{ fontSize: "0.85rem" }}>
                    {p.expected}
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn ${activeId === p.id ? "btn-primary" : ""}`}
                  disabled={activeId !== null && activeId !== p.id}
                  onClick={() => runPhrase(p.id)}
                >
                  {activeId === p.id ? "Слушаю…" : "Записать"}
                </button>
              </div>
              {last ? (
                <div className="muted mono" style={{ fontSize: "0.8rem" }}>
                  {last.ok ? "✓" : "✗"} «{last.actual}»
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {interim ? (
        <p className="muted" style={{ margin: 0 }}>
          Сейчас: {interim}
        </p>
      ) : null}
      {note ? (
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
