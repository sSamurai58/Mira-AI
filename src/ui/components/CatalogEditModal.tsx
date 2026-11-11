import { useEffect, useState, type FormEvent } from "react";

export type CatalogEditDraft = {
  id: string;
  name: string;
  description: string;
  triggers: string;
  tags: string;
  body: string;
  enabled: boolean;
};

type Props = {
  open: boolean;
  title: string;
  draft: CatalogEditDraft;
  /** When editing an existing item, lock the id field. */
  idLocked?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onSave: (draft: CatalogEditDraft) => void | Promise<void>;
};

/** Modal editor for Workshop skills / protocols — visible overlay, not a silent form fill. */
export function CatalogEditModal({
  open,
  title,
  draft,
  idLocked = false,
  confirmLabel = "Сохранить",
  onClose,
  onSave,
}: Props) {
  const [local, setLocal] = useState<CatalogEditDraft>(draft);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setLocal(draft);
  }, [open, draft]);

  if (!open) return null;

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

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="modal modal-wide catalog-edit-modal"
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
            onClick={onClose}
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
        <label className="field-label">
          Тело
          <textarea
            rows={8}
            value={local.body}
            disabled={busy}
            onChange={(e) => setLocal({ ...local, body: e.target.value })}
          />
        </label>
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
            onClick={onClose}
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
}
