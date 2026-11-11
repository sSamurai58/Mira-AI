import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  localDeleteLibraryItem,
  localGetLearnPlan,
  localImportLibraryBytes,
  localImportLibraryText,
  localListLearnedUnits,
  localListLibraryItems,
  localProcessLibraryItem,
  type LocalLearnedUnit,
  type LocalLibraryItem,
} from "../library/libraryLocal";
import {
  displayLearnedContent,
  learnedKindLabel,
} from "../library/learnedLabels";

type LibraryItem = MiraLibraryItem | LocalLibraryItem;
type LearnedUnit = MiraLearnedUnit | LocalLearnedUnit;

export function LibraryPanel() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [units, setUnits] = useState<LearnedUnit[]>([]);
  const [planText, setPlanText] = useState<string>("");
  const [title, setTitle] = useState("Заметки о внимании");
  const [text, setText] = useState(
    `# Внимание и фокус\n\nГлавный тезис: внимание — это навык, а не черта характера.\nПрактика коротких интервалов укрепляет концентрацию.\nФормула: намерение → действие → короткая пауза.\nМы учимся возвращать ум мягко, без самокритики.\n`,
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const electron = typeof window !== "undefined" && Boolean(window.mira);

  async function refresh() {
    if (window.mira) {
      const list = await window.mira.listLibraryItems();
      setItems(list);
      return;
    }
    setItems(localListLibraryItems());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function selectItem(id: string) {
    setActiveId(id);
    if (window.mira) {
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
      return;
    }
    setUnits(localListLearnedUnits(id));
    const plan = localGetLearnPlan(id);
    setPlanText(plan.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  }

  async function importText() {
    if (!title.trim() || !text.trim()) return;
    setBusy("import");
    try {
      const item = window.mira
        ? await window.mira.importLibraryText({
            title: title.trim(),
            text,
          })
        : localImportLibraryText({ title: title.trim(), text });
      setNote(`Импортировано: ${item.title} (${item.status})`);
      await refresh();
      await selectItem(item.id);
    } finally {
      setBusy(null);
    }
  }

  async function importPickedFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    setBusy("picker");
    const names: string[] = [];
    try {
      for (const file of Array.from(list)) {
        let clientText = "";
        if (
          file.type === "application/pdf" ||
          /\.pdf$/i.test(file.name)
        ) {
          try {
            const { extractPdfInBrowser } = await import("../library/pdfClient");
            const pdf = await extractPdfInBrowser(file);
            clientText = pdf.text;
            if (pdf.note) {
              setNote(`PDF «${file.name}»: ${pdf.note}`);
            }
          } catch (err) {
            setNote(
              err instanceof Error
                ? err.message
                : `PDF «${file.name}»: не удалось прочитать`,
            );
          }
        } else if (
          file.type.startsWith("text/") ||
          /\.(md|txt|markdown|json|csv)$/i.test(file.name)
        ) {
          clientText = await file.text();
        }

        if (window.mira?.importLibraryBytes) {
          const buf = new Uint8Array(await file.arrayBuffer());
          const item = await window.mira.importLibraryBytes({
            bytes: Array.from(buf),
            fileName: file.name,
            title: file.name.replace(/\.[^.]+$/, ""),
            extractedText: clientText || undefined,
          });
          names.push(item.title);
          await selectItem(item.id);
        } else {
          const item = localImportLibraryBytes({
            title: file.name.replace(/\.[^.]+$/, ""),
            fileName: file.name,
            text: clientText || undefined,
          });
          names.push(item.title);
          await selectItem(item.id);
        }
      }
      setNote(`Добавлено в обучение: ${names.join(", ")}`);
      await refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function processActive() {
    if (!activeId) return;
    setBusy("process");
    try {
      if (window.mira) {
        const res = await window.mira.processLibraryItem(activeId);
        setNote(
          `Разбор готов · units=${res.units.length} · v${res.item.version}`,
        );
      } else {
        const res = localProcessLibraryItem(activeId);
        setNote(
          `Разбор (demo) · units=${res.units.length} · v${res.item.version}`,
        );
      }
      await refresh();
      await selectItem(activeId);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function proposeSkill() {
    if (!window.mira || !activeId) {
      setNote("Предложить skill доступно в Electron.");
      return;
    }
    setBusy("skill");
    try {
      const res = await window.mira.proposeLibrarySkill(activeId);
      setNote(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteById(id: string) {
    const item = items.find((i) => i.id === id);
    const label = item?.title ?? id;
    const ok = window.confirm(
      `Удалить материал «${label}»?\nВыдержки и план тоже будут удалены. Созданный skill в каталоге останется.`,
    );
    if (!ok) return;
    setBusy("delete");
    try {
      const res = window.mira?.deleteLibraryItem
        ? await window.mira.deleteLibraryItem(id)
        : localDeleteLibraryItem(id);
      setNote(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
      if (res.ok) {
        if (activeId === id) {
          setActiveId(null);
          setUnits([]);
          setPlanText("");
        }
        await refresh();
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function deleteActive() {
    if (!activeId) return;
    await deleteById(activeId);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void importPickedFiles(e.dataTransfer.files);
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="row">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
            Материалы для обучения
          </h2>
          <span className="chip">P8</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Добавьте текст или файлы (md/txt/pdf…). PDF читается через pdf.js; сканы
          — OCR (рус+eng). Затем «Разобрать» → <em>выдержки</em> (тезисы/фразы).
          Skill — кнопкой «Предложить skill» → Мастерская → Skills.
          {!electron
            ? " Сейчас browser-demo: материалы в localStorage."
            : ""}
        </p>
        {note ? (
          <p className="mono muted" style={{ margin: 0 }}>
            {note}
          </p>
        ) : null}
      </div>

      <div className="memory-split">
        <div className="panel stack">
          <strong>Библиотека</strong>
          {items.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Пока пусто — загрузите материал справа или перетащите файл.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`library-item-row ${activeId === item.id ? "is-active" : ""}`}
              >
                <button
                  type="button"
                  className={`btn library-item-select ${activeId === item.id ? "btn-primary" : ""}`}
                  onClick={() => void selectItem(item.id)}
                >
                  <div>{item.title}</div>
                  <div className="mono muted" style={{ fontSize: "0.75rem" }}>
                    {item.status} · {item.media_type} · v{item.version}
                    {"skill_id" in item && item.skill_id
                      ? ` · skill:${item.skill_id}`
                      : ""}
                  </div>
                </button>
                <button
                  type="button"
                  className="btn library-item-delete"
                  title="Удалить материал"
                  aria-label={`Удалить «${item.title}»`}
                  disabled={busy !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteById(item.id);
                  }}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                    <path
                      d="M3.2 3.2l9.6 9.6M12.8 3.2L3.2 12.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
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
              disabled={!activeId || busy !== null || !electron}
              onClick={() => void proposeSkill()}
            >
              Предложить skill
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!activeId || busy !== null}
              onClick={() => void deleteActive()}
            >
              Удалить
            </button>
          </div>
        </div>

        <div className="stack">
          <div
            className={`panel stack library-drop ${dragOver ? "is-drop" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            onClick={() => fileRef.current?.click()}
          >
            <strong>Прикрепить файл</strong>
            <p className="muted" style={{ margin: 0 }}>
              Нажмите или перетащите сюда md / txt / pdf / аудио — материал
              попадёт в обучение.
            </p>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".md,.txt,.markdown,.pdf,.epub,.mp3,.wav,.m4a,.ogg,.mp4,.webm,.json,.csv"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                void importPickedFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
            >
              Прикрепить файл…
            </button>
          </div>

          <form
            className="panel stack"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void importText();
            }}
          >
            <strong>Или вставить текст / md</strong>
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
            <strong>План освоения</strong>
            <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {planText || "—"}
            </pre>
            {activeId &&
            items.find((i) => i.id === activeId && "skill_id" in i && i.skill_id) ? (
              <p className="muted" style={{ margin: 0 }}>
                Skill уже создан:{" "}
                <code className="mono">
                  {
                    (
                      items.find((i) => i.id === activeId) as {
                        skill_id?: string | null;
                      }
                    )?.skill_id
                  }
                </code>{" "}
                — смотрите Мастерская → Skills.
              </p>
            ) : null}
            <strong>Выдержки из материала</strong>
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Тезисы и фразы — конспект для памяти, не каталог skills.
            </p>
            {units.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                После разбора появятся тезисы/фразы/стиль.
              </p>
            ) : (
              units.slice(0, 12).map((u) => (
                <div key={u.id} className="panel learned-unit-card">
                  <div className="row">
                    <span className="chip">{learnedKindLabel(u.kind)}</span>
                    <span className="muted mono">{u.source_ref}</span>
                  </div>
                  <div className="learned-unit-body">
                    {displayLearnedContent(u.content)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
