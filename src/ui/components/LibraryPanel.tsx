import { useEffect, useState } from "react";

type LibraryItem = MiraLibraryItem;
type LearnedUnit = MiraLearnedUnit;

export function LibraryPanel() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [units, setUnits] = useState<LearnedUnit[]>([]);
  const [planText, setPlanText] = useState<string>("");
  const [title, setTitle] = useState("Заметки о внимании");
  const [text, setText] = useState(
    `# Внимание и фокус\n\nГлавный тезис: внимание — это навык, а не черта характера.\nПрактика коротких интервалов укрепляет концентрацию.\nФормула: намерение → действие → короткая пауза.\nМы учимся возвращать ум мягко, без самокритики.\n`,
  );
  const [filePath, setFilePath] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    if (!window.mira) {
      setNote("Нужен Electron для библиотеки.");
      return;
    }
    const list = await window.mira.listLibraryItems();
    setItems(list);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function selectItem(id: string) {
    if (!window.mira) return;
    setActiveId(id);
    const [learned, plan] = await Promise.all([
      window.mira.listLearnedUnits(id),
      window.mira.getLearnPlan(id),
    ]);
    setUnits(learned);
    if (plan) {
      try {
        const steps = JSON.parse(plan.steps_json) as string[];
        setPlanText(steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
      } catch {
        setPlanText(plan.steps_json);
      }
    } else {
      setPlanText("");
    }
  }

  async function importText() {
    if (!window.mira || !title.trim() || !text.trim()) return;
    setBusy("import");
    try {
      const item = await window.mira.importLibraryText({
        title: title.trim(),
        text,
      });
      setNote(`Импортировано: ${item.title} (${item.status})`);
      await refresh();
      await selectItem(item.id);
    } finally {
      setBusy(null);
    }
  }

  async function importFile() {
    if (!window.mira || !filePath.trim()) return;
    setBusy("file");
    try {
      const item = await window.mira.importLibraryFile(filePath.trim());
      setNote(`Файл: ${item.title} · ${item.media_type}`);
      await refresh();
      await selectItem(item.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function processActive() {
    if (!window.mira || !activeId) return;
    setBusy("process");
    try {
      const res = await window.mira.processLibraryItem(activeId);
      setNote(
        `Разбор готов · units=${res.units.length} · v${res.item.version}`,
      );
      await refresh();
      await selectItem(activeId);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function proposeSkill() {
    if (!window.mira || !activeId) return;
    setBusy("skill");
    try {
      const res = await window.mira.proposeLibrarySkill(activeId);
      setNote(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="row">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Библиотека</h2>
          <span className="chip">P8 #14</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Upload → extract → анализ → план → память. Skill — только после
          confirm. PDF/аудио/видео: stub extract.
        </p>
        {note ? <p className="mono muted" style={{ margin: 0 }}>{note}</p> : null}
      </div>

      <div className="memory-split">
        <div className="panel stack">
          <strong>Материалы</strong>
          {items.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Пока пусто — импортируйте текст справа.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`btn ${activeId === item.id ? "btn-primary" : ""}`}
                style={{ textAlign: "left" }}
                onClick={() => void selectItem(item.id)}
              >
                <div>{item.title}</div>
                <div className="mono muted" style={{ fontSize: "0.75rem" }}>
                  {item.status} · {item.media_type} · v{item.version}
                  {item.skill_id ? ` · skill:${item.skill_id}` : ""}
                </div>
              </button>
            ))
          )}
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!activeId || busy !== null}
              onClick={() => void processActive()}
            >
              Разобрать
            </button>
            <button
              type="button"
              className="btn"
              disabled={!activeId || busy !== null}
              onClick={() => void proposeSkill()}
            >
              Предложить skill
            </button>
          </div>
        </div>

        <div className="stack">
          <form
            className="panel stack"
            onSubmit={(e) => {
              e.preventDefault();
              void importText();
            }}
          >
            <strong>Импорт текста / md</strong>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название"
            />
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy !== null}
            >
              Загрузить текст
            </button>
          </form>

          <div className="panel stack">
            <strong>Импорт файла (путь)</strong>
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="/path/to/file.md|.txt|.pdf|.mp3…"
            />
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void importFile()}
            >
              Импорт по пути
            </button>
          </div>

          <div className="panel stack">
            <strong>План освоения</strong>
            <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {planText || "—"}
            </pre>
            <strong>Выученное</strong>
            {units.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                После разбора появятся тезисы/фразы/стиль.
              </p>
            ) : (
              units.slice(0, 12).map((u) => (
                <div key={u.id} className="panel">
                  <div className="row">
                    <span className="chip">{u.kind}</span>
                    <span className="muted mono">{u.source_ref}</span>
                  </div>
                  <div>{u.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
