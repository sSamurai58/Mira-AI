import { useCallback, useEffect, useMemo, useState } from "react";
import { emitActionLog } from "../actionLog";
import {
  deleteLocalProtocol,
  listLocalProtocols,
  saveLocalProtocol,
  setLocalProtocolEnabled,
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

const SORT_KEY = "mira.protocols.sort";

const EMPTY_DRAFT = (): CatalogEditDraft => ({
  id: "custom-protocol",
  name: "Новый протокол",
  description: "",
  triggers: "протокол тест",
  tags: "custom",
  body: "1. Скажи «протокол выполнен».\n2. Предложи следующий шаг.",
  enabled: true,
});

function ProtocolGlyph({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="10" fill="#1E3A5F" />
      <path
        d="M12 13h16M12 20h16M12 27h10"
        stroke="#DBEAFE"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="28" cy="27" r="3.2" fill="#93C5FD" />
    </svg>
  );
}

export function ProtocolsPanel() {
  const confirm = useAppConfirm();
  const browserOnly = typeof window !== "undefined" && !window.mira;
  const [items, setItems] = useState<MiraCatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<CatalogSort>(() =>
    loadCatalogSort(SORT_KEY, "name"),
  );
  const [note, setNote] = useState("");
  const [runLog, setRunLog] = useState<string | null>(null);
  const [busyRun, setBusyRun] = useState(false);
  const [editor, setEditor] = useState<{
    mode: "create" | "edit";
    draft: CatalogEditDraft;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!window.mira) {
      const rows = listLocalProtocols();
      setItems(rows);
      setNote(`Browser-demo · ${rows.length} (localStorage)`);
      return;
    }
    const rows = await window.mira.listProtocols();
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
      setLocalProtocolEnabled(id, enabled);
    } else {
      await window.mira.setProtocolEnabled(id, enabled);
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
      saveLocalProtocol(payload);
    } else {
      await window.mira.saveProtocol(payload);
    }
    await refresh();
    setNote(`Сохранён протокол ${payload.id}`);
    notifyCoreProgress();
    emitActionLog({
      title: "Протокол сохранён",
      reason: `${payload.id} · ${payload.name}`,
      tag: "Мастерская",
      tone: "success",
    });
  }

  async function removeItem(item: MiraCatalogItem) {
    const ok = await confirm({
      title: "Удалить протокол",
      body: `Удалить протокол «${item.name}» (${item.id})?\nФайл будет удалён из каталога.`,
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    const res = window.mira?.deleteProtocol
      ? await window.mira.deleteProtocol(item.id)
      : deleteLocalProtocol(item.id);
    setNote(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
    if (res.ok) await refresh();
  }

  async function runProtocol(id: string) {
    if (!window.mira) {
      setRunLog("Run доступен в Electron");
      return;
    }
    setBusyRun(true);
    setRunLog("Запуск…");
    const requestId = crypto.randomUUID();
    const off = window.mira.onChatEvent(({ requestId: rid, event }) => {
      if (rid !== requestId) return;
      if (event.type === "context") {
        setRunLog(
          `context · protocol=${event.protocol?.id ?? "none"} · skills=${event.skills.map((s) => s.id).join(",") || "none"}`,
        );
      }
      if (event.type === "assistant_done") {
        setRunLog(event.utterance.content.slice(0, 400));
        off();
        setBusyRun(false);
      }
      if (event.type === "error") {
        setRunLog(`error: ${event.message}`);
        off();
        setBusyRun(false);
      }
    });
    try {
      await window.mira.sendChat({
        sessionId: null,
        text: `Выполни протокол ${id}`,
        requestId,
        forceProtocolId: id,
      });
    } catch (err) {
      off();
      setBusyRun(false);
      setRunLog(err instanceof Error ? err.message : String(err));
    }
  }

  const countLabel =
    counts.all === 1
      ? "1 протокол"
      : counts.all >= 2 && counts.all <= 4
        ? `${counts.all} протокола`
        : `${counts.all} протоколов`;

  return (
    <div className="stack paths-panel catalog-panel">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Протоколы</h2>
            <span className="muted">{countLabel}</span>
            <StubBadge label="P3 #10" />
            {browserOnly ? <span className="chip">browser-demo</span> : null}
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Md + панель. Триггер из Диалога или Run на карточке.
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <label className="row catalog-sort" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Сортировка
            </span>
            <ThemeSelect
              aria-label="Сортировка протоколов"
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
            aria-label="Найти протокол"
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
                  <ProtocolGlyph size={40} />
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
                  <div className="paths-card-kind">Protocol · {item.id}</div>
                </div>
                <label className="paths-card-enable" title="Включён">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    aria-label={`«${item.name}» включён`}
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
                  className="btn paths-open-btn"
                  disabled={busyRun || browserOnly}
                  onClick={() => void runProtocol(item.id)}
                >
                  Run
                </button>
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

      {runLog ? (
        <pre
          className="mono catalog-run-log"
          style={{ whiteSpace: "pre-wrap", margin: 0 }}
        >
          {runLog}
        </pre>
      ) : null}

      {editor ? (
        <CatalogEditModal
          open
          title={
            editor.mode === "edit"
              ? `Править протокол · ${editor.draft.id}`
              : "Новый протокол"
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
