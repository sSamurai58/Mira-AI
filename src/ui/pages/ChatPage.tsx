import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createAsrSession, isAsrAvailable } from "../voice/asr";
import {
  getActiveVoiceId,
  setActiveVoiceId,
  waitForVoices,
} from "../voice/catalog";
import { getVoiceEngineStatus } from "../voice/engineStatus";
import {
  getHandsFreePrefs,
  matchWakeWord,
  stripWakePhrase,
  type HandsFreePrefs,
} from "../voice/handsFree";
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
  const [handsFree, setHandsFree] = useState<HandsFreePrefs>(() =>
    getHandsFreePrefs(),
  );
  const [wakeHint, setWakeHint] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const asrRef = useRef<ReturnType<typeof createAsrSession> | null>(null);
  const wakeRef = useRef<ReturnType<typeof createAsrSession> | null>(null);
  const sessionIdRef = useRef(sessionId);
  const sendTextRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const voiceStateRef = useRef(voiceState);
  const busyRef = useRef(busy);
  const handsFreeRef = useRef(handsFree);
  const startCommandListenRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, busy, interim]);

  useEffect(() => {
    const sync = () => setHandsFree(getHandsFreePrefs());
    window.addEventListener("storage", sync);
    const id = window.setInterval(sync, 800);
    return () => {
      window.removeEventListener("storage", sync);
      window.clearInterval(id);
    };
  }, []);

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
      wakeRef.current?.stop();
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
          // Soft-fail TTS: keep chat usable in headless / empty-voice envs
          localStorage.setItem("mira.autoSpeak", "0");
          onVoiceState("idle");
          if (msg && msg !== "synthesis-failed") {
            onError(`TTS: ${msg} (автоозвучка выключена)`);
          }
        },
      });
    },
    [activeVoiceId, autoSpeak, onError, onVoiceState],
  );

  const sendBrowserDemo = useCallback(
    async (trimmed: string) => {
      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;
      setBusy(true);
      setMemoryNote(null);
      setContextNote("demo: browser mock (без Electron IPC)");
      onVoiceState("thinking");
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

      const reply = [
        "Browser-demo Mira (mock).",
        `Вы сказали: «${trimmed.slice(0, 240)}».`,
        "Полный чат с SQLite/tools — в Electron. Здесь быстрый демо-ответ без IPC.",
        "Живые модели: LLM_PROVIDER=openai|claude|gemini|grok + ключ в .env.",
      ].join(" ");

      let built = "";
      for (const word of reply.split(/(\s+)/)) {
        built += word;
        const snapshot = built;
        setBubbles((prev) =>
          prev.map((b) =>
            b.id === `local-assistant-${requestId}`
              ? { ...b, content: snapshot, pending: true }
              : b,
          ),
        );
        await new Promise((r) => setTimeout(r, 8));
      }
      setBubbles((prev) =>
        prev.map((b) =>
          b.id === `local-assistant-${requestId}`
            ? { ...b, content: built, pending: false }
            : b,
        ),
      );
      setBusy(false);
      speakAssistant(built);
    },
    [onVoiceState, speakAssistant],
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      if (!window.mira) {
        await sendBrowserDemo(trimmed);
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
    [busy, onError, onSessionChange, onVoiceState, sendBrowserDemo],
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
        const desktopPart = event.desktop
          ? `desktop: ${event.desktop}`
          : "desktop: none";
        const msgPart = event.messaging
          ? `msg: ${event.messaging}`
          : "msg: none";
        const termPart = event.terminal
          ? `term: ${event.terminal}`
          : "term: none";
        const learnedPart = event.learned
          ? `learned: ${event.learned}`
          : "learned: none";
        setContextNote(
          `${skillPart} · ${protoPart} · ${webPart} · ${desktopPart} · ${msgPart} · ${termPart} · ${learnedPart}`,
        );
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
        const desktopPart = event.desktopUsed
          ? `desktop: ${event.desktopUsed}`
          : "desktop: none";
        const msgPart = event.messagingUsed
          ? `msg: ${event.messagingUsed}`
          : "msg: none";
        const termPart = event.terminalUsed
          ? `term: ${event.terminalUsed}`
          : "term: none";
        const learnedPart = event.learnedUsed
          ? `learned: ${event.learnedUsed}`
          : "learned: none";
        const blenderPart = event.blenderUsed
          ? `blender: ${event.blenderUsed}`
          : "blender: none";
        const addonPart = event.addonUsed
          ? `addon: ${event.addonUsed}`
          : "addon: none";
        setContextNote(
          `${skillPart} · ${protoPart} · ${webPart} · ${desktopPart} · ${msgPart} · ${termPart} · ${learnedPart} · ${blenderPart} · ${addonPart}`,
        );
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

  function stopWakeListen() {
    wakeRef.current?.stop();
    wakeRef.current = null;
    setWakeHint(null);
  }

  function startCommandListen() {
    if (busyRef.current) return;
    stopWakeListen();
    stopSpeaking();
    setInterim("");
    onVoiceState("listening");

    asrRef.current?.stop();
    asrRef.current = createAsrSession({
      onInterim: setInterim,
      onFinal: (transcript) => {
        setInterim("");
        const prefs = handsFreeRef.current;
        const cleaned = prefs.enabled
          ? stripWakePhrase(transcript, prefs.wakePhrase)
          : transcript;
        const text = cleaned.trim() || transcript.trim();
        void sendTextRef.current(text);
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
  }
  startCommandListenRef.current = startCommandListen;

  function startWakeListen() {
    const prefs = handsFreeRef.current;
    if (!prefs.enabled || !isAsrAvailable()) return;
    if (busyRef.current) return;
    if (
      voiceStateRef.current === "listening" ||
      voiceStateRef.current === "thinking" ||
      voiceStateRef.current === "speaking"
    ) {
      return;
    }

    stopWakeListen();
    setWakeHint(`Hands-free: скажите «${prefs.wakePhrase}»…`);
    wakeRef.current = createAsrSession({
      onInterim: (text) => {
        setWakeHint(`Слышу: ${text}`);
        if (
          matchWakeWord(text, prefs.wakePhrase, prefs.sensitivity)
        ) {
          startCommandListenRef.current();
        }
      },
      onFinal: (transcript) => {
        if (
          matchWakeWord(transcript, prefs.wakePhrase, prefs.sensitivity)
        ) {
          const rest = stripWakePhrase(transcript, prefs.wakePhrase).trim();
          if (rest) {
            stopWakeListen();
            void sendTextRef.current(rest);
          } else {
            startCommandListenRef.current();
          }
        } else if (prefs.enabled && voiceStateRef.current === "idle") {
          // restart continuous wake watch after utterance without wake
          wakeRef.current?.stop();
          window.setTimeout(() => startWakeListen(), 200);
        }
      },
      onError: (msg) => {
        if (msg !== "no-speech") setWakeHint(`Wake ASR: ${msg}`);
      },
      onEnd: () => {
        if (
          prefs.enabled &&
          !busyRef.current &&
          voiceStateRef.current === "idle"
        ) {
          window.setTimeout(() => startWakeListen(), 250);
        }
      },
    });
    wakeRef.current.start();
  }

  // Hands-free wake loop when idle
  useEffect(() => {
    if (!handsFree.enabled) {
      stopWakeListen();
      return;
    }
    if (voiceState === "idle" && !busy) {
      startWakeListen();
    } else if (voiceState !== "idle") {
      // command/tts path owns mic; stop wake watcher
      if (voiceState !== "listening") stopWakeListen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional wake loop
  }, [handsFree.enabled, handsFree.wakePhrase, handsFree.sensitivity, voiceState, busy]);

  function handlePtt(down: boolean) {
    if (busy) return;

    if (down) {
      startCommandListen();
      return;
    }

    asrRef.current?.stop();
  }

  function handleDemoPtt() {
    if (busy) return;
    stopWakeListen();
    stopSpeaking();
    onVoiceState("listening");
    window.setTimeout(() => {
      void sendText("Демо PTT: расскажи коротко кто ты.");
    }, 250);
  }

  function handleBargeIn() {
    if (!handsFree.bargeIn && voiceState !== "speaking") {
      handleStopSpeak();
      return;
    }
    stopSpeaking();
    startCommandListen();
  }

  function handleStopSpeak() {
    stopSpeaking();
    onVoiceState("idle");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (voiceStateRef.current === "speaking" && handsFreeRef.current.bargeIn) {
        e.preventDefault();
        handleBargeIn();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {handsFree.enabled ? (
          <span className="chip">
            hands-free <strong>«{handsFree.wakePhrase}»</strong>
          </span>
        ) : null}
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
          <>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleBargeIn}
              title="Стоп TTS и сразу слушать (Space)"
            >
              Перебить
            </button>
            <button type="button" className="btn" onClick={handleStopSpeak}>
              Стоп
            </button>
          </>
        ) : null}
      </div>
      {wakeHint ? <div className="chip">{wakeHint}</div> : null}

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
            Зажмите PTT, включите hands-free (Настройки → Голос) или напишите
            текст. Во время озвучки — «Перебить» / Space.
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
