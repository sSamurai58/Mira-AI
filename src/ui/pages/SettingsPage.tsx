import { useEffect, useState } from "react";
import { StubBadge } from "../components/StubBadge";
import { THEMES, type ThemeId } from "../themes";
import {
  getActiveVoiceId,
  setActiveVoiceId,
  waitForVoices,
} from "../voice/catalog";
import { getVoiceEngineStatus } from "../voice/engineStatus";
import { speakText, stopSpeaking } from "../voice/tts";
import type { VoiceInfo } from "../voice/types";

const SECTIONS = [
  { id: "appearance", label: "Внешний вид" },
  { id: "general", label: "Общие" },
  { id: "voice", label: "Голос и аудио" },
  { id: "api", label: "API и модели" },
  { id: "integrations", label: "Интеграции" },
  { id: "terminal", label: "Терминал" },
  { id: "data", label: "Данные и приватность" },
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
  const [section, setSection] = useState<SectionId>("appearance");
  const [cfgText, setCfgText] = useState("…");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [activeVoiceId, setActiveVoiceIdState] = useState<string | null>(null);
  const [engineDetail, setEngineDetail] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(
    () => localStorage.getItem("mira.autoSpeak") !== "0",
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.mira) {
        if (!cancelled) setCfgText("IPC недоступен (откройте в Electron)");
        return;
      }
      const cfg = await window.mira.getConfig();
      if (!cancelled) setCfgText(JSON.stringify(cfg, null, 2));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [section]);

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

  async function handleTest() {
    if (!window.mira) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await window.mira.testLlm();
      setTestResult(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

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

        {section === "general" ? (
          <StubSection
            title="Общие"
            body="Язык UI (F8), профили (F10), режим confirm (F12). Сейчас confirm = always."
          />
        ) : null}
        {section === "voice" ? (
          <>
            <div className="row">
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Голос и аудио</h2>
              <StubBadge label="P2" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {engineDetail || "Определение движка…"}
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
            {voices.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Системные голоса не найдены. Откройте Mira в Electron/Chrome.
              </p>
            ) : (
              <label className="stack">
                <span className="muted">Активный голос</span>
                <select
                  value={activeVoiceId ?? ""}
                  onChange={(e) => {
                    setActiveVoiceId(e.target.value);
                    setActiveVoiceIdState(e.target.value);
                  }}
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
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
              Wake-word / barge-in — F9. Устройства ввода ОС — системные.
            </p>
          </>
        ) : null}
        {section === "api" ? (
          <>
            <div className="row">
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>API и модели</h2>
              <StubBadge label="P1" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Ключи только в `.env` (`OPENAI_API_KEY`, опц. `OPENAI_BASE_URL`,
              `LLM_PROVIDER=openai|mock`, `LLM_MODEL`). Без ключа работает{" "}
              <strong>mock</strong>.
            </p>
            <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {cfgText}
            </pre>
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={testing}
                onClick={() => void handleTest()}
              >
                {testing ? "Проверка…" : "Тест соединения"}
              </button>
              {testResult ? <span className="chip">{testResult}</span> : null}
            </div>
          </>
        ) : null}
        {section === "integrations" ? (
          <IntegrationsSection />
        ) : null}
        {section === "terminal" ? <TerminalSettingsSection /> : null}
        {section === "data" ? (
          <DataPrivacySection
            healthText={healthText}
            onOpenDoctor={onOpenDoctor}
          />
        ) : null}
      </div>
    </div>
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

  useEffect(() => {
    void refreshStatus();
  }, []);

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
          Данные и приватность
        </h2>
        <StubBadge label="F11" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Export/import пакета (`mira-backup-v1`: БД, library, voice-studio,
        skills/protocols). Секреты в пакет — только с явной опцией. «Забыть» —
        с confirm и предупреждением о необратимости.
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

function StubSection({ title, body }: { title: string; body: string }) {
  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{title}</h2>
        <StubBadge />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {body}
      </p>
    </>
  );
}

function IntegrationsSection() {
  const [webPolicy, setWebPolicy] = useState("…");
  const [screenPolicy, setScreenPolicy] = useState("…");
  const [browserPolicy, setBrowserPolicy] = useState("…");
  const [messagingPolicy, setMessagingPolicy] = useState("…");
  const [contactsText, setContactsText] = useState("…");
  const [webTest, setWebTest] = useState<string | null>(null);
  const [screenTest, setScreenTest] = useState<string | null>(null);
  const [browserTest, setBrowserTest] = useState<string | null>(null);
  const [messagingTest, setMessagingTest] = useState<string | null>(null);
  const [blenderPolicy, setBlenderPolicy] = useState("…");
  const [blenderTest, setBlenderTest] = useState<string | null>(null);
  const [historyText, setHistoryText] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tgChatId, setTgChatId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.mira) {
        if (!cancelled) {
          setWebPolicy("IPC недоступен");
          setScreenPolicy("IPC недоступен");
          setBrowserPolicy("IPC недоступен");
          setMessagingPolicy("IPC недоступен");
          setBlenderPolicy("IPC недоступен");
          setContactsText("IPC недоступен");
        }
        return;
      }
      const [web, screen, browser, messaging, blender, contacts] =
        await Promise.all([
          window.mira.getWebPolicy(),
          window.mira.getScreenPolicy(),
          window.mira.getBrowserPolicy(),
          window.mira.getMessagingPolicy(),
          window.mira.getBlenderPolicy(),
          window.mira.listMessengerContacts(),
        ]);
      if (cancelled) return;
      setWebPolicy(JSON.stringify(web, null, 2));
      setScreenPolicy(JSON.stringify(screen, null, 2));
      setBrowserPolicy(JSON.stringify(browser, null, 2));
      setMessagingPolicy(JSON.stringify(messaging, null, 2));
      setBlenderPolicy(JSON.stringify(blender, null, 2));
      setContactsText(
        contacts
          .map(
            (c) =>
              `${c.provider}: ${c.display_name} (${c.handle}) → ${c.chat_id}`,
          )
          .join("\n") || "(нет контактов)",
      );
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Интеграции</h2>
        <StubBadge label="P10" />
      </div>

      <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Интернет (#4)</h3>
      <p className="muted" style={{ margin: 0 }}>
        `WEB_ENABLED`, `WEB_ALLOWLIST`, `WEB_FETCH_CONFIRM`. Fetch URL — через
        ConfirmModal (always до F12).
      </p>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {webPolicy}
      </pre>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => {
            if (!window.mira) return;
            setBusy("web");
            void window.mira
              .testWeb("weather Moscow")
              .then((res) => {
                setWebTest(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
              })
              .finally(() => setBusy(null));
          }}
        >
          Тест web.search
        </button>
        {webTest ? <span className="chip">{webTest}</span> : null}
      </div>

      <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Экран (#6–7)</h3>
      <p className="muted" style={{ margin: 0 }}>
        `SCREEN_ENABLED`, `SCREEN_CONTROL_ENABLED`, `OS_PRIORITY`. Клик/ввод —
        confirm. Capture → `data/screenshots/`.
      </p>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {screenPolicy}
      </pre>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => {
            if (!window.mira) return;
            setBusy("screen");
            void window.mira
              .testScreen()
              .then((res) => {
                setScreenTest(
                  `${res.ok ? "OK" : "FAIL"} — ${res.detail}${res.path ? ` · ${res.path}` : ""}`,
                );
              })
              .finally(() => setBusy(null));
          }}
        >
          Тест screen.capture
        </button>
        {screenTest ? <span className="chip">{screenTest}</span> : null}
      </div>

      <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Браузер (#8)</h3>
      <p className="muted" style={{ margin: 0 }}>
        `BROWSER_ENABLED`, `BROWSER_PREFERRED`, `BROWSER_OPEN_CONFIRM`. История:
        визиты Mira + опц. Chromium History (read-only).
      </p>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {browserPolicy}
      </pre>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => {
            if (!window.mira) return;
            setBusy("browser");
            void window.mira
              .testBrowserOpen("https://example.com")
              .then((res) => {
                setBrowserTest(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
              })
              .finally(() => setBusy(null));
          }}
        >
          Тест open URL
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => {
            if (!window.mira) return;
            setBusy("history");
            void window.mira
              .searchBrowserHistory("")
              .then((rows) => {
                setHistoryText(
                  rows.length
                    ? rows
                        .slice(0, 8)
                        .map((r) => `${r.title}\n  ${r.url}`)
                        .join("\n")
                    : "(пусто)",
                );
              })
              .finally(() => setBusy(null));
          }}
        >
          История
        </button>
        {browserTest ? <span className="chip">{browserTest}</span> : null}
      </div>
      {historyText ? (
        <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
          {historyText}
        </pre>
      ) : null}

      <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Мессенджеры (#12)</h3>
      <p className="muted" style={{ margin: 0 }}>
        Primary: Telegram. Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEFAULT_CHAT_ID`,
        `MESSAGING_MODE=dry-run|live`, `MESSAGING_CONFIRM`. Отправка только после
        ConfirmModal. WhatsApp / Instagram — stub.
      </p>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {messagingPolicy}
      </pre>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {contactsText}
      </pre>
      <label className="stack">
        <span className="muted">Chat ID для контакта «Иван» (Telegram)</span>
        <input
          value={tgChatId}
          onChange={(e) => setTgChatId(e.target.value)}
          placeholder="например 123456789"
        />
      </label>
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={busy !== null || !tgChatId.trim()}
          onClick={() => {
            if (!window.mira) return;
            setBusy("contact");
            void window.mira
              .upsertMessengerContact({
                id: "tg-ivan",
                provider: "telegram",
                displayName: "Иван",
                handle: "@ivan_demo",
                chatId: tgChatId.trim(),
              })
              .then((row) => {
                setContactsText((prev) =>
                  `${row.provider}: ${row.display_name} (${row.handle}) → ${row.chat_id}\n${prev}`
                    .split("\n")
                    .filter((line, i, arr) => arr.indexOf(line) === i)
                    .join("\n"),
                );
              })
              .finally(() => setBusy(null));
          }}
        >
          Сохранить chat id
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => {
            if (!window.mira) return;
            setBusy("messaging");
            void window.mira
              .testMessagingSend({
                recipient: "Ивану",
                body: "тест из Настроек Mira",
              })
              .then((res) => {
                setMessagingTest(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
              })
              .finally(() => setBusy(null));
          }}
        >
          Тест send (confirm)
        </button>
        {messagingTest ? <span className="chip">{messagingTest}</span> : null}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        WhatsApp / Instagram — интерфейс-заглушки (без отправки).
      </p>

      <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Blender (#13)</h3>
      <p className="muted" style={{ margin: 0 }}>
        `BLENDER_ENABLED`, `BLENDER_PATH`, `BLENDER_MODE=dry-run|live`,
        `BLENDER_CONFIRM`. Демо: куб + свет + камера через bpy. Skill
        `blender-scene` — on-demand (default off).
      </p>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {blenderPolicy}
      </pre>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => {
            if (!window.mira) return;
            setBusy("blender");
            void window.mira
              .testBlenderDemo()
              .then((res) => {
                setBlenderTest(
                  `${res.ok ? "OK" : "FAIL"} · ${res.mode} — ${res.detail}`,
                );
              })
              .finally(() => setBusy(null));
          }}
        >
          Тест демо-сцены
        </button>
        {blenderTest ? <span className="chip">{blenderTest}</span> : null}
      </div>
    </>
  );
}
