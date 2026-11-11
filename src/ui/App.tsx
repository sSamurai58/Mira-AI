import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  formatDoctorView,
  mergeDoctorReport,
} from "./doctor/formatDoctorReport";
import { getVoiceEngineStatus } from "./voice/engineStatus";
import type { VoiceState } from "./voiceState";

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
  const [pendingConfirm, setPendingConfirm] =
    useState<MiraConfirmRequest | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [doctorText, setDoctorText] = useState("Doctor…");
  const [healthText, setHealthText] = useState("Проверка store…");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(
    () => localStorage.getItem("mira.autoSpeak") !== "0",
  );

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    const onStorage = () => {
      setAutoSpeak(localStorage.getItem("mira.autoSpeak") !== "0");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Keep autoSpeak in sync when changed from Settings in same window
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = localStorage.getItem("mira.autoSpeak") !== "0";
      setAutoSpeak((prev) => (prev === next ? prev : next));
    }, 800);
    return () => window.clearInterval(id);
  }, []);

  const refreshHealth = useCallback(async () => {
    if (!window.mira) {
      setHealthText(
        "Renderer-only mode: SQLite IPC unavailable. Use Electron or `npm run db:check`.",
      );
      return;
    }
    try {
      const health = await window.mira.getHealth();
      const voice = getVoiceEngineStatus();
      setHealthText(
        JSON.stringify({ ...health, voice }, null, 2),
      );
      if (health.llmOk === false && health.llmReason) {
        setErrorMessage(health.llmReason);
      }
    } catch (err) {
      setHealthText(
        err instanceof Error ? err.message : "health check failed",
      );
      setErrorMessage(
        err instanceof Error ? err.message : "health check failed",
      );
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    if (!window.mira?.onConfirmRequest) return;
    return window.mira.onConfirmRequest((req) => {
      setPendingConfirm(req);
    });
  }, []);

  const refreshDoctor = useCallback(async () => {
    if (!window.mira?.runDoctor) {
      const local = mergeDoctorReport(null);
      setDoctorText(formatDoctorView(local));
      return;
    }
    try {
      const main = await window.mira.runDoctor();
      const merged = mergeDoctorReport(main);
      setDoctorText(formatDoctorView(merged));
    } catch (err) {
      setDoctorText(
        err instanceof Error ? err.message : "Doctor failed",
      );
    }
  }, []);

  const openDoctor = useCallback(() => {
    setDoctorOpen(true);
    void refreshDoctor();
  }, [refreshDoctor]);

  const doctorBody = useMemo(() => doctorText, [doctorText]);

  const handleSessionChange = useCallback((id: string) => {
    setSessionId(id);
  }, []);

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
              onClick={() => setConfirmOpen(true)}
            >
              Demo confirm
            </button>
          </div>
        </header>

        {errorMessage ? (
          <ErrorBanner
            message={errorMessage}
            onRetry={() => {
              setErrorMessage(null);
              setVoiceState("idle");
              void refreshHealth();
            }}
            onDoctor={openDoctor}
            onDismiss={() => setErrorMessage(null)}
          />
        ) : null}

        <div className="main-body">
          {nav === "chat" ? (
            <ChatPage
              voiceState={voiceState}
              sessionId={sessionId}
              onSessionChange={handleSessionChange}
              onError={setErrorMessage}
              onVoiceState={setVoiceState}
              autoSpeak={autoSpeak}
            />
          ) : null}
          {nav === "memory" ? (
            <MemoryPage
              onOpenSession={(id) => {
                setSessionId(id);
                setNav("chat");
              }}
            />
          ) : null}
          {nav === "workshop" ? <WorkshopPage /> : null}
          {nav === "settings" ? (
            <SettingsPage
              themeId={themeId}
              onThemeChange={setThemeId}
              healthText={healthText}
              onOpenDoctor={openDoctor}
            />
          ) : null}
        </div>
      </main>

      <ConfirmModal
        open={confirmOpen}
        title="Подтверждение действия"
        body="ConfirmModal (always до F12)."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
      />

      <ConfirmModal
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title ?? "Подтверждение"}
        body={pendingConfirm?.body ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel ?? "Подтвердить"}
        onCancel={() => {
          if (pendingConfirm && window.mira) {
            void window.mira.respondConfirm(pendingConfirm.id, false);
          }
          setPendingConfirm(null);
        }}
        onConfirm={() => {
          if (pendingConfirm && window.mira) {
            void window.mira.respondConfirm(pendingConfirm.id, true);
          }
          setPendingConfirm(null);
        }}
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
