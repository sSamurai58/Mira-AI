import { useEffect, useState, type FormEvent } from "react";
import { StubBadge } from "./StubBadge";
import {
  DEFAULT_HUD_WIDGET_META,
  formatCountdown,
  formatElapsed,
  loadHudPrefs,
  saveHudPrefs,
  type HudPrefs,
  type HudWidgetId,
  type HudWidgetMeta,
} from "../hudPrefs";
import { formatChatDateLabel, formatChatTime } from "../chat/timeLabels";

type TimerRow = {
  id: string;
  label: string;
  seconds: number;
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
  id: string;
  label: string;
  started_at: string | null;
  accumulated_ms: number;
  status: "running" | "paused" | "stopped";
};

function stopwatchElapsed(sw: StopwatchRow | null, now: number): number {
  if (!sw) return 0;
  let ms = Math.max(0, sw.accumulated_ms);
  if (sw.status === "running" && sw.started_at) {
    const t = Date.parse(sw.started_at);
    if (Number.isFinite(t)) ms += Math.max(0, now - t);
  }
  return ms;
}

export function HudWorkshopPanel() {
  const [prefs, setPrefs] = useState<HudPrefs | null>(null);
  const [meta, setMeta] = useState<HudWidgetMeta[]>(DEFAULT_HUD_WIDGET_META);
  const [hudOpen, setHudOpen] = useState(false);
  const [timers, setTimers] = useState<TimerRow[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [stopwatch, setStopwatch] = useState<StopwatchRow | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [timerSeconds, setTimerSeconds] = useState(300);
  const [timerLabel, setTimerLabel] = useState("Таймер");
  const [remindTitle, setRemindTitle] = useState("");
  const [remindInMin, setRemindInMin] = useState(30);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const browserOnly = !window.mira;

  async function refreshHudOpen() {
    const policy = await window.mira?.getHudPolicy?.();
    setHudOpen(Boolean(policy?.open));
  }

  async function refreshData(horizon = prefs?.reminderHorizonHours ?? 24) {
    if (!window.mira) return;
    const [t, r, sw] = await Promise.all([
      window.mira.listTimers?.() ?? [],
      window.mira.listUpcomingReminders?.(horizon) ?? [],
      window.mira.getActiveStopwatch?.() ?? null,
    ]);
    setTimers(
      (Array.isArray(t) ? t : []).flatMap((x) => {
        if (!x || typeof x !== "object" || !("id" in x)) return [];
        const row = x as TimerRow;
        return row.status === "running" ? [row] : [];
      }),
    );
    setReminders(
      (Array.isArray(r) ? r : []).flatMap((x) => {
        if (!x || typeof x !== "object" || !("id" in x) || !("title" in x)) {
          return [];
        }
        return [x as ReminderRow];
      }),
    );
    setStopwatch(
      sw && typeof sw === "object" && "id" in sw
        ? (sw as StopwatchRow)
        : null,
    );
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [p, m] = await Promise.all([
        loadHudPrefs(),
        window.mira?.getHudWidgetMeta?.() ?? Promise.resolve(DEFAULT_HUD_WIDGET_META),
      ]);
      if (cancelled) return;
      setPrefs(p);
      if (Array.isArray(m) && m.length) setMeta(m as HudWidgetMeta[]);
      await refreshHudOpen();
      await refreshData(p.reminderHorizonHours);
    })();
    const unsubPrefs = window.mira?.onHudPrefs?.((raw) => {
      void loadHudPrefs().then((p) => {
        if (!cancelled) setPrefs(p);
      });
      void raw;
    });
    const unsubTick = window.mira?.onHudTick?.(() => {
      void refreshData();
      void refreshHudOpen();
    });
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      cancelled = true;
      unsubPrefs?.();
      unsubTick?.();
      window.clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bootstrap
  }, []);

  async function patchPrefs(patch: Partial<HudPrefs>) {
    setBusy(true);
    try {
      const next = await saveHudPrefs(patch);
      setPrefs(next);
      setNote("Настройки HUD сохранены");
    } finally {
      setBusy(false);
    }
  }

  function toggleWidget(id: HudWidgetId) {
    if (!prefs) return;
    const widgets = prefs.widgets.map((w) =>
      w.id === id ? { ...w, enabled: !w.enabled } : w,
    );
    void patchPrefs({ widgets });
  }

  async function toggleHudWindow() {
    const res = await window.mira?.toggleHud?.();
    setHudOpen(Boolean(res?.open));
    setNote(res?.open ? "HUD открыт" : "HUD закрыт");
  }

  async function startQuickTimer(seconds: number) {
    if (!window.mira?.startTimer) return;
    await window.mira.startTimer(timerLabel.trim() || "Таймер", seconds);
    setNote(`Таймер на ${seconds}с`);
    await refreshData();
  }

  async function onStartTimer(e: FormEvent) {
    e.preventDefault();
    await startQuickTimer(Math.max(1, timerSeconds));
  }

  async function onCreateReminder(e: FormEvent) {
    e.preventDefault();
    if (!window.mira?.createCalendarEvent) return;
    const title = remindTitle.trim() || "Напоминание";
    const when = new Date(Date.now() + Math.max(1, remindInMin) * 60_000);
    const iso = when.toISOString();
    await window.mira.createCalendarEvent({
      title,
      startsAt: iso,
      remindAt: iso,
    });
    setRemindTitle("");
    setNote(`Напоминание «${title}» · через ${remindInMin} мин`);
    await refreshData();
  }

  if (!prefs) {
    return (
      <div className="stack paths-panel">
        <p className="muted" style={{ margin: 0 }}>
          Загрузка HUD…
        </p>
      </div>
    );
  }

  const swMs = stopwatchElapsed(stopwatch, now);

  return (
    <div className="stack paths-panel hud-workshop">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>HUD</h2>
            <span className="muted">плавающий оверлей</span>
            <StubBadge label="F3" />
            {browserOnly ? <span className="chip">browser-demo</span> : null}
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Виджеты на always-on-top чипе: таймер, секундомер, напоминания,
            часы, система и др. Настройки хранятся локально.
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${hudOpen ? "" : "btn-primary"}`}
            disabled={browserOnly || busy}
            onClick={() => void toggleHudWindow()}
          >
            {hudOpen ? "Закрыть HUD" : "Открыть HUD"}
          </button>
        </div>
      </div>

      {note ? (
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}

      <div className="settings-stat-row">
        <span className="settings-stat-chip">
          Таймеры <strong>{timers.length}</strong>
        </span>
        <span className="settings-stat-chip">
          Напоминания <strong>{reminders.length}</strong>
        </span>
        <span className="settings-stat-chip">
          Секундомер{" "}
          <strong>
            {stopwatch ? formatElapsed(swMs) : "—"}
            {stopwatch?.status === "paused" ? " · пауза" : ""}
          </strong>
        </span>
      </div>

      <section className="stack">
        <strong>Виджеты на HUD</strong>
        <div className="paths-grid hud-widget-grid">
          {meta.map((m) => {
            const pref = prefs.widgets.find((w) => w.id === m.id);
            const on = pref?.enabled !== false;
            return (
              <article
                key={m.id}
                className={`paths-card panel ${on ? "is-enabled" : "is-disabled"}`}
              >
                <div className="paths-card-head">
                  <div className="paths-card-title">
                    <div className="paths-card-title-row">
                      <span className="paths-card-name">{m.label}</span>
                      <span
                        className={`paths-status-dot ${on ? "is-on" : ""}`}
                        aria-hidden
                      />
                    </div>
                    <span className="paths-card-kind">{m.hint}</span>
                  </div>
                  <label className="paths-card-enable">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busy}
                      onChange={() => toggleWidget(m.id)}
                      aria-label={`Показывать «${m.label}» на HUD`}
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel stack hud-workshop-settings">
        <strong>Поведение</strong>
        <label className="row hud-check">
          <input
            type="checkbox"
            checked={prefs.alwaysOnTop}
            disabled={busy}
            onChange={(e) => void patchPrefs({ alwaysOnTop: e.target.checked })}
          />
          <span>Поверх всех окон</span>
        </label>
        <label className="row hud-check">
          <input
            type="checkbox"
            checked={prefs.autoOpenOnTimer}
            disabled={busy}
            onChange={(e) =>
              void patchPrefs({ autoOpenOnTimer: e.target.checked })
            }
          />
          <span>Открывать HUD при старте таймера / секундомера</span>
        </label>
        <label className="row hud-check">
          <input
            type="checkbox"
            checked={prefs.timerShowCountdown}
            disabled={busy}
            onChange={(e) =>
              void patchPrefs({ timerShowCountdown: e.target.checked })
            }
          />
          <span>Таймер: живой обратный отсчёт</span>
        </label>
        <label className="field-label">
          Горизонт напоминаний (часы)
          <input
            type="number"
            min={1}
            max={168}
            value={prefs.reminderHorizonHours}
            disabled={busy}
            onChange={(e) =>
              void patchPrefs({
                reminderHorizonHours: Number(e.target.value) || 24,
              })
            }
          />
        </label>
        <label className="field-label">
          Прозрачность ({Math.round(prefs.opacity * 100)}%)
          <input
            type="range"
            min={65}
            max={100}
            value={Math.round(prefs.opacity * 100)}
            disabled={busy}
            onChange={(e) =>
              void patchPrefs({ opacity: Number(e.target.value) / 100 })
            }
          />
        </label>
      </section>

      <div className="hud-workshop-split">
        <section className="panel stack">
          <strong>Таймер</strong>
          <form className="stack" onSubmit={(e) => void onStartTimer(e)}>
            <input
              value={timerLabel}
              onChange={(e) => setTimerLabel(e.target.value)}
              placeholder="Подпись"
              aria-label="Подпись таймера"
            />
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {[60, 300, 600, 1500].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className="btn"
                  disabled={browserOnly}
                  onClick={() => {
                    setTimerSeconds(sec);
                    void startQuickTimer(sec);
                  }}
                >
                  {sec < 60 ? `${sec}с` : `${sec / 60} мин`}
                </button>
              ))}
            </div>
            <label className="field-label">
              Секунды
              <input
                type="number"
                min={1}
                value={timerSeconds}
                onChange={(e) => setTimerSeconds(Number(e.target.value) || 1)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={browserOnly}
            >
              Запустить
            </button>
          </form>
          {timers.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Нет активных таймеров.
            </p>
          ) : (
            timers.map((t) => (
              <div key={t.id} className="row hud-live-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{t.label}</strong>
                  <div className="mono muted">
                    {prefs.timerShowCountdown
                      ? formatCountdown(t.ends_at, now)
                      : t.ends_at.slice(11, 19)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void window.mira?.cancelTimer?.(t.id).then(() => refreshData())
                  }
                >
                  Отмена
                </button>
              </div>
            ))
          )}
        </section>

        <section className="panel stack">
          <strong>Секундомер</strong>
          <div className="hud-stopwatch-display mono">
            {formatElapsed(swMs)}
            <span className="muted">
              {stopwatch?.status === "running"
                ? " · идёт"
                : stopwatch?.status === "paused"
                  ? " · пауза"
                  : " · стоп"}
            </span>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={browserOnly}
              onClick={() =>
                void window.mira
                  ?.startStopwatch?.("Секундомер")
                  .then(() => refreshData())
              }
            >
              {stopwatch?.status === "paused" ? "Продолжить" : "Старт"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={browserOnly || stopwatch?.status !== "running"}
              onClick={() =>
                void window.mira?.pauseStopwatch?.().then(() => refreshData())
              }
            >
              Пауза
            </button>
            <button
              type="button"
              className="btn"
              disabled={browserOnly || !stopwatch}
              onClick={() =>
                void window.mira?.resetStopwatch?.().then(() => refreshData())
              }
            >
              Сброс
            </button>
          </div>
        </section>

        <section className="panel stack">
          <strong>Напоминания календаря</strong>
          <form className="stack" onSubmit={(e) => void onCreateReminder(e)}>
            <input
              value={remindTitle}
              onChange={(e) => setRemindTitle(e.target.value)}
              placeholder="Что напомнить…"
              aria-label="Текст напоминания"
            />
            <label className="field-label">
              Через минут
              <input
                type="number"
                min={1}
                value={remindInMin}
                onChange={(e) => setRemindInMin(Number(e.target.value) || 1)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={browserOnly}
            >
              Создать напоминание
            </button>
          </form>
          {reminders.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Ближайших напоминаний нет (горизонт{" "}
              {prefs.reminderHorizonHours} ч).
            </p>
          ) : (
            reminders.map((r) => {
              const when = r.remind_at || r.starts_at;
              return (
                <div key={r.id} className="hud-live-row">
                  <strong>{r.title}</strong>
                  <div className="mono muted">
                    {formatChatDateLabel(when)} · {formatChatTime(when)}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
