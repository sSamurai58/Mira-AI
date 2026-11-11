import { useEffect, useState } from "react";
import { StubBadge } from "../components/StubBadge";
import { SettingsApiSection } from "../components/SettingsApiSection";
import { SettingsIntegrationsSection } from "../components/SettingsIntegrationsSection";
import { SettingsUpdatesSection } from "../components/SettingsUpdatesSection";
import { ThemeSelect } from "../components/ThemeSelect";
import { THEMES, type ThemeId } from "../themes";
import {
  getActiveVoiceId,
  setActiveVoiceId,
  waitForVoices,
} from "../voice/catalog";
import { getVoiceEngineStatus } from "../voice/engineStatus";
import {
  getHandsFreePrefs,
  setHandsFreePrefs,
  type HandsFreePrefs,
  type WakeSensitivity,
} from "../voice/handsFree";
import { speakText, stopSpeaking } from "../voice/tts";
import {
  getActiveTtsEngine,
  listTtsEngines,
  setActiveTtsEngine,
  type TtsEngineId,
} from "../voice/ttsEngines";
import type { VoiceInfo } from "../voice/types";


const SECTIONS = [
  { id: "appearance", label: "Внешний вид" },
  { id: "general", label: "Общие" },
  { id: "voice", label: "Голос и аудио" },
  { id: "api", label: "API и модели" },
  { id: "integrations", label: "Интеграции" },
  { id: "terminal", label: "Терминал" },
  { id: "data", label: "Данные и приватность" },
  { id: "updates", label: "Обновления" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

type SettingsPageProps = {
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  healthText: string;
  onOpenDoctor?: () => void;
};

export function SettingsPage({
  themeId,
  onThemeChange,
  healthText,
  onOpenDoctor,
}: SettingsPageProps) {
  const [section, setSection] = useState<SectionId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("integrations")) return "integrations";
    if (hash.includes("api")) return "api";
    if (hash.includes("voice")) return "voice";
    if (hash.includes("terminal")) return "terminal";
    if (hash.includes("data")) return "data";
    if (hash.includes("updates")) return "updates";
    if (hash.includes("general")) return "general";
    return "appearance";
  });
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [activeVoiceId, setActiveVoiceIdState] = useState<string | null>(null);
  const [engineDetail, setEngineDetail] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(
    () => localStorage.getItem("mira.autoSpeak") !== "0",
  );
  const [handsFree, setHandsFree] = useState<HandsFreePrefs>(() =>
    getHandsFreePrefs(),
  );
  const [ttsEngine, setTtsEngine] = useState<TtsEngineId>(() =>
    getActiveTtsEngine(),
  );

  useEffect(() => {
    let cancelled = false;
    void waitForVoices().then((list) => {
      if (cancelled) return;
      setVoices(list);
      setActiveVoiceIdState(getActiveVoiceId(list));
      setEngineDetail(getVoiceEngineStatus().detail);
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, []);

  return (
    <div className="settings-layout">
      <div className="settings-nav">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`nav-btn ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="panel stack">
        {section === "appearance" ? (
          <>
            <div className="row">
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Темы</h2>
              <StubBadge label="DESIGN" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Акцент зашит в тему. Default — Deep Sea Neon.
            </p>
            <div className="theme-grid">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`theme-card ${themeId === theme.id ? "active" : ""}`}
                  onClick={() => onThemeChange(theme.id)}
                >
                  <strong>{theme.name}</strong>
                  <div className="swatches">
                    <span
                      className="swatch"
                      style={{ background: theme.tokens.bg }}
                    />
                    <span
                      className="swatch"
                      style={{ background: theme.tokens.bgElevated }}
                    />
                    <span
                      className="swatch"
                      style={{ background: theme.tokens.accent }}
                    />
                  </div>
                  <span className="mono muted">{theme.id}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {section === "general" ? <GeneralSection /> : null}
        {section === "voice" ? (
          <>
            <div className="row">
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Голос и аудио</h2>
              <StubBadge label="F9" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {engineDetail || "Определение движка…"}
            </p>
            <label className="stack">
              <span className="muted">Движок TTS</span>
              <ThemeSelect
                aria-label="Движок TTS"
                value={ttsEngine}
                options={listTtsEngines().map((eng) => ({
                  value: eng.id,
                  label: `${eng.label}${eng.ready ? "" : " (stub)"}`,
                }))}
                onChange={(id) => {
                  setTtsEngine(setActiveTtsEngine(id as TtsEngineId));
                  setEngineDetail(getVoiceEngineStatus().detail);
                }}
              />
            </label>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {listTtsEngines().find((e) => e.id === ttsEngine)?.detail}
            </p>
            <label className="row">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAutoSpeak(on);
                  localStorage.setItem("mira.autoSpeak", on ? "1" : "0");
                }}
              />
              <span>Автоозвучка ответов</span>
            </label>

            <label className="row">
              <input
                type="checkbox"
                checked={handsFree.enabled}
                onChange={(e) =>
                  setHandsFree(
                    setHandsFreePrefs({ enabled: e.target.checked }),
                  )
                }
              />
              <span>Hands-free (wake-word без PTT)</span>
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={handsFree.bargeIn}
                onChange={(e) =>
                  setHandsFree(
                    setHandsFreePrefs({ bargeIn: e.target.checked }),
                  )
                }
              />
              <span>Barge-in: перебить озвучку → сразу слушать (Space)</span>
            </label>
            <label className="stack">
              <span className="muted">Wake-фраза</span>
              <input
                value={handsFree.wakePhrase}
                onChange={(e) =>
                  setHandsFree(
                    setHandsFreePrefs({ wakePhrase: e.target.value }),
                  )
                }
                placeholder="мира"
              />
            </label>
            <label className="stack">
              <span className="muted">Чувствительность wake-word</span>
              <ThemeSelect
                aria-label="Чувствительность wake-word"
                value={handsFree.sensitivity}
                options={[
                  { value: "strict", label: "strict" },
                  { value: "normal", label: "normal" },
                  { value: "loose", label: "loose" },
                ]}
                onChange={(v) =>
                  setHandsFree(
                    setHandsFreePrefs({
                      sensitivity: v as WakeSensitivity,
                    }),
                  )
                }
              />
            </label>
            {voices.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Системные голоса не найдены. Откройте Mira в Electron/Chrome.
              </p>
            ) : (
              <label className="stack">
                <span className="muted">Активный голос</span>
                <ThemeSelect
                  aria-label="Активный голос"
                  value={activeVoiceId ?? ""}
                  options={voices.map((v) => ({
                    value: v.id,
                    label: `${v.name} (${v.lang})`,
                  }))}
                  onChange={(id) => {
                    setActiveVoiceId(id);
                    setActiveVoiceIdState(id);
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    speakText(
                      "Проверка голоса Mira. Звучу ли я достаточно естественно?",
                      activeVoiceId,
                    )
                  }
                >
                  Прослушать
                </button>
              </label>
            )}
            <p className="muted" style={{ margin: 0 }}>
              Hands-free слушает wake-фразу в `idle`. Устройства ввода — системные.
            </p>
          </>
        ) : null}
        {section === "api" ? <SettingsApiSection /> : null}
        {section === "integrations" ? <SettingsIntegrationsSection /> : null}
        {section === "terminal" ? <TerminalSettingsSection /> : null}
        {section === "data" ? (
          <DataPrivacySection
            healthText={healthText}
            onOpenDoctor={onOpenDoctor}
          />
        ) : null}
        {section === "updates" ? <SettingsUpdatesSection /> : null}
      </div>
    </div>
  );
}

function GeneralSection() {
  const [lang, setLang] = useState(() =>
    localStorage.getItem("mira.uiLang") === "en" ? "en" : "ru",
  );
  const [mode, setMode] = useState<"always" | "smart" | "dangerous-list">(
    "always",
  );
  const [dangerous, setDangerous] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const [newProfileName, setNewProfileName] = useState("");
  const [hudOpen, setHudOpen] = useState(false);

  useEffect(() => {
    if (!window.mira?.getConfirmPolicy) return;
    void window.mira.getConfirmPolicy().then((p) => {
      setMode(p.mode);
      setDangerous(p.dangerousList.join(", "));
    });
    void window.mira.getProfilesSnapshot?.().then((s) => {
      setProfiles(
        (s.profiles as Array<{ id: string; name: string }>).map((p) => ({
          id: p.id,
          name: p.name,
        })),
      );
      setActiveProfileId(s.activeId);
    });
    void window.mira.getHudPolicy?.().then((h) => setHudOpen(h.open));
  }, []);

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Общие</h2>
        <StubBadge label="F8/F10/F12" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        F8 язык UI/ASR. F10 профили (ключи только в .env). F12 режим confirm. HUD.
      </p>

      <label className="stack">
        <span className="muted">Язык UI</span>
        <ThemeSelect
          aria-label="Язык UI"
          value={lang}
          options={[
            { value: "ru", label: "Русский" },
            { value: "en", label: "English" },
          ]}
          onChange={(raw) => {
            const v = raw === "en" ? "en" : "ru";
            setLang(v);
            localStorage.setItem("mira.uiLang", v);
            setNote(`UI lang → ${v} (перезагрузка nav при следующем открытии)`);
          }}
        />
      </label>
      <label className="stack">
        <span className="muted">Режим подтверждений (F12)</span>
        <ThemeSelect
          aria-label="Режим подтверждений"
          value={mode}
          options={[
            { value: "always", label: "always" },
            { value: "smart", label: "smart" },
            { value: "dangerous-list", label: "dangerous-list" },
          ]}
          onChange={(v) =>
            setMode(v as "always" | "smart" | "dangerous-list")
          }
        />
      </label>
      <label className="stack">
        <span className="muted">Dangerous classes (csv)</span>
        <input
          value={dangerous}
          onChange={(e) => setDangerous(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          if (!window.mira) return;
          void window.mira
            .setConfirmPolicy({
              mode,
              dangerousList: dangerous
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
            .then((p) =>
              setNote(`Confirm policy: ${p.mode} · ${p.dangerousList.join(",")}`),
            );
        }}
      >
        Сохранить confirm policy
      </button>

      <div className="row">
        <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Профили (F10)</h3>
      </div>
      <label className="stack">
        <span className="muted">Активный профиль</span>
        <ThemeSelect
          aria-label="Активный профиль"
          value={activeProfileId}
          options={profiles.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) => {
            setActiveProfileId(id);
            if (!window.mira?.setActiveProfile) return;
            void window.mira.setActiveProfile(id).then(() => {
              setNote(`Активный профиль → ${id}`);
            });
          }}
        />
      </label>
      <div className="row">
        <input
          value={newProfileName}
          onChange={(e) => setNewProfileName(e.target.value)}
          placeholder="Имя нового профиля"
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!window.mira?.upsertProfile || !newProfileName.trim()) return;
            void window.mira
              .upsertProfile({ name: newProfileName.trim() })
              .then(async () => {
                const s = await window.mira!.getProfilesSnapshot();
                setProfiles(
                  (s.profiles as Array<{ id: string; name: string }>).map(
                    (p) => ({ id: p.id, name: p.name }),
                  ),
                );
                setActiveProfileId(s.activeId);
                setNewProfileName("");
                setNote("Профиль создан (ключи API не копируются в JSON)");
              });
          }}
        >
          Добавить
        </button>
      </div>

      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!window.mira?.toggleHud) return;
            void window.mira.toggleHud().then((r) => {
              setHudOpen(r.open);
              setNote(r.open ? "HUD открыт" : "HUD закрыт");
            });
          }}
        >
          {hudOpen ? "Скрыть плавающий HUD" : "Показать плавающий HUD"}
        </button>
      </div>
      {note ? <p className="muted" style={{ margin: 0 }}>{note}</p> : null}
    </>
  );
}


function DataPrivacySection(props: {
  healthText: string;
  onOpenDoctor?: () => void;
}) {
  const [statusText, setStatusText] = useState("…");
  const [packagePath, setPackagePath] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [logsText, setLogsText] = useState("…");
  const [logFile, setLogFile] = useState("");

  async function refreshStatus() {
    if (!window.mira?.getBackupStatus) {
      setStatusText("IPC недоступен");
      return;
    }
    const st = await window.mira.getBackupStatus();
    setStatusText(JSON.stringify(st, null, 2));
    if (!packagePath && st.packages[0]) {
      setPackagePath(`data/backups/${st.packages[0]}`);
    }
  }

  async function refreshLogs() {
    if (!window.mira?.listAppLogs) {
      setLogsText("IPC недоступен");
      return;
    }
    const [rows, status] = await Promise.all([
      window.mira.listAppLogs({ limit: 40 }),
      window.mira.getLoggingStatus(),
    ]);
    if (!logFile && status.latestFile) setLogFile(status.latestFile);
    setLogsText(
      [
        JSON.stringify(status, null, 2),
        "",
        ...rows.map(
          (r) =>
            `${r.created_at} [${r.level}/${r.category}] ${r.message}`,
        ),
      ].join("\n"),
    );
  }

  useEffect(() => {
    void refreshStatus();
    void refreshLogs();
  }, []);

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
          Данные и приватность
        </h2>
        <StubBadge label="F13" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Export/import (`mira-backup-v1`), «забыть» с confirm, Doctor + логи
        сессии (F13). Секреты в пакет — только opt-in.
      </p>
      <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => props.onOpenDoctor?.()}
        >
          Doctor
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => {
            setBusy("export");
            void window.mira
              ?.exportBackup({ includeSecrets })
              .then((res) => {
                setNote(res.detail);
                setPackagePath(res.packagePath);
                return refreshStatus();
              })
              .catch((err) =>
                setNote(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setBusy(null));
          }}
        >
          Export backup
        </button>
        <label className="row" style={{ gap: "0.35rem" }}>
          <input
            type="checkbox"
            checked={includeSecrets}
            onChange={(e) => setIncludeSecrets(e.target.checked)}
          />
          <span className="muted">включить .env (не рекомендуется)</span>
        </label>
      </div>
      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="muted">Путь пакета для import (внутри data/)</span>
        <input
          value={packagePath}
          onChange={(e) => setPackagePath(e.target.value)}
          placeholder="data/backups/mira-backup-…"
        />
      </label>
      <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn"
          disabled={busy !== null || !packagePath.trim()}
          onClick={() => {
            setBusy("import");
            void window.mira
              ?.importBackup(packagePath.trim())
              .then((res) => {
                setNote(res.detail);
                return refreshStatus();
              })
              .catch((err) =>
                setNote(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setBusy(null));
          }}
        >
          Import backup
        </button>
        {(
          [
            ["memory", "Забыть память"],
            ["learned", "Забыть выученное"],
            ["library", "Забыть библиотеку"],
            ["voice-studio", "Забыть студию"],
            ["all", "Забыть всё"],
          ] as const
        ).map(([scope, label]) => (
          <button
            key={scope}
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => {
              setBusy(`forget-${scope}`);
              void window.mira
                ?.forgetData(scope)
                .then((res) => {
                  setNote(
                    `${res.detail} · ${JSON.stringify(res.deleted)}`,
                  );
                  return refreshStatus();
                })
                .catch((err) =>
                  setNote(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setBusy(null));
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {note ? <p className="muted" style={{ margin: 0 }}>{note}</p> : null}
      {busy ? <p className="muted mono">busy: {busy}</p> : null}

      <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Логи сессии</h3>
      <p className="muted" style={{ margin: 0 }}>
        SQLite `app_logs` + файлы `data/logs/mira-YYYY-MM-DD.jsonl`.
      </p>
      <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => {
            setBusy("logs");
            void refreshLogs().finally(() => setBusy(null));
          }}
        >
          Обновить логи
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null || !logFile}
          onClick={() => {
            if (!window.mira || !logFile) return;
            setBusy("logfile");
            void window.mira
              .readLogFile(logFile, 60)
              .then((text) => setLogsText(text))
              .catch((err) =>
                setNote(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setBusy(null));
          }}
        >
          Хвост файла
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => {
            if (!window.mira) return;
            setBusy("clear-logs");
            void window.mira
              .clearAppLogs()
              .then((res) => {
                setNote(`Логи очищены: ${res.deleted}`);
                return refreshLogs();
              })
              .finally(() => setBusy(null));
          }}
        >
          Очистить DB-логи
        </button>
        <input
          value={logFile}
          onChange={(e) => setLogFile(e.target.value)}
          placeholder="mira-….jsonl"
          style={{ minWidth: "12rem" }}
        />
      </div>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {logsText}
      </pre>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {statusText}
      </pre>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {props.healthText}
      </pre>
    </>
  );
}

function TerminalSettingsSection() {
  const [policyText, setPolicyText] = useState("…");
  const [fontSize, setFontSize] = useState(
    () => localStorage.getItem("mira.terminalFontSize") || "14",
  );
  const [scrollback, setScrollback] = useState(
    () => localStorage.getItem("mira.terminalScrollback") || "2000",
  );
  const [test, setTest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.mira) {
        if (!cancelled) setPolicyText("IPC недоступен");
        return;
      }
      const policy = await window.mira.getTerminalPolicy();
      if (!cancelled) setPolicyText(JSON.stringify(policy, null, 2));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Терминал</h2>
        <StubBadge label="P7 #16" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Prefs: `TERMINAL_SHELL`, `TERMINAL_CWD`, `TERMINAL_FONT_SIZE`,
        `TERMINAL_SCROLLBACK`. Эмулятор — Мастерская → Терминал. Команды из
        Диалога: «Выполни в терминале: …» (confirm).
      </p>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {policyText}
      </pre>
      <label className="stack">
        <span className="muted">Размер шрифта (UI)</span>
        <input
          value={fontSize}
          onChange={(e) => {
            setFontSize(e.target.value);
            localStorage.setItem("mira.terminalFontSize", e.target.value);
          }}
        />
      </label>
      <label className="stack">
        <span className="muted">Scrollback (UI)</span>
        <input
          value={scrollback}
          onChange={(e) => {
            setScrollback(e.target.value);
            localStorage.setItem("mira.terminalScrollback", e.target.value);
          }}
        />
      </label>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            if (!window.mira) return;
            setBusy(true);
            void window.mira
              .runTerminalCommand("echo mira-p7 && pwd")
              .then((res) => {
                setTest(
                  `${res.ok ? "OK" : "FAIL"} — ${(res.output || res.detail || "").slice(0, 160)}`,
                );
              })
              .finally(() => setBusy(false));
          }}
        >
          Тест echo/pwd
        </button>
        {test ? <span className="chip">{test}</span> : null}
      </div>
    </>
  );
}

