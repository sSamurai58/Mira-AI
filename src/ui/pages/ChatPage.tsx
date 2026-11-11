import { useEffect, useRef, useState, type FormEvent } from "react";
import { StubBadge } from "../components/StubBadge";
import type { VoiceState } from "../voiceState";

type ChatPageProps = {
  voiceState: VoiceState;
  sessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onError: (message: string) => void;
  onVoiceState: (state: VoiceState) => void;
  onHoldPtt: (down: boolean) => void;
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
  onHoldPtt,
}: ChatPageProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelLabel, setModelLabel] = useState("…");
  const [memoryNote, setMemoryNote] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, busy]);

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
        setBusy(false);
        onVoiceState("idle");
        requestIdRef.current = null;
      }

      if (event.type === "error") {
        setBusy(false);
        onVoiceState("error");
        onError(event.message);
        setBubbles((prev) => prev.filter((b) => !b.pending));
        requestIdRef.current = null;
      }
    });
  }, [onError, onVoiceState]);

  async function handleNewChat() {
    if (!window.mira || busy) return;
    const session = await window.mira.createSession("Новый диалог");
    setBubbles([]);
    setMemoryNote(null);
    onSessionChange(session.id);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    if (!window.mira) {
      onError(
        "Чат доступен в Electron (`npm run dev:electron` / `npm start`). В чистом браузере IPC нет.",
      );
      return;
    }

    setInput("");
    setBusy(true);
    setMemoryNote(null);
    onVoiceState("thinking");
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;

    setBubbles((prev) => [
      ...prev,
      { id: `local-user-${requestId}`, role: "user", content: text },
      {
        id: `local-assistant-${requestId}`,
        role: "assistant",
        content: "",
        pending: true,
      },
    ]);

    const result = await window.mira.sendChat({
      sessionId,
      text,
      requestId,
    });

    if (result.sessionId) onSessionChange(result.sessionId);
    if (!result.ok && result.error) {
      setBusy(false);
      onVoiceState("error");
      onError(result.error);
      setBubbles((prev) => prev.filter((b) => !b.pending));
    }
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
        {sessionId ? (
          <span className="chip mono">{sessionId.slice(0, 8)}…</span>
        ) : null}
        <button type="button" className="btn" onClick={() => void handleNewChat()}>
          Новый диалог
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onMouseDown={() => onHoldPtt(true)}
          onMouseUp={() => onHoldPtt(false)}
          onMouseLeave={() => onHoldPtt(false)}
        >
          PTT <StubBadge label="P2" />
        </button>
      </div>

      {memoryNote ? <div className="chip">{memoryNote}</div> : null}

      <div className="panel thread chat-thread">
        {bubbles.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Напишите сообщение — ответит mock или OpenAI-compatible модель из
            `.env`.
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

      <form className="composer" onSubmit={(e) => void handleSubmit(e)}>
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
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
          {busy ? "Думаю…" : "Отправить"}
        </button>
      </form>
    </div>
  );
}
