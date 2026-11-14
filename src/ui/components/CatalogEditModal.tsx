import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  joinSkillFolder,
  sanitizeParentFolder,
  sanitizeSkillSegment,
  skillSavePath,
} from "../skillPaths";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import {
  composeSkillPreviewMarkdown,
  SafeMarkdown,
} from "./SafeMarkdown";
import { ThemeSelect } from "./ThemeSelect";

export type CatalogEditDraft = {
  id: string;
  name: string;
  description: string;
  triggers: string;
  tags: string;
  body: string;
  enabled: boolean;
  /** Parent catalog folder under data/skills (skills create only). */
  parentFolder?: string;
};

type BodyView = "preview" | "code";

type Props = {
  open: boolean;
  title: string;
  draft: CatalogEditDraft;
  /** When editing an existing item, lock the id field. */
  idLocked?: boolean;
  /** Show parent folder field (new skills / catalogs). */
  showFolderField?: boolean;
  /** Existing catalog folders for the picker. */
  folderOptions?: string[];
  /** Enable GitHub-like Preview / Code tabs for the body. */
  markdownPreview?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  /** Called with the latest form values when the user dismisses without saving. */
  onDismiss?: (draft: CatalogEditDraft) => void;
  onSave: (draft: CatalogEditDraft) => void | Promise<void>;
  /** Persist a new empty folder under skills/. */
  onCreateFolder?: (
    folderPath: string,
  ) => Promise<{ ok: boolean; detail: string; folder: string | null }>;
};

/** Modal editor for Workshop skills / protocols — visible overlay, not a silent form fill. */
export function CatalogEditModal({
  open,
  title,
  draft,
  idLocked = false,
  showFolderField = false,
  folderOptions = [],
  markdownPreview = false,
  confirmLabel = "Сохранить",
  onClose,
  onDismiss,
  onSave,
  onCreateFolder,
}: Props) {
  const [local, setLocal] = useState<CatalogEditDraft>(draft);
  const [busy, setBusy] = useState(false);
  const [bodyView, setBodyView] = useState<BodyView>("code");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderId, setNewFolderId] = useState("");
  const [folderNote, setFolderNote] = useState("");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setLocal({
        ...draft,
        parentFolder: sanitizeParentFolder(draft.parentFolder),
        id: draft.id,
      });
      setBodyView(markdownPreview ? "preview" : "code");
      setNewFolderOpen(false);
      setNewFolderId("");
      setFolderNote("");
      setExtraFolders([]);
    }
  }, [open, draft, markdownPreview]);

  const previewMd = useMemo(() => {
    if (!markdownPreview) return local.body;
    return composeSkillPreviewMarkdown({
      name: local.name,
      description: local.description,
      triggers: local.triggers,
      tags: local.tags,
      body: local.body,
    });
  }, [
    markdownPreview,
    local.name,
    local.description,
    local.triggers,
    local.tags,
    local.body,
  ]);

  const folders = useMemo(() => {
    const set = new Set<string>([
      ...folderOptions.map((f) => sanitizeParentFolder(f)).filter(Boolean),
      ...extraFolders,
    ]);
    const current = sanitizeParentFolder(local.parentFolder);
    if (current) set.add(current);
    return [...set].sort((a, b) => a.localeCompare(b, "en"));
  }, [folderOptions, extraFolders, local.parentFolder]);

  const pathPreview = skillSavePath(local.parentFolder || "", local.id);

  if (!open) return null;

  function dismiss() {
    if (busy) return;
    onDismiss?.(local);
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!local.id.trim() || !local.name.trim()) return;
    setBusy(true);
    try {
      await onSave({
        ...local,
        id: sanitizeSkillSegment(local.id) || local.id.trim(),
        parentFolder: sanitizeParentFolder(local.parentFolder),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function addFolder() {
    const nextPath = joinSkillFolder(local.parentFolder, newFolderId);
    if (!nextPath) {
      setFolderNote("Укажите id папки");
      return;
    }
    setBusy(true);
    try {
      if (onCreateFolder) {
        const res = await onCreateFolder(nextPath);
        setFolderNote(res.detail);
        if (!res.ok || !res.folder) return;
        setExtraFolders((prev) => [...prev, res.folder!]);
        setLocal((prev) => ({ ...prev, parentFolder: res.folder! }));
      } else {
        setExtraFolders((prev) => [...prev, nextPath]);
        setLocal((prev) => ({ ...prev, parentFolder: nextPath }));
        setFolderNote(`Папка skills/${nextPath}`);
      }
      setNewFolderId("");
      setNewFolderOpen(false);
    } finally {
      setBusy(false);
    }
  }

  // Portal to <body> so Workshop sticky left-nav (z-index above .workshop-main)
  // cannot paint over the editor overlay.
  const modal = (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        dismiss();
      }}
    >
      <form
        className="modal modal-wide modal-resizable catalog-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-edit-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="row" style={{ alignItems: "flex-start" }}>
          <h2 id="catalog-edit-title" style={{ margin: 0, flex: 1 }}>
            {title}
          </h2>
          <button
            type="button"
            className="btn catalog-edit-close"
            aria-label="Закрыть"
            disabled={busy}
            onClick={dismiss}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <path
                d="M3.2 3.2l9.6 9.6M12.8 3.2L3.2 12.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {showFolderField ? (
          <div className="skill-folder-box">
            <div className="skill-folder-box-head">
              <span className="field-label" style={{ margin: 0 }}>
                Папка
              </span>
              <button
                type="button"
                className="btn"
                disabled={busy || idLocked}
                onClick={() => {
                  setNewFolderOpen((v) => !v);
                  setFolderNote("");
                }}
              >
                Создать папку
              </button>
            </div>
            <ThemeSelect
              aria-label="Папка каталога"
              value={sanitizeParentFolder(local.parentFolder)}
              disabled={busy || idLocked}
              options={[
                { value: "", label: "skills/ (корень)" },
                ...folders.map((f) => ({
                  value: f,
                  label: `skills/${f}/`,
                })),
              ]}
              onChange={(v) =>
                setLocal({ ...local, parentFolder: sanitizeParentFolder(v) })
              }
            />
            {newFolderOpen ? (
              <div className="skill-folder-create">
                <label className="field-label" style={{ margin: 0, flex: 1 }}>
                  Id папки
                  <input
                    className="mono"
                    value={newFolderId}
                    disabled={busy}
                    placeholder="например animation"
                    onChange={(e) => setNewFolderId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addFolder();
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !newFolderId.trim()}
                  onClick={() => void addFolder()}
                >
                  Добавить
                </button>
              </div>
            ) : null}
            {folderNote ? (
              <p className="muted field-hint" style={{ margin: 0 }}>
                {folderNote}
              </p>
            ) : null}
            <p className="muted field-hint skill-path-preview">
              Скилл → <code>{pathPreview}</code>
            </p>
          </div>
        ) : null}

        <label className="field-label">
          ID
          <input
            className="mono"
            value={local.id}
            disabled={idLocked || busy}
            onChange={(e) => setLocal({ ...local, id: e.target.value })}
            required
            placeholder="например blender-3d"
          />
        </label>
        <label className="field-label">
          Название
          <input
            value={local.name}
            disabled={busy}
            onChange={(e) => setLocal({ ...local, name: e.target.value })}
            required
          />
        </label>
        <label className="field-label">
          Описание
          <input
            value={local.description}
            disabled={busy}
            onChange={(e) =>
              setLocal({ ...local, description: e.target.value })
            }
          />
        </label>
        <label className="field-label">
          Триггеры
          <input
            value={local.triggers}
            disabled={busy}
            onChange={(e) => setLocal({ ...local, triggers: e.target.value })}
            placeholder="фразы через запятую"
          />
        </label>
        <label className="field-label">
          Теги
          <input
            value={local.tags}
            disabled={busy}
            onChange={(e) => setLocal({ ...local, tags: e.target.value })}
            placeholder="custom, library"
          />
        </label>

        <div className="field-label catalog-body-field">
          <div className="catalog-body-head">
            <span>Тело (Markdown)</span>
            {markdownPreview ? (
              <div
                className="catalog-md-tabs"
                role="tablist"
                aria-label="Режим просмотра Markdown"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={bodyView === "preview"}
                  className={`catalog-md-tab ${bodyView === "preview" ? "is-active" : ""}`}
                  disabled={busy}
                  onClick={() => setBodyView("preview")}
                >
                  Предварительный просмотр
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={bodyView === "code"}
                  className={`catalog-md-tab ${bodyView === "code" ? "is-active" : ""}`}
                  disabled={busy}
                  onClick={() => setBodyView("code")}
                >
                  Код
                </button>
              </div>
            ) : null}
          </div>
          {markdownPreview && bodyView === "preview" ? (
            <div className="catalog-md-preview" role="tabpanel">
              <SafeMarkdown text={previewMd} />
            </div>
          ) : (
            <AutoGrowTextarea
              value={local.body}
              disabled={busy}
              minHeight={120}
              maxHeight={Math.round(
                typeof window !== "undefined" ? window.innerHeight * 0.55 : 420,
              )}
              onChange={(e) => setLocal({ ...local, body: e.target.value })}
              spellCheck={false}
              className="catalog-md-code mono"
            />
          )}
        </div>

        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={local.enabled}
            disabled={busy}
            onChange={(e) =>
              setLocal({ ...local, enabled: e.target.checked })
            }
          />
          <span>установлен / включён</span>
        </label>

        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={dismiss}
          >
            Отмена
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
