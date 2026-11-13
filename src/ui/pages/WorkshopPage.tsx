import { emitActionLog } from "../actionLog";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  deleteLocalSkill,
  listLocalProtocols,
  listLocalSkills,
  saveLocalProtocol,
  saveLocalSkill,
  setLocalProtocolEnabled,
  setLocalSkillEnabled,
} from "../catalogLocal";
import { notifyCoreProgress } from "../coreLevel";
import { useAppConfirm } from "../components/AppConfirm";
import { AutoGrowTextarea } from "../components/AutoGrowTextarea";
import {
  CatalogEditModal,
  type CatalogEditDraft,
} from "../components/CatalogEditModal";
import { LibraryPanel } from "../components/LibraryPanel";
import { NotesFilesPanel } from "../components/NotesFilesPanel";
import { PathsPanel } from "../components/PathsPanel";
import { StubBadge } from "../components/StubBadge";
import { TerminalView } from "../components/TerminalView";
import { VoiceStudioPanel } from "../components/VoiceStudioPanel";
import { ThemeSelect } from "../components/ThemeSelect";

import {
  clearActiveVoiceId,
  getActiveVoiceId,
  isCustomVoiceId,
  listCatalogVoices,
  setActiveVoiceId,
} from "../voice/catalog";
import {
  hideSystemVoice,
  localDeleteCustomVoice,
} from "../voice/studioLocal";
import { speakText, stopSpeaking } from "../voice/tts";
import type { VoiceInfo } from "../voice/types";

const SEGMENTS = [
  { id: "skills", label: "Скиллы", phase: "P3" },
  { id: "protocols", label: "Протоколы", phase: "P3" },
  { id: "paths", label: "Пути", phase: "P12" },
  { id: "voices", label: "Голоса", phase: "P9" },
  { id: "library", label: "Обучение", phase: "P8" },
  { id: "notes", label: "Заметки/файлы", phase: "F2/F5" },
  { id: "terminal", label: "Терминал", phase: "P7" },
] as const;


type CatalogItem = MiraCatalogItem;

type SkillSort = "name" | "id" | "enabled" | "updated";

const SKILL_SORT_OPTIONS: Array<{ value: SkillSort; label: string }> = [
  { value: "name", label: "По названию" },
  { value: "id", label: "По ID" },
  { value: "enabled", label: "Сначала включённые" },
  { value: "updated", label: "Сначала новые" },
];

function loadSkillSort(): SkillSort {
  const raw = localStorage.getItem("mira.skills.sort");
  if (raw === "name" || raw === "id" || raw === "enabled" || raw === "updated") {
    return raw;
  }
  return "name";
}

function sortSkills(items: CatalogItem[], mode: SkillSort): CatalogItem[] {
  const next = [...items];
  next.sort((a, b) => {
    if (mode === "enabled") {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name, "ru");
    }
    if (mode === "id") return a.id.localeCompare(b.id);
    if (mode === "updated") {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (tb !== ta) return tb - ta;
      return a.name.localeCompare(b.name, "ru");
    }
    return a.name.localeCompare(b.name, "ru");
  });
  return next;
}

function itemToDraft(item: CatalogItem): CatalogEditDraft {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    triggers: item.triggers.join(", "),
    tags: (item.tags ?? []).join(", "),
    body: item.body,
    enabled: item.enabled,
  };
}

export function WorkshopPage() {
  const confirm = useAppConfirm();
  const [segment, setSegment] =
    useState<(typeof SEGMENTS)[number]["id"]>("skills");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusVoiceProjectId, setFocusVoiceProjectId] = useState<string | null>(
    null,
  );
  const [voiceNote, setVoiceNote] = useState("");
  const [skills, setSkills] = useState<CatalogItem[]>([]);
  const [protocols, setProtocols] = useState<CatalogItem[]>([]);
  const [note, setNote] = useState("");
  const [skillSort, setSkillSort] = useState<SkillSort>(() => loadSkillSort());
  const [skillEditor, setSkillEditor] = useState<{
    mode: "create" | "edit";
    draft: CatalogEditDraft;
  } | null>(null);
  const [skillDraft, setSkillDraft] = useState({
    id: "custom-skill",
    name: "Новый скилл",
    description: "",
    triggers: "помоги, skill тест",
    tags: "custom, workshop",
    body: "1. Уточни задачу.\n2. Дай короткий ответ по шагам.\n3. Предложи следующий шаг.",
  });
  const [draft, setDraft] = useState({
    id: "custom-protocol",
    name: "Новый протокол",
    description: "",
    triggers: "протокол тест",
    tags: "custom",
    body: "1. Скажи «протокол выполнен».\n2. Предложи следующий шаг.",
  });
  const [runLog, setRunLog] = useState<string | null>(null);
  const browserOnly = typeof window !== "undefined" && !window.mira;

  const sortedSkills = useMemo(
    () => sortSkills(skills, skillSort),
    [skills, skillSort],
  );

  async function refreshCatalogs() {
    if (!window.mira) {
      const s = listLocalSkills();
      const p = listLocalProtocols();
      setSkills(s);
      setProtocols(p);
      setNote(
        `Browser-demo · Skills: ${s.length} · Protocols: ${p.length} (localStorage; в Electron — data/skills)`,
      );
      return;
    }
    const [s, p] = await Promise.all([
      window.mira.listSkills(),
      window.mira.listProtocols(),
    ]);
    setSkills(s);
    setProtocols(p);
    setNote(`Skills: ${s.length} · Protocols: ${p.length}`);
  }

  async function refreshVoices() {
    const list = await listCatalogVoices();
    setVoices(list);
    setActiveId(getActiveVoiceId(list));
  }

  useEffect(() => {
    let cancelled = false;
    void listCatalogVoices().then((list) => {
      if (cancelled) return;
      setVoices(list);
      setActiveId(getActiveVoiceId(list));
    });
    void refreshCatalogs();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, []);

  function selectVoice(id: string) {
    setActiveVoiceId(id);
    setActiveId(id);
  }

  async function preview(id: string) {
    selectVoice(id);
    // Custom studio voices: speak path plays corpus/preview clips (not system TTS).
    if (isCustomVoiceId(id)) {
      speakText("Привет, я Mira — твой голосовой помощник.", id, {
        preferPreview: true,
        onStatus: (msg) => setVoiceNote(msg),
        onError: (msg) => setVoiceNote(msg),
      });
      return;
    }
    speakText("Привет, я Mira. Это превью голоса из каталога.", id);
  }

  function configureCustomVoice(voice: VoiceInfo) {
    if (!voice.custom) return;
    const projectId = voice.projectId;
    if (projectId) setFocusVoiceProjectId(projectId);
    setVoiceNote(`Настройка «${voice.name}» — панель студии выше`);
  }

  async function removeVoice(voice: VoiceInfo) {
    if (voice.custom) {
      const ok = await confirm({
        title: "Удалить голос",
        body: `Удалить свой голос «${voice.name}» из каталога?`,
        confirmLabel: "Удалить",
        tone: "danger",
      });
      if (!ok) return;
      const res = window.mira?.deleteCustomVoice
        ? await window.mira.deleteCustomVoice(voice.id)
        : localDeleteCustomVoice(voice.id);
      clearActiveVoiceId(res.clearedVoiceId ?? voice.id);
      if (activeId === voice.id) setActiveId(null);
      setVoiceNote(res.detail);
      if (focusVoiceProjectId && voice.projectId === focusVoiceProjectId) {
        setFocusVoiceProjectId(null);
      }
      await refreshVoices();
      return;
    }
    const ok = await confirm({
      title: "Скрыть голос",
      body: `Скрыть системный голос «${voice.name}» из каталога?`,
      confirmLabel: "Скрыть",
      tone: "danger",
    });
    if (!ok) return;
    hideSystemVoice(voice.id);
    clearActiveVoiceId(voice.id);
    if (activeId === voice.id) setActiveId(null);
    setVoiceNote(`Скрыт системный голос ${voice.name}`);
    await refreshVoices();
  }

  async function toggleSkill(id: string, enabled: boolean) {
    if (!window.mira) {
      setLocalSkillEnabled(id, enabled);
      await refreshCatalogs();
      return;
    }
    await window.mira.setSkillEnabled(id, enabled);
    await refreshCatalogs();
  }

  async function toggleProtocol(id: string, enabled: boolean) {
    if (!window.mira) {
      setLocalProtocolEnabled(id, enabled);
      await refreshCatalogs();
      return;
    }
    await window.mira.setProtocolEnabled(id, enabled);
    await refreshCatalogs();
  }

  function parseCsv(raw: string): string[] {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  async function persistSkill(draftIn: CatalogEditDraft) {
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
    await refreshCatalogs();
    setNote(`Сохранён skill ${payload.id}`);
    notifyCoreProgress();
    emitActionLog({
      title: "Skill сохранён",
      reason: `${payload.id} · ${payload.name}`,
      tag: "Мастерская",
      tone: "success",
    });
  }

  async function saveProtocol(e: FormEvent) {
    e.preventDefault();
    const payload = {
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      triggers: parseCsv(draft.triggers),
      tags: parseCsv(draft.tags),
      enabled: true,
      body: draft.body,
    };
    if (!window.mira) {
      saveLocalProtocol(payload);
    } else {
      await window.mira.saveProtocol(payload);
    }
    await refreshCatalogs();
    setNote(`Сохранён протокол ${payload.id}`);
    notifyCoreProgress();
  }

  function editSkill(item: CatalogItem) {
    setSkillEditor({ mode: "edit", draft: itemToDraft(item) });
  }

  async function deleteSkill(item: CatalogItem) {
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
    if (res.ok) await refreshCatalogs();
  }

  function changeSkillSort(next: SkillSort) {
    setSkillSort(next);
    localStorage.setItem("mira.skills.sort", next);
  }

  async function runProtocol(id: string) {
    if (!window.mira) return;
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
      }
      if (event.type === "error") {
        setRunLog(`error: ${event.message}`);
        off();
      }
    });
    await window.mira.sendChat({
      sessionId: null,
      text: `Выполни протокол ${id}`,
      requestId,
      forceProtocolId: id,
    });
  }

  return (
    <div className="settings-layout workshop-layout">
      <nav className="settings-nav" aria-label="Мастерская">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`nav-btn ${segment === s.id ? "active" : ""}`}
            onClick={() => setSegment(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="panel stack workshop-main">
      {segment === "skills" ? (
        <div className="stack">
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Скиллы</h2>
            <StubBadge label="P3 #9" />
            {browserOnly ? <span className="chip">browser-demo</span> : null}
            <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
              <label className="row" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  Сортировка
                </span>
                <ThemeSelect
                  aria-label="Сортировка скиллов"
                  value={skillSort}
                  options={SKILL_SORT_OPTIONS}
                  onChange={(v) => changeSkillSort(v as SkillSort)}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  setSkillEditor({
                    mode: "create",
                    draft: {
                      ...skillDraft,
                      enabled: false,
                    },
                  })
                }
              >
                Создать
              </button>
            </div>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Установленные ≠ активные. В контекст — matched on-demand или
            «включи skill …». {note}
          </p>
          {sortedSkills.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Пока пусто — нажмите «Создать».
            </p>
          ) : null}
          {sortedSkills.map((s) => (
            <div key={s.id} className="panel voice-row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>{s.name}</strong>
                <div className="muted">{s.description || "—"}</div>
                <div className="mono muted">
                  {s.id} · triggers: {s.triggers.join(", ") || "—"}
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  {(s.tags ?? []).length === 0 ? (
                    <span className="chip">без тегов</span>
                  ) : (
                    (s.tags ?? []).map((tag) => (
                      <span key={tag} className="chip">
                        #{tag}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <label className="row">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => void toggleSkill(s.id, e.target.checked)}
                  />
                  <span>установлен</span>
                </label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => editSkill(s)}
                >
                  Править
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void deleteSkill(s)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}

          {skillEditor ? (
            <CatalogEditModal
              open
              title={
                skillEditor.mode === "edit"
                  ? `Править skill · ${skillEditor.draft.id}`
                  : "Новый skill"
              }
              draft={skillEditor.draft}
              idLocked={skillEditor.mode === "edit"}
              confirmLabel={
                skillEditor.mode === "edit" ? "Сохранить" : "Создать"
              }
              onClose={() => setSkillEditor(null)}
              onSave={async (next) => {
                await persistSkill(next);
                if (skillEditor.mode === "create") {
                  setSkillDraft({
                    id: "custom-skill",
                    name: "Новый скилл",
                    description: "",
                    triggers: "помоги, skill тест",
                    tags: "custom, workshop",
                    body: "1. Уточни задачу.\n2. Дай короткий ответ по шагам.\n3. Предложи следующий шаг.",
                  });
                }
              }}
            />
          ) : null}
        </div>
      ) : null}

      {segment === "protocols" ? (
        <div className="stack">
          <div className="panel stack">
            <div className="row">
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Протоколы</h2>
              <StubBadge label="P3 #10" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Md + панель. Триггер из Диалога или Run здесь. {note}
            </p>
            {protocols.map((p) => (
              <div key={p.id} className="panel voice-row">
                <div>
                  <strong>{p.name}</strong>
                  <div className="muted">{p.description}</div>
                  <div className="mono muted">
                    {p.id} · {p.triggers.join(", ")}
                  </div>
                </div>
                <div className="row">
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) =>
                        void toggleProtocol(p.id, e.target.checked)
                      }
                    />
                    <span>вкл</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void runProtocol(p.id)}
                  >
                    Run
                  </button>
                </div>
              </div>
            ))}
            {runLog ? (
              <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {runLog}
              </pre>
            ) : null}
          </div>

          <form className="panel stack" onSubmit={(e) => void saveProtocol(e)}>
            <strong>Создать / обновить протокол</strong>
            <label className="field-label">
              ID
              <input
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="custom-protocol"
              />
            </label>
            <label className="field-label">
              Название
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Новый протокол"
              />
            </label>
            <label className="field-label">
              Описание
              <input
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Кратко, для чего протокол"
              />
            </label>
            <label className="field-label">
              Триггеры
              <input
                value={draft.triggers}
                onChange={(e) =>
                  setDraft({ ...draft, triggers: e.target.value })
                }
                placeholder="фразы через запятую"
              />
            </label>
            <label className="field-label">
              Теги
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="custom, flow"
              />
            </label>
            <label className="field-label">
              Тело
              <AutoGrowTextarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Шаги протокола…"
                minHeight={120}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Сохранить md
            </button>
          </form>
        </div>
      ) : null}

      {segment === "voices" ? (
        <div className="stack">
          <VoiceStudioPanel
            focusProjectId={focusVoiceProjectId}
            onCatalogChanged={() => {
              void refreshVoices();
              notifyCoreProgress();
            }}
          />
          <div className="panel stack">
            <div className="row">
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
                Каталог голосовых моделей
              </h2>
              <StubBadge label="P2/P9 #11" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Свои модели — настройка и удаление. Системные — превью / выбор /
              скрыть из списка.
            </p>
            {voiceNote ? (
              <p className="muted" style={{ margin: 0 }}>
                {voiceNote}
              </p>
            ) : null}
            {voices.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Модели не найдены в этой среде.
              </p>
            ) : (
              voices.map((v) => (
                <div key={v.id} className="panel voice-row">
                  <div>
                    <strong>{v.name}</strong>
                    <div className="muted mono">
                      {v.lang}
                      {v.custom ? " · custom" : " · system"}
                      {activeId === v.id ? " · active" : ""}
                    </div>
                  </div>
                  <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void preview(v.id)}
                    >
                      Превью
                    </button>
                    <button
                      type="button"
                      className={`btn ${activeId === v.id ? "btn-primary" : ""}`}
                      onClick={() => selectVoice(v.id)}
                    >
                      {activeId === v.id ? "Выбран" : "Выбрать"}
                    </button>
                    {v.custom ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => configureCustomVoice(v)}
                      >
                        Настроить
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void removeVoice(v)}
                    >
                      {v.custom ? "Удалить" : "Скрыть"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {segment === "paths" ? <PathsPanel /> : null}
      {segment === "terminal" ? <TerminalView /> : null}
      {segment === "library" ? <LibraryPanel /> : null}
      {segment === "notes" ? <NotesFilesPanel /> : null}
      </div>
    </div>
  );
}
