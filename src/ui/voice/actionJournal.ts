/**
 * Persistent action journal for voice/file pipeline diagnostics.
 * Answers: when / what / tool / result / version.
 */

import { pushActionLog } from "../actionLog";
import { getDictationSession } from "./dictationSession";

export type JournalEventType =
  | "stt"
  | "command"
  | "llm"
  | "tts"
  | "save"
  | "confirm"
  | "mode"
  | "read"
  | "error"
  | "cancel";

export type JournalEntry = {
  id: string;
  at: string;
  type: JournalEventType;
  transcript?: string;
  tool: string;
  result: "ok" | "cancel" | "error";
  detail?: string;
  version: number;
  sessionId: string;
};

const KEY = "mira.actionJournal.v1";
const MAX = 200;

let entries: JournalEntry[] = load();
const listeners = new Set<() => void>();

function load(): JournalEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JournalEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function persist() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
}

function notify() {
  for (const l of listeners) l();
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `j-${Date.now()}`;
}

export function getActionJournal(): JournalEntry[] {
  return entries;
}

export function subscribeActionJournal(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearActionJournal(): void {
  entries = [];
  persist();
  notify();
}

export function logJournal(input: {
  type: JournalEventType;
  tool: string;
  result?: "ok" | "cancel" | "error";
  transcript?: string;
  detail?: string;
  version?: number;
}): JournalEntry {
  const sess = getDictationSession();
  const entry: JournalEntry = {
    id: makeId(),
    at: new Date().toISOString(),
    type: input.type,
    transcript: input.transcript,
    tool: input.tool,
    result: input.result ?? "ok",
    detail: input.detail,
    version: input.version ?? sess.currentVersion,
    sessionId: sess.sessionId,
  };
  entries = [entry, ...entries].slice(0, MAX);
  persist();
  notify();

  // Mirror into HUD action log (short).
  pushActionLog({
    title: `${input.type}: ${input.tool}`,
    reason: input.detail || input.transcript || input.result || "ok",
    tag: input.type,
    tone:
      input.result === "error"
        ? "danger"
        : input.result === "cancel"
          ? "warning"
          : "accent",
  });

  return entry;
}
