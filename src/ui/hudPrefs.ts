/** Floating HUD widget preferences (renderer cache + IPC). */

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
  alwaysOnTop: boolean;
  autoOpenOnTimer: boolean;
  opacity: number;
  reminderHorizonHours: number;
  timerShowCountdown: boolean;
  widgets: HudWidgetPref[];
};

export type HudWidgetMeta = {
  id: HudWidgetId;
  label: string;
  hint: string;
};

export const DEFAULT_HUD_WIDGET_META: HudWidgetMeta[] = [
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
  { id: "system", label: "Система", hint: "CPU / RAM / VRAM срез" },
  {
    id: "message",
    label: "Сообщение",
    hint: "Эфемерный текст (hud_say / уведомление)",
  },
];

const DEFAULT_WIDGETS: HudWidgetPref[] = DEFAULT_HUD_WIDGET_META.map((w, i) => ({
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

const LS_KEY = "mira.hud.prefs";
export const HUD_PREFS_EVENT = "mira:hud-prefs-changed";

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function normalizeHudPrefs(raw: unknown): HudPrefs {
  const base = {
    ...DEFAULT_HUD_PREFS,
    widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })),
  };
  if (!isRecord(raw)) return base;
  const byId = new Map(base.widgets.map((w) => [w.id, { ...w }]));
  if (Array.isArray(raw.widgets)) {
    for (const item of raw.widgets) {
      if (!isRecord(item)) continue;
      const id = String(item.id) as HudWidgetId;
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
    widgets: [...byId.values()].sort((a, b) => a.order - b.order),
  };
}

export function readLocalHudPrefs(): HudPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_HUD_PREFS, widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })) };
    return normalizeHudPrefs(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_HUD_PREFS, widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })) };
  }
}

export function writeLocalHudPrefs(prefs: HudPrefs): void {
  localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent(HUD_PREFS_EVENT, { detail: prefs }));
}

export async function loadHudPrefs(): Promise<HudPrefs> {
  if (window.mira?.getHudPrefs) {
    try {
      const remote = await window.mira.getHudPrefs();
      const prefs = normalizeHudPrefs(remote);
      writeLocalHudPrefs(prefs);
      return prefs;
    } catch {
      /* fall through */
    }
  }
  return readLocalHudPrefs();
}

export async function saveHudPrefs(
  patch: Partial<HudPrefs>,
): Promise<HudPrefs> {
  const cur = readLocalHudPrefs();
  const merged = normalizeHudPrefs({
    ...cur,
    ...patch,
    widgets: patch.widgets ?? cur.widgets,
  });
  if (window.mira?.setHudPrefs) {
    const remote = await window.mira.setHudPrefs(merged);
    const prefs = normalizeHudPrefs(remote);
    writeLocalHudPrefs(prefs);
    return prefs;
  }
  writeLocalHudPrefs(merged);
  return merged;
}

export function enabledWidgets(prefs: HudPrefs): HudWidgetPref[] {
  return prefs.widgets.filter((w) => w.enabled).sort((a, b) => a.order - b.order);
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatCountdown(endsAt: string, now = Date.now()): string {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return "—";
  const left = Math.max(0, Math.floor((end - now) / 1000));
  return formatElapsed(left * 1000);
}
