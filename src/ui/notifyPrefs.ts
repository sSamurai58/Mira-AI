/** In-app + OS popup notification preferences (renderer). */

export type NotifyPosition = "br" | "bl" | "tr" | "tl";

export type NotifyPrefs = {
  /** In-app HUD toasts (UpdateHudToast and future). */
  hudEnabled: boolean;
  /** Native OS notifications. */
  osEnabled: boolean;
  /** Fire OS notify when main window minimized / hidden / unfocused. */
  osWhenHidden: boolean;
  /** Fire OS notify when closed to tray (requires closeToTray). */
  osWhenClosed: boolean;
  /** Close (X) hides to tray instead of quitting. */
  closeToTray: boolean;
  /** Show tray icon while running. */
  trayEnabled: boolean;
  /** Open minimized / to tray on launch. */
  launchMinimized: boolean;
  /** Register OS login item (Electron). */
  startWithOs: boolean;

  doNotDisturb: boolean;
  quietHoursEnabled: boolean;
  /** HH:MM local */
  quietHoursStart: string;
  quietHoursEnd: string;

  soundEnabled: boolean;
  /** Seconds; 0 = sticky until dismiss. */
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

export const NOTIFY_PREFS_KEY = "mira.notify.prefs";
export const NOTIFY_PREFS_EVENT = "mira:notify-prefs-changed";

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
  try {
    const raw = localStorage.getItem(NOTIFY_PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIFY_PREFS };
    return normalizeNotifyPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS };
  }
}

export function saveNotifyPrefsLocal(prefs: NotifyPrefs): NotifyPrefs {
  const next = normalizeNotifyPrefs(prefs);
  try {
    localStorage.setItem(NOTIFY_PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(NOTIFY_PREFS_EVENT, { detail: next }),
    );
  } catch {
    /* ignore */
  }
  return next;
}

/** Minutes since local midnight. */
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

/** Quiet hours may wrap midnight (22:00–08:00). */
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

export function playNotifySound(prefs: NotifyPrefs): void {
  if (!prefs.soundEnabled || prefs.doNotDisturb || inQuietHours(prefs)) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.stop(ctx.currentTime + 0.2);
    void ctx.resume();
    setTimeout(() => void ctx.close(), 300);
  } catch {
    /* ignore */
  }
}
