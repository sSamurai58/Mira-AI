import { useEffect, useState, type FormEvent } from "react";
import {
  listLocalProtocols,
  listLocalSkills,
  saveLocalProtocol,
  saveLocalSkill,
  setLocalProtocolEnabled,
  setLocalSkillEnabled,
} from "../catalogLocal";
import { LibraryPanel } from "../components/LibraryPanel";
import { NotesFilesPanel } from "../components/NotesFilesPanel";
import { StubBadge } from "../components/StubBadge";
import { TerminalView } from "../components/TerminalView";
import { VoiceStudioPanel } from "../components/VoiceStudioPanel";

import {
  getActiveVoiceId,
  isCustomVoiceId,
  listCatalogVoices,
  setActiveVoiceId,
} from "../voice/catalog";
import { speakText, stopSpeaking } from "../voice/tts";
import type { VoiceInfo } from "../voice/types";

const SEGMENTS = [
  { id: "skills", label: "Скиллы", phase: "P3" },
  { id: "protocols", label: "Протоколы", phase: "P3" },
  { id: "voices", label: "Голоса", phase: "P9" },
  { id: "library", label: "Библиотека", phase: "P8" },
  { id: "notes", label: "Заметки/файлы", phase: "F2/F5" },
  { id: "terminal", label: "Терминал", phase: "P7" },
] as const;


type CatalogItem = MiraCatalogItem;

export function WorkshopPage() {
  const [segment, setSegment] =
    useState<(typeof SEGMENTS)[number]["id"]>("skills");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [skills, setSkills] = useState<CatalogItem[]>([]);
  const [protocols, setProtocols] = useState<CatalogItem[]>([]);
  const [note, setNote] = useState("");
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
    const voice = voices.find((v) => v.id === id);
    if (isCustomVoiceId(id) && voice?.previewPath && window.mira) {
      try {
        const dataUrl = await window.mira.readVoicePreview(voice.previewPath);
        const audio = new Audio(dataUrl);
        void audio.play();
        return;
      } catch {
        // fall through to speechSynthesis stub
      }
    }
    speakText("Привет, я Mira. Это превью голоса из каталога.", id);
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

  async function saveSkill(e: FormEvent) {
    e.preventDefault();
    const payload = {
      id: skillDraft.id.trim(),
      name: skillDraft.name.trim(),
      description: skillDraft.description.trim(),
      triggers: parseCsv(skillDraft.triggers),
      tags: parseCsv(skillDraft.tags),
      enabled: false,
      body: skillDraft.body,
    };
    if (!window.mira) {
      saveLocalSkill(payload);
    } else {
      await window.mira.saveSkill(payload);
    }
    await refreshCatalogs();
    setNote(`Сохранён skill ${payload.id} (default off · on-demand)`);
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
  }

  function editSkill(item: CatalogItem) {
    setSkillDraft({
      id: item.id,
      name: item.name,
      description: item.description,
      triggers: item.triggers.join(", "),
      tags: (item.tags ?? []).join(", "),
      body: item.body,
    });
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
      <div className="settings-nav" aria-label="Разделы мастерской">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`nav-btn ${segment === s.id ? "active" : ""}`}
            onClick={() => setSegment(s.id)}
          >
            <span className="nav-btn-label">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="panel stack workshop-panel">
      {segment === "skills" ? (
        <>
            <div className="row">
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Скиллы</h2>
              <StubBadge label="P3 #9" />
              {browserOnly ? <span className="chip">browser-demo</span> : null}
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Установленные ≠ активные. В контекст — matched on-demand или
              «включи skill …». {note}
            </p>
            {skills.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Пока пусто — создайте скилл формой ниже.
              </p>
            ) : null}
            {skills.map((s) => (
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
                </div>
              </div>
            ))}

          <form className="panel stack" onSubmit={(e) => void saveSkill(e)}>
            <strong>Создать / обновить скилл</strong>
            <label className="field-label">
              ID
              <input
                value={skillDraft.id}
                onChange={(e) =>
                  setSkillDraft({ ...skillDraft, id: e.target.value })
                }
                placeholder="custom-skill"
              />
            </label>
            <label className="field-label">
              Название
              <input
                value={skillDraft.name}
                onChange={(e) =>
                  setSkillDraft({ ...skillDraft, name: e.target.value })
                }
                placeholder="Новый скилл"
              />
            </label>
            <label className="field-label">
              Описание
              <input
                value={skillDraft.description}
                onChange={(e) =>
                  setSkillDraft({
                    ...skillDraft,
                    description: e.target.value,
                  })
                }
                placeholder="Зачем этот скилл"
              />
            </label>
            <label className="field-label">
              Триггеры
              <input
                value={skillDraft.triggers}
                onChange={(e) =>
                  setSkillDraft({ ...skillDraft, triggers: e.target.value })
                }
                placeholder="фразы через запятую"
              />
            </label>
            <label className="field-label">
              Теги
              <input
                value={skillDraft.tags}
                onChange={(e) =>
                  setSkillDraft({ ...skillDraft, tags: e.target.value })
                }
                placeholder="custom, voice, tools"
              />
            </label>
            <label className="field-label">
              Тело
              <textarea
                rows={5}
                value={skillDraft.body}
                onChange={(e) =>
                  setSkillDraft({ ...skillDraft, body: e.target.value })
                }
                placeholder="Инструкции для модели…"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Сохранить skill
            </button>
          </form>
        </>
      ) : null}

      {segment === "protocols" ? (
        <>
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
              <textarea
                rows={5}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Шаги протокола…"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Сохранить md
            </button>
          </form>
        </>
      ) : null}

      {segment === "voices" ? (
        <>
          <VoiceStudioPanel onCatalogChanged={() => void refreshVoices()} />
          <div className="row">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Каталог голосов</h2>
            <StubBadge label="P2/P9 #11" />
          </div>
          {voices.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Голоса не найдены в этой среде.
            </p>
          ) : (
            voices.map((v) => (
              <div key={v.id} className="panel voice-row">
                <div>
                  <strong>{v.name}</strong>
                  <div className="muted mono">
                    {v.lang}
                    {v.custom ? " · custom" : ""}
                    {activeId === v.id ? " · active" : ""}
                  </div>
                </div>
                <div className="row">
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
                    Выбрать
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      ) : null}

      {segment === "terminal" ? <TerminalView /> : null}
      {segment === "library" ? <LibraryPanel /> : null}
      {segment === "notes" ? <NotesFilesPanel /> : null}

      </div>
    </div>
  );
}
