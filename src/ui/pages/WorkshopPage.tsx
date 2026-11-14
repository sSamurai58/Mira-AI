import { useEffect, useState } from "react";
import { useAppConfirm } from "../components/AppConfirm";
import { CustomCommandsPanel } from "../components/CustomCommandsPanel";
import { LibraryPanel } from "../components/LibraryPanel";
import { NotesFilesPanel } from "../components/NotesFilesPanel";
import { PathsPanel } from "../components/PathsPanel";
import { ProtocolsPanel } from "../components/ProtocolsPanel";
import { SkillsPanel } from "../components/SkillsPanel";
import { StubBadge } from "../components/StubBadge";
import { TerminalView } from "../components/TerminalView";
import { VoiceStudioPanel } from "../components/VoiceStudioPanel";
import { notifyCoreProgress } from "../coreLevel";
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
  { id: "commands", label: "Кастомные команды", phase: "P12" },
  { id: "voices", label: "Голоса", phase: "P9" },
  { id: "library", label: "Обучение", phase: "P8" },
  { id: "notes", label: "Заметки/файлы", phase: "F2/F5" },
  { id: "terminal", label: "Терминал", phase: "P7" },
] as const;

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
        {segment === "skills" ? <SkillsPanel /> : null}
        {segment === "protocols" ? <ProtocolsPanel /> : null}

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
                      <div className="mono muted">
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
        {segment === "commands" ? <CustomCommandsPanel /> : null}
        {segment === "terminal" ? <TerminalView /> : null}
        {segment === "library" ? <LibraryPanel /> : null}
        {segment === "notes" ? <NotesFilesPanel /> : null}
      </div>
    </div>
  );
}
