import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "../../config";
import { HudCorners } from "../components/HudCorners";
import { formatChatTime } from "../chat/timeLabels";
import {
  enabledWidgets,
  formatCountdown,
  formatElapsed,
  HUD_PREFS_EVENT,
  loadHudPrefs,
  readLocalHudPrefs,
  type HudPrefs,
  type HudWidgetId,
} from "../hudPrefs";
import { applyTheme, loadStoredThemeId } from "../themes";

const VOICE_LABEL: Record<string, string> = {
  idle: "ожидание",
  listening: "слушаю",
  thinking: "думаю",
  speaking: "говорю",
  error: "ошибка",
};

type TimerRow = {
  id: string;
  label: string;
  ends_at: string;
  status: string;
};

type ReminderRow = {
  id: string;
  title: string;
  starts_at: string;
  remind_at: string | null;
};

type StopwatchRow = {
  started_at: string | null;
  accumulated_ms: number;
  status: string;
};

type LoadSnap = {
  cpu?: number | null;
  ramUsedGb?: number | null;
  ramTotalGb?: number | null;
  vramUsedGb?: number | null;
  vramTotalGb?: number | null;
};

function stopwatchMs(sw: StopwatchRow | null, now: number): number {
  if (!sw) return 0;
  let ms = Math.max(0, sw.accumulated_ms || 0);
  if (sw.status === "running" && sw.started_at) {
    const t = Date.parse(sw.started_at);
    if (Number.isFinite(t)) ms += Math.max(0, now - t);
  }
  return ms;
}

/** Compact always-on-top HUD surface (#/hud) — widget host. */
export function HudPage() {
  const [prefs, setPrefs] = useState<HudPrefs>(() => readLocalHudPrefs());
  const [voice, setVoice] = useState("idle");
  const [profile, setProfile] = useState("—");
  const [timers, setTimers] = useState<TimerRow[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [stopwatch, setStopwatch] = useState<StopwatchRow | null>(null);
  const [load, setLoad] = useState<LoadSnap | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [clock, setClock] = useState(() => formatChatTime(new Date().toISOString()));
  const rootRef = useRef<HTMLDivElement | null>(null);

  const widgets = useMemo(
    () => enabledWidgets(prefs).map((w) => w.id),
    [prefs],
  );
  const show = (id: HudWidgetId) => widgets.includes(id);

  useEffect(() => {
    applyTheme(loadStoredThemeId());
    document.documentElement.classList.add("mira-hud-root");
    document.body.classList.add("mira-hud-root");
    return () => {
      document.documentElement.classList.remove("mira-hud-root");
      document.body.classList.remove("mira-hud-root");
    };
  }, []);

  useEffect(() => {
    void loadHudPrefs().then(setPrefs);
    const onLocal = () => setPrefs(readLocalHudPrefs());
    window.addEventListener(HUD_PREFS_EVENT, onLocal);
    const unsub = window.mira?.onHudPrefs?.(() => {
      void loadHudPrefs().then(setPrefs);
    });
    return () => {
      window.removeEventListener(HUD_PREFS_EVENT, onLocal);
      unsub?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (!window.mira) return;
      try {
        const needsSystem = show("system");
        const needsMsg = show("message");
        const [active, timerList, remList, sw, loadRes, msgRes] =
          await Promise.all([
            show("profile")
              ? window.mira.getActiveProfile?.()
              : Promise.resolve(null),
            show("timer")
              ? window.mira.listTimers?.()
              : Promise.resolve([]),
            show("reminders")
              ? window.mira.listUpcomingReminders?.(
                  prefs.reminderHorizonHours,
                )
              : Promise.resolve([]),
            show("stopwatch")
              ? window.mira.getActiveStopwatch?.()
              : Promise.resolve(null),
            needsSystem ? window.mira.getSystemLoad?.() : Promise.resolve(null),
            needsMsg ? window.mira.getHudMessage?.() : Promise.resolve(null),
          ]);
        if (cancelled) return;
        if (active && typeof active === "object" && "name" in active) {
          setProfile(String((active as { name: string }).name));
        }
        const list = Array.isArray(timerList) ? timerList : [];
        setTimers(
          list.flatMap((item) => {
            if (!item || typeof item !== "object" || !("status" in item)) {
              return [];
            }
            const row = item as TimerRow;
            return row.status === "running" ? [row] : [];
          }),
        );
        setReminders(
          (Array.isArray(remList) ? remList : []).flatMap((item) => {
            if (!item || typeof item !== "object" || !("title" in item)) {
              return [];
            }
            return [item as ReminderRow];
          }),
        );
        setStopwatch(
          sw && typeof sw === "object" ? (sw as StopwatchRow) : null,
        );
        if (loadRes && typeof loadRes === "object") {
          setLoad(loadRes as LoadSnap);
        }
        if (msgRes && typeof msgRes === "object" && "text" in msgRes) {
          setMessage(
            typeof (msgRes as { text: unknown }).text === "string"
              ? (msgRes as { text: string }).text
              : null,
          );
        }
      } catch {
        // ignore
      }
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), 2000);
    const unsubTick = window.mira?.onHudTick?.(() => void refresh());
    return () => {
      cancelled = true;
      window.clearInterval(id);
      unsubTick?.();
    };
  }, [prefs.reminderHorizonHours, widgets.join("|")]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (show("clock")) {
        setClock(formatChatTime(new Date(t).toISOString()));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [widgets.join("|")]);

  useEffect(() => {
    const onStorage = () => {
      setVoice(localStorage.getItem("mira.voiceState") || "idle");
      applyTheme(loadStoredThemeId());
    };
    onStorage();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !window.mira?.resizeHud) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    void window.mira.resizeHud(h + 4);
  }, [widgets.join("|"), timers.length, reminders.length, message, stopwatch?.status]);

  function closeHud() {
    void window.mira?.toggleHud?.();
  }

  const voiceLabel = VOICE_LABEL[voice] ?? voice;
  const primaryTimer = timers[0];
  const timerText = primaryTimer
    ? prefs.timerShowCountdown
      ? `${primaryTimer.label} · ${formatCountdown(primaryTimer.ends_at, now)}`
      : `${primaryTimer.label} → ${primaryTimer.ends_at.slice(11, 19)}`
    : "нет таймеров";
  const swText =
    stopwatch && stopwatch.status !== "stopped"
      ? `${formatElapsed(stopwatchMs(stopwatch, now))}${
          stopwatch.status === "paused" ? " · пауза" : ""
        }`
      : "стоп";
  const reminderText = reminders[0]
    ? `${reminders[0].title} · ${formatChatTime(
        reminders[0].remind_at || reminders[0].starts_at,
      )}`
    : "нет ближайших";
  const systemText = load
    ? [
        load.cpu != null ? `CPU ${Math.round(Number(load.cpu))}%` : null,
        load.ramUsedGb != null && load.ramTotalGb != null
          ? `RAM ${Number(load.ramUsedGb).toFixed(1)}/${Number(load.ramTotalGb).toFixed(0)}`
          : null,
        load.vramUsedGb != null && load.vramTotalGb != null
          ? `VRAM ${Number(load.vramUsedGb).toFixed(1)}/${Number(load.vramTotalGb).toFixed(0)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—"
    : "—";

  return (
    <div
      ref={rootRef}
      className="mira-hud"
      data-voice={voice}
      style={{ opacity: prefs.opacity }}
    >
      <HudCorners />
      <header className="mira-hud-top">
        <div className="mira-hud-brand">
          <img
            className="mira-hud-mark"
            src="./brand/mira-mark.svg"
            width={22}
            height={24}
            alt=""
            aria-hidden
          />
          <span className="mira-hud-name">{APP_NAME}</span>
        </div>
        <div className="mira-hud-actions">
          {show("voice") ? (
            <span className="mira-hud-voice" title={voice}>
              <span className="status-dot" aria-hidden />
              {voiceLabel}
            </span>
          ) : null}
          {show("clock") ? (
            <span className="mira-hud-clock mono">{clock}</span>
          ) : null}
          <button
            type="button"
            className="mira-hud-close"
            aria-label="Закрыть HUD"
            title="Закрыть"
            onClick={closeHud}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <path
                d="M3.2 3.2l9.6 9.6M12.8 3.2L3.2 12.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>
      <div className="mira-hud-meta">
        {show("profile") ? (
          <div className="mira-hud-row">
            <span className="mira-hud-k">Профиль</span>
            <span className="mira-hud-v">{profile}</span>
          </div>
        ) : null}
        {show("timer") ? (
          <div className="mira-hud-row">
            <span className="mira-hud-k">Таймер</span>
            <span className="mira-hud-v">{timerText}</span>
          </div>
        ) : null}
        {show("stopwatch") ? (
          <div className="mira-hud-row">
            <span className="mira-hud-k">Секундомер</span>
            <span className="mira-hud-v mono">{swText}</span>
          </div>
        ) : null}
        {show("reminders") ? (
          <div className="mira-hud-row">
            <span className="mira-hud-k">Напоминание</span>
            <span className="mira-hud-v">{reminderText}</span>
          </div>
        ) : null}
        {show("system") ? (
          <div className="mira-hud-row">
            <span className="mira-hud-k">Система</span>
            <span className="mira-hud-v mono">{systemText}</span>
          </div>
        ) : null}
        {show("message") && message ? (
          <div className="mira-hud-row mira-hud-message">
            <span className="mira-hud-k">Сообщение</span>
            <span className="mira-hud-v">{message}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
