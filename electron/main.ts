import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { getPublicConfig, loadConfig, validateLlmConfig } from "./config";
import { createLlmAdapter } from "./llm";
import { runMemorySearch, sendChatMessage } from "./orchestrator";
import {
  closeStore,
  createSession,
  ensureBootstrapSession,
  getDatabasePath,
  getSession,
  getStoreHealth,
  listSessions,
  listUtterances,
  openStore,
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
  openStore();
  ensureBootstrapSession();

  ipcMain.handle("mira:get-health", () => {
    const health = getStoreHealth();
    const cfg = getPublicConfig();
    const validation = validateLlmConfig();
    return {
      phase: "P2",
      databasePath: getDatabasePath(),
      ...health,
      llm: cfg,
      llmOk: validation.ok,
      llmReason: validation.reason ?? null,
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
      payload: { sessionId?: string | null; text: string; requestId: string },
    ) => {
      const requestId = payload.requestId || crypto.randomUUID();
      const controller = new AbortController();
      activeAborts.set(requestId, controller);

      try {
        const session = await sendChatMessage(
          { sessionId: payload.sessionId, text: payload.text },
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

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  closeStore();
  if (process.platform !== "darwin") app.quit();
});
