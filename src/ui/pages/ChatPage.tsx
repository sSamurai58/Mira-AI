import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createAsrSession, isAsrAvailable } from "../voice/asr";
import {
  getActiveVoiceId,
  setActiveVoiceId,
  waitForVoices,
} from "../voice/catalog";
import { getVoiceEngineStatus } from "../voice/engineStatus";
import { speakText, stopSpeaking } from "../voice/tts";
import type { VoiceInfo } from "../voice/types";
import type { VoiceState } from "../voiceState";

type ChatPageProps = {
  voiceState: VoiceState;
  sessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onError: (message: string) => void;
  onVoiceState: (state: VoiceState) => void;
  autoSpeak: boolean;
};

type Bubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

export function ChatPage({
  voiceState,
  sessionId,
  onSessionChange,
  onError,
  onVoiceState,
  autoSpeak,
}: ChatPageProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelLabel, setModelLabel] = useState("…");
  const [memoryNote, setMemoryNote] = useState<string | null>(null);
  const [contextNote, setContextNote] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [activeVoiceId, setActiveVoiceIdState] = useState<string | null>(null);
  const [engineNote, setEngineNote] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const asrRef = useRef<ReturnType<typeof createAsrSession> | null>(null);
  const sessionIdRef = useRef(sessionId);
  const sendTextRef = useRef<(text: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, busy, interim]);

  useEffect(() => {
    let cancelled = false;
    async function bootVoices() {
      const list = await waitForVoices();
      if (cancelled) return;
      setVoices(list);
      setActiveVoiceIdState(getActiveVoiceId(list));
      setEngineNote(getVoiceEngineStatus().detail);
    }
    void bootVoices();
    return () => {
      cancelled = true;
      stopSpeaking();
      asrRef.current?.stop();
    };
  }, []);

  const speakAssistant = useCallback(
    (text: string) => {
      if (!autoSpeak) {
        onVoiceState("idle");
        return;
      }
      speakText(text, activeVoiceId, {
        onStart: () => onVoiceState("speaking"),
        onEnd: () => onVoiceState("idle"),
        onError: (msg) => {
          onError(msg);
          onVoiceState("error");
        },
      });
    },
    [activeVoiceId, autoSpeak, onError, onVoiceState],
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      if (!window.mira) {
        onError(
          "Чат доступен в Electron (`npm run dev:electron` / `npm start`).",
        );
        return;
      }

      setBusy(true);
      setMemoryNote(null);
      setContextNote(null);
      onVoiceState("thinking");
      stopSpeaking();

      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;

      setBubbles((prev) => [
        ...prev,
        { id: `local-user-${requestId}`, role: "user", content: trimmed },
        {
          id: `local-assistant-${requestId}`,
          role: "assistant",
          content: "",
          pending: true,
        },
      ]);

      const result = await window.mira.sendChat({
        sessionId: sessionIdRef.current,
        text: trimmed,
        requestId,
      });

      if (result.sessionId) onSessionChange(result.sessionId);
      if (!result.ok && result.error) {
        setBusy(false);
        onVoiceState("error");
        onError(result.error);
        setBubbles((prev) => prev.filter((b) => !b.pending));
      }
    },
    [busy, onError, onSessionChange, onVoiceState],
  );

  sendTextRef.current = sendText;

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!window.mira) {
        setModelLabel("browser-only");
        return;
      }
      const cfg = await window.mira.getConfig();
      if (!cancelled) {
        setModelLabel(`${cfg.llmProvider}/${cfg.llmModel}`);
      }

      if (sessionId) {
        const pack = await window.mira.getSession(sessionId);
        if (!cancelled && pack) {
          setBubbles(
            pack.utterances
              .filter((u) => u.role === "user" || u.role === "assistant")
              .map((u) => ({
                id: u.id,
                role: u.role as "user" | "assistant",
                content: u.content,
              })),
          );
        }
      } else {
        const sessions = await window.mira.listSessions();
        if (!cancelled && sessions[0]) {
          onSessionChange(sessions[0].id);
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [sessionId, onSessionChange]);

  useEffect(() => {
    if (!window.mira) return;
    return window.mira.onChatEvent(({ requestId, event }) => {
      if (requestIdRef.current && requestId !== requestIdRef.current) return;

      if (event.type === "context") {
        const skillPart = event.skills.length
          ? `skills: ${event.skills.map((s) => s.id).join(", ")}`
          : "skills: none";
        const protoPart = event.protocol
          ? `protocol: ${event.protocol.id}`
          : "protocol: none";
        const webPart = event.web ? `web: ${event.web}` : "web: none";
        setContextNote(`${skillPart} · ${protoPart} · ${webPart}`);
      }

      if (event.type === "token") {
        setBubbles((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.pending && last.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: last.content + event.text,
            };
          }
          return next;
        });
      }

      if (event.type === "assistant_done") {
        setBubbles((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.pending) {
            next[next.length - 1] = {
              id: event.utterance.id,
              role: "assistant",
              content: event.utterance.content,
            };
          }
          return next;
        });
        setMemoryNote(
          event.memoryUsed.length
            ? `Память: использовано фрагментов — ${event.memoryUsed.length}`
            : null,
        );
        const skillPart = event.skillsUsed.length
          ? `skills: ${event.skillsUsed.map((s) => s.id).join(", ")}`
          : "skills: none";
        const protoPart = event.protocolUsed
          ? `protocol: ${event.protocolUsed.id}`
          : "protocol: none";
        const webPart = event.webUsed ? `web: ${event.webUsed}` : "web: none";
        setContextNote(`${skillPart} · ${protoPart} · ${webPart}`);
        setBusy(false);
        requestIdRef.current = null;
        speakAssistant(event.utterance.content);
      }

      if (event.type === "error") {
        setBusy(false);
        onVoiceState("error");
        onError(event.message);
        setBubbles((prev) => prev.filter((b) => !b.pending));
        requestIdRef.current = null;
      }
    });
  }, [onError, onVoiceState, speakAssistant]);

  async function handleNewChat() {
    if (!window.mira || busy) return;
    stopSpeaking();
    const session = await window.mira.createSession("Новый диалог");
    setBubbles([]);
    setMemoryNote(null);
    onSessionChange(session.id);
    onVoiceState("idle");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    void sendText(text);
  }

  function handlePtt(down: boolean) {
    if (busy) return;

    if (down) {
      stopSpeaking();
      setInterim("");
      onVoiceState("listening");

      asrRef.current = createAsrSession({
        onInterim: setInterim,
        onFinal: (transcript) => {
          setInterim("");
          void sendTextRef.current(transcript);
        },
        onError: (msg) => {
          onError(msg);
          onVoiceState("error");
        },
        onEnd: () => {
          setInterim("");
        },
      });
      asrRef.current.start();
      return;
    }

    asrRef.current?.stop();
  }

  function handleDemoPtt() {
    if (busy) return;
    stopSpeaking();
    onVoiceState("listening");
    window.setTimeout(() => {
      void sendText("Демо PTT: расскажи коротко кто ты.");
    }, 250);
  }

  function handleStopSpeak() {
    stopSpeaking();
    onVoiceState("idle");
  }

  function handleVoicePick(id: string) {
    setActiveVoiceId(id);
    setActiveVoiceIdState(id);
  }

  return (
    <div className="stack chat-layout">
      <div className="row">
        <span className="chip">
          Модель <strong>{modelLabel}</strong>
        </span>
        <span className="chip">
          state <strong>{voiceState}</strong>
        </span>
        <span className="chip" title={engineNote}>
          voice <strong>{activeVoiceId ? "on" : "n/a"}</strong>
        </span>
        <button type="button" className="btn" onClick={() => void handleNewChat()}>
          Новый диалог
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onMouseDown={() => handlePtt(true)}
          onMouseUp={() => handlePtt(false)}
          onMouseLeave={() => {
            if (voiceState === "listening") handlePtt(false);
          }}
          onTouchStart={() => handlePtt(true)}
          onTouchEnd={() => handlePtt(false)}
          disabled={busy}
        >
          Push to talk
        </button>
        {!isAsrAvailable() ? (
          <button type="button" className="btn" onClick={handleDemoPtt} disabled={busy}>
            Demo PTT
          </button>
        ) : null}
        {voiceState === "speaking" ? (
          <button type="button" className="btn btn-danger" onClick={handleStopSpeak}>
            Стоп
          </button>
        ) : null}
      </div>

      {voices.length > 0 ? (
        <label className="row voice-select">
          <span className="muted">Голос</span>
          <select
            value={activeVoiceId ?? ""}
            onChange={(e) => handleVoicePick(e.target.value)}
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Каталог голосов пуст в этой среде — TTS/ASR появятся в Electron/Chrome с
          системными голосами.
        </p>
      )}

      {contextNote ? <div className="chip">{contextNote}</div> : null}
      {memoryNote ? <div className="chip">{memoryNote}</div> : null}
      {interim ? (
        <div className="chip">
          Слушаю: <strong>{interim}</strong>
        </div>
      ) : null}

      <div className="panel voice-stage compact-orb">
        <div className="orb" data-state={voiceState} aria-hidden />
        <div className="muted">{engineNote || "Voice engine…"}</div>
      </div>

      <div className="panel thread chat-thread">
        {bubbles.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Зажмите PTT и говорите — или напишите текст. Ответ озвучивается
            автоматически.
          </p>
        ) : (
          bubbles.map((b) => (
            <div key={b.id} className={`bubble ${b.role}`}>
              {b.content || (b.pending ? "…" : "")}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Спросите Mira…"
          rows={3}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !input.trim()}
        >
          {busy ? "Думаю…" : "Отправить"}
        </button>
      </form>
    </div>
  );
}
