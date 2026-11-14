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
  CATALOG_SORT_OPTIONS,
  loadCatalogSort,
  saveCatalogSort,
  sortCatalogItems,
  type CatalogSort,
} from "../catalogSort";
import { listLocalCustomCommands } from "../customCommandsLocal";
import { notifyCoreProgress } from "../coreLevel";
import {
  emptyCommandStep,
  newProtocolStepId,
  parseProtocolSequence,
  serializeProtocolSequence,
  summarizeProtocolSteps,
  type ProtocolSeqStep,
} from "../protocolSequence";
import { useAppConfirm } from "./AppConfirm";
import { StubBadge } from "./StubBadge";
import { ThemeSelect } from "./ThemeSelect";

type FilterId = "all" | "enabled" | "disabled";

type CommandOption = { id: string; name: string; enabled: boolean };

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

const STEP_TYPE_LABEL: Record<ProtocolSeqStep["type"], string> = {
  command: "Команда",
  say: "Сказать",
  pause: "Пауза",
};

function emptyDraft(): ProtocolDraft {
  return {
    id: "custom-protocol",
    name: "Новый протокол",
    description: "",
    triggers: ["протокол тест"],
    tags: ["custom"],
    steps: [emptyCommandStep()],
    notes: "",
    enabled: true,
    idLocked: false,
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
    steps: parsed.steps.length ? parsed.steps : [emptyCommandStep()],
    notes: parsed.notes,
    enabled: item.enabled,
    idLocked: true,
  };
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<CatalogSort>(() =>
    loadCatalogSort(SORT_KEY, "name"),
  );
  const [note, setNote] = useState("");
  const [runLog, setRunLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<ProtocolDraft | null>(null);
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
  }, [refresh, refreshCommands]);

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

  function openCreate() {
    setEditor(emptyDraft());
    setTriggerDraft("");
    setTagDraft("");
    setNote("");
    void refreshCommands();
  }

  function openEdit(item: MiraCatalogItem) {
    setEditor(draftFromItem(item));
    setTriggerDraft("");
    setTagDraft("");
    setNote("");
    void refreshCommands();
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

  function addStep(type: ProtocolSeqStep["type"]) {
    if (!editor) return;
    let step: ProtocolSeqStep;
    if (type === "command") step = emptyCommandStep();
    else if (type === "say")
      step = { id: newProtocolStepId(), type: "say", value: "" };
    else step = { id: newProtocolStepId(), type: "pause", value: "1" };
    setEditor({ ...editor, steps: [...editor.steps, step] });
  }

  function updateStep(
    id: string,
    patch:
      | { type: "command"; commandId?: string }
      | { type: "say"; value?: string }
      | { type: "pause"; value?: string }
      | { commandId: string }
      | { value: string },
  ) {
    if (!editor) return;
    setEditor({
      ...editor,
      steps: editor.steps.map((s) => {
        if (s.id !== id) return s;
        if ("type" in patch && patch.type !== s.type) {
          if (patch.type === "command") {
            return {
              id: s.id,
              type: "command",
              commandId:
                "commandId" in patch && patch.commandId != null
                  ? patch.commandId
                  : s.type === "command"
                    ? s.commandId
                    : "",
            };
          }
          if (patch.type === "say") {
            return {
              id: s.id,
              type: "say",
              value:
                "value" in patch && patch.value != null
                  ? patch.value
                  : s.type === "say"
                    ? s.value
                    : "",
            };
          }
          return {
            id: s.id,
            type: "pause",
            value:
              "value" in patch && patch.value != null
                ? patch.value
                : s.type === "pause"
                  ? s.value
                  : "1",
          };
        }
        if (s.type === "command" && "commandId" in patch) {
          return { ...s, commandId: patch.commandId ?? s.commandId };
        }
        if (
          (s.type === "say" || s.type === "pause") &&
          "value" in patch &&
          patch.value != null
        ) {
          return { ...s, value: patch.value };
        }
        return s;
      }),
    });
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
    const cmdSteps = editor.steps.filter((s) => s.type === "command");
    if (cmdSteps.some((s) => s.type === "command" && !s.commandId.trim())) {
      setNote("Выберите кастомную команду для каждого шага «Команда»");
      return;
    }
    if (!cmdSteps.length) {
      setNote("Добавьте хотя бы одну кастомную команду в последовательность");
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
      setEditor(null);
      setTriggerDraft("");
      setTagDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function testEditor() {
    if (!editor) return;
    const cmdSteps = editor.steps.filter((s) => s.type === "command");
    if (!cmdSteps.length || cmdSteps.some((s) => !s.commandId.trim())) {
      setNote("Сначала заполните шаги командами");
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
              if (!busy) {
                setEditor(null);
                setTriggerDraft("");
                setTagDraft("");
              }
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
                  onClick={() => {
                    setEditor(null);
                    setTriggerDraft("");
                    setTagDraft("");
                  }}
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
                  Последовательность кастомных команд
                </div>
                <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
                  Как в «Кастомных командах», но шаги — готовые команды из
                  Мастерской. Можно вставить «Сказать» и «Паузу».
                </p>

                {commands.length === 0 ? (
                  <p className="muted" style={{ margin: "0 0 10px" }}>
                    Пока нет кастомных команд — создайте их во вкладке «Команды»,
                    затем добавьте сюда.
                  </p>
                ) : null}

                <div className="cc-steps">
                  {editor.steps.map((step, idx) => (
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
                          {STEP_TYPE_LABEL[step.type]}
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
                            {(
                              ["command", "say", "pause"] as const
                            ).map((t) => (
                              <li key={t}>
                                <button
                                  type="button"
                                  className={
                                    t === step.type
                                      ? "cc-type-option is-active"
                                      : "cc-type-option"
                                  }
                                  role="option"
                                  aria-selected={t === step.type}
                                  onClick={() => {
                                    updateStep(step.id, { type: t });
                                    setOpenStepMenu(null);
                                  }}
                                >
                                  {STEP_TYPE_LABEL[t]}
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
                        ) : (
                          <input
                            value={step.value}
                            disabled={busy}
                            placeholder={
                              step.type === "say"
                                ? "Текст для озвучки"
                                : "Секунды, напр. 1.5"
                            }
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
                          disabled={busy || idx === editor.steps.length - 1}
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
                  ))}
                </div>

                <div
                  className="cc-quick-add"
                  role="group"
                  aria-label="Добавить шаг"
                >
                  <button
                    type="button"
                    className="cc-pill"
                    disabled={busy}
                    onClick={() => addStep("command")}
                  >
                    + Команда
                  </button>
                  <button
                    type="button"
                    className="cc-pill"
                    disabled={busy}
                    onClick={() => addStep("say")}
                  >
                    + Сказать
                  </button>
                  <button
                    type="button"
                    className="cc-pill"
                    disabled={busy}
                    onClick={() => addStep("pause")}
                  >
                    + Пауза
                  </button>
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
                  onClick={() => {
                    setEditor(null);
                    setTriggerDraft("");
                    setTagDraft("");
                  }}
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
            Последовательности кастомных команд. Триггер из Диалога или Run на
            карточке.
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
