import { useEffect, useState } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { StubBadge } from "../components/StubBadge";
import { SettingsApiSection } from "../components/SettingsApiSection";
import { SettingsDataPrivacySection } from "../components/SettingsDataPrivacySection";
import { SettingsIntegrationsSection } from "../components/SettingsIntegrationsSection";
import { SettingsMcpSection } from "../components/SettingsMcpSection";
import { SettingsNotificationsSection } from "../components/SettingsNotificationsSection";
import { SettingsTerminalSection } from "../components/SettingsTerminalSection";
import { SettingsUpdatesSection } from "../components/SettingsUpdatesSection";
import { SettingsVoiceSection } from "../components/SettingsVoiceSection";
import { SettingsAppleSection } from "../components/SettingsAppleSection";
import { ThemeSelect } from "../components/ThemeSelect";
import { BG_PATTERNS, type BgPatternId } from "../backgrounds";
import { miraThemes, type ThemeId } from "../themes";

const SECTIONS = [
  { id: "appearance", label: "Внешний вид" },
  { id: "general", label: "Общие" },
  { id: "notifications", label: "Всплывающие уведомления" },
  { id: "voice", label: "Голос и аудио" },
  { id: "api", label: "API и модели" },
  { id: "integrations", label: "Интеграции" },
  { id: "mcp", label: "MCP" },
  { id: "terminal", label: "Терминал" },
  { id: "data", label: "Данные и приватность" },
  { id: "updates", label: "Обновления" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

type SettingsPageProps = {
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  bgPatternId: BgPatternId;
  onBgPatternChange: (id: BgPatternId) => void;
  healthText: string;
  onOpenDoctor?: () => void;
};

export function SettingsPage({
  themeId,
  onThemeChange,
  bgPatternId,
  onBgPatternChange,
  healthText,
  onOpenDoctor,
}: SettingsPageProps) {
  function sectionFromHash(hash: string): SectionId {
    if (hash.includes("mcp")) return "mcp";
    if (hash.includes("integrations")) return "integrations";
    if (hash.includes("api")) return "api";
    if (hash.includes("notifications")) return "notifications";
    if (hash.includes("voice")) return "voice";
    if (hash.includes("terminal")) return "terminal";
    if (hash.includes("data")) return "data";
    if (hash.includes("updates")) return "updates";
    if (hash.includes("general")) return "general";
    /* Legacy #/settings/apple → Appearance subsection */
    if (hash.includes("apple") || hash.includes("appearance")) return "appearance";
    return "appearance";
  }

  function hashForSection(id: SectionId): string {
    return id === "appearance" ? "#/settings" : `#/settings/${id}`;
  }

  const [section, setSectionState] = useState<SectionId>(() =>
    sectionFromHash(typeof window !== "undefined" ? window.location.hash : ""),
  );

  function setSection(id: SectionId) {
    setSectionState(id);
    const next = hashForSection(id);
    if (typeof window !== "undefined" && window.location.hash !== next) {
      window.location.hash = next;
    }
  }

  useEffect(() => {
    function onHash() {
      setSectionState(sectionFromHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
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
          <div className="appearance-stack">
            <header className="appearance-block-head">
              <div className="row">
                <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Темы</h2>
                <StubBadge label="DESIGN" />
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Акцент зашит в тему. Default — Deep Sea Neon.
              </p>
            </header>
            <div className="theme-grid">
              {miraThemes().map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`theme-card ${themeId === theme.id ? "active" : ""}`}
                  onClick={() => onThemeChange(theme.id)}
                  aria-pressed={themeId === theme.id}
                >
                  <span
                    className="theme-card-ribbon"
                    aria-hidden
                    style={{
                      background: `linear-gradient(90deg, ${theme.tokens.bg} 0 34%, ${theme.tokens.bgElevated} 34% 68%, ${theme.tokens.accent} 68% 100%)`,
                    }}
                  />
                  <span className="theme-card-body">
                    <strong>{theme.name}</strong>
                    <span className="mono muted">{theme.id}</span>
                  </span>
                  {themeId === theme.id ? (
                    <span className="appearance-check" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <header className="appearance-block-head">
              <div className="row">
                <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Фон · узор</h2>
                <StubBadge label="STATIC" />
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Статичный паттерн без свечений. Чернила из цвета темы.
              </p>
            </header>
            <div className="bg-pattern-grid">
              {BG_PATTERNS.map((pat) => (
                <button
                  key={pat.id}
                  type="button"
                  className={`bg-pattern-card ${bgPatternId === pat.id ? "active" : ""}`}
                  onClick={() => onBgPatternChange(pat.id)}
                  aria-pressed={bgPatternId === pat.id}
                >
                  <span
                    className="bg-pattern-preview"
                    data-bg-preview={pat.id}
                    aria-hidden
                  />
                  <span className="bg-pattern-meta">
                    <strong>{pat.label}</strong>
                    <span className="mono muted">{pat.id}</span>
                  </span>
                  {bgPatternId === pat.id ? (
                    <span className="appearance-check" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="appearance-apple-sub">
              <SettingsAppleSection
                themeId={themeId}
                onThemeChange={onThemeChange}
              />
            </div>
          </div>
        ) : null}

        {section === "general" ? <GeneralSection /> : null}
        {section === "voice" ? <SettingsVoiceSection /> : null}
        {section === "notifications" ? (
          <SettingsNotificationsSection />
        ) : null}
        {section === "api" ? <SettingsApiSection /> : null}
        {section === "integrations" ? (
          <ErrorBoundary
            key="integrations"
            fallbackTitle="Интеграции сбойнули"
          >
            <SettingsIntegrationsSection />
          </ErrorBoundary>
        ) : null}
        {section === "mcp" ? (
          <ErrorBoundary fallbackTitle="MCP сбойнул">
            <SettingsMcpSection />
          </ErrorBoundary>
        ) : null}
        {section === "terminal" ? <SettingsTerminalSection /> : null}
        {section === "data" ? (
          <SettingsDataPrivacySection
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
        F8 язык UI/ASR. F10 профили (ключи только в .env). F12 режим confirm.
        HUD.
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
            setNote(
              `UI lang → ${v} (перезагрузка nav при следующем открытии)`,
            );
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
              setNote(
                `Confirm policy: ${p.mode} · ${p.dangerousList.join(",")}`,
              ),
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
      {note ? (
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}
    </>
  );
}
