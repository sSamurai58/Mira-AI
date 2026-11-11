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
};

export function SettingsPage({
  themeId,
  onThemeChange,
  healthText,
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
        {section === "terminal" ? (
          <StubSection
            title="Терминал"
            body="Prefs shell/шрифт — P7. Эмулятор живёт в Мастерской."
          />
        ) : null}
        {section === "data" ? (
          <>
            <div className="row">
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
                Данные и приватность
              </h2>
              <StubBadge label="P1 store" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Backup/забыть — F11. Health:
            </p>
            <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {healthText}
            </pre>
          </>
        ) : null}
      </div>
    </div>
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
  const [policyText, setPolicyText] = useState("…");
  const [test, setTest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.mira) {
        if (!cancelled) setPolicyText("IPC недоступен");
        return;
      }
      const policy = await window.mira.getWebPolicy();
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
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Интеграции</h2>
        <StubBadge label="P4 web" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Интернет (#4): `WEB_ENABLED`, `WEB_ALLOWLIST`, `WEB_FETCH_CONFIRM` в
        `.env`. Fetch URL всегда через ConfirmModal (always до F12).
      </p>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {policyText}
      </pre>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            if (!window.mira) return;
            setBusy(true);
            void window.mira
              .testWeb("weather Moscow")
              .then((res) => {
                setTest(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
              })
              .finally(() => setBusy(false));
          }}
        >
          Тест web.search
        </button>
        {test ? <span className="chip">{test}</span> : null}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Экран / браузер / мессенджеры / Blender — следующие фазы.
      </p>
    </>
  );
}
