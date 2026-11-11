import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { getPublicConfig, loadConfig, validateLlmConfig } from "./config";
import { wireConfirmBridge } from "./confirmBridge";
import { createLlmAdapter } from "./llm";
import {
  ensureSeededCatalog,
  loadMarkdownCatalog,
  setCatalogEnabled,
  writeCatalogItem,
} from "./markdownCatalog";
import { runMemorySearch, sendChatMessage } from "./orchestrator";
import {
  clearTerminalHistory,
  createTerminalSession,
  disposeAllTerminals,
  ensureDefaultTerminal,
  getTerminalHistory,
  getTerminalPrefs,
  getTerminalSession,
  killTerminal,
  listTerminalSessions,
  resizeTerminal,
  runCommandInTerminal,
  setTerminalCwd,
  setTerminalHandlers,
  writeTerminal,
} from "./terminal/manager";
import {
  getBrowserPolicy,
  openBrowserUrl,
  searchHistory,
} from "./tools/browser";
import {
  getMessagingPolicy,
  getMessagingStatusSnapshot,
  parseMessengerIntent,
  sendOrReplyMessage,
} from "./tools/messaging";
import { captureScreen, getScreenPolicy } from "./tools/screen";
import { getTerminalPolicy, isDangerousTerminalCommand } from "./tools/terminal";
import { getWebPolicy, webSearch } from "./tools/web";
import {
  closeStore,
  createSession,
  ensureBootstrapSession,
  getDatabasePath,
  getSession,
  getStoreHealth,
  listMessengerContacts,
  listMessengerMessages,
  listSessions,
  listUtterances,
  openStore,
  upsertMessengerContact,
} from "./store";

const isDev = process.env.MIRA_DEV === "1";
const activeAborts = new Map<string, AbortController>();

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#000814",
    title: "Mira",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    void win.loadURL(process.env.MIRA_DEV_URL ?? "http://127.0.0.1:5173");
  } else {
    void win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return win;
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

app.whenReady().then(() => {
  loadConfig(true);
  wireConfirmBridge();
  openStore();
  ensureBootstrapSession();
  ensureSeededCatalog("skills");
  ensureSeededCatalog("protocols");

  setTerminalHandlers({
    onData: (sessionId, data) => {
      broadcast("mira:terminal-data", { sessionId, data });
    },
    onExit: (sessionId, exitCode) => {
      broadcast("mira:terminal-exit", { sessionId, exitCode });
    },
  });

  ipcMain.handle("mira:get-health", () => {
    const health = getStoreHealth();
    const cfg = getPublicConfig();
    const validation = validateLlmConfig();
    return {
      phase: "P7",
      databasePath: getDatabasePath(),
      ...health,
      llm: cfg,
      llmOk: validation.ok,
      llmReason: validation.reason ?? null,
      skills: loadMarkdownCatalog("skills").length,
      protocols: loadMarkdownCatalog("protocols").length,
      web: getWebPolicy(),
      screen: getScreenPolicy(),
      browser: getBrowserPolicy(),
      messaging: getMessagingPolicy(),
      terminal: getTerminalPolicy(),
      terminalSessions: listTerminalSessions().length,
    };
  });

  ipcMain.handle("mira:get-config", () => getPublicConfig());

  ipcMain.handle("mira:list-sessions", () => listSessions());

  ipcMain.handle("mira:create-session", (_e, title?: string) =>
    createSession(title || "Новый диалог"),
  );

  ipcMain.handle("mira:get-session", (_e, sessionId: string) => {
    const session = getSession(sessionId);
    if (!session) return null;
    return { session, utterances: listUtterances(sessionId) };
  });

  ipcMain.handle("mira:search-memory", (_e, query: string) =>
    runMemorySearch(query ?? "", 20),
  );

  ipcMain.handle("mira:test-llm", async () => {
    const cfg = loadConfig(true);
    const validation = validateLlmConfig(cfg);
    if (!validation.ok) {
      return { ok: false, detail: validation.reason ?? "invalid config" };
    }
    const adapter = createLlmAdapter(cfg);
    return adapter.testConnection();
  });

  ipcMain.handle(
    "mira:send-chat",
    async (
      _e,
      payload: {
        sessionId?: string | null;
        text: string;
        requestId: string;
        forceProtocolId?: string | null;
      },
    ) => {
      const requestId = payload.requestId || crypto.randomUUID();
      const controller = new AbortController();
      activeAborts.set(requestId, controller);

      try {
        const session = await sendChatMessage(
          {
            sessionId: payload.sessionId,
            text: payload.text,
            forceProtocolId: payload.forceProtocolId,
          },
          (event) => {
            broadcast("mira:chat-event", { requestId, event });
          },
          controller.signal,
        );
        return { ok: true, sessionId: session.id, requestId };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        broadcast("mira:chat-event", {
          requestId,
          event: { type: "error", message },
        });
        return { ok: false, error: message, requestId };
      } finally {
        activeAborts.delete(requestId);
      }
    },
  );

  ipcMain.handle("mira:abort-chat", (_e, requestId: string) => {
    const c = activeAborts.get(requestId);
    if (c) {
      c.abort();
      activeAborts.delete(requestId);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle("mira:list-skills", () => loadMarkdownCatalog("skills"));
  ipcMain.handle("mira:list-protocols", () => loadMarkdownCatalog("protocols"));

  ipcMain.handle(
    "mira:set-skill-enabled",
    (_e, id: string, enabled: boolean) =>
      setCatalogEnabled("skills", id, enabled),
  );
  ipcMain.handle(
    "mira:set-protocol-enabled",
    (_e, id: string, enabled: boolean) =>
      setCatalogEnabled("protocols", id, enabled),
  );

  ipcMain.handle(
    "mira:save-protocol",
    (
      _e,
      item: {
        id: string;
        name: string;
        description: string;
        triggers: string[];
        enabled: boolean;
        body: string;
      },
    ) => writeCatalogItem("protocols", item),
  );

  ipcMain.handle("mira:get-web-policy", () => getWebPolicy());
  ipcMain.handle("mira:get-screen-policy", () => getScreenPolicy());
  ipcMain.handle("mira:get-browser-policy", () => getBrowserPolicy());

  ipcMain.handle("mira:test-web", async (_e, query?: string) => {
    try {
      const hits = await webSearch(query?.trim() || "Mira AI assistant");
      return {
        ok: true,
        detail: `web.search OK · hits=${hits.length}`,
        hits,
      };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        hits: [],
      };
    }
  });

  ipcMain.handle("mira:test-screen", async () => {
    try {
      const shot = await captureScreen();
      return {
        ok: shot.ok,
        detail: shot.note,
        path: shot.path,
      };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        path: null,
      };
    }
  });

  ipcMain.handle("mira:test-browser-open", async (_e, url?: string) => {
    try {
      const target = (url?.trim() || "https://example.com").replace(
        /[),.]+$/,
        "",
      );
      const opened = await openBrowserUrl(target);
      return {
        ok: opened.ok,
        detail: opened.detail,
        url: opened.url,
      };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        url: null,
      };
    }
  });

  ipcMain.handle("mira:search-browser-history", (_e, query?: string) =>
    searchHistory(query ?? "", 20),
  );

  ipcMain.handle("mira:get-messaging-policy", () => getMessagingPolicy());
  ipcMain.handle("mira:get-messaging-status", () =>
    getMessagingStatusSnapshot(),
  );
  ipcMain.handle("mira:list-messenger-contacts", (_e, provider?: string) =>
    listMessengerContacts(provider),
  );
  ipcMain.handle("mira:list-messenger-messages", (_e, limit?: number) =>
    listMessengerMessages(limit ?? 20),
  );
  ipcMain.handle(
    "mira:upsert-messenger-contact",
    (
      _e,
      item: {
        id?: string;
        provider: string;
        displayName: string;
        handle: string;
        chatId: string;
        enabled?: boolean;
      },
    ) => upsertMessengerContact(item),
  );

  ipcMain.handle(
    "mira:test-messaging-send",
    async (
      _e,
      payload?: { text?: string; recipient?: string; body?: string },
    ) => {
      try {
        const text =
          payload?.text?.trim() ||
          `Напиши ${payload?.recipient?.trim() || "Ивану"} в Telegram, что ${payload?.body?.trim() || "тест из Настроек Mira"}`;
        const intent = parseMessengerIntent(text);
        if (!intent) {
          return {
            ok: false,
            detail: "Не удалось разобрать команду отправки",
            result: null,
          };
        }
        const result = await sendOrReplyMessage(intent);
        return {
          ok: result.ok,
          detail: result.detail,
          result,
        };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          result: null,
        };
      }
    },
  );

  ipcMain.handle("mira:get-terminal-policy", () => getTerminalPolicy());
  ipcMain.handle("mira:get-terminal-prefs", () => getTerminalPrefs());
  ipcMain.handle("mira:list-terminal-sessions", () => listTerminalSessions());
  ipcMain.handle(
    "mira:create-terminal-session",
    (_e, opts?: { title?: string; cwd?: string; cols?: number; rows?: number }) =>
      createTerminalSession(opts),
  );
  ipcMain.handle("mira:ensure-terminal", () => ensureDefaultTerminal());
  ipcMain.handle("mira:get-terminal-session", (_e, id: string) =>
    getTerminalSession(id),
  );
  ipcMain.handle("mira:write-terminal", (_e, id: string, data: string) =>
    writeTerminal(id, data),
  );
  ipcMain.handle(
    "mira:resize-terminal",
    (_e, id: string, cols: number, rows: number) =>
      resizeTerminal(id, cols, rows),
  );
  ipcMain.handle("mira:kill-terminal", (_e, id: string) => killTerminal(id));
  ipcMain.handle("mira:clear-terminal", (_e, id: string) =>
    clearTerminalHistory(id),
  );
  ipcMain.handle("mira:get-terminal-history", (_e, id: string) =>
    getTerminalHistory(id),
  );
  ipcMain.handle("mira:set-terminal-cwd", (_e, id: string, cwd: string) =>
    setTerminalCwd(id, cwd),
  );
  ipcMain.handle(
    "mira:run-terminal-command",
    async (_e, command: string, sessionId?: string | null) => {
      try {
        const dangerous = isDangerousTerminalCommand(command);
        const result = await runCommandInTerminal(command, {
          sessionId,
          waitMs: 5000,
        });
        return { ok: true, dangerous, ...result };
      } catch (err) {
        return {
          ok: false,
          dangerous: isDangerousTerminalCommand(command),
          detail: err instanceof Error ? err.message : String(err),
          sessionId: null,
          output: "",
          backend: null,
        };
      }
    },
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  disposeAllTerminals();
  closeStore();
  if (process.platform !== "darwin") app.quit();
});
