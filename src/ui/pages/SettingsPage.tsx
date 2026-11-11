import { useState } from "react";
import { THEMES, type ThemeId } from "../themes";
import { StubBadge } from "../components/StubBadge";

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
          <StubSection
            title="Голос и аудио"
            body="Микрофон, вывод, wake-word (F9) — фаза P2+."
          />
        ) : null}
        {section === "api" ? (
          <StubSection
            title="API и модели"
            body="Ключи только через .env. Подключение провайдеров — P1."
          />
        ) : null}
        {section === "integrations" ? (
          <StubSection
            title="Интеграции"
            body="Экран, браузер, мессенджеры, Blender, интернет — отдельные фазы после MVP."
          />
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
              <StubBadge label="P0 store" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Backup/забыть — F11. Сейчас доступен health SQLite:
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
