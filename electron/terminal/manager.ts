import { spawn as cpSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type TerminalSessionInfo = {
  id: string;
  title: string;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  createdAt: string;
  alive: boolean;
  backend: "node-pty" | "spawn";
};

type Session = {
  info: TerminalSessionInfo;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  history: string[];
};

export type TerminalPrefs = {
  shell: string;
  fontSize: number;
  scrollback: number;
  defaultCwd: string;
};

type DataHandler = (sessionId: string, data: string) => void;
type ExitHandler = (sessionId: string, exitCode: number) => void;

let onData: DataHandler | null = null;
let onExit: ExitHandler | null = null;
const sessions = new Map<string, Session>();

function loadPty():
  | {
      spawn: (
        file: string,
        args: string[],
        opts: Record<string, unknown>,
      ) => {
        write: (data: string) => void;
        resize: (cols: number, rows: number) => void;
        kill: () => void;
        onData: (cb: (data: string) => void) => void;
        onExit: (cb: (e: { exitCode: number }) => void) => void;
      };
    }
  | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node-pty") as ReturnType<typeof loadPty>;
  } catch {
    return null;
  }
}

export function getTerminalPrefs(): TerminalPrefs {
  const shell =
    process.env.TERMINAL_SHELL?.trim() ||
    process.env.SHELL?.trim() ||
    (process.platform === "win32"
      ? "powershell.exe"
      : process.platform === "darwin"
        ? "/bin/zsh"
        : "/bin/bash");
  const fontSize = Number(process.env.TERMINAL_FONT_SIZE ?? "14") || 14;
  const scrollback = Number(process.env.TERMINAL_SCROLLBACK ?? "2000") || 2000;
  const defaultCwd =
    process.env.TERMINAL_CWD?.trim() ||
    path.resolve(process.cwd());
  return { shell, fontSize, scrollback, defaultCwd };
}

export function setTerminalHandlers(handlers: {
  onData: DataHandler;
  onExit: ExitHandler;
}): void {
  onData = handlers.onData;
  onExit = handlers.onExit;
}

function pushHistory(session: Session, chunk: string): void {
  const prefs = getTerminalPrefs();
  session.history.push(chunk);
  let total = session.history.join("").length;
  while (session.history.length > 1 && total > prefs.scrollback * 80) {
    const removed = session.history.shift();
    total -= removed?.length ?? 0;
  }
}

function createSpawnBackend(
  shell: string,
  cwd: string,
  cols: number,
  rows: number,
  sessionId: string,
): Pick<Session, "write" | "resize" | "kill"> & { backend: "spawn" } {
  const env = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    COLUMNS: String(cols),
    LINES: String(rows),
  };
  const child: ChildProcessWithoutNullStreams = cpSpawn(
    shell,
    process.platform === "win32" ? [] : ["-i"],
    {
      cwd,
      env,
      stdio: "pipe",
    },
  );

  child.stdout.on("data", (buf: Buffer) => {
    const data = buf.toString("utf8");
    const session = sessions.get(sessionId);
    if (session) pushHistory(session, data);
    onData?.(sessionId, data);
  });
  child.stderr.on("data", (buf: Buffer) => {
    const data = buf.toString("utf8");
    const session = sessions.get(sessionId);
    if (session) pushHistory(session, data);
    onData?.(sessionId, data);
  });
  child.on("exit", (code) => {
    const session = sessions.get(sessionId);
    if (session) session.info.alive = false;
    onExit?.(sessionId, code ?? 0);
  });

  return {
    backend: "spawn",
    write: (data: string) => {
      child.stdin.write(data);
    },
    resize: () => {
      // spawn pipe backend cannot resize PTY; no-op
    },
    kill: () => {
      child.kill("SIGTERM");
    },
  };
}

export function createTerminalSession(opts?: {
  title?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}): TerminalSessionInfo {
  const prefs = getTerminalPrefs();
  const id = crypto.randomUUID();
  const cols = opts?.cols ?? 80;
  const rows = opts?.rows ?? 24;
  let cwd = opts?.cwd?.trim() || prefs.defaultCwd;
  if (!fs.existsSync(cwd)) cwd = os.homedir();

  const shell = prefs.shell;
  const title = opts?.title?.trim() || `Shell ${sessions.size + 1}`;
  const pty = loadPty();

  if (pty) {
    try {
      const proc = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env: process.env as Record<string, string>,
      });
      const info: TerminalSessionInfo = {
        id,
        title,
        cwd,
        shell,
        cols,
        rows,
        createdAt: new Date().toISOString(),
        alive: true,
        backend: "node-pty",
      };
      const session: Session = {
        info,
        history: [],
        write: (data) => proc.write(data),
        resize: (c, r) => {
          proc.resize(c, r);
          info.cols = c;
          info.rows = r;
        },
        kill: () => proc.kill(),
      };
      proc.onData((data) => {
        pushHistory(session, data);
        onData?.(id, data);
      });
      proc.onExit(({ exitCode }) => {
        info.alive = false;
        onExit?.(id, exitCode);
      });
      sessions.set(id, session);
      return info;
    } catch {
      // fall through to spawn
    }
  }

  const spawnBackend = createSpawnBackend(shell, cwd, cols, rows, id);
  const info: TerminalSessionInfo = {
    id,
    title,
    cwd,
    shell,
    cols,
    rows,
    createdAt: new Date().toISOString(),
    alive: true,
    backend: "spawn",
  };
  const session: Session = {
    info,
    history: [],
    write: spawnBackend.write,
    resize: (c, r) => {
      info.cols = c;
      info.rows = r;
      spawnBackend.resize(c, r);
    },
    kill: spawnBackend.kill,
  };
  sessions.set(id, session);
  // Banner so UI knows backend
  const banner = `\r\n[mira-terminal] backend=${info.backend} cwd=${cwd} shell=${shell}\r\n`;
  pushHistory(session, banner);
  onData?.(id, banner);
  return info;
}

export function listTerminalSessions(): TerminalSessionInfo[] {
  return [...sessions.values()].map((s) => ({ ...s.info }));
}

export function getTerminalSession(id: string): TerminalSessionInfo | null {
  return sessions.get(id)?.info ?? null;
}

export function writeTerminal(id: string, data: string): boolean {
  const session = sessions.get(id);
  if (!session || !session.info.alive) return false;
  session.write(data);
  return true;
}

export function resizeTerminal(
  id: string,
  cols: number,
  rows: number,
): boolean {
  const session = sessions.get(id);
  if (!session || !session.info.alive) return false;
  session.resize(Math.max(20, cols), Math.max(5, rows));
  return true;
}

export function killTerminal(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.kill();
  session.info.alive = false;
  return true;
}

export function clearTerminalHistory(id: string): string {
  const session = sessions.get(id);
  if (!session) return "";
  session.history = [];
  const msg = "\r\n[mira-terminal] cleared\r\n";
  pushHistory(session, msg);
  onData?.(id, msg);
  return msg;
}

export function getTerminalHistory(id: string): string {
  return sessions.get(id)?.history.join("") ?? "";
}

export function setTerminalCwd(id: string, cwd: string): TerminalSessionInfo | null {
  const session = sessions.get(id);
  if (!session) return null;
  const next = path.resolve(cwd);
  if (!fs.existsSync(next)) {
    throw new Error(`Каталог не существует: ${next}`);
  }
  // Soft update: next commands should cd; also announce
  session.info.cwd = next;
  const note = `\r\n[mira-terminal] cwd → ${next}\r\n`;
  pushHistory(session, note);
  onData?.(id, note);
  if (session.info.alive) {
    session.write(`cd ${JSON.stringify(next)}\n`);
  }
  return { ...session.info };
}

export function ensureDefaultTerminal(): TerminalSessionInfo {
  const alive = [...sessions.values()].find((s) => s.info.alive);
  if (alive) return { ...alive.info };
  return createTerminalSession({ title: "Main" });
}

export async function runCommandInTerminal(
  command: string,
  opts?: { sessionId?: string | null; waitMs?: number },
): Promise<{
  sessionId: string;
  output: string;
  backend: string;
}> {
  const sessionInfo = opts?.sessionId
    ? getTerminalSession(opts.sessionId)
    : ensureDefaultTerminal();
  if (!sessionInfo) {
    throw new Error("Нет терминальной сессии");
  }
  const session = sessions.get(sessionInfo.id);
  if (!session || !session.info.alive) {
    throw new Error("Сессия терминала не активна");
  }

  const marker = `__MIRA_DONE_${Date.now()}__`;
  const startLen = session.history.join("").length;
  const wrapped =
    process.platform === "win32"
      ? `${command}\r\necho ${marker}\r\n`
      : `${command}\necho ${marker}\n`;
  session.write(wrapped);

  const waitMs = opts?.waitMs ?? 4000;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const hist = session.history.join("");
    if (hist.includes(marker)) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const hist = session.history.join("").slice(startLen);
  const output = hist.replace(new RegExp(`${marker}\\r?\\n?`, "g"), "").trim();
  return {
    sessionId: sessionInfo.id,
    output: output.slice(-8000),
    backend: session.info.backend,
  };
}

export function disposeAllTerminals(): void {
  for (const session of sessions.values()) {
    try {
      session.kill();
    } catch {
      // ignore
    }
  }
  sessions.clear();
}
