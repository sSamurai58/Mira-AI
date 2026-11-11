import { useEffect, useState, type FormEvent } from "react";
import { LibraryPanel } from "../components/LibraryPanel";
import { StubBadge } from "../components/StubBadge";
import { TerminalView } from "../components/TerminalView";
import {
  getActiveVoiceId,
  setActiveVoiceId,
  waitForVoices,
} from "../voice/catalog";
import { speakText, stopSpeaking } from "../voice/tts";
import type { VoiceInfo } from "../voice/types";

const SEGMENTS = [
  { id: "skills", label: "Скиллы", phase: "P3" },
  { id: "protocols", label: "Протоколы", phase: "P3" },
  { id: "voices", label: "Голоса", phase: "P2" },
  { id: "library", label: "Библиотека", phase: "P8" },
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
  const [draft, setDraft] = useState({
    id: "custom-protocol",
    name: "Новый протокол",
    description: "",
    triggers: "протокол тест",
    body: "1. Скажи «протокол выполнен».\n2. Предложи следующий шаг.",
  });
  const [runLog, setRunLog] = useState<string | null>(null);

  async function refreshCatalogs() {
    if (!window.mira) {
      setNote("Нужен Electron для каталогов skills/protocols.");
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

  useEffect(() => {
    let cancelled = false;
    void waitForVoices().then((list) => {
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

  function preview(id: string) {
    selectVoice(id);
    speakText("Привет, я Mira. Это превью голоса из каталога.", id);
  }

  async function toggleSkill(id: string, enabled: boolean) {
    if (!window.mira) return;
    await window.mira.setSkillEnabled(id, enabled);
    await refreshCatalogs();
  }

  async function toggleProtocol(id: string, enabled: boolean) {
    if (!window.mira) return;
    await window.mira.setProtocolEnabled(id, enabled);
    await refreshCatalogs();
  }

  async function saveProtocol(e: FormEvent) {
    e.preventDefault();
    if (!window.mira) return;
    await window.mira.saveProtocol({
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      triggers: draft.triggers
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      enabled: true,
      body: draft.body,
    });
    await refreshCatalogs();
    setNote(`Сохранён протокол ${draft.id}`);
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
    <div className="stack">
      <div className="workshop-segments">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`btn ${segment === s.id ? "btn-primary" : ""}`}
            onClick={() => setSegment(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {segment === "skills" ? (
        <div className="panel stack">
          <div className="row">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Скиллы</h2>
            <StubBadge label="P3 #9" />
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Установленные ≠ активные. В контекст попадают только matched
            on-demand (или явная команда «включи skill …»). {note}
          </p>
          {skills.map((s) => (
            <div key={s.id} className="panel voice-row">
              <div>
                <strong>{s.name}</strong>
                <div className="muted">{s.description}</div>
                <div className="mono muted">
                  {s.id} · triggers: {s.triggers.join(", ") || "—"}
                </div>
              </div>
              <label className="row">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) => void toggleSkill(s.id, e.target.checked)}
                />
                <span>установлен</span>
              </label>
            </div>
          ))}
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
            <input
              value={draft.id}
              onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              placeholder="id"
            />
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="name"
            />
            <input
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="description"
            />
            <input
              value={draft.triggers}
              onChange={(e) => setDraft({ ...draft, triggers: e.target.value })}
              placeholder="triggers, comma-separated"
            />
            <textarea
              rows={5}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <button type="submit" className="btn btn-primary">
              Сохранить md
            </button>
          </form>
        </div>
      ) : null}

      {segment === "voices" ? (
        <div className="panel stack">
          <div className="row">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Голоса</h2>
            <StubBadge label="P2 #11" />
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
                    {activeId === v.id ? " · active" : ""}
                  </div>
                </div>
                <div className="row">
                  <button type="button" className="btn" onClick={() => preview(v.id)}>
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
        </div>
      ) : null}

      {segment === "terminal" ? <TerminalView /> : null}
      {segment === "library" ? <LibraryPanel /> : null}
    </div>
  );
}
