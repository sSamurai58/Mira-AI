import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import {
  composeSkillPreviewMarkdown,
  SafeMarkdown,
} from "./SafeMarkdown";

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
  /** Enable GitHub-like Preview / Code tabs for the body. */
  markdownPreview?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  /** Called with the latest form values when the user dismisses without saving. */
  onDismiss?: (draft: CatalogEditDraft) => void;
  onSave: (draft: CatalogEditDraft) => void | Promise<void>;
};

/** Modal editor for Workshop skills / protocols — visible overlay, not a silent form fill. */
export function CatalogEditModal({
  open,
  title,
  draft,
  idLocked = false,
  showFolderField = false,
  markdownPreview = false,
  confirmLabel = "Сохранить",
  onClose,
  onDismiss,
  onSave,
}: Props) {
  const [local, setLocal] = useState<CatalogEditDraft>(draft);
  const [busy, setBusy] = useState(false);
  const [bodyView, setBodyView] = useState<BodyView>("code");

  useEffect(() => {
    if (open) {
      setLocal(draft);
      setBodyView(markdownPreview ? "preview" : "code");
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
      await onSave(local);
      onClose();
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

        <label className="field-label">
          ID
          <input
            className="mono"
            value={local.id}
            disabled={idLocked || busy}
            onChange={(e) => setLocal({ ...local, id: e.target.value })}
            required
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
        {showFolderField ? (
          <label className="field-label">
            Каталог (папка)
            <input
              className="mono"
              value={local.parentFolder ?? ""}
              disabled={busy || idLocked}
              onChange={(e) =>
                setLocal({ ...local, parentFolder: e.target.value })
              }
              placeholder="например figma или tools/blender"
            />
            <span className="muted field-hint">
              Скилл сохранится как{" "}
              <code>
                skills/
                {(local.parentFolder || "").trim()
                  ? `${(local.parentFolder || "").trim()}/`
                  : ""}
                {local.id.trim() || "id"}/SKILL.md
              </code>
            </span>
          </label>
        ) : null}
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
