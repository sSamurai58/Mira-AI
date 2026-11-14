import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { StubBadge } from "./StubBadge";

type TermSession = {
  id: string;
  title: string;
  cwd: string;
  shell: string;
  alive: boolean;
  backend: string;
};

export function TerminalView() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<TermSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cwdInput, setCwdInput] = useState("");
  const [note, setNote] = useState("");
  const [prefsText, setPrefsText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const root = getComputedStyle(document.documentElement);
    // Resolve real font names — canvas metrics ignore CSS `var(...)`.
    const monoFont =
      root.getPropertyValue("--font-mono").trim() ||
      '"JetBrains Mono", ui-monospace, monospace';
    const fontSize = Math.max(
      11,
      Number(localStorage.getItem("mira.terminalFontSize") || "14") || 14,
    );
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: monoFont,
      fontSize,
      // Default 1.0 clips JetBrains Mono descenders (g/y/p) on Windows DPI.
      lineHeight: 1.28,
      letterSpacing: 0.4,
      theme: {
        background:
          root.getPropertyValue("--terminal-bg").trim() || "#061018",
        foreground:
          root.getPropertyValue("--terminal-fg").trim() || "#e8f1f8",
        cursor: root.getPropertyValue("--accent").trim() || "#38bdf8",
        selectionBackground: "rgba(56, 189, 248, 0.28)",
        black: "#0b1620",
        brightBlack: "#64748b",
        blue: "#38bdf8",
        brightBlue: "#7dd3fc",
        cyan: "#22d3ee",
        brightCyan: "#67e8f9",
        green: "#34d399",
        brightGreen: "#6ee7b7",
        red: "#f87171",
        brightRed: "#fca5a5",
        yellow: "#fbbf24",
        brightYellow: "#fde68a",
        magenta: "#c084fc",
        brightMagenta: "#d8b4fe",
        white: "#e2e8f0",
        brightWhite: "#f8fafc",
      },
      convertEol: true,
      scrollback: Number(
        localStorage.getItem("mira.terminalScrollback") || "2000",
      ),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const refit = () => {
      fit.fit();
      const id = activeIdRef.current;
      if (!id || !window.mira) return;
      void window.mira.resizeTerminal(id, term.cols, term.rows);
    };

    // Remeasure after webfonts load so cell height matches real glyphs.
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled || !termRef.current) return;
      term.refresh(0, Math.max(0, term.rows - 1));
      refit();
    });

    term.onData((data) => {
      const id = activeIdRef.current;
      if (!id || !window.mira) return;
      void window.mira.writeTerminal(id, data);
    });

    window.addEventListener("resize", refit);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", refit);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!window.mira) {
      setNote("Терминал доступен в Electron (`npm run dev:electron`).");
      return;
    }
    let cancelled = false;
    const offData = window.mira.onTerminalData(({ sessionId, data }) => {
      if (sessionId !== activeIdRef.current) return;
      termRef.current?.write(data);
    });
    const offExit = window.mira.onTerminalExit(({ sessionId, exitCode }) => {
      if (sessionId === activeIdRef.current) {
        termRef.current?.writeln(`\r\n[exit ${exitCode}]`);
      }
      void refreshSessions();
    });

    async function boot() {
      const prefs = await window.mira!.getTerminalPrefs();
      if (cancelled) return;
      setPrefsText(
        `${prefs.shell} · ${prefs.fontSize}px · ${prefs.defaultCwd}`,
      );
      setCwdInput(prefs.defaultCwd);
      const existing = await window.mira!.listTerminalSessions();
      const session =
        existing.find((s) => s.alive) ??
        (await window.mira!.createTerminalSession({
          title: "Main",
          cols: termRef.current?.cols ?? 80,
          rows: termRef.current?.rows ?? 24,
        }));
      if (cancelled) return;
      await attachSession(session.id, true);
      await refreshSessions();
    }
    void boot();

    return () => {
      cancelled = true;
      offData();
      offExit();
    };
  }, []);

  async function refreshSessions() {
    if (!window.mira) return;
    const list = await window.mira.listTerminalSessions();
    setSessions(list);
  }

  async function attachSession(id: string, clear = false) {
    if (!window.mira || !termRef.current) return;
    setActiveId(id);
    activeIdRef.current = id;
    if (clear) termRef.current.reset();
    const hist = await window.mira.getTerminalHistory(id);
    if (hist) termRef.current.write(hist);
    const info = await window.mira.getTerminalSession(id);
    if (info) setCwdInput(info.cwd);
    fitRef.current?.fit();
    void window.mira.resizeTerminal(
      id,
      termRef.current.cols,
      termRef.current.rows,
    );
    setNote(`${info?.title ?? id.slice(0, 8)} · ${info?.backend ?? "?"}`);
  }

  async function newSession() {
    if (!window.mira || !termRef.current) return;
    setBusy(true);
    try {
      const session = await window.mira.createTerminalSession({
        title: `Shell ${sessions.length + 1}`,
        cwd: cwdInput || undefined,
        cols: termRef.current.cols,
        rows: termRef.current.rows,
      });
      await attachSession(session.id, true);
      await refreshSessions();
    } finally {
      setBusy(false);
    }
  }

  async function clearActive() {
    if (!window.mira || !activeId || !termRef.current) return;
    await window.mira.clearTerminal(activeId);
    termRef.current.clear();
  }

  async function killActive() {
    if (!window.mira || !activeId) return;
    setBusy(true);
    try {
      await window.mira.killTerminal(activeId);
      await refreshSessions();
    } finally {
      setBusy(false);
    }
  }

  async function applyCwd() {
    if (!window.mira || !activeId || !cwdInput.trim()) return;
    try {
      const info = await window.mira.setTerminalCwd(activeId, cwdInput.trim());
      setNote(`cwd → ${info.cwd}`);
      await refreshSessions();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  }

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const browserOnly = typeof window !== "undefined" && !window.mira;

  return (
    <div className="stack terminal-shell">
      <div className="row terminal-shell-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Терминал</h2>
            <span className="muted">
              {sessions.filter((s) => s.alive).length} живых
            </span>
            <StubBadge label="P7 #16" />
            {browserOnly ? <span className="chip">Electron only</span> : null}
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Встроенный PTY в Мастерской
            {prefsText ? ` · ${prefsText}` : ""}.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary terminal-new-btn"
          disabled={busy || browserOnly}
          onClick={() => void newSession()}
        >
          + Сессия
        </button>
      </div>

      <div className="terminal-stage panel">
        <div className="terminal-tabs" role="tablist" aria-label="Сессии">
          {sessions.length === 0 ? (
            <span className="muted terminal-tabs-empty">Нет сессий</span>
          ) : (
            sessions.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={activeId === s.id}
                className={`terminal-tab ${activeId === s.id ? "is-active" : ""} ${s.alive ? "is-alive" : "is-dead"}`}
                onClick={() => void attachSession(s.id, true)}
              >
                <span
                  className={`terminal-tab-dot ${s.alive ? "is-on" : ""}`}
                  aria-hidden
                />
                <span className="terminal-tab-label">
                  {s.title || `Shell ${idx + 1}`}
                </span>
                {!s.alive ? (
                  <span className="terminal-tab-exit">exit</span>
                ) : null}
              </button>
            ))
          )}
        </div>

        <div className="terminal-toolbar">
          <label className="terminal-cwd-field">
            <span className="terminal-cwd-prefix" aria-hidden>
              cwd
            </span>
            <input
              className="terminal-cwd"
              value={cwdInput}
              onChange={(e) => setCwdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void applyCwd();
                }
              }}
              placeholder="/path/to/workdir"
              spellCheck={false}
              disabled={browserOnly || !activeId}
              aria-label="Рабочая директория"
            />
          </label>
          <div className="terminal-toolbar-actions">
            <button
              type="button"
              className="btn terminal-tool-btn"
              disabled={browserOnly || !activeId}
              onClick={() => void applyCwd()}
              title="Сменить каталог"
            >
              cd
            </button>
            <button
              type="button"
              className="btn terminal-tool-btn"
              disabled={browserOnly || !activeId}
              onClick={() => void clearActive()}
              title="Очистить экран"
            >
              clear
            </button>
            <button
              type="button"
              className="btn btn-danger terminal-tool-btn"
              disabled={busy || browserOnly || !activeId}
              onClick={() => void killActive()}
              title="Завершить сессию"
            >
              kill
            </button>
          </div>
        </div>

        <div className="terminal-screen">
          <div className="terminal-host" ref={hostRef} />
          {browserOnly ? (
            <div className="terminal-overlay" role="status">
              <strong>Только Electron</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Запустите `npm run dev:electron`, чтобы открыть живой PTY.
              </p>
            </div>
          ) : null}
        </div>

        <div className="terminal-status">
          <span className="mono muted">
            {note ||
              (active
                ? `${active.title} · ${active.backend}`
                : "Ожидание сессии…")}
          </span>
          {active ? (
            <span
              className={`terminal-alive-pill ${active.alive ? "is-on" : ""}`}
            >
              {active.alive ? "alive" : "exited"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
