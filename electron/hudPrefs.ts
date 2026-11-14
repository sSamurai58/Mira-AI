/**
 * Floating HUD widget preferences (userData). Separate from notify-prefs
 * so toast/OS policy stays independent of which widgets paint on #/hud.
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type HudWidgetId =
  | "voice"
  | "profile"
  | "clock"
  | "timer"
  | "stopwatch"
  | "reminders"
  | "system"
  | "message";

export type HudWidgetPref = {
  id: HudWidgetId;
  enabled: boolean;
  order: number;
};

export type HudPrefs = {
  /** Soft always-on-top preference for the floating chip (env still gates enable). */
  alwaysOnTop: boolean;
  /** Open HUD automatically when a timer starts. */
  autoOpenOnTimer: boolean;
  /** Compact opacity 0.65–1. */
  opacity: number;
  /** How many hours ahead to show calendar reminders. */
  reminderHorizonHours: number;
  /** Show live countdown for running timers (vs end clock). */
  timerShowCountdown: boolean;
  widgets: HudWidgetPref[];
};

export const HUD_WIDGET_META: Array<{
  id: HudWidgetId;
  label: string;
  hint: string;
}> = [
  { id: "voice", label: "Голос", hint: "Состояние: слушаю / думаю / говорю" },
  { id: "profile", label: "Профиль", hint: "Активный профиль Mira" },
  { id: "clock", label: "Часы", hint: "Текущее локальное время" },
  { id: "timer", label: "Таймер", hint: "Обратный отсчёт и активные таймеры" },
  {
    id: "stopwatch",
    label: "Секундомер",
    hint: "Накопительное время, пауза / сброс",
  },
  {
    id: "reminders",
    label: "Напоминания",
    hint: "Ближайшие события календаря",
  },
  {
    id: "system",
    label: "Система",
    hint: "CPU / RAM / VRAM срез",
  },
  {
    id: "message",
    label: "Сообщение",
    hint: "Эфемерный текст (hud_say / уведомление)",
  },
];

const DEFAULT_WIDGETS: HudWidgetPref[] = HUD_WIDGET_META.map((w, i) => ({
  id: w.id,
  enabled: ["voice", "profile", "timer", "reminders"].includes(w.id),
  order: i,
}));

export const DEFAULT_HUD_PREFS: HudPrefs = {
  alwaysOnTop: true,
  autoOpenOnTimer: true,
  opacity: 0.96,
  reminderHorizonHours: 24,
  timerShowCountdown: true,
  widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })),
};

let cached: HudPrefs | null = null;
let ephemeralMessage: { text: string; until: number } | null = null;

function prefsPath(): string {
  return path.join(app.getPath("userData"), "hud-prefs.json");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function normalizeWidgets(raw: unknown): HudWidgetPref[] {
  const byId = new Map<HudWidgetId, HudWidgetPref>();
  for (const w of DEFAULT_WIDGETS) byId.set(w.id, { ...w });
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item)) continue;
      const id = String(item.id ?? "") as HudWidgetId;
      if (!byId.has(id)) continue;
      byId.set(id, {
        id,
        enabled: item.enabled !== false,
        order:
          typeof item.order === "number" && Number.isFinite(item.order)
            ? item.order
            : (byId.get(id)?.order ?? 0),
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.order - b.order);
}

function normalize(raw: unknown): HudPrefs {
  const base = { ...DEFAULT_HUD_PREFS, widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })) };
  if (!isRecord(raw)) return base;
  const opacity =
    typeof raw.opacity === "number" && Number.isFinite(raw.opacity)
      ? Math.min(1, Math.max(0.65, raw.opacity))
      : base.opacity;
  const horizon =
    typeof raw.reminderHorizonHours === "number" &&
    Number.isFinite(raw.reminderHorizonHours)
      ? Math.min(168, Math.max(1, Math.round(raw.reminderHorizonHours)))
      : base.reminderHorizonHours;
  return {
    alwaysOnTop: raw.alwaysOnTop !== false,
    autoOpenOnTimer: raw.autoOpenOnTimer !== false,
    opacity,
    reminderHorizonHours: horizon,
    timerShowCountdown: raw.timerShowCountdown !== false,
    widgets: normalizeWidgets(raw.widgets),
  };
}

export function loadHudPrefs(): HudPrefs {
  if (cached) return cached;
  try {
    const p = prefsPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
      cached = normalize(parsed);
      return cached;
    }
  } catch {
    /* corrupt → defaults */
  }
  cached = { ...DEFAULT_HUD_PREFS, widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })) };
  return cached;
}

export function saveHudPrefs(patch: Partial<HudPrefs>): HudPrefs {
  const cur = loadHudPrefs();
  const next = normalize({
    ...cur,
    ...patch,
    widgets: patch.widgets ?? cur.widgets,
  });
  cached = next;
  try {
    fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2), "utf8");
  } catch {
    /* ignore */
  }
  return next;
}

export function setHudEphemeralMessage(text: string, ttlMs = 12_000): void {
  const t = text.trim();
  if (!t) {
    ephemeralMessage = null;
    return;
  }
  ephemeralMessage = { text: t.slice(0, 240), until: Date.now() + ttlMs };
}

export function getHudEphemeralMessage(): string | null {
  if (!ephemeralMessage) return null;
  if (Date.now() > ephemeralMessage.until) {
    ephemeralMessage = null;
    return null;
  }
  return ephemeralMessage.text;
}

/** Approximate chip height for BrowserWindow sizing. */
export function estimateHudHeight(prefs: HudPrefs = loadHudPrefs()): number {
  const enabled = prefs.widgets.filter((w) => w.enabled);
  const header = 52;
  const row = 28;
  const pad = 28;
  const extras =
    (enabled.some((w) => w.id === "timer") ? 18 : 0) +
    (enabled.some((w) => w.id === "stopwatch") ? 18 : 0) +
    (enabled.some((w) => w.id === "reminders") ? 36 : 0) +
    (enabled.some((w) => w.id === "system") ? 18 : 0) +
    (enabled.some((w) => w.id === "message") ? 24 : 0);
  return Math.min(
    520,
    Math.max(118, header + pad + enabled.length * row + extras),
  );
}
