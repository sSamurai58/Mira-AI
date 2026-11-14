import { useEffect, useState } from "react";
import { StubBadge } from "./StubBadge";
import { Field, ToggleRow } from "./SettingsFormBits";
import {
  boolToEnv,
  isTruthyEnv,
  loadSettingsEnv,
  saveSettingsEnv,
  type SettingsEnvSnapshot,
} from "../settingsEnvClient";

type TermPrefs = {
  shell: string;
  fontSize: number;
  scrollback: number;
  defaultCwd: string;
};

type TermPolicy = {
  enabled: boolean;
  requireConfirmDangerous: boolean;
  prefs: TermPrefs;
};

export function SettingsTerminalSection() {
  const [snap, setSnap] = useState<SettingsEnvSnapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState<TermPolicy | null>(null);
  const [uiFont, setUiFont] = useState(
    () => localStorage.getItem("mira.terminalFontSize") || "14",
  );
  const [uiScroll, setUiScroll] = useState(
    () => localStorage.getItem("mira.terminalScrollback") || "2000",
  );
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<string | null>(null);
  const live = Boolean(window.mira);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const s = await loadSettingsEnv();
      if (cancelled) return;
      setSnap(s);
      setDraft(s.values);
      if (!window.mira) {
        setPolicy(null);
        return;
      }
      try {
        const [prefs, pol] = await Promise.all([
          window.mira.getTerminalPrefs(),
          window.mira.getTerminalPolicy(),
        ]);
        if (cancelled) return;
        setPolicy(pol as TermPolicy);
        setDraft((prev) => ({
          ...prev,
          TERMINAL_SHELL: prev.TERMINAL_SHELL || prefs.shell,
          TERMINAL_CWD: prev.TERMINAL_CWD || prefs.defaultCwd,
          TERMINAL_FONT_SIZE:
            prev.TERMINAL_FONT_SIZE || String(prefs.fontSize),
          TERMINAL_SCROLLBACK:
            prev.TERMINAL_SCROLLBACK || String(prefs.scrollback),
          TERMINAL_ENABLED:
            prev.TERMINAL_ENABLED ||
            boolToEnv((pol as TermPolicy).enabled !== false),
          TERMINAL_CONFIRM_DANGEROUS:
            prev.TERMINAL_CONFIRM_DANGEROUS ||
            boolToEnv(
              (pol as TermPolicy).requireConfirmDangerous !== false,
            ),
        }));
        if (!localStorage.getItem("mira.terminalFontSize")) {
          setUiFont(String(prefs.fontSize));
        }
        if (!localStorage.getItem("mira.terminalScrollback")) {
          setUiScroll(String(prefs.scrollback));
        }
      } catch {
        if (!cancelled) setNote("Не удалось прочитать policy терминала");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function setField(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      const keys = [
        "TERMINAL_ENABLED",
        "TERMINAL_CONFIRM_DANGEROUS",
        "TERMINAL_SHELL",
        "TERMINAL_CWD",
        "TERMINAL_FONT_SIZE",
        "TERMINAL_SCROLLBACK",
      ];
      const patch: Record<string, string> = {};
      for (const key of keys) patch[key] = draft[key] ?? "";
      const res = await saveSettingsEnv(patch);
      if (res.snap) {
        setSnap(res.snap);
        setDraft((prev) => ({ ...prev, ...res.snap!.values }));
      }
      localStorage.setItem(
        "mira.terminalFontSize",
        draft.TERMINAL_FONT_SIZE || uiFont,
      );
      localStorage.setItem(
        "mira.terminalScrollback",
        draft.TERMINAL_SCROLLBACK || uiScroll,
      );
      setUiFont(draft.TERMINAL_FONT_SIZE || uiFont);
      setUiScroll(draft.TERMINAL_SCROLLBACK || uiScroll);
      setNote(res.detail || (res.ok ? "Сохранено" : "Ошибка"));
      if (window.mira?.getTerminalPolicy) {
        const pol = await window.mira.getTerminalPolicy();
        setPolicy(pol as TermPolicy);
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    if (!window.mira) return;
    setBusy(true);
    setTestLog("Выполняется echo / pwd…");
    try {
      const res = await window.mira.runTerminalCommand("echo mira-p7 && pwd");
      setTestLog(
        [
          `${res.ok ? "OK" : "FAIL"}${res.dangerous ? " · dangerous" : ""}`,
          res.detail || null,
          (res.output || "").trim() || null,
          res.backend ? `backend: ${res.backend}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (err) {
      setTestLog(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const enabled = isTruthyEnv(draft.TERMINAL_ENABLED ?? "true");
  const confirmDanger = isTruthyEnv(
    draft.TERMINAL_CONFIRM_DANGEROUS ?? "true",
  );

  return (
    <div className="stack paths-panel settings-polish">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Терминал</h2>
            <StubBadge label="P7 #16" />
            {!live ? <span className="chip">Electron only</span> : null}
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            PTY в Мастерской → Терминал. Команды из Диалога идут через confirm
            для опасных операций.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      {note ? (
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Основные</h3>
        <ToggleRow
          label="Терминал включён"
          hint="TERMINAL_ENABLED — иначе Диалог не запустит команды"
          checked={enabled}
          onChange={(on) => setField("TERMINAL_ENABLED", boolToEnv(on))}
        />
        <ToggleRow
          label="Confirm для опасных команд"
          hint="rm, format, shutdown и т.п. — спрашивать подтверждение"
          checked={confirmDanger}
          onChange={(on) =>
            setField("TERMINAL_CONFIRM_DANGEROUS", boolToEnv(on))
          }
        />
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Оболочка</h3>
        <div className="integ-grid-2">
          <Field label="Shell" hint="powershell.exe · bash · pwsh · cmd">
            <input
              value={draft.TERMINAL_SHELL ?? ""}
              onChange={(e) => setField("TERMINAL_SHELL", e.target.value)}
              placeholder={policy?.prefs.shell || "powershell.exe"}
              spellCheck={false}
            />
          </Field>
          <Field label="Рабочая папка" hint="TERMINAL_CWD по умолчанию">
            <input
              value={draft.TERMINAL_CWD ?? ""}
              onChange={(e) => setField("TERMINAL_CWD", e.target.value)}
              placeholder={policy?.prefs.defaultCwd || "D:\\Mira"}
              spellCheck={false}
            />
          </Field>
        </div>
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Оформление эмулятора</h3>
        <div className="integ-grid-2">
          <Field label="Размер шрифта" hint="px · UI + .env">
            <input
              type="number"
              min={10}
              max={28}
              value={draft.TERMINAL_FONT_SIZE ?? uiFont}
              onChange={(e) => {
                setField("TERMINAL_FONT_SIZE", e.target.value);
                setUiFont(e.target.value);
                localStorage.setItem("mira.terminalFontSize", e.target.value);
              }}
            />
          </Field>
          <Field label="Scrollback" hint="строк истории буфера">
            <input
              type="number"
              min={200}
              max={20000}
              step={100}
              value={draft.TERMINAL_SCROLLBACK ?? uiScroll}
              onChange={(e) => {
                setField("TERMINAL_SCROLLBACK", e.target.value);
                setUiScroll(e.target.value);
                localStorage.setItem(
                  "mira.terminalScrollback",
                  e.target.value,
                );
              }}
            />
          </Field>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Источник:{" "}
          {snap?.source === "electron"
            ? `.env${snap.envFile ? ` · ${snap.envFile}` : ""}`
            : "browser demo / localStorage"}
          {policy
            ? ` · live shell «${policy.prefs.shell}»`
            : ""}
        </p>
      </article>

      <section className="integ-conn-panel" aria-live="polite">
        <div className="integ-conn-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 className="integ-conn-title">Тест и подключение</h3>
            <p className="muted integ-conn-hint">
              Короткий echo/pwd через IPC — результат только здесь.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !live}
            onClick={() => void runTest()}
          >
            {busy ? "Проверка…" : "Тест echo/pwd"}
          </button>
        </div>
        <div
          className={`integ-conn-log mono${
            testLog?.startsWith("OK")
              ? " is-ok"
              : testLog?.startsWith("FAIL")
                ? " is-fail"
                : busy
                  ? " is-running"
                  : ""
          }`}
        >
          {testLog ||
            (live
              ? "Ещё не запускали."
              : "Тест доступен в Electron (`npm run dev:electron`).")}
        </div>
      </section>
    </div>
  );
}
