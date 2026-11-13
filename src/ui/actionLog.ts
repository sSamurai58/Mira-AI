import { useSyncExternalStore } from "react";
import type { VoiceState } from "./voiceState";

export type ActionLogTone = "accent" | "success" | "warning" | "danger";

export type ActionLogEntry = {
  id: string;
  at: number;
  title: string;
  reason: string;
  tag: string;
  tone: ActionLogTone;
  pending?: boolean;
};

export type ActionLogInput = {
  id?: string;
  title: string;
  reason: string;
  tag: string;
  tone?: ActionLogTone;
  pending?: boolean;
};

const MAX_ENTRIES = 48;
const ACTION_EVENT = "mira:action-log";

let entries: ActionLogEntry[] = [];
const listeners = new Set<() => void>();
let bootstrapped = false;
let lastVoiceLogged: VoiceState | null = null;
let lastPhaseKey = "";
let lastUpdateDetail = "";

function notify() {
  for (const listener of listeners) listener();
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getActionLog(): ActionLogEntry[] {
  return entries;
}

export function subscribeActionLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActionLog(): ActionLogEntry[] {
  return useSyncExternalStore(subscribeActionLog, getActionLog, getActionLog);
}

export function pushActionLog(input: ActionLogInput): ActionLogEntry {
  const entry: ActionLogEntry = {
    id: input.id ?? makeId(),
    at: Date.now(),
    title: input.title,
    reason: input.reason,
    tag: input.tag,
    tone: input.tone ?? "accent",
    pending: input.pending,
  };

  const withoutDup = entries.filter((e) => e.id !== entry.id);
  entries = [entry, ...withoutDup].slice(0, MAX_ENTRIES);
  notify();
  return entry;
}

export function patchActionLog(
  id: string,
  patch: Partial<Omit<ActionLogEntry, "id">>,
): void {
  let changed = false;
  entries = entries.map((entry) => {
    if (entry.id !== id) return entry;
    changed = true;
    return { ...entry, ...patch, at: patch.at ?? Date.now() };
  });
  if (changed) notify();
}

export function clearActionLog(): void {
  entries = [];
  notify();
}

/** UI helpers fire this; the bridge stores the row (single path). */
export function emitActionLog(input: ActionLogInput): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: input }));
    return;
  }
  pushActionLog(input);
}

export function formatActionLogTime(at: number, now = Date.now()): string {
  const delta = Math.max(0, now - at);
  if (delta < 4_000) return "сейчас";
  if (delta < 60_000) return `${Math.floor(delta / 1000)} с`;
  if (delta < 60 * 60_000) return `${Math.floor(delta / 60_000)} мин`;
  return new Date(at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clip(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function voiceEntry(state: VoiceState): ActionLogInput | null {
  switch (state) {
    case "listening":
      return {
        title: "Слушаю",
        reason: "ASR активен — говорите или диктуйте команду.",
        tag: "Голос",
        tone: "success",
      };
    case "thinking":
      return {
        title: "Думаю",
        reason: "Запрос обрабатывается моделью и инструментами.",
        tag: "Чат",
        tone: "accent",
      };
    case "speaking":
      return {
        title: "Говорю",
        reason: "TTS озвучивает ответ.",
        tag: "Голос",
        tone: "success",
      };
    case "error":
      return {
        title: "Ошибка голоса / диалога",
        reason: "Сбой ASR, TTS или ответа модели.",
        tag: "Ошибка",
        tone: "danger",
      };
    default:
      return null;
  }
}

export function logVoiceState(state: VoiceState): void {
  if (state === lastVoiceLogged) return;
  // Skip idle chatter; keep meaningful transitions only.
  if (state === "idle") {
    lastVoiceLogged = state;
    return;
  }
  const entry = voiceEntry(state);
  if (!entry) return;
  lastVoiceLogged = state;
  pushActionLog(entry);
}

export function logAppError(message: string): void {
  const reason = clip(message);
  if (!reason) return;
  pushActionLog({
    title: "Ошибка",
    reason,
    tag: "Система",
    tone: "danger",
  });
}

function handleChatEvent(event: MiraChatEvent): void {
  if (event.type === "user") {
    pushActionLog({
      title: "Сообщение отправлено",
      reason: clip(event.utterance.content || "(пусто)"),
      tag: "Чат",
      tone: "accent",
    });
    return;
  }

  if (event.type === "phase") {
    const key = `${event.phase}:${event.detail}`;
    if (key === lastPhaseKey) return;
    lastPhaseKey = key;
    pushActionLog({
      title: event.phase === "tools" ? "Инструменты" : "Модель",
      reason: clip(event.detail),
      tag: "Чат",
      tone: "accent",
    });
    return;
  }

  if (event.type === "context") {
    const skills = event.skills.map((s) => s.id).join(", ") || "нет";
    const bits = [
      event.protocol ? `протокол ${event.protocol.id}` : null,
      event.web ? `web:${event.web}` : null,
      event.desktop ? `desktop:${event.desktop}` : null,
      event.messaging ? `msg:${event.messaging}` : null,
      event.terminal ? `term:${event.terminal}` : null,
      event.learned ? `learned:${event.learned}` : null,
      event.blender ? `blender:${event.blender}` : null,
      event.addon ? `addon:${event.addon}` : null,
    ].filter(Boolean);
    pushActionLog({
      title: "Контекст собран",
      reason: clip(
        `skills: ${skills}${bits.length ? ` · ${bits.join(" · ")}` : ""}`,
      ),
      tag: "Чат",
      tone: "accent",
    });
    return;
  }

  if (event.type === "assistant_done") {
    lastPhaseKey = "";
    const tools = [
      event.skillsUsed.length
        ? `skills ${event.skillsUsed.map((s) => s.id).join(", ")}`
        : null,
      event.protocolUsed ? `protocol ${event.protocolUsed.id}` : null,
      event.webUsed ? `web ${event.webUsed}` : null,
      event.desktopUsed ? `desktop ${event.desktopUsed}` : null,
      event.messagingUsed ? `msg ${event.messagingUsed}` : null,
      event.terminalUsed ? `term ${event.terminalUsed}` : null,
      event.learnedUsed ? `learned ${event.learnedUsed}` : null,
      event.memoryUsed.length ? `память ×${event.memoryUsed.length}` : null,
    ].filter(Boolean);
    pushActionLog({
      title: "Ответ готов",
      reason: clip(
        tools.length
          ? tools.join(" · ")
          : clip(event.utterance.content || "Пустой ответ", 80),
      ),
      tag: "Чат",
      tone: "success",
    });
    return;
  }

  if (event.type === "error") {
    lastPhaseKey = "";
    pushActionLog({
      title: "Сбой диалога",
      reason: clip(event.message),
      tag: "Ошибка",
      tone: "danger",
    });
  }
}

function handleUpdateStatus(status: {
  detail: string;
  availableVersion: string | null;
  canInstall: boolean;
  progress: number | null;
}): void {
  const detail = status.detail?.trim() || "";
  const key = `${detail}|${status.availableVersion ?? ""}|${status.progress ?? ""}`;
  if (!detail || key === lastUpdateDetail) return;
  lastUpdateDetail = key;
  const tone: ActionLogTone = /error|fail|ошиб/i.test(detail)
    ? "danger"
    : status.canInstall || status.availableVersion
      ? "warning"
      : "accent";
  pushActionLog({
    title: "Обновление",
    reason: clip(
      status.availableVersion
        ? `${detail} · ${status.availableVersion}`
        : detail,
    ),
    tag: "Система",
    tone,
  });
}

/**
 * Subscribe to Mira IPC + UI custom events. Safe to call once from App.
 * Returns disposer.
 */
export function installActionLogBridge(): () => void {
  const unsubs: Array<() => void> = [];

  if (!bootstrapped) {
    bootstrapped = true;
    pushActionLog({
      title: "Диалог открыт",
      reason: "Главный экран готов к голосу и тексту.",
      tag: "Система",
      tone: "accent",
    });
  }

  if (typeof window !== "undefined") {
    const onCustom = (ev: Event) => {
      const detail = (ev as CustomEvent<ActionLogInput>).detail;
      if (!detail?.title) return;
      pushActionLog(detail);
    };
    window.addEventListener(ACTION_EVENT, onCustom);
    unsubs.push(() => window.removeEventListener(ACTION_EVENT, onCustom));

    const onNewChat = () => {
      pushActionLog({
        title: "Новый диалог",
        reason: "Сессия сброшена — можно начать сначала.",
        tag: "Чат",
        tone: "accent",
      });
    };
    window.addEventListener("mira:new-chat", onNewChat);
    unsubs.push(() => window.removeEventListener("mira:new-chat", onNewChat));
  }

  const mira = typeof window !== "undefined" ? window.mira : undefined;
  if (mira?.onChatEvent) {
    unsubs.push(
      mira.onChatEvent(({ event }) => {
        handleChatEvent(event);
      }),
    );
  }
  if (mira?.onConfirmRequest) {
    unsubs.push(
      mira.onConfirmRequest((req) => {
        pushActionLog({
          id: `confirm-${req.id}`,
          title: "Ждёт подтверждения",
          reason: clip(req.title || req.body || "Опасное действие"),
          tag: "Голосом",
          tone: "warning",
          pending: true,
        });
      }),
    );
  }
  if (mira?.onConfirmDismiss) {
    unsubs.push(
      mira.onConfirmDismiss((payload) => {
        if (!payload?.id) return;
        patchActionLog(`confirm-${payload.id}`, {
          title: "Подтверждение закрыто",
          reason: "Запрос снят без ответа UI (dismiss).",
          tag: "Голосом",
          tone: "warning",
          pending: false,
        });
      }),
    );
  }
  if (mira?.onUpdateEvent) {
    unsubs.push(mira.onUpdateEvent((status) => handleUpdateStatus(status)));
  }
  if (mira?.onTerminalExit) {
    unsubs.push(
      mira.onTerminalExit(({ exitCode }) => {
        pushActionLog({
          title: "Терминал завершён",
          reason: `Код выхода: ${exitCode}`,
          tag: "Терминал",
          tone: exitCode === 0 ? "success" : "danger",
        });
      }),
    );
  }

  return () => {
    for (const u of unsubs) u();
  };
}

export function logConfirmResolved(
  id: string,
  accepted: boolean,
  title?: string,
): void {
  patchActionLog(`confirm-${id}`, {
    title: accepted ? "Подтверждено" : "Отклонено",
    reason: clip(
      title || (accepted ? "Действие разрешено." : "Действие отменено."),
    ),
    tag: "Голосом",
    tone: accepted ? "success" : "warning",
    pending: false,
  });
}
