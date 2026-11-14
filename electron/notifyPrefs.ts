/**
 * Notification preferences persisted in userData (main-process source of truth).
 * Mirrors src/ui/notifyPrefs.ts fields.
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type NotifyPosition = "br" | "bl" | "tr" | "tl";

export type NotifyPrefs = {
  hudEnabled: boolean;
  osEnabled: boolean;
  osWhenHidden: boolean;
  osWhenClosed: boolean;
  closeToTray: boolean;
  trayEnabled: boolean;
  launchMinimized: boolean;
  startWithOs: boolean;
  doNotDisturb: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  soundEnabled: boolean;
  durationSec: number;
  position: NotifyPosition;
  maxStack: number;
  catUpdates: boolean;
  catActions: boolean;
  catVoice: boolean;
  catErrors: boolean;
  catCalendar: boolean;
  catCommands: boolean;
};

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  hudEnabled: true,
  osEnabled: true,
  osWhenHidden: true,
  osWhenClosed: true,
  closeToTray: true,
  trayEnabled: true,
  launchMinimized: false,
  startWithOs: false,
  doNotDisturb: false,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  soundEnabled: false,
  durationSec: 12,
  position: "br",
  maxStack: 3,
  catUpdates: true,
  catActions: true,
  catVoice: true,
  catErrors: true,
  catCalendar: true,
  catCommands: true,
};

let cached: NotifyPrefs | null = null;

function prefsPath(): string {
  return path.join(app.getPath("userData"), "notify-prefs.json");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function normalizeNotifyPrefs(raw: unknown): NotifyPrefs {
  const src = isRecord(raw) ? raw : {};
  const base = { ...DEFAULT_NOTIFY_PREFS };
  for (const key of Object.keys(base) as Array<keyof NotifyPrefs>) {
    const v = src[key as string];
    if (typeof base[key] === "boolean" && typeof v === "boolean") {
      (base as Record<string, unknown>)[key] = v;
    } else if (typeof base[key] === "number" && typeof v === "number") {
      (base as Record<string, unknown>)[key] = v;
    } else if (typeof base[key] === "string" && typeof v === "string") {
      (base as Record<string, unknown>)[key] = v;
    }
  }
  if (!["br", "bl", "tr", "tl"].includes(base.position)) base.position = "br";
  if (!Number.isFinite(base.durationSec) || base.durationSec < 0) {
    base.durationSec = 12;
  }
  if (!Number.isFinite(base.maxStack) || base.maxStack < 1) base.maxStack = 3;
  return base;
}

export function loadNotifyPrefs(): NotifyPrefs {
  if (cached) return cached;
  try {
    const file = prefsPath();
    if (!fs.existsSync(file)) {
      cached = { ...DEFAULT_NOTIFY_PREFS };
      return cached;
    }
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    cached = normalizeNotifyPrefs(raw);
    return cached;
  } catch {
    cached = { ...DEFAULT_NOTIFY_PREFS };
    return cached;
  }
}

export function saveNotifyPrefs(patch: Partial<NotifyPrefs>): NotifyPrefs {
  const next = normalizeNotifyPrefs({ ...loadNotifyPrefs(), ...patch });
  try {
    fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2), "utf8");
  } catch {
    /* keep memory */
  }
  cached = next;
  return next;
}

function minutesNow(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

function parseHm(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return 0;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

export function inQuietHours(prefs: NotifyPrefs, now = new Date()): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const cur = minutesNow(now);
  const start = parseHm(prefs.quietHoursStart);
  const end = parseHm(prefs.quietHoursEnd);
  if (start === end) return true;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

export type NotifyCategory =
  | "updates"
  | "actions"
  | "voice"
  | "errors"
  | "calendar"
  | "commands";

export function categoryAllowed(
  prefs: NotifyPrefs,
  category: NotifyCategory,
): boolean {
  if (prefs.doNotDisturb) return false;
  if (inQuietHours(prefs)) return false;
  switch (category) {
    case "updates":
      return prefs.catUpdates;
    case "actions":
      return prefs.catActions;
    case "voice":
      return prefs.catVoice;
    case "errors":
      return prefs.catErrors;
    case "calendar":
      return prefs.catCalendar;
    case "commands":
      return prefs.catCommands;
    default:
      return true;
  }
}
