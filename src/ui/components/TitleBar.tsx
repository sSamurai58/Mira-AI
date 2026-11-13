import { useEffect, useState } from "react";
import { APP_NAME } from "../../config";
import { getTheme, MIRA_THEME_EVENT, type ThemeId } from "../themes";

/**
 * Frameless Electron chrome — drag region + window controls.
 * Colors follow active theme CSS vars; Electron backgroundColor syncs live.
 * Hidden in pure browser/dev (no window.mira window APIs).
 *
 * Windows: maximize / titlebar double-click → exclusive fullscreen (covers taskbar).
 * All platforms: F11 toggles exclusive fullscreen (main process); Esc exits it
 * when no modal already handled the key.
 */
export function TitleBar() {
  const electron = typeof window !== "undefined" && Boolean(window.mira?.windowMinimize);
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const isDarwin =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

  useEffect(() => {
    if (!electron || !window.mira) return;
    let cancelled = false;
    void window.mira.windowGetState?.().then((st) => {
      if (cancelled || !st) return;
      setFullscreen(Boolean(st.fullscreen));
      setExpanded(Boolean(st.maximized || st.fullscreen));
    });
    const off = window.mira.onWindowState?.((st) => {
      setFullscreen(Boolean(st.fullscreen));
      setExpanded(Boolean(st.maximized || st.fullscreen));
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [electron]);

  useEffect(() => {
    if (!electron || !window.mira?.windowSetFullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || e.repeat) return;
      if (!fullscreen) return;
      e.preventDefault();
      void window.mira?.windowSetFullscreen?.(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [electron, fullscreen]);

  useEffect(() => {
    if (!electron || !window.mira?.windowSetChrome) return;

    function syncChrome(id?: ThemeId) {
      const themeId =
        id ??
        ((document.documentElement.dataset.theme as ThemeId | undefined) ||
          undefined);
      const bg = themeId
        ? getTheme(themeId).tokens.bg
        : getComputedStyle(document.documentElement)
            .getPropertyValue("--bg")
            .trim();
      if (!bg) return;
      void window.mira?.windowSetChrome?.({ backgroundColor: bg });
    }

    syncChrome();
    const onTheme = (ev: Event) => {
      const detail = (ev as CustomEvent<{ id?: ThemeId }>).detail;
      syncChrome(detail?.id);
    };
    window.addEventListener(MIRA_THEME_EVENT, onTheme);
    return () => window.removeEventListener(MIRA_THEME_EVENT, onTheme);
  }, [electron]);

  if (!electron) return null;

  return (
    <header
      className={`mira-titlebar${isDarwin ? " is-darwin" : ""}`}
      onDoubleClick={() => {
        void window.mira?.windowMaximizeToggle?.();
      }}
    >
      <div className="mira-titlebar-drag" aria-hidden />
      <div className="mira-titlebar-brand">
        <img
          className="mira-titlebar-mark"
          src="./brand/mira-mark.svg"
          width={16}
          height={17}
          alt=""
          aria-hidden
        />
        <span className="mira-titlebar-name">{APP_NAME}</span>
      </div>
      {!isDarwin ? (
        <div className="mira-titlebar-controls">
          <button
            type="button"
            className="mira-titlebar-btn"
            aria-label="Свернуть"
            title="Свернуть"
            onClick={() => void window.mira?.windowMinimize?.()}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
              <path
                d="M2 6.5h8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="mira-titlebar-btn"
            aria-label={expanded ? "Восстановить" : "Развернуть"}
            title={expanded ? "Восстановить" : "Развернуть"}
            onClick={() => void window.mira?.windowMaximizeToggle?.()}
          >
            {expanded ? (
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <path
                  d="M3.5 4.5h4v4h-4zM4.5 3.5h4v4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <rect
                  x="2.5"
                  y="2.5"
                  width="7"
                  height="7"
                  rx="0.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="mira-titlebar-btn is-close"
            aria-label="Закрыть"
            title="Закрыть"
            onClick={() => void window.mira?.windowClose?.()}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
              <path
                d="M3 3l6 6M9 3L3 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <div className="mira-titlebar-spacer" aria-hidden />
      )}
    </header>
  );
}
