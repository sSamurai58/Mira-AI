import { useEffect, useState, type CSSProperties } from "react";
import { APP_NAME } from "../../config";

/** Compact always-on-top HUD surface (#/hud). */
export function HudPage() {
  const [voice, setVoice] = useState("idle");
  const [profile, setProfile] = useState("—");
  const [timerHint, setTimerHint] = useState("нет таймеров");

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
    };
    onStorage();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const shell: CSSProperties = {
    minHeight: "100vh",
    padding: "14px 16px",
    background:
      "linear-gradient(135deg, rgba(4,22,42,0.92), rgba(8,48,72,0.88))",
    color: "#e8f4ff",
    fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif',
    borderRadius: 16,
    border: "1px solid rgba(120,200,255,0.25)",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  return (
    <div style={shell}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <strong
          style={{
            letterSpacing: "0.04em",
            fontSize: "1.15rem",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <img
            src="./brand/mira-mark.svg"
            width={18}
            height={20}
            alt=""
            aria-hidden
          />
          {APP_NAME}
        </strong>
        <span style={{ opacity: 0.75, fontSize: "0.8rem" }}>{voice}</span>
      </div>
      <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>Профиль: {profile}</div>
      <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>⏱ {timerHint}</div>
      <button
        type="button"
        className="btn"
        style={{ marginTop: "auto", alignSelf: "flex-start" }}
        onClick={() => {
          void window.mira?.toggleHud?.();
        }}
      >
        Скрыть HUD
      </button>
    </div>
  );
}
