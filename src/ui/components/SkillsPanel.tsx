import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { emitActionLog } from "../actionLog";
import {
  createLocalSkillFolder,
  deleteLocalSkill,
  listLocalSkillFolders,
  listLocalSkills,
  saveLocalSkill,
  setLocalSkillEnabled,
} from "../catalogLocal";
import {
  draftsDiffer,
  newCatalogDraftId,
  removeCatalogDraft,
  upsertCatalogDraft,
  type CatalogDraftEntry,
} from "../catalogDrafts";
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
import {
  collectSkillFolders,
  joinSkillFolder,
  sanitizeParentFolder,
  sanitizeSkillSegment,
} from "../skillPaths";
import { useAppConfirm } from "./AppConfirm";
import { CatalogDraftsSection } from "./CatalogDraftsSection";
import {
  CatalogEditModal,
  type CatalogEditDraft,
} from "./CatalogEditModal";
import { StubBadge } from "./StubBadge";
import { ThemeSelect } from "./ThemeSelect";

type FilterId = "all" | "enabled" | "disabled";

const SORT_KEY = "mira.skills.sort";

const EMPTY_DRAFT = (parentFolder = ""): CatalogEditDraft => ({
  id: "custom-skill",
  name: "Новый скилл",
  description: "",
  triggers: "помоги, skill тест",
  tags: "custom, workshop",
  body: [
    "# Новый скилл",
    "",
    "1. Уточни задачу.",
    "2. Дай короткий ответ по шагам.",
    "3. Предложи следующий шаг.",
    "",
    "| Шаг | Действие |",
    "| --- | --- |",
    "| 1 | Уточнить |",
    "| 2 | Ответить |",
  ].join("\n"),
  enabled: false,
  parentFolder: sanitizeParentFolder(parentFolder),
});

function skillPathLabel(item: MiraCatalogItem): string {
  const folder = sanitizeParentFolder(item.folder);
  if (item.layout === "folder" && folder) return `${folder}/SKILL.md`;
  if (item.relativePath) {
    const m = item.relativePath.match(/(?:^|\/)skills\/(.+)$/);
    if (m?.[1]) return m[1].replace(/\\/g, "/");
  }
  return `${item.id}.md`;
}

/** Folder path that contains this skill (skills/<folder>/SKILL.md). */
function skillContainerFolder(item: MiraCatalogItem): string {
  return sanitizeParentFolder(item.folder);
}

function skillDraftSummary(d: CatalogEditDraft): string {
  const bits = [
    d.description.trim(),
    d.triggers.trim() ? `триггеры: ${d.triggers.trim()}` : "",
  ].filter(Boolean);
  return bits.join(" · ") || d.id;
}

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
    /** Create-session draft id (localStorage черновик). */
    draftId?: string;
    baseline?: CatalogEditDraft;
  } | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [folderDialog, setFolderDialog] = useState<{
    parent: string;
    id: string;
    busy: boolean;
    note: string;
  } | null>(null);
  const [draftsRev, setDraftsRev] = useState(0);

  const refresh = useCallback(async () => {
    if (!window.mira) {
      const rows = listLocalSkills();
      setItems(rows);
      setFolders(listLocalSkillFolders());
      setNote(`Browser-demo · ${rows.length} (localStorage)`);
      return;
    }
    const rows = await window.mira.listSkills();
    setItems(rows);
    const diskFolders = window.mira.listSkillFolders
      ? await window.mira.listSkillFolders()
      : collectSkillFolders(rows);
    setFolders(diskFolders);
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
        item.folder ?? "",
        ...(item.triggers ?? []),
        ...(item.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return sortCatalogItems(filtered, sort);
  }, [items, filter, query, sort]);

  /** Tree: group skills by parent folder path (skills/<folder>/…). */
  const skillTree = useMemo(() => {
    const map = new Map<string, MiraCatalogItem[]>();
    for (const item of visible) {
      const folder = sanitizeParentFolder(item.folder);
      const parts = folder.split("/").filter(Boolean);
      const parent =
        item.layout === "folder" && parts.length > 1
          ? parts.slice(0, -1).join("/")
          : item.layout === "folder" && parts.length === 1
            ? ""
            : folder || "";
      const key = parent || "(корень)";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    for (const f of folders) {
      const key = f || "(корень)";
      if (!map.has(key) && f) {
        // empty catalog folders still show as a group header
        map.set(f, []);
      }
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "(корень)") return -1;
      if (b[0] === "(корень)") return 1;
      return a[0].localeCompare(b[0], "en");
    });
  }, [visible, folders]);

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

  function stashCreateDraft(next: CatalogEditDraft, draftId: string, baseline: CatalogEditDraft) {
    if (!draftsDiffer(next, baseline)) {
      removeCatalogDraft(draftId);
      setDraftsRev((n) => n + 1);
      return;
    }
    upsertCatalogDraft({
      id: draftId,
      kind: "skill",
      title: next.name.trim() || "Новый скилл",
      summary: skillDraftSummary(next),
      payload: next,
    });
    setDraftsRev((n) => n + 1);
  }

  function openCreate(parentFolder = "") {
    const baseline = EMPTY_DRAFT(parentFolder);
    setEditor({
      mode: "create",
      draft: baseline,
      draftId: newCatalogDraftId(),
      baseline,
    });
  }

  function openCreateInside(item: MiraCatalogItem) {
    openCreate(skillContainerFolder(item));
  }

  function openFolderDialog(parent = "") {
    setFolderDialog({
      parent: sanitizeParentFolder(parent),
      id: "",
      busy: false,
      note: "",
    });
  }

  function openFolderInside(item: MiraCatalogItem) {
    openFolderDialog(skillContainerFolder(item));
  }

  async function persistFolder(folderPath: string) {
    const path = sanitizeParentFolder(folderPath);
    if (!path) {
      return { ok: false, detail: "Укажите id папки", folder: null as string | null };
    }
    if (window.mira?.createSkillFolder) {
      return window.mira.createSkillFolder(path);
    }
    return createLocalSkillFolder(path);
  }

  function resumeDraft(entry: CatalogDraftEntry) {
    const payload = entry.payload as CatalogEditDraft;
    if (!payload || typeof payload !== "object") return;
    setEditor({
      mode: "create",
      draft: {
        ...payload,
        parentFolder: sanitizeParentFolder(payload.parentFolder),
      },
      draftId: entry.id,
      baseline: EMPTY_DRAFT(),
    });
  }

  async function persist(draftIn: CatalogEditDraft) {
    const payload = {
      id: sanitizeSkillSegment(draftIn.id) || draftIn.id.trim(),
      name: draftIn.name.trim(),
      description: draftIn.description.trim(),
      triggers: parseCsv(draftIn.triggers),
      tags: parseCsv(draftIn.tags),
      enabled: draftIn.enabled,
      body: draftIn.body,
      parentFolder: sanitizeParentFolder(draftIn.parentFolder),
      asFolder: true as const,
    };
    if (!window.mira) {
      saveLocalSkill(payload);
    } else {
      await window.mira.saveSkill(payload);
    }
    if (editor?.draftId) {
      removeCatalogDraft(editor.draftId);
      setDraftsRev((n) => n + 1);
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
    const pathHint = skillPathLabel(item);
    const ok = await confirm({
      title: "Удалить skill",
      body: `Удалить skill «${item.name}» (${item.id})?\nБудет удалён ${item.layout === "folder" ? "каталог" : "файл"}: ${pathHint}`,
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

  async function importFromDisk(kind: "file" | "folder") {
    if (!window.mira?.pickAppPath || !window.mira.importSkill) {
      setNote(
        "Импорт доступен только в Electron — выберите .md или папку со SKILL.md",
      );
      return;
    }
    const picked = await window.mira.pickAppPath(kind);
    if (picked.canceled || !picked.path) return;
    const res = await window.mira.importSkill(picked.path);
    setNote(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
    if (res.ok) {
      await refresh();
      notifyCoreProgress();
      emitActionLog({
        title: "Skill импортирован",
        reason: res.detail,
        tag: "Мастерская",
        tone: "success",
      });
    }
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
            Сначала папка (id), внутри — ещё папка или скилл (
            <code>SKILL.md</code>). Установленные ≠ активные.
          </p>
        </div>
        <div className="catalog-sort">
          <span className="muted catalog-sort-caption">Сортировка</span>
          <div className="catalog-sort-controls">
            <ThemeSelect
              aria-label="Сортировка скиллов"
              value={sort}
              options={CATALOG_SORT_OPTIONS}
              onChange={(v) => changeSort(v as CatalogSort)}
            />
            <button
              type="button"
              className="btn"
              disabled={browserOnly}
              title={
                browserOnly
                  ? "Импорт только в Electron"
                  : "Импортировать .md / SKILL.md"
              }
              onClick={() => void importFromDisk("file")}
            >
              Импорт файла
            </button>
            <button
              type="button"
              className="btn"
              disabled={browserOnly}
              title={
                browserOnly
                  ? "Импорт только в Electron"
                  : "Импортировать папку-каталог со SKILL.md"
              }
              onClick={() => void importFromDisk("folder")}
            >
              Импорт папки
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => openFolderDialog("")}
            >
              + Папка
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openCreate("")}
            >
              + Скилл
            </button>
          </div>
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

      {visible.length === 0 && folders.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {items.length === 0
            ? "Пока пусто — «+ Папка» или «+ Скилл»."
            : "Ничего не найдено по запросу."}
        </p>
      ) : (
        <div className="skills-tree">
          {skillTree.map(([folderKey, groupItems]) => (
            <section key={folderKey} className="skills-tree-group">
              <div className="skills-tree-folder">
                <strong>
                  {folderKey === "(корень)"
                    ? "skills/"
                    : `skills/${folderKey}/`}
                </strong>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      openFolderDialog(
                        folderKey === "(корень)" ? "" : folderKey,
                      )
                    }
                  >
                    + Папка
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      openCreate(folderKey === "(корень)" ? "" : folderKey)
                    }
                  >
                    + Скилл
                  </button>
                </div>
              </div>
              {groupItems.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Пустая папка — добавьте скилл.
                </p>
              ) : (
                <div className="paths-grid">
                  {groupItems.map((item) => (
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
                  <div className="paths-card-kind" title={skillPathLabel(item)}>
                    Skill · {skillPathLabel(item)}
                  </div>
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
                {item.layout === "folder" ? (
                  <>
                    <button
                      type="button"
                      className="btn"
                      title="Создать папку внутри"
                      onClick={() => openFolderInside(item)}
                    >
                      + Папка
                    </button>
                    <button
                      type="button"
                      className="btn"
                      title="Создать скилл внутри"
                      onClick={() => openCreateInside(item)}
                    >
                      + Скилл
                    </button>
                  </>
                ) : null}
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
            </section>
          ))}
        </div>
      )}

      <CatalogDraftsSection
        kind="skill"
        revision={draftsRev}
        onResume={resumeDraft}
      />

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
          showFolderField={editor.mode === "create"}
          folderOptions={folders}
          markdownPreview
          confirmLabel={editor.mode === "edit" ? "Сохранить" : "Создать"}
          onClose={() => setEditor(null)}
          onDismiss={(next) => {
            if (editor.mode === "create" && editor.draftId && editor.baseline) {
              stashCreateDraft(next, editor.draftId, editor.baseline);
            }
          }}
          onSave={async (next) => {
            await persist(next);
          }}
          onCreateFolder={async (folderPath) => {
            const res = await persistFolder(folderPath);
            if (res.ok && res.folder) {
              setFolders((prev) =>
                [...new Set([...prev, res.folder!])].sort((a, b) =>
                  a.localeCompare(b, "en"),
                ),
              );
            }
            return res;
          }}
        />
      ) : null}

      {folderDialog
        ? createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!folderDialog.busy) setFolderDialog(null);
              }}
            >
              <form
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="skill-folder-title"
                onClick={(e) => e.stopPropagation()}
                onSubmit={(e) => {
                  e.preventDefault();
                  void (async () => {
                    setFolderDialog((d) =>
                      d ? { ...d, busy: true, note: "" } : d,
                    );
                    const res = await persistFolder(
                      joinSkillFolder(folderDialog.parent, folderDialog.id),
                    );
                    if (res.ok && res.folder) {
                      setFolders((prev) =>
                        [...new Set([...prev, res.folder!])].sort((a, b) =>
                          a.localeCompare(b, "en"),
                        ),
                      );
                      setNote(res.detail);
                      setFolderDialog(null);
                      return;
                    }
                    setFolderDialog((d) =>
                      d
                        ? {
                            ...d,
                            busy: false,
                            note: res.detail || "Не удалось создать папку",
                          }
                        : d,
                    );
                  })();
                }}
              >
                <h2 id="skill-folder-title" style={{ margin: 0 }}>
                  Новая папка
                </h2>
                <p className="muted" style={{ margin: 0 }}>
                  Внутри можно будет добавить ещё папку или скилл (
                  <code>SKILL.md</code>).
                </p>
                <label className="field-label">
                  Родитель
                  <ThemeSelect
                    aria-label="Родительская папка"
                    value={folderDialog.parent}
                    disabled={folderDialog.busy}
                    options={[
                      { value: "", label: "skills/ (корень)" },
                      ...folders.map((f) => ({
                        value: f,
                        label: `skills/${f}/`,
                      })),
                    ]}
                    onChange={(v) =>
                      setFolderDialog((d) =>
                        d
                          ? { ...d, parent: sanitizeParentFolder(v) }
                          : d,
                      )
                    }
                  />
                </label>
                <label className="field-label">
                  Id папки
                  <input
                    className="mono"
                    value={folderDialog.id}
                    disabled={folderDialog.busy}
                    required
                    placeholder="например animation"
                    onChange={(e) =>
                      setFolderDialog((d) =>
                        d ? { ...d, id: e.target.value } : d,
                      )
                    }
                  />
                </label>
                <p className="muted field-hint" style={{ margin: 0 }}>
                  Путь →{" "}
                  <code>
                    skills/
                    {joinSkillFolder(folderDialog.parent, folderDialog.id) ||
                      "…"}
                    /
                  </code>
                </p>
                {folderDialog.note ? (
                  <p className="muted" style={{ margin: 0 }}>
                    {folderDialog.note}
                  </p>
                ) : null}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={folderDialog.busy}
                    onClick={() => setFolderDialog(null)}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={folderDialog.busy || !folderDialog.id.trim()}
                  >
                    Создать папку
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
