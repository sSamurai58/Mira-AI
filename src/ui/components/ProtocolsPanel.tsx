import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { emitActionLog } from "../actionLog";
import {
  deleteLocalProtocol,
  listLocalProtocols,
  saveLocalProtocol,
  setLocalProtocolEnabled,
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
  loadCatalogSort,
  saveCatalogSort,
  sortCatalogItems,
  type CatalogSort,
} from "../catalogSort";
import { listLocalCustomCommands } from "../customCommandsLocal";
import { notifyCoreProgress } from "../coreLevel";
import {
  emptyActionStep,
  emptyCommandStep,
  parseProtocolSequence,
  PROTOCOL_ACTION_LABEL,
  PROTOCOL_ACTION_TYPES,
  PROTOCOL_QUICK_ADD,
  PROTOCOL_VALUELESS,
  serializeProtocolSequence,
  stepPlaceholder,
  summarizeProtocolSteps,
  type ProtocolActionType,
  type ProtocolSeqStep,
} from "../protocolSequence";
import { useAppConfirm } from "./AppConfirm";
import { CatalogDraftsSection } from "./CatalogDraftsSection";
import { StubBadge } from "./StubBadge";
import { ThemeSelect } from "./ThemeSelect";
import {
  encodeLaunchValue,
  MONITOR_OPTIONS,
  parseLaunchValue,
  selectValueToMonitor,
  WINDOW_PLACE_OPTIONS,
  type WindowPlacement,
} from "../windowLayout";

type FilterId = "all" | "enabled" | "disabled";

type CommandOption = { id: string; name: string; enabled: boolean };
type AppPathOption = {
  id: string;
  name: string;
  path: string;
  kind: "program" | "folder" | "file";
};

type ProtocolDraft = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  tags: string[];
  steps: ProtocolSeqStep[];
  notes: string;
  enabled: boolean;
  /** True when editing an existing catalog id (lock id field). */
  idLocked: boolean;
};

const SORT_KEY = "mira.protocols.sort";

type StepKind = "command" | ProtocolActionType;

function stepKindLabel(kind: StepKind): string {
  if (kind === "command") return "Кастомная команда";
  return PROTOCOL_ACTION_LABEL[kind];
}

function stepKindOf(step: ProtocolSeqStep): StepKind {
  return step.type === "command" ? "command" : step.action;
}

function emptyDraft(): ProtocolDraft {
  return {
    id: "custom-protocol",
    name: "Новый протокол",
    description: "",
    triggers: ["протокол тест"],
    tags: ["custom"],
    steps: [emptyActionStep("say"), emptyCommandStep()],
    notes: "",
    enabled: true,
    idLocked: false,
  };
}

function protocolDraftSummary(d: ProtocolDraft): string {
  const bits = [
    d.description.trim(),
    `${d.steps.length} шагов`,
    d.triggers.length ? `триггеры: ${d.triggers.slice(0, 2).join(", ")}` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}

/** Compare create drafts without volatile step ids. */
function protocolDraftFingerprint(d: ProtocolDraft): unknown {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    triggers: d.triggers,
    tags: d.tags,
    notes: d.notes,
    enabled: d.enabled,
    steps: d.steps.map((s) =>
      s.type === "command"
        ? { type: "command", commandId: s.commandId }
        : { type: "action", action: s.action, value: s.value },
    ),
  };
}

function draftFromItem(item: MiraCatalogItem): ProtocolDraft {
  const parsed = parseProtocolSequence(item.body);
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    triggers: [...(item.triggers ?? [])],
    tags: [...(item.tags ?? [])],
    steps: parsed.steps.length
      ? parsed.steps
      : [emptyActionStep("say")],
    notes: parsed.notes,
    enabled: item.enabled,
    idLocked: true,
  };
}

function stepsReady(steps: ProtocolSeqStep[]): { ok: boolean; detail: string } {
  if (!steps.length) {
    return { ok: false, detail: "Добавьте хотя бы один шаг" };
  }
  for (const s of steps) {
    if (s.type === "command" && !s.commandId.trim()) {
      return {
        ok: false,
        detail: "Выберите кастомную команду для каждого шага «Кастомная команда»",
      };
    }
    if (
      s.type === "action" &&
      !PROTOCOL_VALUELESS.includes(s.action) &&
      s.action !== "clipboard_paste" &&
      !s.value.trim()
    ) {
      return {
        ok: false,
        detail: `Заполните значение для шага «${PROTOCOL_ACTION_LABEL[s.action]}»`,
      };
    }
  }
  return { ok: true, detail: "" };
}

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
  const [commands, setCommands] = useState<CommandOption[]>([]);
  const [appPaths, setAppPaths] = useState<AppPathOption[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<CatalogSort>(() =>
    loadCatalogSort(SORT_KEY, "name"),
  );
  const [note, setNote] = useState("");
  const [runLog, setRunLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<ProtocolDraft | null>(null);
  const [createDraftId, setCreateDraftId] = useState<string | null>(null);
  const [draftsRev, setDraftsRev] = useState(0);
  const [triggerDraft, setTriggerDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [openStepMenu, setOpenStepMenu] = useState<string | null>(null);

  const refreshCommands = useCallback(async () => {
    if (!window.mira?.listCustomCommands) {
      setCommands(
        listLocalCustomCommands().map((c) => ({
          id: c.id,
          name: c.name,
          enabled: c.enabled,
        })),
      );
      return;
    }
    const rows = await window.mira.listCustomCommands();
    setCommands(
      rows.map((c) => ({ id: c.id, name: c.name, enabled: c.enabled })),
    );
  }, []);

  const refreshPaths = useCallback(async () => {
    if (!window.mira?.listAppPaths) {
      setAppPaths([]);
      return;
    }
    try {
      const rows = await window.mira.listAppPaths();
      setAppPaths(
        rows
          .filter((r) => r.enabled)
          .map((r) => ({
            id: r.id,
            name: r.name,
            path: r.path,
            kind: r.kind,
          })),
      );
    } catch {
      setAppPaths([]);
    }
  }, []);

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
    void refreshCommands();
    void refreshPaths();
  }, [refresh, refreshCommands, refreshPaths]);

  useEffect(() => {
    if (!openStepMenu) return;
    const onDoc = () => setOpenStepMenu(null);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openStepMenu]);

  const commandNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of commands) m.set(c.id, c.name);
    return m;
  }, [commands]);

  const commandSelectOptions = useMemo(
    () => [
      { value: "", label: "Выберите команду…" },
      ...commands.map((c) => ({
        value: c.id,
        label: c.enabled ? c.name : `${c.name} (выкл)`,
      })),
    ],
    [commands],
  );

  const pathSelectOptions = useMemo(
    () => [
      { value: "", label: "Из библиотеки Путей…" },
      ...appPaths.map((p) => ({
        value: p.id,
        label: p.path ? `${p.name} · ${p.path}` : p.name,
      })),
    ],
    [appPaths],
  );

  const launchPathOptions = pathSelectOptions;

  const folderPathOptions = useMemo(
    () => [
      { value: "", label: "Папка из Путей…" },
      ...appPaths
        .filter((p) => p.kind === "folder" || !p.kind)
        .map((p) => ({
          value: p.id,
          label: p.path ? `${p.name} · ${p.path}` : p.name,
        })),
    ],
    [appPaths],
  );

  const stepKindOptions = useMemo(
    () => [
      { value: "command", label: "Кастомная команда" },
      ...PROTOCOL_ACTION_TYPES.map((t) => ({
        value: t,
        label: PROTOCOL_ACTION_LABEL[t],
      })),
    ],
    [],
  );

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

  function stashProtocolDraft(next: ProtocolDraft, draftId: string) {
    if (
      !draftsDiffer(
        protocolDraftFingerprint(next),
        protocolDraftFingerprint(emptyDraft()),
      )
    ) {
      removeCatalogDraft(draftId);
      setDraftsRev((n) => n + 1);
      return;
    }
    upsertCatalogDraft({
      id: draftId,
      kind: "protocol",
      title: next.name.trim() || "Новый протокол",
      summary: protocolDraftSummary(next),
      payload: next,
    });
    setDraftsRev((n) => n + 1);
  }

  function closeEditor(saveDraft: boolean) {
    if (saveDraft && editor && createDraftId && !editor.idLocked) {
      stashProtocolDraft(editor, createDraftId);
    }
    setEditor(null);
    setCreateDraftId(null);
    setTriggerDraft("");
    setTagDraft("");
  }

  function openCreate() {
    setEditor(emptyDraft());
    setCreateDraftId(newCatalogDraftId());
    setTriggerDraft("");
    setTagDraft("");
    setNote("");
    void refreshCommands();
    void refreshPaths();
  }

  function openEdit(item: MiraCatalogItem) {
    setEditor(draftFromItem(item));
    setCreateDraftId(null);
    setTriggerDraft("");
    setTagDraft("");
    setNote("");
    void refreshCommands();
    void refreshPaths();
  }

  function resumeDraft(entry: CatalogDraftEntry) {
    const payload = entry.payload as ProtocolDraft;
    if (!payload || typeof payload !== "object") return;
    setEditor({
      ...emptyDraft(),
      ...payload,
      idLocked: false,
      triggers: Array.isArray(payload.triggers) ? [...payload.triggers] : [],
      tags: Array.isArray(payload.tags) ? [...payload.tags] : [],
      steps: Array.isArray(payload.steps)
        ? payload.steps.map((s) => ({ ...s }))
        : emptyDraft().steps,
    });
    setCreateDraftId(entry.id);
    setTriggerDraft("");
    setTagDraft("");
    setNote("");
    void refreshCommands();
    void refreshPaths();
  }

  function addChip(
    kind: "triggers" | "tags",
    draft: string,
    setDraft: (v: string) => void,
  ) {
    if (!editor) return;
    const t = draft.trim();
    if (!t) return;
    const list = editor[kind];
    if (list.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setDraft("");
      return;
    }
    setEditor({ ...editor, [kind]: [...list, t] });
    setDraft("");
  }

  function onChipKeyDown(
    e: KeyboardEvent<HTMLInputElement>,
    kind: "triggers" | "tags",
    draft: string,
    setDraft: (v: string) => void,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      addChip(kind, draft, setDraft);
    } else if (
      e.key === "Backspace" &&
      !draft &&
      editor &&
      editor[kind].length
    ) {
      setEditor({ ...editor, [kind]: editor[kind].slice(0, -1) });
    }
  }

  function addStep(kind: StepKind) {
    if (!editor) return;
    const step =
      kind === "command" ? emptyCommandStep() : emptyActionStep(kind);
    setEditor({ ...editor, steps: [...editor.steps, step] });
  }

  function setStepKind(id: string, kind: StepKind) {
    if (!editor) return;
    setEditor({
      ...editor,
      steps: editor.steps.map((s) => {
        if (s.id !== id) return s;
        if (kind === "command") {
          return {
            id: s.id,
            type: "command",
            commandId: s.type === "command" ? s.commandId : "",
          };
        }
        const prevValue = s.type === "action" ? s.value : "";
        return {
          id: s.id,
          type: "action",
          action: kind,
          value:
            kind === "pause" && !prevValue
              ? "1"
              : kind === "click" && !prevValue
                ? "100, 200"
                : PROTOCOL_VALUELESS.includes(kind)
                  ? ""
                  : prevValue,
        };
      }),
    });
  }

  function updateStep(
    id: string,
    patch: { commandId?: string; value?: string },
  ) {
    if (!editor) return;
    setEditor({
      ...editor,
      steps: editor.steps.map((s) => {
        if (s.id !== id) return s;
        if (s.type === "command" && patch.commandId != null) {
          return { ...s, commandId: patch.commandId };
        }
        if (s.type === "action" && patch.value != null) {
          return { ...s, value: patch.value };
        }
        return s;
      }),
    });
  }

  async function browseLaunch(
    stepId: string,
    kind: "program" | "folder" = "program",
  ) {
    if (!editor) return;
    if (!window.mira?.pickAppPath) {
      setNote("Выбор файла доступен в Electron");
      return;
    }
    const res = await window.mira.pickAppPath(kind);
    if (res.canceled || !res.path) return;
    if (kind === "program") {
      const step = editor.steps.find((s) => s.id === stepId);
      const layout = parseLaunchValue(
        step && step.type === "action" ? step.value : "",
      );
      updateStep(stepId, {
        value: encodeLaunchValue({ ...layout, target: res.path }),
      });
      return;
    }
    updateStep(stepId, { value: res.path });
  }

  function moveStep(id: string, dir: -1 | 1) {
    if (!editor) return;
    const idx = editor.steps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= editor.steps.length) return;
    const steps = [...editor.steps];
    const tmp = steps[idx]!;
    steps[idx] = steps[next]!;
    steps[next] = tmp;
    setEditor({ ...editor, steps });
  }

  function removeStep(id: string) {
    if (!editor) return;
    setEditor({
      ...editor,
      steps: editor.steps.filter((s) => s.id !== id),
    });
  }

  async function persistDraft(draft: ProtocolDraft) {
    const body = serializeProtocolSequence(draft.steps, draft.notes);
    const payload = {
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      triggers: draft.triggers,
      tags: draft.tags,
      enabled: draft.enabled,
      body,
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

  async function saveEditor(e: FormEvent) {
    e.preventDefault();
    if (!editor || !editor.id.trim() || !editor.name.trim()) return;
    const ready = stepsReady(editor.steps);
    if (!ready.ok) {
      setNote(ready.detail);
      return;
    }
    // Flush pending chips
    const next = { ...editor };
    const td = triggerDraft.trim();
    if (
      td &&
      !next.triggers.some((x) => x.toLowerCase() === td.toLowerCase())
    ) {
      next.triggers = [...next.triggers, td];
    }
    const gd = tagDraft.trim();
    if (gd && !next.tags.some((x) => x.toLowerCase() === gd.toLowerCase())) {
      next.tags = [...next.tags, gd];
    }
    setBusy(true);
    try {
      await persistDraft(next);
      if (createDraftId) {
        removeCatalogDraft(createDraftId);
        setDraftsRev((n) => n + 1);
      }
      setEditor(null);
      setCreateDraftId(null);
      setTriggerDraft("");
      setTagDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function testEditor() {
    if (!editor) return;
    const ready = stepsReady(editor.steps);
    if (!ready.ok) {
      setNote(ready.detail);
      return;
    }
    setBusy(true);
    try {
      await persistDraft(editor);
      if (!window.mira?.runProtocolSequence) {
        setNote("Проверка доступна в Electron");
        return;
      }
      const res = await window.mira.runProtocolSequence(editor.id.trim(), {
        dryRun: true,
      });
      setRunLog(res.detail || res.reply);
      setNote(res.ok ? "Проверка ок" : "Проверка с ошибками");
      emitActionLog({
        title: "Проверка протокола",
        reason: editor.name,
        tag: "Мастерская",
        tone: res.ok ? "accent" : "warning",
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    if (!window.mira) {
      setLocalProtocolEnabled(id, enabled);
    } else {
      await window.mira.setProtocolEnabled(id, enabled);
    }
    await refresh();
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
    if (editor?.id === item.id) setEditor(null);
    if (res.ok) await refresh();
  }

  async function runProtocol(item: MiraCatalogItem) {
    if (!window.mira) {
      setRunLog("Run доступен в Electron");
      return;
    }
    const { isSequence } = parseProtocolSequence(item.body);
    setBusy(true);
    setRunLog("Запуск…");
    try {
      if (isSequence && window.mira.runProtocolSequence) {
        const res = await window.mira.runProtocolSequence(item.id, {
          dryRun: false,
        });
        setRunLog(res.reply || res.detail);
        emitActionLog({
          title: res.ok ? "Протокол выполнен" : "Протокол с ошибками",
          reason: item.name,
          tag: "Мастерская",
          tone: res.ok ? "success" : "warning",
        });
        setBusy(false);
        return;
      }
      // Legacy LLM protocol body
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
          setBusy(false);
        }
        if (event.type === "error") {
          setRunLog(`error: ${event.message}`);
          off();
          setBusy(false);
        }
      });
      await window.mira.sendChat({
        sessionId: null,
        text: `Выполни протокол ${item.id}`,
        requestId,
        forceProtocolId: item.id,
      });
    } catch (err) {
      setBusy(false);
      setRunLog(err instanceof Error ? err.message : String(err));
    }
  }

  const countLabel =
    counts.all === 1
      ? "1 протокол"
      : counts.all >= 2 && counts.all <= 4
        ? `${counts.all} протокола`
        : `${counts.all} протоколов`;

  const editorModal =
    editor && typeof document !== "undefined"
      ? createPortal(
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => {
              if (!busy) closeEditor(true);
            }}
          >
            <form
              className="modal modal-wide modal-resizable catalog-edit-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="protocol-edit-title"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => void saveEditor(e)}
            >
              <div className="row" style={{ alignItems: "flex-start" }}>
                <h2 id="protocol-edit-title" style={{ margin: 0, flex: 1 }}>
                  {editor.idLocked
                    ? `Править протокол · ${editor.id}`
                    : "Новый протокол"}
                </h2>
                <button
                  type="button"
                  className="btn catalog-edit-close"
                  aria-label="Закрыть"
                  disabled={busy}
                  onClick={() => closeEditor(true)}
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
                  value={editor.id}
                  disabled={editor.idLocked || busy}
                  required
                  onChange={(e) =>
                    setEditor({ ...editor, id: e.target.value })
                  }
                />
              </label>
              <label className="field-label">
                Название
                <input
                  value={editor.name}
                  disabled={busy}
                  required
                  onChange={(e) =>
                    setEditor({ ...editor, name: e.target.value })
                  }
                />
              </label>
              <label className="field-label">
                Описание
                <input
                  value={editor.description}
                  disabled={busy}
                  placeholder="Кратко, что делает протокол"
                  onChange={(e) =>
                    setEditor({ ...editor, description: e.target.value })
                  }
                />
              </label>

              <label className="field-label">
                Триггеры
                <div className="paths-tags-input">
                  {editor.triggers.map((t) => (
                    <span key={t} className="paths-tag-chip">
                      {t}
                      <button
                        type="button"
                        className="paths-tag-remove"
                        aria-label={`Удалить «${t}»`}
                        disabled={busy}
                        onClick={() =>
                          setEditor({
                            ...editor,
                            triggers: editor.triggers.filter((x) => x !== t),
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    value={triggerDraft}
                    disabled={busy}
                    placeholder="Фраза и Enter"
                    onChange={(e) => setTriggerDraft(e.target.value)}
                    onKeyDown={(e) =>
                      onChipKeyDown(e, "triggers", triggerDraft, setTriggerDraft)
                    }
                    onBlur={() =>
                      addChip("triggers", triggerDraft, setTriggerDraft)
                    }
                  />
                </div>
              </label>

              <label className="field-label">
                Теги
                <div className="paths-tags-input">
                  {editor.tags.map((t) => (
                    <span key={t} className="paths-tag-chip">
                      {t}
                      <button
                        type="button"
                        className="paths-tag-remove"
                        aria-label={`Удалить тег «${t}»`}
                        disabled={busy}
                        onClick={() =>
                          setEditor({
                            ...editor,
                            tags: editor.tags.filter((x) => x !== t),
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
                    placeholder="Тег и Enter"
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) =>
                      onChipKeyDown(e, "tags", tagDraft, setTagDraft)
                    }
                    onBlur={() => addChip("tags", tagDraft, setTagDraft)}
                  />
                </div>
              </label>

              <div className="cc-chain">
                <div className="field-label" style={{ marginBottom: 8 }}>
                  Последовательность шагов
                </div>
                <p
                  className="muted"
                  style={{ margin: "0 0 10px", fontSize: "0.85rem" }}
                >
                  Кастомные команды из Мастерской или действия напрямую: сайт,
                  запуск, клавиши, клик, буфер, терминал, сказать, пауза…
                </p>

                <div className="cc-steps">
                  {editor.steps.map((step, idx) => {
                    const kind = stepKindOf(step);
                    return (
                      <div key={step.id} className="cc-step">
                        <span className="cc-step-num" aria-hidden>
                          {idx + 1}
                        </span>

                        <div className="cc-step-type-wrap">
                          <button
                            type="button"
                            className="cc-step-type"
                            disabled={busy}
                            aria-haspopup="listbox"
                            aria-expanded={openStepMenu === step.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenStepMenu(
                                openStepMenu === step.id ? null : step.id,
                              );
                            }}
                          >
                            {stepKindLabel(kind)}
                            <span className="cc-chevron" aria-hidden>
                              ▾
                            </span>
                          </button>
                          {openStepMenu === step.id ? (
                            <ul
                              className="cc-type-menu"
                              role="listbox"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {stepKindOptions.map((opt) => (
                                <li key={opt.value}>
                                  <button
                                    type="button"
                                    className={
                                      opt.value === kind
                                        ? "cc-type-option is-active"
                                        : "cc-type-option"
                                    }
                                    role="option"
                                    aria-selected={opt.value === kind}
                                    onClick={() => {
                                      setStepKind(
                                        step.id,
                                        opt.value as StepKind,
                                      );
                                      setOpenStepMenu(null);
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>

                        <div className="cc-step-value">
                          {step.type === "command" ? (
                            <ThemeSelect
                              className="cc-path-select"
                              aria-label="Кастомная команда"
                              value={step.commandId}
                              options={commandSelectOptions}
                              disabled={busy}
                              onChange={(id) =>
                                updateStep(step.id, { commandId: id })
                              }
                            />
                          ) : PROTOCOL_VALUELESS.includes(step.action) ? (
                            <span
                              className="muted"
                              style={{ fontSize: "0.85rem" }}
                            >
                              {step.action === "window_minimize_all"
                                ? "Win+D — свернуть всё"
                                : step.action.startsWith("desktop_")
                                  ? "Виртуальные столы Windows"
                                  : "Best-effort для активного окна"}
                            </span>
                          ) : step.action === "window_snap" ? (
                            <ThemeSelect
                              className="cc-path-select"
                              aria-label="Раскладка окна"
                              value={step.value || "left"}
                              options={WINDOW_PLACE_OPTIONS.filter(
                                (o) => o.id !== "default",
                              ).map((o) => ({
                                value: o.id,
                                label: o.label,
                              }))}
                              disabled={busy}
                              onChange={(id) =>
                                updateStep(step.id, { value: id })
                              }
                            />
                          ) : step.action === "desktop_switch" ? (
                            <ThemeSelect
                              className="cc-path-select"
                              aria-label="Направление стола"
                              value={
                                step.value === "prev" || step.value === "left"
                                  ? "prev"
                                  : "next"
                              }
                              options={[
                                { value: "next", label: "Следующий стол" },
                                { value: "prev", label: "Предыдущий стол" },
                              ]}
                              disabled={busy}
                              onChange={(id) =>
                                updateStep(step.id, { value: id })
                              }
                            />
                          ) : step.action === "open_path" ? (
                            <div
                              className="row"
                              style={{ gap: 8, flex: 1, minWidth: 0 }}
                            >
                              {appPaths.length > 0 ? (
                                <ThemeSelect
                                  className="cc-path-select"
                                  aria-label="Путь из Путей"
                                  value={
                                    appPaths.some((p) => p.id === step.value)
                                      ? step.value
                                      : ""
                                  }
                                  options={pathSelectOptions}
                                  disabled={busy}
                                  onChange={(id) =>
                                    updateStep(step.id, { value: id })
                                  }
                                />
                              ) : null}
                              <input
                                style={{ flex: 1, minWidth: 0 }}
                                value={step.value}
                                disabled={busy}
                                placeholder={stepPlaceholder(step.action)}
                                onChange={(e) =>
                                  updateStep(step.id, {
                                    value: e.target.value,
                                  })
                                }
                              />
                            </div>
                          ) : step.action === "launch" ? (
                            (() => {
                              const layout = parseLaunchValue(step.value);
                              const fromLibrary = appPaths.some(
                                (p) => p.id === layout.target,
                              );
                              return (
                                <div
                                  className="stack"
                                  style={{ gap: 8, flex: 1, minWidth: 0 }}
                                >
                                  <div
                                    className="row"
                                    style={{ gap: 8, flex: 1, minWidth: 0 }}
                                  >
                                    {appPaths.length > 0 ? (
                                      <ThemeSelect
                                        className="cc-path-select"
                                        aria-label="Приложение из Путей"
                                        value={
                                          fromLibrary ? layout.target : ""
                                        }
                                        options={launchPathOptions}
                                        disabled={busy}
                                        onChange={(id) =>
                                          updateStep(step.id, {
                                            value: encodeLaunchValue({
                                              ...layout,
                                              target: id,
                                            }),
                                          })
                                        }
                                      />
                                    ) : null}
                                    <input
                                      style={{ flex: 1, minWidth: 0 }}
                                      value={
                                        fromLibrary
                                          ? appPaths.find(
                                              (p) => p.id === layout.target,
                                            )?.path || layout.target
                                          : layout.target
                                      }
                                      disabled={busy || fromLibrary}
                                      placeholder={stepPlaceholder(
                                        step.action,
                                      )}
                                      onChange={(e) =>
                                        updateStep(step.id, {
                                          value: encodeLaunchValue({
                                            ...layout,
                                            target: e.target.value,
                                          }),
                                        })
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="btn"
                                      disabled={busy}
                                      onClick={() => {
                                        if (fromLibrary) {
                                          updateStep(step.id, {
                                            value: encodeLaunchValue({
                                              ...layout,
                                              target: "",
                                            }),
                                          });
                                        }
                                        void browseLaunch(step.id, "program");
                                      }}
                                    >
                                      Выбрать
                                    </button>
                                  </div>
                                  <div
                                    className="row"
                                    style={{ gap: 8, flexWrap: "wrap" }}
                                  >
                                    <ThemeSelect
                                      className="cc-path-select"
                                      aria-label="Раскладка при запуске"
                                      value={layout.place}
                                      options={WINDOW_PLACE_OPTIONS.map(
                                        (o) => ({
                                          value: o.id,
                                          label: o.label,
                                        }),
                                      )}
                                      disabled={busy}
                                      onChange={(id) =>
                                        updateStep(step.id, {
                                          value: encodeLaunchValue({
                                            ...layout,
                                            place: id as WindowPlacement,
                                          }),
                                        })
                                      }
                                    />
                                    <ThemeSelect
                                      className="cc-path-select"
                                      aria-label="Монитор"
                                      value={String(layout.monitor)}
                                      options={MONITOR_OPTIONS.map((o) => ({
                                        value: o.id,
                                        label: o.label,
                                      }))}
                                      disabled={busy}
                                      onChange={(id) =>
                                        updateStep(step.id, {
                                          value: encodeLaunchValue({
                                            ...layout,
                                            monitor: selectValueToMonitor(id),
                                          }),
                                        })
                                      }
                                    />
                                  </div>
                                </div>
                              );
                            })()
                          ) : step.action === "open_folder" ? (
                            <div
                              className="row"
                              style={{ gap: 8, flex: 1, minWidth: 0 }}
                            >
                              {appPaths.length > 0 ? (
                                <ThemeSelect
                                  className="cc-path-select"
                                  aria-label="Папка из Путей"
                                  value={
                                    appPaths.some((p) => p.id === step.value)
                                      ? step.value
                                      : ""
                                  }
                                  options={folderPathOptions}
                                  disabled={busy}
                                  onChange={(id) =>
                                    updateStep(step.id, { value: id })
                                  }
                                />
                              ) : null}
                              <input
                                style={{ flex: 1, minWidth: 0 }}
                                value={
                                  appPaths.some((p) => p.id === step.value)
                                    ? appPaths.find((p) => p.id === step.value)
                                        ?.path || step.value
                                    : step.value
                                }
                                disabled={
                                  busy ||
                                  appPaths.some((p) => p.id === step.value)
                                }
                                placeholder={stepPlaceholder(step.action)}
                                onChange={(e) =>
                                  updateStep(step.id, {
                                    value: e.target.value,
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    appPaths.some((p) => p.id === step.value)
                                  ) {
                                    updateStep(step.id, { value: "" });
                                  }
                                  void browseLaunch(step.id, "folder");
                                }}
                              >
                                Выбрать
                              </button>
                            </div>
                          ) : (
                            <input
                              value={step.value}
                              disabled={busy}
                              placeholder={stepPlaceholder(step.action)}
                              onChange={(e) =>
                                updateStep(step.id, {
                                  value: e.target.value,
                                })
                              }
                            />
                          )}
                        </div>

                        <div className="cc-step-controls">
                          <button
                            type="button"
                            className="cc-icon-btn"
                            aria-label="Выше"
                            disabled={busy || idx === 0}
                            onClick={() => moveStep(step.id, -1)}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="cc-icon-btn"
                            aria-label="Ниже"
                            disabled={
                              busy || idx === editor.steps.length - 1
                            }
                            onClick={() => moveStep(step.id, 1)}
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            className="cc-icon-btn"
                            aria-label="Удалить шаг"
                            disabled={busy}
                            onClick={() => removeStep(step.id)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className="cc-quick-add"
                  role="group"
                  aria-label="Добавить шаг"
                >
                  {PROTOCOL_QUICK_ADD.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className="cc-pill"
                      disabled={busy}
                      onClick={() => addStep(kind)}
                    >
                      + {stepKindLabel(kind)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="row" style={{ gap: 8, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={editor.enabled}
                  disabled={busy}
                  onChange={(e) =>
                    setEditor({ ...editor, enabled: e.target.checked })
                  }
                />
                <span>установлен / включён</span>
              </label>

              <div className="modal-actions row" style={{ gap: 10 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => closeEditor(true)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void testEditor()}
                >
                  Проверить
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !editor.id.trim() || !editor.name.trim()}
                >
                  {editor.idLocked ? "Сохранить" : "Создать"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )
      : null;

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
            Последовательности: команды и действия (сайт, клавиши, терминал…).
            Триггер из Диалога или Run на карточке.
          </p>
        </div>
        <div className="catalog-sort">
          <span className="muted catalog-sort-caption">Сортировка</span>
          <div className="catalog-sort-controls">
            <ThemeSelect
              aria-label="Сортировка протоколов"
              value={sort}
              options={CATALOG_SORT_OPTIONS}
              onChange={(v) => changeSort(v as CatalogSort)}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={openCreate}
            >
              + Создать
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
        <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
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
          {visible.map((item) => {
            const parsed = parseProtocolSequence(item.body);
            const summary = parsed.isSequence
              ? summarizeProtocolSteps(parsed.steps, commandNameById)
              : "LLM · текстовые шаги";
            return (
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
                    <div className="paths-card-kind">
                      Protocol · {item.id}
                    </div>
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
                  className={`paths-card-path mono ${summary ? "" : "is-empty"}`}
                  title={summary}
                >
                  {summary}
                </div>

                <div className="paths-card-tags">
                  {(item.triggers ?? []).length === 0 &&
                  (item.tags ?? []).length === 0 ? (
                    <span className="paths-tags-empty">
                      Нет триггеров и тегов
                    </span>
                  ) : (
                    <>
                      {(item.triggers ?? []).slice(0, 4).map((t) => (
                        <span
                          key={`t-${t}`}
                          className="paths-tag-chip is-readonly"
                        >
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
                    disabled={busy || browserOnly}
                    onClick={() => void runProtocol(item)}
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    className="btn paths-edit-btn"
                    disabled={busy}
                    onClick={() => openEdit(item)}
                  >
                    Править
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger paths-delete-btn"
                    disabled={busy}
                    onClick={() => void removeItem(item)}
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
        kind="protocol"
        revision={draftsRev}
        onResume={resumeDraft}
      />

      {runLog ? (
        <pre
          className="mono catalog-run-log"
          style={{ whiteSpace: "pre-wrap", margin: 0 }}
        >
          {runLog}
        </pre>
      ) : null}

      {editorModal}
    </div>
  );
}
