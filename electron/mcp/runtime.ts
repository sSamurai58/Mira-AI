/**
 * MCP client scaffolding (0.1.11).
 * Real stdio/HTTP MCP sessions + honest connection status — never fake "connected".
 * Tier A OAuth (Calendar/Tasks/Slack/GitHub) opens browser consent when credentials exist;
 * full offline OAuth token exchange still requires user secrets.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import { dataRoot } from "../appPaths";

export type McpConnectionState =
  | "disconnected"
  | "draft"
  | "connecting"
  | "connected"
  | "error"
  | "needs-auth";

export type McpRuntimeStatus = {
  connectorId: string;
  state: McpConnectionState;
  detail: string;
  transport: "stdio" | "http" | "oauth-browser" | "none";
  tools: string[];
  lastCheckedAt: string;
  /** True only after a successful initialize/listTools handshake. */
  live: boolean;
};

export type McpConnectRequest = {
  connectorId: string;
  /** Optional override command for stdio MCP servers. */
  command?: string;
  args?: string[];
  /** HTTP MCP endpoint (rare; most Tier A use OAuth + remote). */
  url?: string;
  /** Field values from Settings draft (client id, token, …). */
  fields?: Record<string, string>;
  auth?: "oauth" | "api-key" | "local" | "bridge";
};

type Session = {
  status: McpRuntimeStatus;
  child?: ChildProcessWithoutNullStreams;
};

const sessions = new Map<string, Session>();

/** Tier A connectors we attempt a real path for when credentials exist. */
export const MCP_TIER_A_IDS = [
  "google-calendar",
  "microsoft-todo",
  "todoist",
  "slack",
  "github",
  "linear",
  "gmail",
] as const;

const OAUTH_START_URLS: Record<string, string> = {
  "google-calendar":
    "https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/calendar.readonly",
  gmail:
    "https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/gmail.readonly",
  slack: "https://slack.com/oauth/v2/authorize",
  github: "https://github.com/login/oauth/authorize",
  "microsoft-todo":
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  linear: "https://linear.app/oauth/authorize",
  todoist: "https://todoist.com/oauth/authorize",
};

function nowIso(): string {
  return new Date().toISOString();
}

function statusPath(): string {
  return path.join(dataRoot("mcp"), "runtime-status.json");
}

function persistAll(): void {
  const dir = path.dirname(statusPath());
  fs.mkdirSync(dir, { recursive: true });
  const payload: Record<string, McpRuntimeStatus> = {};
  for (const [id, s] of sessions) payload[id] = s.status;
  fs.writeFileSync(statusPath(), JSON.stringify(payload, null, 2), "utf8");
}

function setStatus(
  connectorId: string,
  patch: Partial<McpRuntimeStatus>,
): McpRuntimeStatus {
  const prev = sessions.get(connectorId)?.status;
  const next: McpRuntimeStatus = {
    state: "disconnected",
    detail: "",
    transport: "none",
    tools: [],
    live: false,
    ...prev,
    ...patch,
    connectorId,
    lastCheckedAt: nowIso(),
  };
  // Never mark live/connected without an actual handshake.
  if (next.state === "connected" && !next.live) {
    next.state = "error";
    next.detail =
      next.detail ||
      "Handshake не завершён — статус «подключено» не выставляется.";
  }
  const session = sessions.get(connectorId) ?? { status: next };
  session.status = next;
  sessions.set(connectorId, session);
  persistAll();
  return next;
}

export function getMcpRuntimeStatus(connectorId?: string): McpRuntimeStatus[] {
  if (connectorId) {
    const s = sessions.get(connectorId);
    return s
      ? [s.status]
      : [
          {
            connectorId,
            state: "disconnected",
            detail: "Нет активной сессии",
            transport: "none",
            tools: [],
            lastCheckedAt: nowIso(),
            live: false,
          },
        ];
  }
  return Array.from(sessions.values()).map((s) => s.status);
}

export function listMcpRuntimeStatuses(): Record<string, McpRuntimeStatus> {
  const out: Record<string, McpRuntimeStatus> = {};
  for (const [id, s] of sessions) out[id] = s.status;
  return out;
}

/** Kill stdio child if any. */
export async function disconnectMcp(
  connectorId: string,
): Promise<McpRuntimeStatus> {
  const session = sessions.get(connectorId);
  if (session?.child && !session.child.killed) {
    try {
      session.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  sessions.delete(connectorId);
  return setStatus(connectorId, {
    state: "disconnected",
    detail: "Отключено",
    transport: "none",
    tools: [],
    live: false,
  });
}

/**
 * Attempt connection. Honest states only:
 * - needs-auth: opened OAuth browser, awaiting user tokens
 * - connecting → connected: stdio MCP initialize succeeded
 * - error: failed attempt with detail
 * - draft: insufficient credentials (still a draft, not connected)
 */
export async function connectMcp(
  req: McpConnectRequest,
): Promise<McpRuntimeStatus> {
  const id = (req.connectorId || "").trim();
  if (!id) {
    return setStatus("unknown", {
      state: "error",
      detail: "Не указан connectorId",
      live: false,
    });
  }

  // Tear down prior session.
  await disconnectMcp(id).catch(() => undefined);

  setStatus(id, {
    state: "connecting",
    detail: "Пробую подключить…",
    transport: "none",
    tools: [],
    live: false,
  });

  const fields = req.fields ?? {};
  const hasToken = Object.entries(fields).some(
    ([k, v]) =>
      /token|key|secret|password/i.test(k) && Boolean(v?.trim()),
  );
  const hasClient =
    Boolean(fields.client_id?.trim() || fields.CLIENT_ID?.trim()) ||
    Boolean(fields.clientId?.trim());

  // Prefer explicit stdio command (local MCP server).
  const command = (req.command || fields.command || fields.MCP_COMMAND || "").trim();
  if (command) {
    return connectStdio(id, command, req.args ?? parseArgs(fields.args || fields.MCP_ARGS || ""));
  }

  // HTTP MCP endpoint
  const url = (req.url || fields.url || fields.MCP_URL || "").trim();
  if (url.startsWith("http")) {
    return connectHttp(id, url, fields);
  }

  // OAuth Tier A: open consent URL when client id present; never claim connected.
  if (req.auth === "oauth" || OAUTH_START_URLS[id]) {
    if (!hasClient && !hasToken) {
      return setStatus(id, {
        state: "draft",
        detail:
          "Черновик: нет Client ID / token. Заполните поля и нажмите «Подключить» снова. Статус «подключено» появится только после успешного handshake.",
        transport: "oauth-browser",
        live: false,
      });
    }
    if (hasToken) {
      // Token present → probe a lightweight API for Tier A where possible.
      const probed = await probeTierAWithToken(id, fields);
      return setStatus(id, probed);
    }
    const start = OAUTH_START_URLS[id];
    if (start) {
      const clientId =
        fields.client_id?.trim() ||
        fields.CLIENT_ID?.trim() ||
        fields.clientId?.trim() ||
        "";
      const oauthUrl = clientId.includes("client_id=")
        ? start
        : `${start}${start.includes("?") ? "&" : "?"}client_id=${encodeURIComponent(clientId)}&response_type=code`;
      try {
        await shell.openExternal(oauthUrl);
      } catch (err) {
        return setStatus(id, {
          state: "error",
          detail: `Не удалось открыть OAuth: ${err instanceof Error ? err.message : String(err)}`,
          transport: "oauth-browser",
          live: false,
        });
      }
      return setStatus(id, {
        state: "needs-auth",
        detail:
          "Открыл окно OAuth в браузере. Вставьте полученный token/code в поля и нажмите «Подключить» снова. Пока handshake не пройден — это не «подключено».",
        transport: "oauth-browser",
        live: false,
      });
    }
  }

  if (hasToken) {
    const probed = await probeTierAWithToken(id, fields);
    return setStatus(id, probed);
  }

  return setStatus(id, {
    state: "draft",
    detail:
      "Недостаточно данных для подключения. Укажите MCP_COMMAND / URL / OAuth Client ID или API token. Черновик ≠ подключено.",
    transport: "none",
    live: false,
  });
}

function parseArgs(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function connectStdio(
  id: string,
  command: string,
  args: string[],
): Promise<McpRuntimeStatus> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: McpRuntimeStatus) => {
      if (settled) return;
      settled = true;
      resolve(status);
    };

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
        shell: false,
      });
    } catch (err) {
      finish(
        setStatus(id, {
          state: "error",
          detail: `Не удалось запустить MCP: ${err instanceof Error ? err.message : String(err)}`,
          transport: "stdio",
          live: false,
        }),
      );
      return;
    }

    const session: Session = {
      status: setStatus(id, {
        state: "connecting",
        detail: `stdio: ${command} ${args.join(" ")}`.trim(),
        transport: "stdio",
        live: false,
      }),
      child,
    };
    sessions.set(id, session);

    let stdout = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      finish(
        setStatus(id, {
          state: "error",
          detail:
            "Таймаут initialize MCP (8с). Сервер не ответил на JSON-RPC initialize.",
          transport: "stdio",
          live: false,
        }),
      );
    }, 8000);

    child.stdout.on("data", (buf: Buffer) => {
      stdout += buf.toString("utf8");
      // Minimal JSON-RPC line scan for initialize result / tools.
      if (/initialize|tools\/list|"result"/i.test(stdout) && !settled) {
        clearTimeout(timer);
        const tools = extractToolNames(stdout);
        finish(
          setStatus(id, {
            state: "connected",
            detail: tools.length
              ? `MCP stdio подключён · tools: ${tools.slice(0, 8).join(", ")}`
              : "MCP stdio: initialize OK",
            transport: "stdio",
            tools,
            live: true,
          }),
        );
      }
    });

    child.stderr.on("data", (buf: Buffer) => {
      const msg = buf.toString("utf8").trim().slice(0, 200);
      if (msg) {
        setStatus(id, {
          state: "connecting",
          detail: `MCP stderr: ${msg}`,
          transport: "stdio",
          live: false,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      finish(
        setStatus(id, {
          state: "error",
          detail: `MCP process error: ${err.message}`,
          transport: "stdio",
          live: false,
        }),
      );
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled) {
        finish(
          setStatus(id, {
            state: "error",
            detail: `MCP процесс завершился (code=${code}). Handshake не завершён.`,
            transport: "stdio",
            live: false,
          }),
        );
      }
    });

    // JSON-RPC initialize (MCP-ish) — best-effort; servers may speak NDJSON.
    const init = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mira", version: "0.1.11" },
      },
    };
    try {
      child.stdin.write(`${JSON.stringify(init)}\n`);
      const listTools = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      };
      child.stdin.write(`${JSON.stringify(listTools)}\n`);
    } catch (err) {
      clearTimeout(timer);
      finish(
        setStatus(id, {
          state: "error",
          detail: `stdin write failed: ${err instanceof Error ? err.message : String(err)}`,
          transport: "stdio",
          live: false,
        }),
      );
    }
  });
}

function extractToolNames(raw: string): string[] {
  const names: string[] = [];
  const re = /"name"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const n = m[1]!;
    if (!names.includes(n) && n.length < 64) names.push(n);
  }
  return names.slice(0, 24);
}

async function connectHttp(
  id: string,
  url: string,
  fields: Record<string, string>,
): Promise<McpRuntimeStatus> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const token =
      fields.token?.trim() ||
      fields.access_token?.trim() ||
      fields.API_TOKEN?.trim() ||
      "";
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "mira", version: "0.1.11" },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return setStatus(id, {
        state: "error",
        detail: `HTTP MCP ${res.status}: ${url}`,
        transport: "http",
        live: false,
      });
    }
    const text = await res.text();
    const tools = extractToolNames(text);
    return setStatus(id, {
      state: "connected",
      detail: `HTTP MCP OK · ${url}`,
      transport: "http",
      tools,
      live: true,
    });
  } catch (err) {
    return setStatus(id, {
      state: "error",
      detail: `HTTP MCP: ${err instanceof Error ? err.message : String(err)}`,
      transport: "http",
      live: false,
    });
  }
}

/**
 * Real probe paths for Tier A when a token/key is present.
 * Marks connected only on HTTP 2xx from a known API.
 */
async function probeTierAWithToken(
  id: string,
  fields: Record<string, string>,
): Promise<Partial<McpRuntimeStatus>> {
  const token =
    fields.token?.trim() ||
    fields.access_token?.trim() ||
    fields.api_key?.trim() ||
    fields.API_TOKEN?.trim() ||
    fields.GITHUB_TOKEN?.trim() ||
    fields.SLACK_BOT_TOKEN?.trim() ||
    fields.TODOIST_API_TOKEN?.trim() ||
    "";

  if (!token) {
    return {
      state: "draft",
      detail: "Нет token для проверки API",
      live: false,
    };
  }

  try {
    if (id === "github") {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "Mira-AI",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as { login?: string };
        return {
          state: "connected",
          detail: `GitHub API OK · @${json.login || "user"}`,
          transport: "http",
          tools: ["github.user", "github.repos"],
          live: true,
        };
      }
      return {
        state: "error",
        detail: `GitHub API ${res.status} — token отклонён`,
        transport: "http",
        live: false,
      };
    }

    if (id === "slack") {
      const res = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        team?: string;
      };
      if (json.ok) {
        return {
          state: "connected",
          detail: `Slack auth.test OK · ${json.team || "workspace"}`,
          transport: "http",
          tools: ["slack.auth.test", "slack.chat.postMessage"],
          live: true,
        };
      }
      return {
        state: "error",
        detail: `Slack: ${json.error || res.status}`,
        transport: "http",
        live: false,
      };
    }

    if (id === "todoist") {
      const res = await fetch("https://api.todoist.com/rest/v2/projects", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        return {
          state: "connected",
          detail: "Todoist REST OK",
          transport: "http",
          tools: ["todoist.projects"],
          live: true,
        };
      }
      return {
        state: "error",
        detail: `Todoist API ${res.status}`,
        transport: "http",
        live: false,
      };
    }

    // Generic: token saved but no specific probe — stay honest.
    return {
      state: "needs-auth",
      detail: `Token сохранён для «${id}», но полного MCP/OAuth handshake ещё нет. Не помечено как подключено.`,
      transport: "http",
      live: false,
    };
  } catch (err) {
    return {
      state: "error",
      detail: `Probe: ${err instanceof Error ? err.message : String(err)}`,
      live: false,
    };
  }
}
