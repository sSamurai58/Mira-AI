import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_NAME, APP_VERSION } from "../config";
import {
  installActionLogBridge,
  logAppError,
  logConfirmResolved,
  logVoiceState,
} from "./actionLog";
import { installAutoGrowTextareas } from "./autoGrowTextareas";
import { AppConfirmProvider } from "./components/AppConfirm";
import { ConfirmModal } from "./components/ConfirmModal";
import { ErrorBanner } from "./components/ErrorBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TitleBar } from "./components/TitleBar";
import { UpdateHudToast } from "./components/UpdateHudToast";
import { ChatPage } from "./pages/ChatPage";
import { HudPage } from "./pages/HudPage";
import { MemoryPage } from "./pages/MemoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TranslatePage } from "./pages/TranslatePage";
import { WorkshopPage } from "./pages/WorkshopPage";
import {
  applyBgPattern,
  loadStoredBgPatternId,
  type BgPatternId,
} from "./backgrounds";
import { CoreLevelChip } from "./components/CoreLevelChip";
import {
  CORE_PROGRESS_EVENT,
  coreLevelRingPct,
  loadCoreLevel,
  syncCoreLevelFromProgress,
} from "./coreLevel";
import {
  applyTheme,
  loadStoredThemeId,
  type ThemeId,
} from "./themes";
import {
  formatDoctorView,
  mergeDoctorReport,
} from "./doctor/formatDoctorReport";
import { getUiLang, t } from "./i18n";
import { getVoiceEngineStatus } from "./voice/engineStatus";
import { warmupVoiceEngine } from "./voice/voiceWarmup";
import type { VoiceState } from "./voiceState";

type RootNav =
  | "home"
  | "chat"
  | "memory"
  | "workshop"
  | "translate"
  | "settings";

function navItems(): {
  id: RootNav;
  label: string;
  tone: "accent" | "success" | "warning" | "danger" | "translate";
}[] {
  const lang = getUiLang();
  return [
    { id: "home", label: t("home", lang), tone: "accent" },
    { id: "chat", label: t("chat", lang), tone: "accent" },
    { id: "memory", label: t("memory", lang), tone: "success" },
    { id: "workshop", label: t("workshop", lang), tone: "warning" },
    { id: "translate", label: t("translate", lang), tone: "translate" },
    { id: "settings", label: t("settings", lang), tone: "danger" },
  ];
}

function NavIcon({ id }: { id: RootNav }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "nav-ico",
  };
  if (id === "home") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  if (id === "chat") {
    return (
      <svg {...common}>
        <path d="M4 6h16v10H8l-4 3V6z" />
      </svg>
    );
  }
  if (id === "memory") {
    return (
      <svg {...common}>
        <path d="M5 8h14M5 12h14M5 16h10" />
      </svg>
    );
  }
  if (id === "workshop") {
    return (
      <svg {...common}>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-1.9-1.9 2-2.1z" />
      </svg>
    );
  }
  if (id === "translate") {
    return (
      <svg {...common} className="nav-ico nav-ico-translate">
        <text
          x="3.5"
          y="15.5"
          fill="currentColor"
          stroke="none"
          fontSize="11"
          fontWeight="700"
          fontFamily="var(--font-sans)"
        >
          文
        </text>
        <text
          x="12.5"
          y="18"
          fill="currentColor"
          stroke="none"
          fontSize="10"
          fontWeight="700"
          fontFamily="var(--font-sans)"
        >
          A
        </text>
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </svg>
  );
}

export function App() {
  const isHud =
    typeof window !== "undefined" &&
    (window.location.hash === "#/hud" || window.location.hash === "#hud");
  const isUpdateHud =
    typeof window !== "undefined" &&
    (window.location.hash === "#/update-hud" ||
      window.location.hash === "#update-hud");

  function navFromHash(hash: string): RootNav {
    if (hash.includes("settings")) return "settings";
    if (hash.includes("translate") || hash.includes("translator")) {
      return "translate";
    }
    if (hash.includes("workshop")) return "workshop";
    if (hash.includes("memory")) return "memory";
    if (hash.includes("chat") || hash.includes("dialog")) return "chat";
    if (hash.includes("home")) return "home";
    return "home";
  }

  function hashForNav(id: RootNav): string {
    switch (id) {
      case "home":
        return "#/home";
      case "chat":
        return "#/chat";
      case "memory":
        return "#/memory";
      case "workshop":
        return "#/workshop";
      case "translate":
        return "#/translate";
      case "settings":
        return "#/settings";
      default:
        return "#/home";
    }
  }

  const [nav, setNavState] = useState<RootNav>(() =>
    navFromHash(typeof window !== "undefined" ? window.location.hash : ""),
  );
  const setNav = useCallback((id: RootNav) => {
    setNavState(id);
    const next = hashForNav(id);
    if (window.location.hash !== next) {
      window.location.hash = next;
    }
  }, []);
  const [themeId, setThemeId] = useState<ThemeId>(() => loadStoredThemeId());
  const [bgPatternId, setBgPatternId] = useState<BgPatternId>(() =>
    loadStoredBgPatternId(),
  );
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [pendingConfirm, setPendingConfirm] =
    useState<MiraConfirmRequest | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [doctorText, setDoctorText] = useState("Doctor…");
  const [healthText, setHealthText] = useState("Проверка store…");
  const [calendarToast, setCalendarToast] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [coreLevel, setCoreLevel] = useState(() => loadCoreLevel());
  const [coreXp, setCoreXp] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    if (localStorage.getItem("mira.autoSpeak") === "1") return true;
    if (localStorage.getItem("mira.autoSpeak") === "0") return false;
    // First run: autonomous local speech of Mira replies.
    localStorage.setItem("mira.autoSpeak", "1");
    return true;
  });
  const [navLabels, setNavLabels] = useState(() => navItems());

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    applyBgPattern(bgPatternId);
  }, [bgPatternId]);

  useEffect(() => installAutoGrowTextareas(), []);

  useEffect(() => installActionLogBridge(), []);

  // Stage B: warm local neural pack + AudioContext so first reply speaks fast.
  useEffect(() => {
    void warmupVoiceEngine();
  }, []);

  useEffect(() => {
    localStorage.setItem("mira.voiceState", voiceState);
    logVoiceState(voiceState);
  }, [voiceState]);

  useEffect(() => {
    if (errorMessage) logAppError(errorMessage);
  }, [errorMessage]);

  useEffect(() => {
    const unsub = window.mira?.onCalendarToast?.((payload) => {
      setCalendarToast({ title: payload.title, body: payload.body });
      window.setTimeout(() => setCalendarToast(null), 8000);
      // Speak timer/reminder with the same active Mira voice when autoSpeak on.
      try {
        const auto = localStorage.getItem("mira.autoSpeak") !== "0";
        if (auto) {
          void import("./voice/voiceEngine").then(({ speakWithActiveVoice }) => {
            speakWithActiveVoice(`${payload.title}. ${payload.body}`);
          });
        }
      } catch {
        /* ignore */
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    function onHash() {
      setNavState(navFromHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onStorage = () => {
      setAutoSpeak(localStorage.getItem("mira.autoSpeak") !== "0");
      setNavLabels(navItems());
      setCoreLevel(loadCoreLevel());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = localStorage.getItem("mira.autoSpeak") !== "0";
      setAutoSpeak((prev) => (prev === next ? prev : next));
      setNavLabels((prev) => {
        const nextNav = navItems();
        return prev.map((p) => p.label).join() ===
          nextNav.map((n) => n.label).join()
          ? prev
          : nextNav;
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  const applyProgressFromHealth = useCallback((health: MiraHealth) => {
    const signals = {
      sessions: health.sessions,
      utterances: health.utterances,
      learnedUnits: health.learnedUnits,
      libraryItems: health.libraryItems,
      skills: health.skills,
      voiceProjects: health.voiceProjects,
      customVoices: health.customVoices,
      browserVisits: health.browserVisits,
    };
    const { level: nextLevel, xp } = syncCoreLevelFromProgress(signals);
    setCoreXp(xp);
    setCoreLevel((prev) => (prev === nextLevel ? prev : nextLevel));
  }, []);

  const refreshCoreLevel = useCallback(async () => {
    if (!window.mira?.getHealth) return;
    try {
      const health = await window.mira.getHealth();
      applyProgressFromHealth(health);
    } catch {
      /* keep last known level */
    }
  }, [applyProgressFromHealth]);

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
      setHealthText(JSON.stringify({ ...health, voice }, null, 2));
      applyProgressFromHealth(health);
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
  }, [applyProgressFromHealth]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    void refreshCoreLevel();
    const onProgress = () => {
      void refreshCoreLevel();
    };
    window.addEventListener(CORE_PROGRESS_EVENT, onProgress);
    window.addEventListener("focus", onProgress);
    const id = window.setInterval(onProgress, 12_000);
    return () => {
      window.removeEventListener(CORE_PROGRESS_EVENT, onProgress);
      window.removeEventListener("focus", onProgress);
      window.clearInterval(id);
    };
  }, [refreshCoreLevel]);

  useEffect(() => {
    if (!window.mira?.onConfirmDismiss) return;
    return window.mira.onConfirmDismiss((payload) => {
      setPendingConfirm((prev) =>
        prev && payload?.id && prev.id === payload.id ? null : prev,
      );
    });
  }, []);

  useEffect(() => {
    if (!window.mira?.onConfirmRequest) return;
    return window.mira.onConfirmRequest((req) => {
      setPendingConfirm(req);
    });
  }, []);

  const refreshDoctor = useCallback(async () => {
    if (!window.mira?.runDoctor) {
      setDoctorText(formatDoctorView(mergeDoctorReport(null)));
      return;
    }
    try {
      const main = await window.mira.runDoctor();
      setDoctorText(formatDoctorView(mergeDoctorReport(main)));
    } catch (err) {
      setDoctorText(err instanceof Error ? err.message : "Doctor failed");
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

  const requestNewChat = useCallback(() => {
    setNav("chat");
    window.dispatchEvent(new Event("mira:new-chat"));
  }, []);

  if (isHud) {
    return <HudPage />;
  }
  if (isUpdateHud) {
    return <UpdateHudToast overlayWindow />;
  }

  const levelPct = coreLevelRingPct(coreLevel, coreXp);

  return (
    <AppConfirmProvider>
    <div className="app-shell" data-voice={voiceState}>
      <div className="atmosphere" aria-hidden />
      <div className="atmosphere-mid" aria-hidden />
      <div className="atmosphere-grid" aria-hidden />

      <TitleBar />

      <div className="app-shell-body">
      <ErrorBoundary fallbackTitle="Навигация Mira сбойнула">
        <aside className="nav">
          <div className="brand-row">
            <img
              className="brand-logo"
              src="./brand/mira-mark.svg"
              width={28}
              height={30}
              alt=""
              aria-hidden
            />
            <div className="brand-name">{APP_NAME}</div>
            <div className="brand-phase" title={`Mira ${APP_VERSION}`}>
              v{APP_VERSION}
            </div>
          </div>

          <button
            type="button"
            className="btn-new-chat"
            onClick={requestNewChat}
          >
            <span aria-hidden>+</span>
            Новая беседа
          </button>

          <nav className="nav-list" aria-label="Основное">
            {navLabels.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-btn ${nav === item.id ? "active" : ""}`}
                data-tone={item.tone}
                onClick={() => setNav(item.id)}
              >
                <NavIcon id={item.id} />
                <span className="nav-btn-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="nav-spacer" />

          <CoreLevelChip level={coreLevel} progressPct={levelPct} />
        </aside>
      </ErrorBoundary>

      <ErrorBoundary fallbackTitle="Рабочая область Mira сбойнула">
        <div className="workspace">
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

          <div className="workspace-body">
            {nav === "home" || nav === "chat" ? (
              <ChatPage
                panel={nav === "home" ? "home" : "dialog"}
                voiceState={voiceState}
                sessionId={sessionId}
                onSessionChange={handleSessionChange}
                onError={setErrorMessage}
                onVoiceState={setVoiceState}
                autoSpeak={autoSpeak}
                coreLevel={coreLevel}
                coreProgressPct={levelPct}
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
            {nav === "translate" ? <TranslatePage /> : null}
            {nav === "settings" ? (              <SettingsPage
                themeId={themeId}
                onThemeChange={setThemeId}
                bgPatternId={bgPatternId}
                onBgPatternChange={setBgPatternId}
                healthText={healthText}
                onOpenDoctor={openDoctor}
              />
            ) : null}
          </div>
        </div>
      </ErrorBoundary>
      </div>

      <ErrorBoundary fallbackTitle="Диалог подтверждения сбойнул">
        <ConfirmModal
          open={Boolean(pendingConfirm)}
          title={pendingConfirm?.title ?? "Подтверждение"}
          body={pendingConfirm?.body ?? ""}
          confirmLabel={pendingConfirm?.confirmLabel ?? "Подтвердить"}
          skillPropose={pendingConfirm?.skillPropose ?? null}
          bridgeHint
          onCancel={() => {
            if (pendingConfirm) {
              logConfirmResolved(pendingConfirm.id, false, pendingConfirm.title);
              if (window.mira) {
                void window.mira.respondConfirm(pendingConfirm.id, false);
              }
            }
            setPendingConfirm(null);
          }}
          onConfirm={(fields) => {
            if (pendingConfirm) {
              logConfirmResolved(pendingConfirm.id, true, pendingConfirm.title);
              if (window.mira) {
                void window.mira.respondConfirm(
                  pendingConfirm.id,
                  true,
                  fields,
                );
              }
            }
            setPendingConfirm(null);
          }}
        />
      </ErrorBoundary>

      <ErrorBoundary fallbackTitle="Doctor сбойнул">
        <ConfirmModal
          open={doctorOpen}
          title="Проверка Mira"
          body={doctorBody}
          confirmLabel="Понятно"
          onCancel={() => setDoctorOpen(false)}
          onConfirm={() => setDoctorOpen(false)}
        />
      </ErrorBoundary>

      {/* Electron: toast lives in always-on-top #/update-hud window. */}
      {typeof window !== "undefined" && !window.mira ? (
        <UpdateHudToast />
      ) : null}

      {calendarToast ? (
        <div className="calendar-toast-banner" role="status" aria-live="polite">
          <strong>{calendarToast.title}</strong>
          <p>{calendarToast.body}</p>
        </div>
      ) : null}
    </div>
    </AppConfirmProvider>
  );
}
