import { useCallback, useEffect, useState } from "react";
import {
  CATALOG_DRAFTS_EVENT,
  formatDraftUpdatedAt,
  loadCatalogDrafts,
  removeCatalogDraft,
  type CatalogDraftEntry,
  type CatalogDraftKind,
} from "../catalogDrafts";
import { useAppConfirm } from "./AppConfirm";

type Props = {
  kind: CatalogDraftKind;
  onResume: (draft: CatalogDraftEntry) => void;
  /** Bump to force reload (e.g. after save). */
  revision?: number;
};

export function CatalogDraftsSection({ kind, onResume, revision = 0 }: Props) {
  const confirm = useAppConfirm();
  const [drafts, setDrafts] = useState<CatalogDraftEntry[]>(() =>
    loadCatalogDrafts(kind),
  );

  const refresh = useCallback(() => {
    setDrafts(loadCatalogDrafts(kind));
  }, [kind]);

  useEffect(() => {
    refresh();
  }, [refresh, revision]);

  useEffect(() => {
    function onEvt() {
      refresh();
    }
    window.addEventListener(CATALOG_DRAFTS_EVENT, onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener(CATALOG_DRAFTS_EVENT, onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, [refresh]);

  async function onDelete(draft: CatalogDraftEntry) {
    const ok = await confirm({
      title: "Удалить черновик",
      body: `Удалить черновик «${draft.title}»? Восстановить его будет нельзя.`,
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    removeCatalogDraft(draft.id);
    refresh();
  }

  if (drafts.length === 0) return null;

  const countLabel =
    drafts.length === 1
      ? "1 черновик"
      : drafts.length >= 2 && drafts.length <= 4
        ? `${drafts.length} черновика`
        : `${drafts.length} черновиков`;

  return (
    <section className="catalog-drafts" aria-label="Черновики">
      <header className="catalog-drafts-head">
        <h3 className="catalog-drafts-title">Черновики</h3>
        <span className="muted">{countLabel}</span>
      </header>
      <p className="muted catalog-drafts-hint">
        Незаконченные карточки — можно вернуться, дозаполнить и сохранить, или
        удалить.
      </p>
      <div className="paths-grid catalog-drafts-grid">
        {drafts.map((draft) => (
          <article key={draft.id} className="paths-card panel catalog-draft-card">
            <div className="paths-card-head">
              <span className="catalog-draft-badge" aria-hidden>
                ✎
              </span>
              <div className="paths-card-title">
                <div className="paths-card-title-row">
                  <strong className="paths-card-name">{draft.title}</strong>
                </div>
                <div className="paths-card-kind">
                  Черновик · {formatDraftUpdatedAt(draft.updatedAt)}
                  <span className="sr-only"> (Europe/Moscow)</span>
                </div>
              </div>
            </div>
            <div
              className={`paths-card-path ${draft.summary.trim() ? "" : "is-empty"}`}
            >
              {draft.summary.trim() || "Пока почти пусто — продолжите заполнение"}
            </div>
            <div className="row paths-card-actions">
              <button
                type="button"
                className="btn btn-primary paths-edit-btn"
                onClick={() => onResume(draft)}
              >
                Продолжить
              </button>
              <button
                type="button"
                className="btn btn-danger paths-delete-btn"
                onClick={() => void onDelete(draft)}
              >
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
