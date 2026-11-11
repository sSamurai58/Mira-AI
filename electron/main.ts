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
import {
  getLearnPlan,
  getLibraryItem,
  getLibrarySnapshot,
  importLibraryFile,
  importLibraryText,
  listLearnedUnits,
  listLibraryItems,
  processLibraryItem,
  proposeSkillFromItem,
  searchLearnedUnits,
} from "./library/learn";
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
import { executeTerminalFromChat, getTerminalPolicy } from "./tools/terminal";
import { getWebPolicy, webSearch } from "./tools/web";
import {
  closeStore,
  createSession,
  ensureBootstrapSession,
  getSession,
  getStoreHealth,
  listMessengerContacts,
  listMessengerMessages,
  listSessions,
  listUtterances,
  openStore,
  upsertMessengerContact,
} from "./store";
import { authed, desktopToolsEnabled, initIpcSecurity } from "./ipcSecurity";

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
  initIpcSecurity();
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


  const on = (
    channel: string,
    fn: (...args: any[]) => unknown,
    opts?: { privileged?: boolean },
  ) => {
    ipcMain.handle(channel, authed(fn as any, opts));
  };

  on("mira:get-health", () => {
    const health = getStoreHealth();
    const cfg = getPublicConfig();
    const validation = validateLlmConfig();
    return {
      phase: "P8",
      databasePath: "<local-sqlite>",
      ok: health.ok,
      path: "<local-sqlite>",
      sessions: health.sessions,
      utterances: health.utterances,
      browserVisits: health.browserVisits,
      messengerContacts: health.messengerContacts,
      messengerMessages: health.messengerMessages,
      libraryItems: health.libraryItems,
      learnedUnits: health.learnedUnits,
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
      library: listLibraryItems(5).length,
      desktopTools: desktopToolsEnabled(),
    };
  });

  on("mira:get-config", () => getPublicConfig());
  on("mira:list-sessions", () => listSessions());
  on("mira:create-session", (_e, title?: string) =>
    createSession(title || "Новый диалог"),
  );
  on("mira:get-session", (_e, sessionId: string) => {
    const session = getSession(sessionId);
    if (!session) return null;
    return { session, utterances: listUtterances(sessionId) };
  });
  on("mira:search-memory", (_e, query: string) =>
    runMemorySearch(query ?? "", 20),
  );
  on("mira:test-llm", async () => {
    const cfg = loadConfig(true);
    const validation = validateLlmConfig(cfg);
    if (!validation.ok) {
      return { ok: false, detail: validation.reason ?? "invalid config" };
    }
    const adapter = createLlmAdapter(cfg);
    return adapter.testConnection();
  });

  on(
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

  on("mira:abort-chat", (_e, requestId: string) => {
    const c = activeAborts.get(requestId);
    if (c) {
      c.abort();
      activeAborts.delete(requestId);
      return { ok: true };
    }
    return { ok: false };
  });

  on("mira:list-skills", () => loadMarkdownCatalog("skills"));
  on("mira:list-protocols", () => loadMarkdownCatalog("protocols"));
  on("mira:set-skill-enabled", (_e, id: string, enabled: boolean) =>
    setCatalogEnabled("skills", id, enabled),
  );
  on("mira:set-protocol-enabled", (_e, id: string, enabled: boolean) =>
    setCatalogEnabled("protocols", id, enabled),
  );
  on(
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

  on("mira:get-web-policy", () => getWebPolicy());
  on("mira:get-screen-policy", () => getScreenPolicy());
  on("mira:get-browser-policy", () => getBrowserPolicy());

  on("mira:test-web", async (_e, query?: string) => {
    try {
      const hits = await webSearch(query?.trim() || "Mira AI assistant");
      return { ok: true, detail: `web.search OK · hits=${hits.length}`, hits };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        hits: [],
      };
    }
  });

  on(
    "mira:test-screen",
    async () => {
      try {
        const shot = await captureScreen();
        return { ok: shot.ok, detail: shot.note, path: shot.path };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          path: null,
        };
      }
    },
    { privileged: true },
  );

  on(
    "mira:test-browser-open",
    async (_e, url?: string) => {
      try {
        const target = (url?.trim() || "https://example.com").replace(/[),.]+$/, "");
        const opened = await openBrowserUrl(target);
        return { ok: opened.ok, detail: opened.detail, url: opened.url };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          url: null,
        };
      }
    },
    { privileged: true },
  );

  on(
    "mira:search-browser-history",
    (_e, query?: string) => searchHistory(query ?? "", 20),
    { privileged: true },
  );

  on("mira:get-messaging-policy", () => getMessagingPolicy());
  on("mira:get-messaging-status", () => getMessagingStatusSnapshot(), {
    privileged: true,
  });
  on(
    "mira:list-messenger-contacts",
    (_e, provider?: string) => listMessengerContacts(provider),
    { privileged: true },
  );
  on(
    "mira:list-messenger-messages",
    (_e, limit?: number) => listMessengerMessages(limit ?? 20),
    { privileged: true },
  );
  on(
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
    { privileged: true },
  );
  on(
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
        return { ok: result.ok, detail: result.detail, result };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          result: null,
        };
      }
    },
    { privileged: true },
  );

  on("mira:get-terminal-policy", () => getTerminalPolicy());
  on("mira:get-terminal-prefs", () => getTerminalPrefs());
  on("mira:list-terminal-sessions", () => listTerminalSessions(), {
    privileged: true,
  });
  on(
    "mira:create-terminal-session",
    (_e, opts?: { title?: string; cwd?: string; cols?: number; rows?: number }) =>
      createTerminalSession(opts),
    { privileged: true },
  );
  on("mira:ensure-terminal", () => ensureDefaultTerminal(), { privileged: true });
  on(
    "mira:get-terminal-session",
    (_e, id: string) => getTerminalSession(id),
    { privileged: true },
  );
  on(
    "mira:write-terminal",
    (_e, id: string, data: string) => writeTerminal(id, data),
    { privileged: true },
  );
  on(
    "mira:resize-terminal",
    (_e, id: string, cols: number, rows: number) =>
      resizeTerminal(id, cols, rows),
    { privileged: true },
  );
  on("mira:kill-terminal", (_e, id: string) => killTerminal(id), {
    privileged: true,
  });
  on("mira:clear-terminal", (_e, id: string) => clearTerminalHistory(id), {
    privileged: true,
  });
  on("mira:get-terminal-history", (_e, id: string) => getTerminalHistory(id), {
    privileged: true,
  });
  on(
    "mira:set-terminal-cwd",
    (_e, id: string, cwd: string) => setTerminalCwd(id, cwd),
    { privileged: true },
  );
  on(
    "mira:run-terminal-command",
    async (_e, command: string, _sessionId?: string | null) => {
      try {
        const result = await executeTerminalFromChat(String(command ?? ""));
        return {
          ok: result.ok,
          dangerous: result.dangerous,
          sessionId: result.sessionId,
          output: result.output,
          backend: null,
          detail: result.detail,
          mode: result.mode,
        };
      } catch (err) {
        return {
          ok: false,
          dangerous: false,
          detail: err instanceof Error ? err.message : String(err),
          sessionId: null,
          output: "",
          backend: null,
        };
      }
    },
    { privileged: true },
  );

  on("mira:list-library-items", () => listLibraryItems());
  on("mira:get-library-item", (_e, id: string) => getLibraryItem(id));
  on("mira:get-library-snapshot", () => getLibrarySnapshot());
  on(
    "mira:import-library-file",
    (_e, filePath: string, title?: string) =>
      importLibraryFile({ filePath, title }),
    { privileged: true },
  );
  on(
    "mira:import-library-text",
    (_e, payload: { title: string; text: string; fileName?: string }) =>
      importLibraryText(payload),
  );
  on("mira:process-library-item", (_e, id: string) => processLibraryItem(id));
  on("mira:propose-library-skill", async (_e, id: string) =>
    proposeSkillFromItem(id),
  );
  on("mira:list-learned-units", (_e, libraryItemId?: string) =>
    listLearnedUnits(
      libraryItemId ? { libraryItemId, limit: 50 } : { limit: 50 },
    ),
  );
  on("mira:search-learned-units", (_e, query?: string) =>
    searchLearnedUnits(query ?? "", 20),
  );
  on("mira:get-learn-plan", (_e, libraryItemId: string) =>
    getLearnPlan(libraryItemId),
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
