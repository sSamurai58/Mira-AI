import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { emitActionLog } from "../actionLog";
import {
  draftsDiffer,
  newCatalogDraftId,
  removeCatalogDraft,
  upsertCatalogDraft,
  type CatalogDraftEntry,
} from "../catalogDrafts";
import {
  autodiscoverLocalAppPaths,
  deleteLocalAppPath,
  listLocalAppPaths,
  setLocalAppPathEnabled,
  upsertLocalAppPath,
  type AppPathItem,
  type AppPathKind,
} from "../pathsLocal";
import { AppPathIcon, resolveAppPathIconId } from "./AppPathIcon";
import { useAppConfirm } from "./AppConfirm";
import { CatalogDraftsSection } from "./CatalogDraftsSection";
import { StubBadge } from "./StubBadge";

type FilterId = "all" | "program" | "folder" | "file";

const KIND_LABEL: Record<AppPathKind, string> = {
  program: "Программа",
  folder: "Папка",
  file: "Файл",
};

type PathEditorDraft = {
  id?: string;
  kind: AppPathKind;
  name: string;
  path: string;
  tags: string[];
  enabled: boolean;
};

const EMPTY_DRAFT = (): PathEditorDraft => ({
  kind: "program",
  name: "",
  path: "",
  tags: [],
  enabled: true,
});

function pathDraftSummary(d: PathEditorDraft): string {
  const bits = [
    KIND_LABEL[d.kind],
    d.path.trim() || "путь не задан",
    d.tags.length ? `${d.tags.length} фраз` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}

function kindIcon(kind: AppPathKind) {
  if (kind === "folder") {
    return (
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
        <path
          d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l1.5 1.5H15.5A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    );
  }
  if (kind === "file") {
    return (
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
        <path
          d="M6 3.5h5l4 4V16.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M11 3.5V8h4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <rect
        x="3"
        y="4"
        width="14"
        height="10"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M7 16.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PathsPanel() {
  const confirm = useAppConfirm();
  const browserOnly = typeof window !== "undefined" && !window.mira;
  const [items, setItems] = useState<AppPathItem[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [note, setNote] = useState("");
  const [editor, setEditor] = useState<PathEditorDraft | null>(null);
  /** Create-only localStorage draft id. */
  const [createDraftId, setCreateDraftId] = useState<string | null>(null);
  const [draftsRev, setDraftsRev] = useState(0);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!window.mira?.listAppPaths) {
      setItems(listLocalAppPaths());
      return;
    }
    const rows = await window.mira.listAppPaths();
    setItems(rows);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const program = items.filter((i) => i.kind === "program").length;
    const folder = items.filter((i) => i.kind === "folder").length;
    const file = items.filter((i) => i.kind === "file").length;
    return { all: items.length, program, folder, file };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.kind !== filter) return false;
      if (!q) return true;
      const hay = [item.name, item.path, ...item.tags].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter, query]);

  function stashPathDraft(next: PathEditorDraft, draftId: string) {
    if (!draftsDiffer(next, EMPTY_DRAFT())) {
      removeCatalogDraft(draftId);
      setDraftsRev((n) => n + 1);
      return;
    }
    upsertCatalogDraft({
      id: draftId,
      kind: "path",
      title: next.name.trim() || "Новый путь",
      summary: pathDraftSummary(next),
      payload: next,
    });
    setDraftsRev((n) => n + 1);
  }

  function closeEditor(saveDraft: boolean) {
    if (saveDraft && editor && createDraftId && !editor.id) {
      stashPathDraft(editor, createDraftId);
    }
    setEditor(null);
    setCreateDraftId(null);
    setTagDraft("");
  }

  function openCreate() {
    setEditor(EMPTY_DRAFT());
    setCreateDraftId(newCatalogDraftId());
    setTagDraft("");
  }

  function openEdit(item: AppPathItem) {
    setEditor({
      id: item.id,
      kind: item.kind,
      name: item.name,
      path: item.path,
      tags: [...item.tags],
      enabled: item.enabled,
    });
    setCreateDraftId(null);
    setTagDraft("");
  }

  function resumeDraft(entry: CatalogDraftEntry) {
    const payload = entry.payload as PathEditorDraft;
    if (!payload || typeof payload !== "object") return;
    setEditor({
      kind: payload.kind ?? "program",
      name: payload.name ?? "",
      path: payload.path ?? "",
      tags: Array.isArray(payload.tags) ? [...payload.tags] : [],
      enabled: payload.enabled !== false,
    });
    setCreateDraftId(entry.id);
    setTagDraft("");
  }

  function addTagFromDraft() {
    const t = tagDraft.trim();
    if (!t || !editor) return;
    if (editor.tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTagDraft("");
      return;
    }
    setEditor({ ...editor, tags: [...editor.tags, t] });
    setTagDraft("");
  }

  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTagFromDraft();
    } else if (e.key === "Backspace" && !tagDraft && editor && editor.tags.length) {
      setEditor({ ...editor, tags: editor.tags.slice(0, -1) });
    }
  }

  async function saveEditor(e: FormEvent) {
    e.preventDefault();
    if (!editor || !editor.name.trim()) return;
    setBusy(true);
    try {
      if (window.mira?.upsertAppPath) {
        await window.mira.upsertAppPath({
          id: editor.id,
          kind: editor.kind,
          name: editor.name,
          path: editor.path,
          tags: editor.tags,
          enabled: editor.enabled,
        });
      } else {
        upsertLocalAppPath({
          id: editor.id,
          kind: editor.kind,
          name: editor.name,
          path: editor.path,
          tags: editor.tags,
          enabled: editor.enabled,
        });
      }
      emitActionLog({
        title: editor.id ? "Путь сохранён" : "Путь добавлен",
        reason: editor.name,
        tag: "Пути",
        tone: "success",
      });
      if (createDraftId) {
        removeCatalogDraft(createDraftId);
        setDraftsRev((n) => n + 1);
      }
      setEditor(null);
      setCreateDraftId(null);
      setTagDraft("");
      await refresh();
      setNote("Сохранено");
    } finally {
      setBusy(false);
    }
  }

  async function browsePath() {
    if (!editor) return;
    if (!window.mira?.pickAppPath) {
      setNote("Выбор файла доступен в Electron");
      return;
    }
    const res = await window.mira.pickAppPath(editor.kind);
    if (res.canceled || !res.path) return;
    const next = { ...editor, path: res.path };
    if (!next.name.trim()) {
      const base = res.path.split(/[/\\]/).pop() ?? "";
      next.name = base.replace(/\.(exe|app)$/i, "") || next.name;
    }
    setEditor(next);
  }

  async function runAutodiscover() {
    setBusy(true);
    try {
      if (window.mira?.autodiscoverAppPaths) {
        const res = await window.mira.autodiscoverAppPaths();
        setItems(res.paths);
        setNote(
          `Автообнаружение: просмотрено ${res.scanned}, обновлено ${res.updated}, добавлено ${res.created}`,
        );
        emitActionLog({
          title: "Автообнаружение путей",
          reason: `+${res.created} · ~${res.updated}`,
          tag: "Пути",
          tone: "accent",
        });
      } else {
        const res = autodiscoverLocalAppPaths();
        setItems(res.paths);
        setNote(`Browser-demo: каталог ${res.paths.length} путей`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function openPath(item: AppPathItem) {
    if (!window.mira?.openAppPath) {
      setNote("Открытие доступно в Electron");
      return;
    }
    const res = await window.mira.openAppPath(item.id);
    setNote(res.detail);
    emitActionLog({
      title: res.ok ? "Открыто" : "Не открыто",
      reason: item.name,
      tag: "Пути",
      tone: res.ok ? "success" : "warning",
    });
  }

  async function removePath(item: AppPathItem) {
    const ok = await confirm({
      title: "Удалить путь?",
      body: `Удалить «${item.name}» из списка?`,
      confirmLabel: "Удалить",
    });
    if (!ok) return;
    if (window.mira?.deleteAppPath) {
      await window.mira.deleteAppPath(item.id);
    } else {
      deleteLocalAppPath(item.id);
    }
    await refresh();
    setNote(`Удалено «${item.name}»`);
  }

  async function toggleEnabled(item: AppPathItem, enabled: boolean) {
    if (window.mira?.setAppPathEnabled) {
      await window.mira.setAppPathEnabled(item.id, enabled);
    } else {
      setLocalAppPathEnabled(item.id, enabled);
    }
    await refresh();
  }

  const pathCountLabel =
    counts.all === 1
      ? "1 путь"
      : counts.all >= 2 && counts.all <= 4
        ? `${counts.all} пути`
        : `${counts.all} путей`;

  const modal =
    editor &&
    createPortal(
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={() => {
          if (!busy) closeEditor(true);
        }}
      >
        <form
          className="modal modal-wide paths-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paths-edit-title"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => void saveEditor(e)}
        >
          <h2 id="paths-edit-title" style={{ margin: 0 }}>
            {editor.id ? "Изменить путь" : "Добавить путь"}
          </h2>

          <div className="paths-kind-toggle" role="group" aria-label="Тип">
            {(["program", "folder", "file"] as AppPathKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`paths-kind-btn ${editor.kind === k ? "is-active" : ""}`}
                disabled={busy}
                onClick={() => setEditor({ ...editor, kind: k })}
              >
                <span className="paths-kind-icon">{kindIcon(k)}</span>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <label className="field-label">
            Путь
            <div className="row" style={{ gap: 8 }}>
              <input
                style={{ flex: 1 }}
                value={editor.path}
                disabled={busy}
                placeholder={
                  editor.kind === "folder"
                    ? "C:\\Users\\…\\Documents"
                    : editor.kind === "file"
                      ? "C:\\Users\\…\\файл.docx"
                      : "C:\\Program Files\\App\\app.exe"
                }
                onChange={(e) =>
                  setEditor({ ...editor, path: e.target.value })
                }
              />
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void browsePath()}
              >
                Выбрать
              </button>
            </div>
          </label>

          <label className="field-label">
            Название
            <input
              value={editor.name}
              disabled={busy}
              required
              placeholder="Telegram"
              onChange={(e) =>
                setEditor({ ...editor, name: e.target.value })
              }
            />
          </label>

          <label className="field-label">
            Что сказать, чтобы открыть
            <div className="paths-tags-input">
              {editor.tags.map((tag) => (
                <span key={tag} className="paths-tag-chip">
                  {tag}
                  <button
                    type="button"
                    className="paths-tag-remove"
                    aria-label={`Удалить «${tag}»`}
                    disabled={busy}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        tags: editor.tags.filter((t) => t !== tag),
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                disabled={busy}
                placeholder="Введите фразу и нажмите Enter"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={addTagFromDraft}
              />
            </div>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Можно несколько вариантов, например «открой проекты» и «мои
              проекты».
            </span>
          </label>

          <div className="row" style={{ gap: 10, marginTop: 4 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !editor.name.trim()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => closeEditor(true)}
            >
              Отмена
            </button>
          </div>
        </form>
      </div>,
      document.body,
    );

  return (
    <div className="stack paths-panel">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Пути</h2>
            <span className="muted">{pathCountLabel}</span>
            <StubBadge label="P12" />
            {browserOnly ? <span className="chip">browser-demo</span> : null}
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Готовые пути для приложений из команд. Укажите путь к exe/папке и
            сохраните — Mira откроет по голосовой фразе.
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={openCreate}
          >
            + Добавить путь
          </button>
          <button
            type="button"
            className="btn paths-autodiscover-btn"
            disabled={busy}
            onClick={() => void runAutodiscover()}
          >
            Автообнаружение
          </button>
        </div>
      </div>

      <div className="row paths-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <label className="paths-search">
          <span className="sr-only">Поиск</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти по названию, пути или фразе"
            aria-label="Найти по названию, пути или фразе"
          />
        </label>
        <div className="paths-filters" role="tablist" aria-label="Фильтр">
          {(
            [
              ["all", "Все", counts.all],
              ["program", "Программы", counts.program],
              ["folder", "Папки", counts.folder],
              ["file", "Файлы", counts.file],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`paths-filter-btn ${filter === id ? "is-active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label} {count}
            </button>
          ))}
        </div>
      </div>

      {note ? (
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Нет путей. Добавьте вручную или запустите автообнаружение.
        </p>
      ) : (
        <div className="paths-grid">
          {filtered.map((item) => {
            const iconId = resolveAppPathIconId(item);
            const pathMissing = !item.path.trim();
            return (
              <article
                key={item.id}
                className={`paths-card panel ${item.enabled ? "is-enabled" : "is-disabled"}`}
              >
                <div className="paths-card-head">
                  <span
                    className={`paths-card-icon paths-card-icon--${iconId}`}
                    aria-hidden
                  >
                    <AppPathIcon id={iconId} size={40} />
                  </span>
                  <div className="paths-card-title">
                    <div className="paths-card-title-row">
                      <strong className="paths-card-name">{item.name}</strong>
                      <span
                        className={`paths-status-dot ${item.enabled ? "is-on" : ""}`}
                        title={item.enabled ? "Включён" : "Выключен"}
                        aria-hidden
                      />
                    </div>
                    <div className="paths-card-kind">{KIND_LABEL[item.kind]}</div>
                  </div>
                  <label className="paths-card-enable" title="В голосе">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      aria-label={`«${item.name}» в голосе`}
                      onChange={(e) =>
                        void toggleEnabled(item, e.target.checked)
                      }
                    />
                  </label>
                </div>

                <div
                  className={`paths-card-path mono ${pathMissing ? "is-empty" : ""}`}
                  title={pathMissing ? undefined : item.path}
                >
                  {pathMissing
                    ? "Путь не задан — нажмите «Изменить»"
                    : item.path}
                </div>

                <div className="paths-card-tags">
                  {item.tags.length === 0 ? (
                    <span className="paths-tags-empty">Нет фраз</span>
                  ) : (
                    item.tags.map((tag) => (
                      <span key={tag} className="paths-tag-chip is-readonly">
                        {tag}
                      </span>
                    ))
                  )}
                </div>

                <div className="row paths-card-actions">
                  <button
                    type="button"
                    className="btn paths-open-btn"
                    onClick={() => void openPath(item)}
                    disabled={pathMissing}
                  >
                    Открыть
                  </button>
                  <button
                    type="button"
                    className="btn paths-edit-btn"
                    onClick={() => openEdit(item)}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger paths-delete-btn"
                    onClick={() => void removePath(item)}
                  >
                    Удалить
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CatalogDraftsSection
        kind="path"
        revision={draftsRev}
        onResume={resumeDraft}
      />

      {modal}
    </div>
  );
}
