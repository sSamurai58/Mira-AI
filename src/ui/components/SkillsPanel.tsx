import { useCallback, useEffect, useMemo, useState } from "react";
import { emitActionLog } from "../actionLog";
import {
  deleteLocalSkill,
  listLocalSkills,
  saveLocalSkill,
  setLocalSkillEnabled,
} from "../catalogLocal";
import {
  CATALOG_SORT_OPTIONS,
  itemToCatalogDraft,
  loadCatalogSort,
  parseCsv,
  saveCatalogSort,
  sortCatalogItems,
  type CatalogSort,
} from "../catalogSort";
import { notifyCoreProgress } from "../coreLevel";
import { useAppConfirm } from "./AppConfirm";
import {
  CatalogEditModal,
  type CatalogEditDraft,
} from "./CatalogEditModal";
import { StubBadge } from "./StubBadge";
import { ThemeSelect } from "./ThemeSelect";

type FilterId = "all" | "enabled" | "disabled";

const SORT_KEY = "mira.skills.sort";

const EMPTY_DRAFT = (): CatalogEditDraft => ({
  id: "custom-skill",
  name: "Новый скилл",
  description: "",
  triggers: "помоги, skill тест",
  tags: "custom, workshop",
  body: "1. Уточни задачу.\n2. Дай короткий ответ по шагам.\n3. Предложи следующий шаг.",
  enabled: false,
});

function SkillGlyph({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="10" fill="#0F766E" />
      <path
        d="M13 26V14l7-3 7 3v12l-7 3-7-3z"
        fill="none"
        stroke="#ECFDF5"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M20 11v18M13 14l7 3 7-3"
        stroke="#ECFDF5"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function SkillsPanel() {
  const confirm = useAppConfirm();
  const browserOnly = typeof window !== "undefined" && !window.mira;
  const [items, setItems] = useState<MiraCatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<CatalogSort>(() => loadCatalogSort(SORT_KEY));
  const [note, setNote] = useState("");
  const [editor, setEditor] = useState<{
    mode: "create" | "edit";
    draft: CatalogEditDraft;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!window.mira) {
      const rows = listLocalSkills();
      setItems(rows);
      setNote(`Browser-demo · ${rows.length} (localStorage)`);
      return;
    }
    const rows = await window.mira.listSkills();
    setItems(rows);
    setNote(`${rows.length} в каталоге`);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const enabled = items.filter((i) => i.enabled).length;
    return {
      all: items.length,
      enabled,
      disabled: items.length - enabled,
    };
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (filter === "enabled" && !item.enabled) return false;
      if (filter === "disabled" && item.enabled) return false;
      if (!q) return true;
      const hay = [
        item.name,
        item.id,
        item.description,
        ...(item.triggers ?? []),
        ...(item.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return sortCatalogItems(filtered, sort);
  }, [items, filter, query, sort]);

  function changeSort(next: CatalogSort) {
    setSort(next);
    saveCatalogSort(SORT_KEY, next);
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    if (!window.mira) {
      setLocalSkillEnabled(id, enabled);
    } else {
      await window.mira.setSkillEnabled(id, enabled);
    }
    await refresh();
  }

  async function persist(draftIn: CatalogEditDraft) {
    const payload = {
      id: draftIn.id.trim(),
      name: draftIn.name.trim(),
      description: draftIn.description.trim(),
      triggers: parseCsv(draftIn.triggers),
      tags: parseCsv(draftIn.tags),
      enabled: draftIn.enabled,
      body: draftIn.body,
    };
    if (!window.mira) {
      saveLocalSkill(payload);
    } else {
      await window.mira.saveSkill(payload);
    }
    await refresh();
    setNote(`Сохранён skill ${payload.id}`);
    notifyCoreProgress();
    emitActionLog({
      title: "Skill сохранён",
      reason: `${payload.id} · ${payload.name}`,
      tag: "Мастерская",
      tone: "success",
    });
  }

  async function removeItem(item: MiraCatalogItem) {
    const ok = await confirm({
      title: "Удалить skill",
      body: `Удалить skill «${item.name}» (${item.id})?\nФайл будет удалён из каталога.`,
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    const res = window.mira?.deleteSkill
      ? await window.mira.deleteSkill(item.id)
      : deleteLocalSkill(item.id);
    setNote(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
    if (res.ok) await refresh();
  }

  const countLabel =
    counts.all === 1
      ? "1 скилл"
      : counts.all >= 2 && counts.all <= 4
        ? `${counts.all} скилла`
        : `${counts.all} скиллов`;

  return (
    <div className="stack paths-panel catalog-panel">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Скиллы</h2>
            <span className="muted">{countLabel}</span>
            <StubBadge label="P3 #9" />
            {browserOnly ? <span className="chip">browser-demo</span> : null}
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Установленные ≠ активные. В контекст — matched on-demand или «включи
            skill …».
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <label className="row catalog-sort" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Сортировка
            </span>
            <ThemeSelect
              aria-label="Сортировка скиллов"
              value={sort}
              options={CATALOG_SORT_OPTIONS}
              onChange={(v) => changeSort(v as CatalogSort)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              setEditor({ mode: "create", draft: EMPTY_DRAFT() })
            }
          >
            + Создать
          </button>
        </div>
      </div>

      <div className="row paths-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <label className="paths-search">
          <span className="sr-only">Поиск</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти по названию, id, триггеру или тегу"
            aria-label="Найти скилл"
          />
        </label>
        <div className="paths-filters" role="tablist" aria-label="Фильтр">
          {(
            [
              ["all", "Все", counts.all],
              ["enabled", "Вкл", counts.enabled],
              ["disabled", "Выкл", counts.disabled],
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

      {visible.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {items.length === 0
            ? "Пока пусто — нажмите «Создать»."
            : "Ничего не найдено по запросу."}
        </p>
      ) : (
        <div className="paths-grid">
          {visible.map((item) => (
            <article
              key={item.id}
              className={`paths-card panel ${item.enabled ? "is-enabled" : "is-disabled"}`}
            >
              <div className="paths-card-head">
                <span className="paths-card-icon" aria-hidden>
                  <SkillGlyph size={40} />
                </span>
                <div className="paths-card-title">
                  <div className="paths-card-title-row">
                    <strong className="paths-card-name">{item.name}</strong>
                    <span
                      className={`paths-status-dot ${item.enabled ? "is-on" : ""}`}
                      title={item.enabled ? "Установлен" : "Выключен"}
                      aria-hidden
                    />
                  </div>
                  <div className="paths-card-kind">Skill · {item.id}</div>
                </div>
                <label className="paths-card-enable" title="Установлен">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    aria-label={`«${item.name}» установлен`}
                    onChange={(e) =>
                      void toggleEnabled(item.id, e.target.checked)
                    }
                  />
                </label>
              </div>

              <div
                className={`paths-card-path mono ${item.description.trim() ? "" : "is-empty"}`}
                title={item.description || undefined}
              >
                {item.description.trim() || "Без описания"}
              </div>

              <div className="paths-card-tags">
                {(item.triggers ?? []).length === 0 &&
                (item.tags ?? []).length === 0 ? (
                  <span className="paths-tags-empty">Нет триггеров и тегов</span>
                ) : (
                  <>
                    {(item.triggers ?? []).slice(0, 4).map((t) => (
                      <span key={`t-${t}`} className="paths-tag-chip is-readonly">
                        {t}
                      </span>
                    ))}
                    {(item.tags ?? []).slice(0, 4).map((tag) => (
                      <span
                        key={`tag-${tag}`}
                        className="paths-tag-chip is-readonly"
                      >
                        #{tag}
                      </span>
                    ))}
                  </>
                )}
              </div>

              <div className="row paths-card-actions">
                <button
                  type="button"
                  className="btn paths-edit-btn"
                  onClick={() =>
                    setEditor({
                      mode: "edit",
                      draft: itemToCatalogDraft(item),
                    })
                  }
                >
                  Править
                </button>
                <button
                  type="button"
                  className="btn btn-danger paths-delete-btn"
                  onClick={() => void removeItem(item)}
                >
                  Удалить
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editor ? (
        <CatalogEditModal
          open
          title={
            editor.mode === "edit"
              ? `Править skill · ${editor.draft.id}`
              : "Новый skill"
          }
          draft={editor.draft}
          idLocked={editor.mode === "edit"}
          confirmLabel={editor.mode === "edit" ? "Сохранить" : "Создать"}
          onClose={() => setEditor(null)}
          onSave={async (next) => {
            await persist(next);
          }}
        />
      ) : null}
    </div>
  );
}
