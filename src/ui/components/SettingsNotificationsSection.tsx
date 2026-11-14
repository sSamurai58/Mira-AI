import { useEffect, useState } from "react";
import { StubBadge } from "./StubBadge";
import { Field, ToggleRow } from "./SettingsFormBits";
import { ThemeSelect } from "./ThemeSelect";
import {
  DEFAULT_NOTIFY_PREFS,
  loadNotifyPrefs,
  normalizeNotifyPrefs,
  saveNotifyPrefsLocal,
  type NotifyPrefs,
  type NotifyPosition,
} from "../notifyPrefs";

const POSITION_OPTS: Array<{ value: NotifyPosition; label: string }> = [
  { value: "br", label: "Справа снизу" },
  { value: "bl", label: "Слева снизу" },
  { value: "tr", label: "Справа сверху" },
  { value: "tl", label: "Слева сверху" },
];

const DURATION_OPTS = [
  { value: "5", label: "5 секунд" },
  { value: "10", label: "10 секунд" },
  { value: "12", label: "12 секунд" },
  { value: "30", label: "30 секунд" },
  { value: "0", label: "Пока не скрою" },
];

export function SettingsNotificationsSection() {
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => loadNotifyPrefs());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const live = Boolean(window.mira?.getNotifyPrefs);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.mira?.getNotifyPrefs) {
        setPrefs(loadNotifyPrefs());
        return;
      }
      try {
        const remote = await window.mira.getNotifyPrefs();
        if (cancelled) return;
        const next = normalizeNotifyPrefs(remote);
        setPrefs(next);
        saveNotifyPrefsLocal(next);
      } catch {
        if (!cancelled) setPrefs(loadNotifyPrefs());
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persist(patch: Partial<NotifyPrefs>) {
    setBusy(true);
    try {
      const merged = normalizeNotifyPrefs({ ...prefs, ...patch });
      setPrefs(merged);
      saveNotifyPrefsLocal(merged);
      if (window.mira?.setNotifyPrefs) {
        const remote = await window.mira.setNotifyPrefs(merged);
        const next = normalizeNotifyPrefs(remote);
        setPrefs(next);
        saveNotifyPrefsLocal(next);
      }
      setNote("Сохранено");
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function set<K extends keyof NotifyPrefs>(key: K, value: NotifyPrefs[K]) {
    void persist({ [key]: value } as Partial<NotifyPrefs>);
  }

  async function testOs() {
    setTestNote(null);
    if (!window.mira?.testOsNotification) {
      setTestNote("Тест OS доступен в Electron");
      return;
    }
    const res = await window.mira.testOsNotification({
      title: "Mira · тест",
      body: "Всплывающее уведомление работает — сверните окно и повторите.",
    });
    setTestNote(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
  }

  return (
    <div className="stack paths-panel notify-settings">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
              Всплывающие уведомления
            </h2>
            <StubBadge label="HUD · OS" />
            {!live ? <span className="chip">browser-demo</span> : null}
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            HUD в стиле Mira (обновления и др.) и системные уведомления, когда
            окно свёрнуто или закрыто в трей.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void testOs()}
          >
            Тест OS
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void persist(DEFAULT_NOTIFY_PREFS)}
          >
            Сбросить
          </button>
        </div>
      </div>

      {note ? (
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}
      {testNote ? <span className="chip">{testNote}</span> : null}

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Основные</h3>
        <ToggleRow
          label="HUD-уведомления в приложении"
          hint="Плавающий toast (MIRA · UPDATE и др.)"
          checked={prefs.hudEnabled}
          onChange={(on) => set("hudEnabled", on)}
        />
        <ToggleRow
          label="Системные (OS) уведомления"
          hint="Windows / macOS Notification Center"
          checked={prefs.osEnabled}
          onChange={(on) => set("osEnabled", on)}
        />
        <ToggleRow
          label="OS, когда окно свёрнуто / не в фокусе"
          hint="Показывать обновления даже если Mira не видна"
          checked={prefs.osWhenHidden}
          onChange={(on) => set("osWhenHidden", on)}
        />
        <ToggleRow
          label="OS, когда закрыто в трей"
          hint="Нужен режим «Закрывать в трей»"
          checked={prefs.osWhenClosed}
          onChange={(on) => set("osWhenClosed", on)}
        />
        <ToggleRow
          label="Не беспокоить"
          hint="Глушит HUD и OS (кроме ручного теста)"
          checked={prefs.doNotDisturb}
          onChange={(on) => set("doNotDisturb", on)}
        />
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Фон и трей</h3>
        <ToggleRow
          label="Закрывать в трей (X)"
          hint="Вместо выхода — иконка в системном трее; обновления продолжают приходить"
          checked={prefs.closeToTray}
          onChange={(on) => set("closeToTray", on)}
        />
        <ToggleRow
          label="Иконка в трее"
          hint="Пока Mira запущена"
          checked={prefs.trayEnabled}
          onChange={(on) => set("trayEnabled", on)}
        />
        <ToggleRow
          label="Запускать свёрнутой / в трее"
          hint="Окно не всплывает при старте"
          checked={prefs.launchMinimized}
          onChange={(on) => set("launchMinimized", on)}
        />
        <ToggleRow
          label="Запускать с системой"
          hint="Автозагрузка Windows / macOS (Electron login item)"
          checked={prefs.startWithOs}
          onChange={(on) => set("startWithOs", on)}
        />
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Вид HUD</h3>
        <ToggleRow
          label="Звук"
          hint="Короткий сигнал при появлении toast / OS (если не silent)"
          checked={prefs.soundEnabled}
          onChange={(on) => set("soundEnabled", on)}
        />
        <div className="integ-grid-2">
          <Field label="Позиция HUD" hint="Угол экрана">
            <ThemeSelect
              aria-label="Позиция HUD"
              value={prefs.position}
              options={POSITION_OPTS}
              onChange={(v) => set("position", v as NotifyPosition)}
            />
          </Field>
          <Field label="Автоскрытие" hint="0 = пока не нажмёте «Скрыть»">
            <ThemeSelect
              aria-label="Длительность HUD"
              value={String(prefs.durationSec)}
              options={DURATION_OPTS}
              onChange={(v) => set("durationSec", Number(v))}
            />
          </Field>
        </div>
        <Field
          label="Макс. одновременно"
          hint="Сколько toast держать на экране (1–5)"
        >
          <input
            type="number"
            min={1}
            max={5}
            value={prefs.maxStack}
            onChange={(e) =>
              set(
                "maxStack",
                Math.max(1, Math.min(5, Number(e.target.value) || 1)),
              )
            }
          />
        </Field>
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Тихие часы</h3>
        <ToggleRow
          label="Включить тихие часы"
          hint="В этот интервал уведомления не показываются"
          checked={prefs.quietHoursEnabled}
          onChange={(on) => set("quietHoursEnabled", on)}
        />
        <div className="integ-grid-2">
          <Field label="С" hint="Локальное время HH:MM">
            <input
              type="time"
              value={prefs.quietHoursStart}
              disabled={!prefs.quietHoursEnabled}
              onChange={(e) => set("quietHoursStart", e.target.value || "22:00")}
            />
          </Field>
          <Field label="До" hint="Может быть на следующие сутки">
            <input
              type="time"
              value={prefs.quietHoursEnd}
              disabled={!prefs.quietHoursEnabled}
              onChange={(e) => set("quietHoursEnd", e.target.value || "08:00")}
            />
          </Field>
        </div>
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Категории</h3>
        <ToggleRow
          label="Обновления"
          hint="MIRA · UPDATE и OS о новой версии"
          checked={prefs.catUpdates}
          onChange={(on) => set("catUpdates", on)}
        />
        <ToggleRow
          label="Действия / журнал"
          hint="Важные события из action log"
          checked={prefs.catActions}
          onChange={(on) => set("catActions", on)}
        />
        <ToggleRow
          label="Голос"
          hint="Wake / ошибки озвучки"
          checked={prefs.catVoice}
          onChange={(on) => set("catVoice", on)}
        />
        <ToggleRow
          label="Ошибки"
          hint="Сбои обновления, сети, критичные ошибки"
          checked={prefs.catErrors}
          onChange={(on) => set("catErrors", on)}
        />
        <ToggleRow
          label="Календарь"
          hint="Напоминания и таймеры"
          checked={prefs.catCalendar}
          onChange={(on) => set("catCalendar", on)}
        />
        <ToggleRow
          label="Кастомные команды"
          hint="Шаг notify / hud_say"
          checked={prefs.catCommands}
          onChange={(on) => set("catCommands", on)}
        />
      </article>
    </div>
  );
}
