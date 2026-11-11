import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "var(--font-mono)",
      fontSize: Number(localStorage.getItem("mira.terminalFontSize") || "14"),
      theme: {
        background: getComputedStyle(document.documentElement)
          .getPropertyValue("--terminal-bg")
          .trim() || "#000814",
        foreground: getComputedStyle(document.documentElement)
          .getPropertyValue("--terminal-fg")
          .trim() || "#f8fafc",
        cursor: getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim() || "#ffc300",
      },
      convertEol: true,
      scrollback: Number(localStorage.getItem("mira.terminalScrollback") || "2000"),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    term.onData((data) => {
      const id = activeIdRef.current;
      if (!id || !window.mira) return;
      void window.mira.writeTerminal(id, data);
    });

    const onResize = () => {
      fit.fit();
      const id = activeIdRef.current;
      if (!id || !window.mira) return;
      void window.mira.resizeTerminal(id, term.cols, term.rows);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
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
        `shell=${prefs.shell} · font=${prefs.fontSize} · cwd=${prefs.defaultCwd}`,
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
    setNote(`Сессия ${id.slice(0, 8)} · ${info?.backend ?? "?"}`);
  }

  async function newSession() {
    if (!window.mira || !termRef.current) return;
    const session = await window.mira.createTerminalSession({
      title: `Shell ${sessions.length + 1}`,
      cwd: cwdInput || undefined,
      cols: termRef.current.cols,
      rows: termRef.current.rows,
    });
    await attachSession(session.id, true);
    await refreshSessions();
  }

  async function clearActive() {
    if (!window.mira || !activeId || !termRef.current) return;
    await window.mira.clearTerminal(activeId);
    termRef.current.clear();
  }

  async function killActive() {
    if (!window.mira || !activeId) return;
    await window.mira.killTerminal(activeId);
    await refreshSessions();
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

  return (
    <div className="panel stack terminal-panel">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Терминал</h2>
        <span className="chip">P7 #16</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Встроенный PTY в Мастерской. {prefsText}
      </p>
      <div className="terminal-tabs">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`btn ${activeId === s.id ? "btn-primary" : ""}`}
            onClick={() => void attachSession(s.id, true)}
          >
            {s.title}
            {s.alive ? "" : " (exit)"}
          </button>
        ))}
        <button type="button" className="btn" onClick={() => void newSession()}>
          + сессия
        </button>
      </div>
      <div className="row terminal-toolbar">
        <input
          className="terminal-cwd"
          value={cwdInput}
          onChange={(e) => setCwdInput(e.target.value)}
          placeholder="cwd"
        />
        <button type="button" className="btn" onClick={() => void applyCwd()}>
          cd
        </button>
        <button type="button" className="btn" onClick={() => void clearActive()}>
          clear
        </button>
        <button type="button" className="btn" onClick={() => void killActive()}>
          kill
        </button>
      </div>
      <div className="terminal-host" ref={hostRef} />
      {note ? <p className="muted mono" style={{ margin: 0 }}>{note}</p> : null}
    </div>
  );
}
