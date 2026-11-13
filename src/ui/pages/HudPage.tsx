import { useEffect, useState } from "react";
import { APP_NAME } from "../../config";
import { HudCorners } from "../components/HudCorners";
import { applyTheme, loadStoredThemeId } from "../themes";

const VOICE_LABEL: Record<string, string> = {
  idle: "ожидание",
  listening: "слушаю",
  thinking: "думаю",
  speaking: "говорю",
  error: "ошибка",
};

/** Compact always-on-top HUD surface (#/hud), themed like the main shell. */
export function HudPage() {
  const [voice, setVoice] = useState("idle");
  const [profile, setProfile] = useState("—");
  const [timerHint, setTimerHint] = useState("нет таймеров");

  useEffect(() => {
    applyTheme(loadStoredThemeId());
    document.documentElement.classList.add("mira-hud-root");
    document.body.classList.add("mira-hud-root");
    return () => {
      document.documentElement.classList.remove("mira-hud-root");
      document.body.classList.remove("mira-hud-root");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (!window.mira) return;
      try {
        const [active, timers] = await Promise.all([
          window.mira.getActiveProfile?.(),
          window.mira.listTimers?.(),
        ]);
        if (cancelled) return;
        if (active && typeof active === "object" && "name" in active) {
          setProfile(String((active as { name: string }).name));
        }
        const list = Array.isArray(timers) ? timers : [];
        const running = list.filter(
          (t) =>
            t &&
            typeof t === "object" &&
            "status" in t &&
            (t as { status: string }).status === "running",
        );
        if (running[0] && typeof running[0] === "object") {
          const t = running[0] as { label?: string; ends_at?: string };
          setTimerHint(
            `${t.label ?? "таймер"} → ${t.ends_at?.slice(11, 19) ?? "?"}`,
          );
        } else {
          setTimerHint("нет таймеров");
        }
      } catch {
        // ignore
      }
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const onStorage = () => {
      setVoice(localStorage.getItem("mira.voiceState") || "idle");
      applyTheme(loadStoredThemeId());
    };
    onStorage();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function closeHud() {
    void window.mira?.toggleHud?.();
  }

  const voiceLabel = VOICE_LABEL[voice] ?? voice;

  return (
    <div className="mira-hud" data-voice={voice}>
      <HudCorners />
      <header className="mira-hud-top">
        <div className="mira-hud-brand">
          <img
            className="mira-hud-mark"
            src="./brand/mira-mark.svg"
            width={22}
            height={24}
            alt=""
            aria-hidden
          />
          <span className="mira-hud-name">{APP_NAME}</span>
        </div>
        <div className="mira-hud-actions">
          <span className="mira-hud-voice" title={voice}>
            <span className="status-dot" aria-hidden />
            {voiceLabel}
          </span>
          <button
            type="button"
            className="mira-hud-close"
            aria-label="Закрыть HUD"
            title="Закрыть"
            onClick={closeHud}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <path
                d="M3.2 3.2l9.6 9.6M12.8 3.2L3.2 12.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>
      <div className="mira-hud-meta">
        <div className="mira-hud-row">
          <span className="mira-hud-k">Профиль</span>
          <span className="mira-hud-v">{profile}</span>
        </div>
        <div className="mira-hud-row">
          <span className="mira-hud-k">Таймер</span>
          <span className="mira-hud-v">{timerHint}</span>
        </div>
      </div>
    </div>
  );
}
