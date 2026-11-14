import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { emitActionLog } from "../actionLog";
import {
  ACTION_TYPES,
  deleteLocalCustomCommand,
  listLocalCustomCommands,
  runLocalCustomCommandDry,
  setLocalCustomCommandEnabled,
  upsertLocalCustomCommand,
  type CustomCommandActionType,
  type CustomCommandItem,
  type CustomCommandStep,
} from "../customCommandsLocal";
import { useAppConfirm } from "./AppConfirm";
import { StubBadge } from "./StubBadge";
import { ThemeSelect } from "./ThemeSelect";

const ACTION_LABEL: Record<CustomCommandActionType, string> = {
  open_url: "Открыть в браузере",
  launch: "Запустить",
  open_path: "Открыть путь",
  open_folder: "Открыть папку",
  keys: "Нажать клавиши",
  type: "Ввести текст",
  click: "Клик",
  clipboard_copy: "Копировать в буфер",
  clipboard_paste: "Вставить",
  pause: "Задержка (сек)",
  say: "Сказать",
  notify: "Уведомление",
  hud_say: "Сказать в HUD",
  window_minimize: "Свернуть окно",
  window_close: "Закрыть окно",
  terminal: "Команда терминала",
};

/** Quick-add pills — useful subset (full list is in the type dropdown). */
const QUICK_ADD: CustomCommandActionType[] = [
  "open_url",
  "launch",
  "open_path",
  "type",
  "click",
  "keys",
  "clipboard_copy",
  "clipboard_paste",
  "pause",
  "say",
  "notify",
  "open_folder",
];

const VALUELESS_TYPES: CustomCommandActionType[] = [
  "window_minimize",
  "window_close",
];

type AppPathOption = {
  id: string;
  name: string;
  path: string;
  kind: "program" | "folder" | "file";
};

type Draft = {
  id?: string;
  name: string;
  phrases: string[];
  steps: CustomCommandStep[];
  reply: string;
  enabled: boolean;
};

function newStepId(): string {
  return `step-${crypto.randomUUID().slice(0, 8)}`;
}

function emptyStep(type: CustomCommandActionType = "launch"): CustomCommandStep {
  return {
    id: newStepId(),
    type,
    value:
      type === "pause"
        ? "1"
        : type === "click"
          ? "100, 200"
          : "",
  };
}

function emptyDraft(): Draft {
  return {
    name: "",
    phrases: [],
    steps: [emptyStep("launch"), emptyStep("keys")],
    reply: "",
    enabled: true,
  };
}

function stepPlaceholder(type: CustomCommandActionType): string {
  switch (type) {
    case "open_url":
      return "https://example.com";
    case "launch":
      return "Из Путей или путь к программе/файлу/папке";
    case "open_path":
      return "id или имя из Путей";
    case "open_folder":
      return "Из Путей или путь к папке";
    case "keys":
      return "ctrl+shift+s";
    case "type":
      return "Текст для ввода";
    case "click":
      return "x, y — например 100, 200";
    case "clipboard_copy":
      return "Текст в буфер обмена";
    case "clipboard_paste":
      return "Текст (необязательно) или пусто = вставить";
    case "pause":
      return "Секунды, напр. 1.5";
    case "say":
      return "Текст для озвучки";
    case "notify":
      return "Заголовок|Текст или просто текст";
    case "hud_say":
      return "Текст в HUD / уведомление";
    case "window_minimize":
    case "window_close":
      return "";
    case "terminal":
      return "Команда (с подтверждением)";
  }
}

function ActionIcon({ type }: { type: CustomCommandActionType }) {
  if (type === "open_url") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M3 10h14M10 3c2.2 2.5 2.2 11.5 0 14M10 3c-2.2 2.5-2.2 11.5 0 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    );
  }
  if (type === "launch" || type === "open_path" || type === "open_folder") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <path
          d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l1.5 1.5H15.5A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    );
  }
  if (type === "keys" || type === "type") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <rect
          x="2.5"
          y="5"
          width="15"
          height="10"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5 8.5h2M9 8.5h2M13 8.5h2M6.5 12h7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "click") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <path
          d="M9 3v8.5l2.2-1.4 1.5 3.2 1.8-.8-1.5-3.2L16 8.2 9 3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === "clipboard_copy" || type === "clipboard_paste") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <rect
          x="6"
          y="4"
          width="9"
          height="12"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5 14H4.5A1.5 1.5 0 0 1 3 12.5v-8A1.5 1.5 0 0 1 4.5 3H12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    );
  }
  if (type === "pause") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M10 6v4.5l3 1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "notify" || type === "hud_say") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <path
          d="M10 3a5 5 0 0 1 5 5v2.5l1.5 2.5H3.5L5 10.5V8a5 5 0 0 1 5-5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M8.5 15.5a1.5 1.5 0 0 0 3 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    );
  }
  if (type === "window_minimize" || type === "window_close") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <rect
          x="3.5"
          y="5"
          width="13"
          height="10"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M3.5 8h13"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    );
  }
  if (type === "terminal") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <rect
          x="2.5"
          y="4"
          width="15"
          height="12"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5.5 8l2.5 2-2.5 2M10 13h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
      <path
        d="M4 8.5v3a1 1 0 0 0 1 1h1.5L10 15.5V4.5L6.5 7.5H5a1 1 0 0 0-1 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M13 7.2a3 3 0 0 1 0 5.6M14.8 5.2a5.2 5.2 0 0 1 0 9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CustomCommandsPanel() {
  const confirm = useAppConfirm();
  const browserOnly = typeof window !== "undefined" && !window.mira;
  const [items, setItems] = useState<CustomCommandItem[]>([]);
  const [note, setNote] = useState("");
  const [editor, setEditor] = useState<Draft | null>(null);
  const [phraseDraft, setPhraseDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [openStepMenu, setOpenStepMenu] = useState<string | null>(null);
  const [appPaths, setAppPaths] = useState<AppPathOption[]>([]);

  const refresh = useCallback(async () => {
    if (!window.mira?.listCustomCommands) {
      setItems(listLocalCustomCommands());
      return;
    }
    setItems(await window.mira.listCustomCommands());
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

  useEffect(() => {
    void refresh();
    void refreshPaths();
  }, [refresh, refreshPaths]);

  useEffect(() => {
    if (!openStepMenu) return;
    const onDoc = () => setOpenStepMenu(null);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openStepMenu]);

  const countLabel = useMemo(() => {
    const n = items.length;
    if (n === 1) return "1 команда";
    if (n >= 2 && n <= 4) return `${n} команды`;
    return `${n} команд`;
  }, [items.length]);

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

  const launchPathOptions = useMemo(
    () => [
      { value: "", label: "Из библиотеки Путей…" },
      ...appPaths.map((p) => ({
        value: p.id,
        label: p.path ? `${p.name} · ${p.path}` : p.name,
      })),
    ],
    [appPaths],
  );

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

  function openCreate() {
    setEditor(emptyDraft());
    setPhraseDraft("");
    setNote("");
    void refreshPaths();
  }

  function openEdit(item: CustomCommandItem) {
    setEditor({
      id: item.id,
      name: item.name,
      phrases: [...item.phrases],
      steps: item.steps.map((s) => ({ ...s })),
      reply: item.reply,
      enabled: item.enabled,
    });
    setPhraseDraft("");
    setNote("");
    void refreshPaths();
  }

  function addPhraseFromDraft() {
    const t = phraseDraft.trim();
    if (!t || !editor) return;
    if (editor.phrases.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setPhraseDraft("");
      return;
    }
    setEditor({ ...editor, phrases: [...editor.phrases, t] });
    setPhraseDraft("");
  }

  function onPhraseKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addPhraseFromDraft();
    } else if (
      e.key === "Backspace" &&
      !phraseDraft &&
      editor &&
      editor.phrases.length
    ) {
      setEditor({ ...editor, phrases: editor.phrases.slice(0, -1) });
    }
  }

  function addStep(type: CustomCommandActionType) {
    if (!editor) return;
    setEditor({
      ...editor,
      steps: [...editor.steps, emptyStep(type)],
    });
  }

  function updateStep(id: string, patch: Partial<CustomCommandStep>) {
    if (!editor) return;
    setEditor({
      ...editor,
      steps: editor.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
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

  async function browseLaunch(stepId: string, kind: "program" | "folder" = "program") {
    if (!editor) return;
    if (!window.mira?.pickAppPath) {
      setNote("Выбор файла доступен в Electron");
      return;
    }
    const res = await window.mira.pickAppPath(kind);
    if (res.canceled || !res.path) return;
    updateStep(stepId, { value: res.path });
  }

  async function saveEditor(e: FormEvent) {
    e.preventDefault();
    if (!editor || !editor.name.trim()) return;
    const draftPhrase = phraseDraft.trim();
    const phrases =
      draftPhrase &&
      !editor.phrases.some((x) => x.toLowerCase() === draftPhrase.toLowerCase())
        ? [...editor.phrases, draftPhrase]
        : editor.phrases;
    setBusy(true);
    try {
      const payload = {
        id: editor.id,
        name: editor.name,
        phrases,
        steps: editor.steps,
        reply: editor.reply,
        enabled: editor.enabled,
      };
      if (window.mira?.upsertCustomCommand) {
        await window.mira.upsertCustomCommand(payload);
      } else {
        upsertLocalCustomCommand(payload);
      }
      emitActionLog({
        title: editor.id ? "Команда сохранена" : "Команда добавлена",
        reason: editor.name,
        tag: "Команды",
        tone: "success",
      });
      setEditor(null);
      setPhraseDraft("");
      await refresh();
      setNote("Сохранено");
    } finally {
      setBusy(false);
    }
  }

  async function testEditor() {
    if (!editor) return;
    setBusy(true);
    try {
      const payload = {
        id: editor.id,
        name: editor.name.trim() || "Черновик",
        phrases: editor.phrases,
        steps: editor.steps,
        reply: editor.reply,
        enabled: editor.enabled,
      };
      let id = editor.id;
      if (window.mira?.upsertCustomCommand) {
        const saved = await window.mira.upsertCustomCommand(payload);
        id = saved.id;
        setEditor({ ...editor, id: saved.id });
        await refresh();
        const res = await window.mira.runCustomCommand!(id!, { dryRun: true });
        setNote(res.detail || res.reply || "Проверка выполнена");
        emitActionLog({
          title: "Проверка команды",
          reason: payload.name,
          tag: "Команды",
          tone: res.ok ? "accent" : "warning",
        });
      } else {
        const saved = upsertLocalCustomCommand(payload);
        id = saved.id;
        setEditor({ ...editor, id: saved.id });
        await refresh();
        const res = runLocalCustomCommandDry(id);
        setNote(res.detail);
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeCommand(item: CustomCommandItem) {
    const ok = await confirm({
      title: "Удалить команду?",
      body: `Удалить «${item.name}»?`,
      confirmLabel: "Удалить",
    });
    if (!ok) return;
    if (window.mira?.deleteCustomCommand) {
      await window.mira.deleteCustomCommand(item.id);
    } else {
      deleteLocalCustomCommand(item.id);
    }
    if (editor?.id === item.id) setEditor(null);
    await refresh();
    setNote(`Удалено «${item.name}»`);
  }

  async function toggleEnabled(item: CustomCommandItem, enabled: boolean) {
    if (window.mira?.setCustomCommandEnabled) {
      await window.mira.setCustomCommandEnabled(item.id, enabled);
    } else {
      setLocalCustomCommandEnabled(item.id, enabled);
    }
    await refresh();
  }

  async function runLive(item: CustomCommandItem) {
    if (!window.mira?.runCustomCommand) {
      setNote("Запуск доступен в Electron");
      return;
    }
    const hasTerminal = item.steps.some((s) => s.type === "terminal");
    if (hasTerminal) {
      const ok = await confirm({
        title: "Команда с терминалом",
        body: `«${item.name}» содержит шаг «Команда терминала». Продолжить?`,
        confirmLabel: "Запустить",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await window.mira.runCustomCommand(item.id, { dryRun: false });
      setNote(res.reply || res.detail);
      emitActionLog({
        title: res.ok ? "Команда выполнена" : "Команда с ошибками",
        reason: item.name,
        tag: "Команды",
        tone: res.ok ? "success" : "warning",
      });
    } finally {
      setBusy(false);
    }
  }

  function renderStepValue(step: CustomCommandStep) {
    if (VALUELESS_TYPES.includes(step.type)) {
      return (
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          Best-effort для активного окна
        </span>
      );
    }

    if (step.type === "open_path") {
      return (
        <div className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          {appPaths.length > 0 ? (
            <ThemeSelect
              className="cc-path-select"
              aria-label="Путь из Путей"
              value={
                appPaths.some((p) => p.id === step.value) ? step.value : ""
              }
              options={pathSelectOptions}
              disabled={busy}
              onChange={(id) => updateStep(step.id, { value: id })}
            />
          ) : null}
          <input
            style={{ flex: 1, minWidth: 0 }}
            value={step.value}
            disabled={busy}
            placeholder={stepPlaceholder(step.type)}
            onChange={(e) => updateStep(step.id, { value: e.target.value })}
          />
        </div>
      );
    }

    if (step.type === "launch" || step.type === "open_folder") {
      const fromLibrary = appPaths.some((p) => p.id === step.value);
      const options =
        step.type === "open_folder" ? folderPathOptions : launchPathOptions;
      return (
        <div className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          {appPaths.length > 0 ? (
            <ThemeSelect
              className="cc-path-select"
              aria-label={
                step.type === "open_folder"
                  ? "Папка из Путей"
                  : "Приложение из Путей"
              }
              value={fromLibrary ? step.value : ""}
              options={options}
              disabled={busy}
              onChange={(id) => updateStep(step.id, { value: id })}
            />
          ) : null}
          <input
            style={{ flex: 1, minWidth: 0 }}
            value={
              fromLibrary
                ? appPaths.find((p) => p.id === step.value)?.path || step.value
                : step.value
            }
            disabled={busy || fromLibrary}
            placeholder={stepPlaceholder(step.type)}
            onChange={(e) => updateStep(step.id, { value: e.target.value })}
            title={
              fromLibrary
                ? "Выбрано из библиотеки Путей — смените в списке слева или очистите выбор"
                : undefined
            }
          />
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              if (fromLibrary) {
                updateStep(step.id, { value: "" });
              }
              void browseLaunch(
                step.id,
                step.type === "open_folder" ? "folder" : "program",
              );
            }}
          >
            Выбрать
          </button>
        </div>
      );
    }

    return (
      <input
        value={step.value}
        disabled={busy}
        placeholder={stepPlaceholder(step.type)}
        onChange={(e) => updateStep(step.id, { value: e.target.value })}
      />
    );
  }

  return (
    <div className="stack cc-panel">
      <div className="row cc-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Кастомные команды</h2>
            <span className="muted">{countLabel}</span>
            <StubBadge label="P12" />
            {browserOnly ? <span className="chip">browser-demo</span> : null}
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Придумайте фразу, а Mira выполнит цепочку действий.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={openCreate}
        >
          + Новая команда
        </button>
      </div>

      {note ? (
        <p className="muted cc-note" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {note}
        </p>
      ) : null}

      {editor ? (
        <form
          className="panel cc-form"
          onSubmit={(e) => void saveEditor(e)}
          aria-labelledby="cc-form-title"
        >
          <h3 id="cc-form-title" className="cc-form-title">
            {editor.id ? "Изменить команду" : "Новая команда"}
          </h3>

          <label className="field-label">
            Название
            <input
              value={editor.name}
              disabled={busy}
              required
              placeholder="Например, Рабочий режим"
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </label>

          <label className="field-label">
            Что сказать, чтобы запустить
            <div className="paths-tags-input">
              {editor.phrases.map((phrase) => (
                <span key={phrase} className="paths-tag-chip">
                  {phrase}
                  <button
                    type="button"
                    className="paths-tag-remove"
                    aria-label={`Удалить «${phrase}»`}
                    disabled={busy}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        phrases: editor.phrases.filter((t) => t !== phrase),
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={phraseDraft}
                disabled={busy}
                placeholder="Введите фразу и нажмите Enter"
                onChange={(e) => setPhraseDraft(e.target.value)}
                onKeyDown={onPhraseKeyDown}
                onBlur={addPhraseFromDraft}
              />
            </div>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Можно несколько вариантов. Mira поймёт фразу, даже если вокруг есть
              другие слова.
            </span>
          </label>

          <div className="cc-chain">
            <div className="field-label" style={{ marginBottom: 8 }}>
              Что должна сделать Mira
            </div>

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
                      {ACTION_LABEL[step.type]}
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
                        {ACTION_TYPES.map((t) => (
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
                                const nextValue =
                                  t === "pause" && !step.value
                                    ? "1"
                                    : t === "click" && !step.value
                                      ? "100, 200"
                                      : VALUELESS_TYPES.includes(t)
                                        ? ""
                                        : step.value;
                                updateStep(step.id, {
                                  type: t,
                                  value: nextValue,
                                });
                                setOpenStepMenu(null);
                              }}
                            >
                              {ACTION_LABEL[t]}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="cc-step-value">{renderStepValue(step)}</div>

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

            <div className="cc-quick-add" role="group" aria-label="Добавить шаг">
              {QUICK_ADD.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="cc-pill"
                  disabled={busy}
                  onClick={() => addStep(t)}
                >
                  <ActionIcon type={t} />
                  {ACTION_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <label className="field-label">
            Что ответит Mira (необязательно)
            <input
              value={editor.reply}
              disabled={busy}
              placeholder="Например, Всё открыто, приятной работы!"
              onChange={(e) => setEditor({ ...editor, reply: e.target.value })}
            />
          </label>

          <div className="row cc-form-actions" style={{ gap: 10, flexWrap: "wrap" }}>
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
              disabled={busy || !editor.name.trim()}
              onClick={() => void testEditor()}
            >
              Проверить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setEditor(null);
                setPhraseDraft("");
              }}
            >
              Отмена
            </button>
          </div>

          <p className="muted cc-keys-hint">
            Клавиши через плюс: ctrl, shift, alt, win, enter, esc, tab, f1…f12.
            Задержка — в секундах (суффикс ms/мс для миллисекунд). Клик — «x, y».
            Терминал запросит подтверждение. Пример:{" "}
            <strong className="cc-keys-example">win+shift+s</strong>
          </p>
        </form>
      ) : null}

      {!editor && items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Пока нет команд. Нажмите «+ Новая команда», чтобы собрать цепочку
          действий.
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="cc-list">
          {items.map((item) => (
            <article key={item.id} className="panel cc-card">
              <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <strong className="cc-card-name">{item.name}</strong>
                    <span
                      className={`paths-status-dot ${item.enabled ? "is-on" : ""}`}
                      title={item.enabled ? "Включена" : "Выключена"}
                      aria-hidden
                    />
                  </div>
                  <div className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                    {item.steps.length}{" "}
                    {item.steps.length === 1
                      ? "шаг"
                      : item.steps.length >= 2 && item.steps.length <= 4
                        ? "шага"
                        : "шагов"}
                    {item.reply.trim() ? " · ответ Mira" : ""}
                  </div>
                </div>
                <label className="row" style={{ gap: 4 }} title="В голосе">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) =>
                      void toggleEnabled(item, e.target.checked)
                    }
                  />
                </label>
              </div>

              <div className="paths-card-tags">
                {item.phrases.length === 0 ? (
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    Нет фраз
                  </span>
                ) : (
                  item.phrases.map((p) => (
                    <span key={p} className="paths-tag-chip is-readonly">
                      {p}
                    </span>
                  ))
                )}
              </div>

              <div className="row paths-card-actions">
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onClick={() => void runLive(item)}
                >
                  Запустить
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => openEdit(item)}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void removeCommand(item)}
                >
                  Удалить
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
