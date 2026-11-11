import { useEffect, useMemo, useState } from "react";
import { APP_NAME, APP_PHASE } from "../config";
import { ConfirmModal } from "./components/ConfirmModal";
import { ErrorBanner } from "./components/ErrorBanner";
import { ChatPage } from "./pages/ChatPage";
import { MemoryPage } from "./pages/MemoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkshopPage } from "./pages/WorkshopPage";
import {
  applyTheme,
  loadStoredThemeId,
  type ThemeId,
} from "./themes";
import { nextVoiceState, type VoiceState } from "./voiceState";

type RootNav = "chat" | "memory" | "workshop" | "settings";

const NAV: { id: RootNav; label: string }[] = [
  { id: "chat", label: "Диалог" },
  { id: "memory", label: "Память" },
  { id: "workshop", label: "Мастерская" },
  { id: "settings", label: "Настройки" },
];

const TITLES: Record<RootNav, string> = {
  chat: "Диалог",
  memory: "Память",
  workshop: "Мастерская",
  settings: "Настройки",
};

export function App() {
  const [nav, setNav] = useState<RootNav>("chat");
  const [themeId, setThemeId] = useState<ThemeId>(() => loadStoredThemeId());
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showError, setShowError] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [healthText, setHealthText] = useState("Проверка store…");

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      if (!window.mira) {
        if (!cancelled) {
          setHealthText(
            "Renderer-only mode: SQLite IPC unavailable. Use Electron or `npm run db:check`.",
          );
        }
        return;
      }
      try {
        const health = await window.mira.getHealth();
        if (!cancelled) {
          setHealthText(JSON.stringify(health, null, 2));
        }
      } catch (err) {
        if (!cancelled) {
          setHealthText(
            err instanceof Error ? err.message : "health check failed",
          );
          setShowError(true);
        }
      }
    }

    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  const doctorBody = useMemo(
    () =>
      [
        "Doctor (заготовка F13 / P0 stub)",
        "",
        "• Mic: ещё не подключён (P2)",
        "• API: ключи и провайдер — P1",
        "• Blender: интеграция — P10",
        "",
        healthText,
      ].join("\n"),
    [healthText],
  );

  function handleThemeChange(id: ThemeId) {
    setThemeId(id);
  }

  function handleHoldPtt(down: boolean) {
    if (down) {
      setVoiceState("listening");
      setShowError(false);
      return;
    }
    setVoiceState("idle");
  }

  return (
    <div className="app-shell">
      <aside className="nav">
        <div className="brand">
          <div className="brand-name">{APP_NAME}</div>
          <div className="brand-phase">phase {APP_PHASE}</div>
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-btn ${nav === item.id ? "active" : ""}`}
            onClick={() => setNav(item.id)}
          >
            {item.label}
          </button>
        ))}
      </aside>

      <main className="main">
        <header className="main-header">
          <h1>{TITLES[nav]}</h1>
          <div className="row">
            <span className="chip">
              state <strong>{voiceState}</strong>
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => setShowError(true)}
            >
              Demo error
            </button>
          </div>
        </header>

        {showError ? (
          <ErrorBanner
            message="Демо: сбой (mic/API). В P1/P2 здесь будут реальные причины."
            onRetry={() => {
              setShowError(false);
              setVoiceState("idle");
            }}
            onDoctor={() => setDoctorOpen(true)}
            onDismiss={() => setShowError(false)}
          />
        ) : null}

        <div className="main-body">
          {nav === "chat" ? (
            <ChatPage
              voiceState={voiceState}
              onCycleVoiceState={() => setVoiceState((s) => nextVoiceState(s))}
              onHoldPtt={handleHoldPtt}
              onDemoConfirm={() => setConfirmOpen(true)}
            />
          ) : null}
          {nav === "memory" ? <MemoryPage /> : null}
          {nav === "workshop" ? <WorkshopPage /> : null}
          {nav === "settings" ? (
            <SettingsPage
              themeId={themeId}
              onThemeChange={handleThemeChange}
              healthText={healthText}
            />
          ) : null}
        </div>
      </main>

      <ConfirmModal
        open={confirmOpen}
        title="Подтверждение действия"
        body="Демо ConfirmModal (P0). Опасные действия и исходящие сообщения всегда требуют confirm до F12."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
      />

      <ConfirmModal
        open={doctorOpen}
        title="Doctor"
        body={doctorBody}
        confirmLabel="Закрыть"
        onCancel={() => setDoctorOpen(false)}
        onConfirm={() => setDoctorOpen(false)}
      />
    </div>
  );
}
