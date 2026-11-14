import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type UIEvent,
} from "react";
import { emitActionLog } from "../actionLog";
import { getBrowserLlmLabel, streamBrowserChat } from "../browserLlm";
import {
  filesToPendingAttachments,
  formatAttachmentsForPrompt,
  isLearnableAttachment,
  toAttachmentPayload,
  type PendingChatAttachment,
} from "../chat/attachments";
import { ChatMarkdown } from "../chat/ChatMarkdown";
import { textForSpeech } from "../chat/codeSpeech";
import {
  dayKey,
  formatChatDateLabel,
  formatChatTime,
} from "../chat/timeLabels";
import { CoreOrb } from "../components/CoreOrb";
import { HomeRail } from "../components/HomeRail";
import { HudCorners } from "../components/HudCorners";
import { ThemeSelect } from "../components/ThemeSelect";
import { notifyCoreProgress } from "../coreLevel";
import {
  localImportLibraryBytes,
  localImportLibraryText,
} from "../library/libraryLocal";
import { createAsrSession, isAsrAvailable } from "../voice/asr";
import {
  getActiveVoiceId,
  isCustomVoiceId,
  listCatalogVoices,
  setActiveVoiceId,
} from "../voice/catalog";
import { getVoiceEngineStatus } from "../voice/engineStatus";
import {
  getHandsFreePrefs,
  matchWakeWord,
  stripWakePhrase,
  type HandsFreePrefs,
} from "../voice/handsFree";
import { getMicDeviceId } from "../voice/micDevices";
import { acquireMicLevel, releaseMicLevel } from "../voice/micLevel";
import { getActiveTtsEngine, listTtsEngines } from "../voice/ttsEngines";
import { speakText, stopSpeaking } from "../voice/tts";
import type { VoiceInfo } from "../voice/types";
import type { VoiceState } from "../voiceState";

type ChatPageProps = {
  /** home = ядро; dialog = чат на отдельной вкладке */
  panel?: "home" | "dialog";
  voiceState: VoiceState;
  sessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onError: (message: string) => void;
  onVoiceState: (state: VoiceState) => void;
  autoSpeak: boolean;
  coreLevel?: number;
  /** 0…100 toward next core level (home orb caption). */
  coreProgressPct?: number;
};

type Bubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** ISO timestamp for time label + date separators */
  createdAt: string;
  pending?: boolean;
  /** Shown while waiting for tools / first tokens */
  statusHint?: string;
  attachments?: Array<{ name: string; kind: string }>;
};

const NEAR_BOTTOM_PX = 96;

function isNearBottom(el: HTMLElement, threshold = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

export function ChatPage({
  panel = "dialog",
  voiceState,
  sessionId,
  onSessionChange,
  onError,
  onVoiceState,
  autoSpeak,
  coreLevel = 1,
  coreProgressPct = 0,
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
  const [pendingFiles, setPendingFiles] = useState<PendingChatAttachment[]>([]);
  const [addToLibrary, setAddToLibrary] = useState(false);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** Last measured first-token / reply latency (seconds); Home «Ответ» tile. */
  const [replySecs, setReplySecs] = useState(0.4);
  const [replyDisplay, setReplyDisplay] = useState("~0,4 с");
  const [micLevel, setMicLevel] = useState(0);
  const [ttsHud, setTtsHud] = useState("TTS…");
  const requestIdRef = useRef<string | null>(null);
  const replyStartRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  /** When true, new bubbles / tokens pin the viewport to the latest message. */
  const stickToBottomRef = useRef(true);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  /** Single floating day chip (never stack sticky dates). */
  const [stickyDateLabel, setStickyDateLabel] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const asrRef = useRef<ReturnType<typeof createAsrSession> | null>(null);
  const wakeRef = useRef<ReturnType<typeof createAsrSession> | null>(null);
  const sessionIdRef = useRef(sessionId);
  const sendTextRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const voiceStateRef = useRef(voiceState);
  const busyRef = useRef(busy);
  const handsFreeRef = useRef(handsFree);
  const startCommandListenRef = useRef<() => void>(() => undefined);

  const showDialog = panel === "dialog";

  const scrollThreadToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = threadRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
    if (behavior === "smooth") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, []);

  const syncStickyDate = useCallback((el: HTMLDivElement) => {
    const markers = el.querySelectorAll<HTMLElement>("[data-thread-date]");
    if (!markers.length) {
      setStickyDateLabel(null);
      return;
    }
    let active: HTMLElement | null = null;
    for (const m of markers) {
      if (m.offsetTop <= el.scrollTop + 10) active = m;
      else break;
    }
    if (!active) {
      setStickyDateLabel(null);
      return;
    }
    // Show float only after the inline marker has scrolled away — one label.
    const past = active.offsetTop < el.scrollTop - 2;
    const label = active.dataset.threadDate?.trim() || null;
    setStickyDateLabel(past && label ? label : null);
  }, []);

  const onThreadScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const near = isNearBottom(el);
      stickToBottomRef.current = near;
      setShowJumpLatest(!near && el.scrollHeight > el.clientHeight + 24);
      syncStickyDate(el);
    },
    [syncStickyDate],
  );

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

  // Pin to latest while the user is (or should be) at the bottom.
  useLayoutEffect(() => {
    if (!showDialog) return;
    if (!stickToBottomRef.current) return;
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [bubbles, busy, interim, showDialog, sessionId]);

  // Opening the dialog tab always lands on the newest messages.
  useLayoutEffect(() => {
    if (!showDialog) return;
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [showDialog, sessionId]);

  const threadItems = useMemo(() => {
    const items: Array<
      | { type: "date"; key: string; label: string }
      | { type: "bubble"; key: string; bubble: Bubble }
    > = [];
    let lastDay = "";
    for (const b of bubbles) {
      const key = dayKey(b.createdAt);
      if (key !== lastDay) {
        lastDay = key;
        items.push({
          type: "date",
          key: `date-${key}`,
          label: formatChatDateLabel(b.createdAt),
        });
      }
      items.push({ type: "bubble", key: b.id, bubble: b });
    }
    return items;
  }, [bubbles]);

  useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    syncStickyDate(el);
  }, [threadItems, showDialog, sessionId, syncStickyDate]);

  // Home TTS engine status (EL key/quota/fallback).
  useEffect(() => {
    let cancelled = false;
    async function refreshTtsHud() {
      const engine = getActiveTtsEngine();
      const info = listTtsEngines().find((e) => e.id === engine);
      if (engine === "elevenlabs" && window.mira?.getElevenLabsStatus) {
        try {
          const st = await window.mira.getElevenLabsStatus(false);
          if (cancelled) return;
          const quota =
            st.characterCount != null && st.characterLimit != null
              ? ` · ${(st.characterLimit - st.characterCount).toLocaleString("ru-RU")} симв.`
              : "";
          setTtsHud(
            st.hasKey
              ? `EL ${st.connected ? "ok" : "ключ"}${quota}`
              : "EL нет ключа → fallback",
          );
          return;
        } catch {
          /* fall through */
        }
      }
      if (!cancelled) {
        setTtsHud(
          engine === "parametric"
            ? "Параметрический"
            : engine === "neural-pack"
              ? "Neural pack"
              : engine === "elevenlabs"
                ? "EL (нужен Electron)"
                : info?.label || "Web Speech",
        );
      }
    }
    void refreshTtsHud();
    const id = window.setInterval(() => void refreshTtsHud(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Mic level for HUD bars when listening only.
  // Never open the mic while TTS is playing — speakers→mic feedback is the
  // classic “озвучки нет, одни помехи/скрипы” regression from 0.1.11 HUD.
  useEffect(() => {
    if (voiceState !== "listening") {
      setMicLevel(0);
      return;
    }
    let cancelled = false;
    let raf = 0;
    let read: (() => number) | null = null;
    void (async () => {
      read = await acquireMicLevel(getMicDeviceId() || undefined);
      if (cancelled) {
        releaseMicLevel();
        return;
      }
      const tick = () => {
        if (cancelled) return;
        setMicLevel(read?.() ?? 0);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      releaseMicLevel();
    };
  }, [voiceState]);

  useEffect(() => {
    const sync = () => setHandsFree(getHandsFreePrefs());
    window.addEventListener("storage", sync);
    const id = window.setInterval(sync, 4000);
    return () => {
      window.removeEventListener("storage", sync);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootVoices() {
      const list = await listCatalogVoices();
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
      const spoken = textForSpeech(text);
      if (!spoken) {
        onVoiceState("idle");
        return;
      }
      speakText(spoken, activeVoiceId, {
        onStart: () => onVoiceState("speaking"),
        onEnd: () => onVoiceState("idle"),
        onStatus: (msg) => {
          setEngineNote(msg);
        },
        onError: (msg) => {
          onVoiceState("idle");
          // Local studio voice: keep auto-speak on — fall back path already ran.
          if (isCustomVoiceId(activeVoiceId)) {
            if (msg && msg !== "synthesis-failed") {
              onError(`TTS: ${msg}`);
            }
            return;
          }
          // System/cloud soft-fail: disable so chat stays usable headless.
          localStorage.setItem("mira.autoSpeak", "0");
          if (msg && msg !== "synthesis-failed") {
            onError(`TTS: ${msg} (автоозвучка выключена)`);
          }
        },
      });
    },
    [activeVoiceId, autoSpeak, onError, onVoiceState],
  );

  async function importPendingToLocalLibrary(
    files: PendingChatAttachment[],
  ): Promise<string | null> {
    const titles: string[] = [];
    for (const f of files) {
      if (!isLearnableAttachment(f) && !f.dataBase64) continue;
      try {
        if (f.kind === "text" && f.text?.trim()) {
          const item = localImportLibraryText({
            title: f.name.replace(/\.[^.]+$/, "") || f.name,
            text: f.text,
            fileName: f.name,
          });
          titles.push(item.title);
        } else {
          const item = localImportLibraryBytes({
            title: f.name.replace(/\.[^.]+$/, "") || f.name,
            fileName: f.name,
            text: f.text,
          });
          titles.push(item.title);
        }
      } catch {
        /* skip bad file */
      }
    }
    if (titles.length) notifyCoreProgress();
    return titles.length
      ? `Добавлено в обучение (demo): ${titles.join(", ")}. Workshop → Обучение → Разобрать.`
      : null;
  }

  const noteReplyLatency = useCallback((startedAt: number | null) => {
    if (startedAt == null) return;
    const secs = Math.min(9.9, Math.max(0.08, (performance.now() - startedAt) / 1000));
    setReplySecs(secs);
    replyStartRef.current = null;
  }, []);

  const sendBrowserDemo = useCallback(
    async (
      trimmed: string,
      files: PendingChatAttachment[] = [],
      toLibrary = false,
    ) => {
      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;
      replyStartRef.current = performance.now();
      setBusy(true);
      setMemoryNote(null);
      onVoiceState("thinking");
      const payloads = files.map(toAttachmentPayload);
      const prompt = formatAttachmentsForPrompt(trimmed, payloads);
      const display =
        trimmed ||
        (files.length
          ? `📎 ${files.map((f) => f.name).join(", ")}`
          : "");
      emitActionLog({
        title: "Сообщение отправлено",
        reason: (display || trimmed || "вложения").slice(0, 120),
        tag: "Чат",
        tone: "accent",
      });
      const nowIso = new Date().toISOString();
      stickToBottomRef.current = true;
      setShowJumpLatest(false);
      setBubbles((prev) => [
        ...prev,
        {
          id: `local-user-${requestId}`,
          role: "user",
          content: display,
          createdAt: nowIso,
          attachments: files.map((f) => ({ name: f.name, kind: f.kind })),
        },
        {
          id: `local-assistant-${requestId}`,
          role: "assistant",
          content: "",
          createdAt: nowIso,
          pending: true,
        },
      ]);

      let libraryHint: string | null = null;
      if (toLibrary && files.length) {
        libraryHint = await importPendingToLocalLibrary(files);
        if (libraryHint) {
          emitActionLog({
            title: "В библиотеку",
            reason: libraryHint.slice(0, 120),
            tag: "Обучение",
            tone: "success",
          });
        }
      }

      const history = bubbles
        .filter((b) => !b.pending && (b.role === "user" || b.role === "assistant"))
        .map((b) => ({ role: b.role, content: b.content }));

      try {
        const cfg = await streamBrowserChat({
          userText: libraryHint ? `${prompt}\n\n[${libraryHint}]` : prompt,
          history,
          handlers: {
            onToken: (chunk) => {
              if (replyStartRef.current != null) {
                noteReplyLatency(replyStartRef.current);
              }
              setBubbles((prev) =>
                prev.map((b) =>
                  b.id === `local-assistant-${requestId}`
                    ? { ...b, content: b.content + chunk, pending: true }
                    : b,
                ),
              );
            },
            onDone: (full) => {
              if (replyStartRef.current != null) {
                noteReplyLatency(replyStartRef.current);
              }
              const label = getBrowserLlmLabel();
              setBubbles((prev) =>
                prev.map((b) =>
                  b.id === `local-assistant-${requestId}`
                    ? { ...b, content: full || b.content, pending: false }
                    : b,
                ),
              );
              setModelLabel(label);
              setContextNote(
                libraryHint
                  ? `browser · ${label} · library`
                  : `browser · ${label}`,
              );
              emitActionLog({
                title: "Ответ готов",
                reason: `browser · ${label}`,
                tag: "Чат",
                tone: "success",
              });
              setBusy(false);
              speakAssistant(full);
            },
            onError: (err) => {
              setBusy(false);
              onVoiceState("error");
              onError(err.message);
              emitActionLog({
                title: "Сбой диалога",
                reason: err.message.slice(0, 120),
                tag: "Ошибка",
                tone: "danger",
              });
              setBubbles((prev) => prev.filter((b) => !b.pending));
            },
          },
        });
        setModelLabel(cfg.label);
      } catch (err) {
        // Fallback mock only when no key configured
        const msg = err instanceof Error ? err.message : String(err);
        const noKey = /нет api-ключа/i.test(msg);
        if (!noKey) {
          setBusy(false);
          onVoiceState("error");
          onError(msg);
          setBubbles((prev) => prev.filter((b) => !b.pending));
          return;
        }

        setContextNote("demo: browser mock — сохраните ключ в API и модели");
        setModelLabel("browser-only");
        const reply = [
          "Browser-demo Mira (mock).",
          `Вы сказали: «${trimmed.slice(0, 240) || "вложения"}».`,
          files.length ? `Файлов: ${files.map((f) => f.name).join(", ")}.` : "",
          libraryHint ?? "",
          "Ключ Grok/OpenAI ещё не сохранён в этой вкладке.",
          "Настройки → API и модели → провайдер grok + XAI_API_KEY → Сохранить, затем снова напишите сюда.",
        ]
          .filter(Boolean)
          .join(" ");

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
      }
    },
    [bubbles, noteReplyLatency, onError, onVoiceState, speakAssistant],
  );

  const sendText = useCallback(
    async (
      text: string,
      files: PendingChatAttachment[] = [],
      toLibrary = false,
    ) => {
      const trimmed = text.trim();
      if ((!trimmed && !files.length) || busy) return;
      if (!window.mira) {
        await sendBrowserDemo(trimmed, files, toLibrary);
        return;
      }

      setBusy(true);
      setMemoryNote(null);
      setContextNote(null);
      onVoiceState("thinking");
      stopSpeaking();

      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;
      replyStartRef.current = performance.now();
      const display =
        trimmed ||
        (files.length
          ? `📎 ${files.map((f) => f.name).join(", ")}`
          : "");

      const nowIso = new Date().toISOString();
      stickToBottomRef.current = true;
      setShowJumpLatest(false);
      setBubbles((prev) => [
        ...prev,
        {
          id: `local-user-${requestId}`,
          role: "user",
          content: display,
          createdAt: nowIso,
          attachments: files.map((f) => ({ name: f.name, kind: f.kind })),
        },
        {
          id: `local-assistant-${requestId}`,
          role: "assistant",
          content: "",
          createdAt: nowIso,
          pending: true,
          statusHint: "Собираю данные…",
        },
      ]);

      const result = await window.mira.sendChat({
        sessionId: sessionIdRef.current,
        text: trimmed,
        requestId,
        attachments: files.map(toAttachmentPayload),
        addToLibrary: toLibrary,
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
        if (!cancelled) setModelLabel(getBrowserLlmLabel());
        return;
      }
      const cfg = await window.mira.getConfig();
      if (!cancelled) {
        setModelLabel(`${cfg.llmProvider}/${cfg.llmModel}`);
      }

      if (sessionId) {
        // Don't clobber an in-flight reply (causes duplicate / truncated bubbles).
        if (busyRef.current || requestIdRef.current) return;
        const pack = await window.mira.getSession(sessionId);
        if (!cancelled && pack) {
          stickToBottomRef.current = true;
          setShowJumpLatest(false);
          setBubbles(
            pack.utterances
              .filter((u) => u.role === "user" || u.role === "assistant")
              .map((u) => ({
                id: u.id,
                role: u.role as "user" | "assistant",
                content: u.content,
                createdAt: u.created_at || new Date().toISOString(),
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

      if (event.type === "phase") {
        setBubbles((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.pending && last.role === "assistant" && !last.content) {
            next[next.length - 1] = {
              ...last,
              statusHint: event.detail,
            };
          }
          return next;
        });
      }

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
        if (replyStartRef.current != null) {
          noteReplyLatency(replyStartRef.current);
        }
        setBubbles((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.pending && last.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: last.content + event.text,
              statusHint: undefined,
            };
          }
          return next;
        });
      }

      if (event.type === "assistant_done") {
        if (replyStartRef.current != null) {
          noteReplyLatency(replyStartRef.current);
        }
        setBubbles((prev) => {
          const next = [...prev];
          const pendingIdx = [...next]
            .map((b, i) => ({ b, i }))
            .reverse()
            .find((x) => x.b.pending && x.b.role === "assistant")?.i;
          const bubble: Bubble = {
            id: event.utterance.id,
            role: "assistant",
            content: event.utterance.content,
            createdAt:
              event.utterance.created_at ||
              (pendingIdx != null ? next[pendingIdx]!.createdAt : new Date().toISOString()),
          };
          if (pendingIdx != null) {
            next[pendingIdx] = bubble;
            return next;
          }
          // Fallback: avoid losing the final answer if the pending bubble was cleared.
          if (!next.some((b) => b.id === event.utterance.id)) {
            next.push(bubble);
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
        notifyCoreProgress();
      }

      if (event.type === "error") {
        setBusy(false);
        onVoiceState("error");
        onError(event.message);
        setBubbles((prev) => prev.filter((b) => !b.pending));
        requestIdRef.current = null;
      }
    });
  }, [noteReplyLatency, onError, onVoiceState, speakAssistant]);

  // Home «Ответ» tile: keep a soft live readout around the last measured latency.
  useEffect(() => {
    if (panel !== "home") {
      const rounded = Math.round(replySecs * 10) / 10;
      setReplyDisplay(`~${String(rounded).replace(".", ",")} с`);
      return;
    }
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const wobble = Math.sin(performance.now() / 1800) * 0.03;
      const v = Math.max(0.08, replySecs + wobble);
      const rounded = Math.round(v * 10) / 10;
      setReplyDisplay(`~${String(rounded).replace(".", ",")} с`);
    };
    tick();
    const id = window.setInterval(tick, 900);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [panel, replySecs]);

  async function handleNewChat() {
    if (!window.mira || busy) return;
    stopSpeaking();
    const session = await window.mira.createSession("Новый диалог");
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
    setBubbles([]);
    setMemoryNote(null);
    onSessionChange(session.id);
    onVoiceState("idle");
  }

  async function addFilesFromList(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    const { added, errors } = await filesToPendingAttachments(
      list,
      pendingFiles.length,
    );
    if (added.length) {
      setPendingFiles((prev) => [...prev, ...added]);
      if (added.some(isLearnableAttachment)) setAddToLibrary(true);
    }
    setAttachNote(errors[0] ?? null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text && !pendingFiles.length) return;
    const files = pendingFiles;
    const toLibrary = addToLibrary;
    setInput("");
    setPendingFiles([]);
    setAttachNote(null);
    void sendText(text, files, toLibrary);
  }

  function onComposerDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void addFilesFromList(e.dataTransfer.files);
  }

  function stopWakeListen() {
    wakeRef.current?.stop();
    wakeRef.current = null;
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
    wakeRef.current = createAsrSession({
      onInterim: (text) => {
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
      onError: () => {
        /* wake errors are non-fatal; loop restarts onEnd when idle */
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

  useEffect(() => {
    const onNew = () => {
      void handleNewChat();
    };
    window.addEventListener("mira:new-chat", onNew);
    return () => window.removeEventListener("mira:new-chat", onNew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, sessionId]);

  const greeting =
    voiceState === "listening"
      ? "Привет! Я слушаю. Чем займёмся?"
      : voiceState === "thinking"
        ? "Думаю…"
        : voiceState === "speaking"
          ? "Говорю…"
          : "Готова. Скажите или напишите.";

  const waveActive =
    voiceState === "listening" || voiceState === "speaking" || Boolean(interim);
  const voiceOn = Boolean(activeVoiceId);
  const waveClass = waveActive
    ? "wave is-live"
    : voiceOn
      ? "wave is-idle is-voice-on"
      : "wave is-idle";

  const showHome = panel === "home";
  const levelPctClamped = Math.min(100, Math.max(0, coreProgressPct));

  return (
    <div className={`home-grid ${showDialog ? "is-dialog-tab" : "is-home-tab"}`}>
      <div className="home-center">
        {showHome ? (
          <section className="glass-card core-card">
            <HudCorners />
            <header className="core-head">
              <h2 className="greeting">{greeting}</h2>
              <div className="pill-row state-pills">
                <span
                  className="pill"
                  data-active={
                    voiceState === "listening" || voiceState === "idle"
                      ? "true"
                      : "false"
                  }
                >
                  Слушает
                </span>
                <span
                  className="pill"
                  data-active={voiceState === "thinking" ? "true" : "false"}
                >
                  Думает
                </span>
                <span
                  className="pill"
                  data-active={voiceState === "speaking" ? "true" : "false"}
                >
                  Говорит
                </span>
              </div>
            </header>

            <div className="core-card-grid">
              <div className="core-col">
                <CoreOrb
                  level={coreLevel}
                  voiceState={voiceState}
                  size={440}
                  active={showHome}
                />
                <div
                  className="core-level-controls"
                  aria-live="polite"
                  aria-label={`Уровень ядра ${coreLevel}`}
                >
                  <div className="core-level-value is-live">
                    <span className="core-level-aura" aria-hidden />
                    <strong>{coreLevel}</strong>
                    <span className="muted">уровень</span>
                    <span
                      className="core-level-progress"
                      aria-hidden
                      style={
                        {
                          "--core-level-pct": `${levelPctClamped}%`,
                        } as CSSProperties
                      }
                    />
                  </div>
                </div>
                <p className="core-level-caption muted">
                  Уровень ядра {coreLevel} ·{" "}
                  {Math.round(levelPctClamped)}% до {coreLevel + 1} · растёт с
                  диалогами и обучением
                </p>
              </div>

              <div className="core-meta">
                <div className="stat-row">
                  <div className="stat-block is-live">
                    <span className="stat-label">Модель</span>
                    <div className="stat-value" title={modelLabel}>
                      {modelLabel}
                    </div>
                  </div>
                  <div className="stat-block is-live">
                    <span className="stat-label">Ответ</span>
                    <div className="stat-value g2 is-ticking">{replyDisplay}</div>
                  </div>
                  <div
                    className={`stat-block is-live${voiceOn ? " is-voice-on" : ""}`}
                  >
                    <span className="stat-label">Голос</span>
                    <div className="stat-value g3">
                      {voiceOn ? "on" : "n/a"}
                    </div>
                  </div>
                  <div className="stat-block is-live" title="Движок TTS">
                    <span className="stat-label">TTS</span>
                    <div className="stat-value g2" style={{ fontSize: "0.78rem" }}>
                      {ttsHud}
                    </div>
                  </div>
                </div>

                <div className="voice-panel is-live">
                  <div className="voice-panel-top">
                    <h4>Голосовой ввод</h4>
                    {interim ? (
                      <span className="mono tiny voice-interim">{interim}</span>
                    ) : (
                      <span className="muted tiny">
                        PTT и чат — во вкладке «Диалог»
                      </span>
                    )}
                  </div>
                  <div className={waveClass} aria-hidden>
                    {Array.from({ length: 36 }, (_, i) => {
                      const base = 18 + ((i * 37) % 55);
                      const live =
                        micLevel > 0.02
                          ? Math.min(
                              100,
                              base + micLevel * 90 * (0.55 + ((i * 13) % 10) / 20),
                            )
                          : base;
                      return (
                        <span
                          key={i}
                          style={{
                            height: `${live}%`,
                            animationDelay: `${(i % 7) * 0.08}s`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="core-hint-row">
                  <p className="muted" style={{ margin: 0 }}>
                    {voiceState === "speaking"
                      ? "Говорю — нажмите «Перебить» или Space, чтобы остановить и сразу слушать."
                      : "Ядро реагирует на голос и ответы. Чтобы писать или говорить с Мирой — откройте «Диалог»."}
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {showDialog ? (
        <section className="glass-card chat-card">
          <div className="chat-toolbar">
            <span className="chip">
              Модель <strong>{modelLabel}</strong>
            </span>
            {handsFree.enabled ? (
              <span className="chip">
                hands-free <strong>«{handsFree.wakePhrase}»</strong>
              </span>
            ) : null}
            {contextNote ? <span className="chip">{contextNote}</span> : null}
            {memoryNote ? <span className="chip">{memoryNote}</span> : null}
            {interim ? (
              <span className="chip">
                Слушаю: <strong>{interim}</strong>
              </span>
            ) : null}

            {voices.length > 0 ? (
              <label className="row voice-select">
                <span className="muted">Голос</span>
                <ThemeSelect
                  aria-label="Голос"
                  value={activeVoiceId ?? ""}
                  options={voices.map((v) => ({
                    value: v.id,
                    label: `${v.name} (${v.lang})`,
                  }))}
                  onChange={handleVoicePick}
                />
              </label>
            ) : null}

            {!isAsrAvailable() ? (
              <button
                type="button"
                className="btn"
                onClick={handleDemoPtt}
                disabled={busy}
              >
                Demo PTT
              </button>
            ) : null}
            {voiceState === "speaking" ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleBargeIn}
                  title="Стоп озвучки и сразу слушать (Space)"
                >
                  Перебить
                </button>
                <span className="chip" title="Barge-in">
                  Space = перебить → слушаю
                </span>
                <button type="button" className="btn" onClick={handleStopSpeak}>
                  Стоп
                </button>
              </>
            ) : null}
          </div>

          <div className="thread-wrap">
            {stickyDateLabel ? (
              <div className="thread-date-float" aria-hidden>
                <span>{stickyDateLabel}</span>
              </div>
            ) : null}
            <div
              className="thread hide-scroll"
              ref={threadRef}
              onScroll={onThreadScroll}
            >
              {bubbles.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  Скажите «Мира», зажмите микрофон или напишите ниже.
                </p>
              ) : (
                threadItems.map((item) =>
                  item.type === "date" ? (
                    <div
                      key={item.key}
                      className="thread-date"
                      role="separator"
                      data-thread-date={item.label}
                    >
                      <span>{item.label}</span>
                    </div>
                  ) : (
                    <div
                      key={item.key}
                      className={`bubble ${item.bubble.role}`}
                    >
                      {item.bubble.attachments?.length ? (
                        <div className="bubble-attach-list">
                          {item.bubble.attachments.map((a) => (
                            <span key={a.name} className="attach-chip">
                              {a.kind === "image" ? "🖼" : "📎"} {a.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {item.bubble.content ? (
                        item.bubble.role === "assistant" ? (
                          <ChatMarkdown text={item.bubble.content} />
                        ) : (
                          <div className="bubble-plain">
                            {item.bubble.content}
                          </div>
                        )
                      ) : item.bubble.pending ? (
                        <span className="bubble-pending">
                          {item.bubble.statusHint || "Думаю…"}
                        </span>
                      ) : null}
                      {item.bubble.createdAt ? (
                        <time
                          className="bubble-time"
                          dateTime={item.bubble.createdAt}
                        >
                          {formatChatTime(item.bubble.createdAt)}
                        </time>
                      ) : null}
                    </div>
                  ),
                )
              )}
              <div ref={bottomRef} />
            </div>
            {showJumpLatest ? (
              <button
                type="button"
                className="thread-jump"
                aria-label="К новым сообщениям"
                title="К новым сообщениям"
                onClick={() => scrollThreadToLatest("smooth")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 10l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>

          <div className="hint-chips">
            {[
              "Что на камере",
              "Включи ТВ",
              "Покажи модель",
              "Новая заметка",
            ].map((label) => (
              <button
                key={label}
                type="button"
                className="hint-chip"
                disabled={busy}
                onClick={() => void sendText(label)}
              >
                {label}
              </button>
            ))}
          </div>

          {pendingFiles.length > 0 ? (
            <div className="attach-pending">
              {pendingFiles.map((f) => (
                <span key={f.id} className="attach-chip is-pending">
                  {f.kind === "image" ? "🖼" : "📎"} {f.name}
                  <button
                    type="button"
                    className="attach-chip-x"
                    aria-label={`Убрать ${f.name}`}
                    onClick={() =>
                      setPendingFiles((prev) =>
                        prev.filter((x) => x.id !== f.id),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              <label className="attach-learn-toggle">
                <input
                  type="checkbox"
                  checked={addToLibrary}
                  onChange={(e) => setAddToLibrary(e.target.checked)}
                />
                В материалы обучения
              </label>
            </div>
          ) : null}
          {attachNote ? (
            <p className="mono tiny muted" style={{ margin: 0 }}>
              {attachNote}
            </p>
          ) : null}

          <form
            className={`composer-row ${dragOver ? "is-drop" : ""}`}
            onSubmit={handleSubmit}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onComposerDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void addFilesFromList(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="rainbow-field has-attach">
              <button
                type="button"
                className="attach-btn"
                disabled={busy}
                title="Прикрепить файлы к сообщению"
                aria-label="Прикрепить файлы к сообщению"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M16.5 6.5v8.25a4.5 4.5 0 1 1-9 0V7a3 3 0 0 1 6 0v7.25a1.5 1.5 0 1 1-3 0V8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="attach-btn-label">Файл</span>
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  pendingFiles.length
                    ? "Напишите сообщение к файлам…"
                    : "Сообщение или перетащите файлы сюда…"
                }
                disabled={busy}
                aria-label="Сообщение для Mira"
              />
            </div>
            <button
              type="button"
              className={`mic-btn ${voiceState === "listening" ? "is-hot" : ""}`}
              aria-label="Push to talk"
              disabled={busy}
              onMouseDown={() => handlePtt(true)}
              onMouseUp={() => handlePtt(false)}
              onMouseLeave={() => {
                if (voiceState === "listening") handlePtt(false);
              }}
              onTouchStart={() => handlePtt(true)}
              onTouchEnd={() => handlePtt(false)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" />
              </svg>
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || (!input.trim() && !pendingFiles.length)}
            >
              {busy ? "Думаю…" : "Отправить"}
            </button>
          </form>
          {engineNote ? (
            <p className="mono tiny muted" style={{ margin: 0 }}>
              {engineNote}
            </p>
          ) : null}
        </section>
        ) : null}
      </div>

      {showHome ? (
        <HomeRail
          modelLabel={modelLabel}
          voiceNote={
            activeVoiceId
              ? isCustomVoiceId(activeVoiceId)
                ? "студия"
                : "voice on"
              : "voice n/a"
          }
          voiceState={voiceState}
        />
      ) : null}
    </div>
  );
}

