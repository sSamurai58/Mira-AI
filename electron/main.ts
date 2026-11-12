import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getPublicConfig, loadConfig, validateLlmConfig } from "./config";
import { getSettingsEnv, setSettingsEnv } from "./settingsEnv";
import { wireConfirmBridge } from "./confirmBridge";
import { createLlmAdapter } from "./llm";
import {
  deleteCatalogItem,
  ensureSeededCatalog,
  loadMarkdownCatalog,
  setCatalogEnabled,
  writeCatalogItem,
} from "./markdownCatalog";
import {
  deleteLibraryMaterial,
  getLearnPlan,
  getLibraryItem,
  getLibrarySnapshot,
  importLibraryBytes,
  importLibraryFile,
  importLibraryText,
  listLearnedUnits,
  listLibraryItems,
  processLibraryItem,
  proposeSkillFromItem,
  searchLearnedUnits,
} from "./library/learn";
import { runMemorySearch, sendChatMessage } from "./orchestrator";
import { sampleSystemLoad, warmSystemMetrics } from "./systemMetrics";
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
  listInstalledBrowsers,
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
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  initUpdater,
  openReleasesPage,
  quitAndInstall,
} from "./updater";
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
import {
  addCustomPhrase,
  createVoiceProject,
  deleteCustomVoice,
  deleteVoiceProject,
  generatePhrases,
  getCustomVoiceCorpus,
  getStudioSnapshot,
  importClip,
  importClipBytes,
  listCustomVoices,
  listVoiceProjects,
  trainVoiceModel,
  updateCustomVoice,
  updateVoiceProject,
} from "./voiceStudio/studio";
import {
  getBlenderPolicy,
  runDemoScene,
} from "./tools/blender";
import { formatDoctorText, runDoctor } from "./doctor";
import {
  exportBackup,
  forgetData,
  getBackupStatus,
  importBackup,
  type ForgetScope,
} from "./backup";
import {
  clearAppLogs,
  getLoggingStatus,
  listAppLogs,
  readLogFileTail,
  type LogLevel,
} from "./logging";
import {
  getConfirmPolicy,
  setConfirmPolicyEnv,
  type ConfirmClass,
  type ConfirmMode,
} from "./confirmPolicy";
import { listNotes, searchNotes, upsertNote } from "./future/notes";
import {
  cancelTimer,
  createEvent,
  listEvents,
  listTimers,
  startTimer,
  tickCalendarNotifications,
} from "./future/calendar";
import { listCameras, upsertCamera } from "./future/cameras";
import { listIotDevices } from "./future/iot";
import { getMailPolicy, listMail } from "./future/mail";
import { getMediaStatus } from "./future/media";
import { searchFiles } from "./future/files";
import {
  deleteProfile,
  getActiveProfile,
  getProfilesSnapshot,
  listProfiles,
  setActiveProfile,
  upsertProfile,
} from "./profiles";
import { getHudPolicy, isHudOpen, toggleHud } from "./hud";

const isDev = process.env.MIRA_DEV === "1";
const activeAborts = new Map<string, AbortController>();
let calendarTick: NodeJS.Timeout | null = null;

// Pin taskbar identity. GPU stays on — software rendering made the UI laggy.
// Opt out only if needed: MIRA_DISABLE_GPU=1
if (process.platform === "win32") {
  app.setAppUserModelId("ai.mira.desktop");
}
if (process.env.MIRA_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      createWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}


function appIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, "..", "build", "icon.png"),
    path.join(process.cwd(), "build", "icon.png"),
    path.join(process.resourcesPath ?? "", "icon.png"),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow(): BrowserWindow {
  const icon = appIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#000814",
    title: "Mira",
    show: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  // Fallback if ready-to-show never fires (some GPU drivers)
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  }, 2500);

  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted */) return;
    console.error("[mira] renderer failed", code, desc, url);
    void dialog.showMessageBox(win, {
      type: "error",
      title: "Mira — UI не загрузился",
      message: "Не удалось открыть интерфейс",
      detail: `${desc} (${code})\n${url}`,
    });
  });

  if (isDev) {
    void win.loadURL(process.env.MIRA_DEV_URL ?? "http://127.0.0.1:5173");
  } else {
    const indexHtml = path.join(__dirname, "..", "dist", "index.html");
    void win.loadFile(indexHtml).catch((err) => {
      console.error("[mira] loadFile failed", indexHtml, err);
      void dialog.showErrorBox(
        "Mira — UI не загрузился",
        `${indexHtml}\n${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  return win;
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

if (gotSingleInstanceLock) app.whenReady().then(() => {
  // Make window appear even if later init throws (common on Windows install).
  let bootError: string | null = null;
  try {
    initIpcSecurity();
    loadConfig(true);
    wireConfirmBridge();
    openStore();
    ensureBootstrapSession();
    ensureSeededCatalog("skills");
    ensureSeededCatalog("protocols");
  } catch (err) {
    bootError = err instanceof Error ? err.message : String(err);
    console.error("[mira] boot failed", err);
  }

  setTerminalHandlers({
    onData: (sessionId, data) => {
      broadcast("mira:terminal-data", { sessionId, data });
    },
    onExit: (sessionId, exitCode) => {
      broadcast("mira:terminal-exit", { sessionId, exitCode });
    },
  });

  try {
    initUpdater(broadcast);
  } catch (err) {
    console.error("[mira] updater init failed", err);
  }

  try {
    warmSystemMetrics();
  } catch (err) {
    console.error("[mira] system metrics warm failed", err);
  }

  const on = (
    channel: string,
    fn: (...args: any[]) => unknown,
    opts?: { privileged?: boolean },
  ) => {
    ipcMain.handle(channel, authed(fn as any, opts));
  };

  on("mira:get-system-load", () => sampleSystemLoad());

  on("mira:get-health", () => {
    const health = getStoreHealth();
    const cfg = getPublicConfig();
    const validation = validateLlmConfig();
    return {
      phase: "F*",
      confirm: getConfirmPolicy(),
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
      voiceProjects: listVoiceProjects().length,
      customVoices: listCustomVoices().length,
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
      blender: getBlenderPolicy(),
      terminalSessions: listTerminalSessions().length,
      library: listLibraryItems(5).length,
      desktopTools: desktopToolsEnabled(),
    };
  });

  on("mira:get-config", () => getPublicConfig());
  on("mira:get-settings-env", () => getSettingsEnv());
  on(
    "mira:set-settings-env",
    (_e, patch: Record<string, string>) => setSettingsEnv(patch ?? {}),
    { privileged: true },
  );
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
        attachments?: Array<{
          name: string;
          mimeType: string;
          size: number;
          kind: string;
          text?: string;
          dataBase64?: string;
        }>;
        addToLibrary?: boolean;
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
            attachments: payload.attachments,
            addToLibrary: payload.addToLibrary,
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
        tags?: string[];
        enabled: boolean;
        body: string;
      },
    ) => writeCatalogItem("protocols", item),
  );
  on(
    "mira:save-skill",
    (
      _e,
      item: {
        id: string;
        name: string;
        description: string;
        triggers: string[];
        tags?: string[];
        enabled: boolean;
        body: string;
      },
    ) => writeCatalogItem("skills", item),
  );
  on(
    "mira:delete-skill",
    (_e, id: string) => deleteCatalogItem("skills", id),
    { privileged: true },
  );
  on(
    "mira:delete-protocol",
    (_e, id: string) => deleteCatalogItem("protocols", id),
    { privileged: true },
  );

  on("mira:get-web-policy", () => getWebPolicy());
  on("mira:get-screen-policy", () => getScreenPolicy());
  on("mira:get-browser-policy", () => getBrowserPolicy());
  on("mira:list-installed-browsers", () => listInstalledBrowsers());

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
  on(
    "mira:import-library-bytes",
    (
      _e,
      payload: {
        bytes: number[] | Uint8Array;
        fileName: string;
        title?: string;
        extractedText?: string;
      },
    ) =>
      importLibraryBytes({
        bytes: Uint8Array.from(payload.bytes),
        fileName: payload.fileName,
        title: payload.title,
        extractedText: payload.extractedText,
      }),
    { privileged: true },
  );
  on("mira:process-library-item", (_e, id: string) => processLibraryItem(id));
  on(
    "mira:delete-library-item",
    (_e, id: string) => deleteLibraryMaterial(id),
    { privileged: true },
  );
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

  on("mira:voice-studio-snapshot", (_e, projectId?: string) =>
    getStudioSnapshot(projectId),
  );
  on("mira:list-voice-projects", () => listVoiceProjects());
  on("mira:list-custom-voices", () => listCustomVoices());
  on("mira:get-custom-voice-corpus", (_e, voiceId: string) =>
    getCustomVoiceCorpus(voiceId),
  );
  on(
    "mira:create-voice-project",
    (_e, payload?: { name?: string; lang?: string }) =>
      createVoiceProject({
        name: payload?.name ?? "Новый голос",
        lang: payload?.lang,
      }),
  );
  on(
    "mira:update-voice-project",
    (_e, payload: { id: string; name?: string; lang?: string }) =>
      updateVoiceProject(payload.id, {
        name: payload.name,
        lang: payload.lang,
      }),
  );
  on(
    "mira:delete-voice-project",
    (_e, id: string) => deleteVoiceProject(id),
    { privileged: true },
  );
  on(
    "mira:update-custom-voice",
    (_e, payload: { id: string; name?: string; lang?: string }) =>
      updateCustomVoice(payload.id, {
        name: payload.name,
        lang: payload.lang,
      }),
  );
  on("mira:delete-custom-voice", (_e, id: string) => deleteCustomVoice(id));
  on(
    "mira:add-voice-phrase",
    (_e, projectId: string, text: string) => addCustomPhrase(projectId, text),
  );
  on("mira:train-voice-model", (_e, projectId: string) =>
    trainVoiceModel(projectId, (ev) => {
      broadcast("mira:voice-train-progress", ev);
    }),
  );
  on(
    "mira:generate-voice-phrases",
    (
      _e,
      projectId: string,
      countOrOpts?:
        | number
        | { count?: number; minWords?: number; maxWords?: number },
    ) => generatePhrases(projectId, countOrOpts ?? 5),
  );
  on(
    "mira:import-voice-clip",
    (
      _e,
      payload: {
        projectId: string;
        sourcePath: string;
        phraseId?: string | null;
      },
    ) =>
      importClip({
        projectId: payload.projectId,
        sourcePath: payload.sourcePath,
        phraseId: payload.phraseId,
      }),
    { privileged: true },
  );
  on(
    "mira:import-voice-clip-bytes",
    (
      _e,
      payload: {
        projectId: string;
        bytes: number[] | Uint8Array;
        fileName: string;
        phraseId?: string | null;
      },
    ) =>
      importClipBytes({
        projectId: payload.projectId,
        bytes: Uint8Array.from(payload.bytes),
        fileName: payload.fileName,
        phraseId: payload.phraseId,
      }),
    { privileged: true },
  );
  on("mira:get-blender-policy", () => getBlenderPolicy());
  on("mira:run-doctor", () => {
    const report = runDoctor();
    return { ...report, text: formatDoctorText(report) };
  });
  on(
    "mira:list-app-logs",
    (_e, opts?: { limit?: number; category?: string; level?: LogLevel }) =>
      listAppLogs(opts),
  );
  on("mira:get-logging-status", () => getLoggingStatus());
  on(
    "mira:read-log-file",
    (_e, fileName: string, maxLines?: number) =>
      readLogFileTail(String(fileName ?? ""), maxLines ?? 80),
    { privileged: true },
  );
  on("mira:clear-app-logs", () => clearAppLogs(), { privileged: true });
  on("mira:get-confirm-policy", () => getConfirmPolicy());
  on(
    "mira:set-confirm-policy",
    (
      _e,
      payload: { mode?: ConfirmMode; dangerousList?: ConfirmClass[] },
    ) => {
      setConfirmPolicyEnv(payload);
      return getConfirmPolicy();
    },
  );
  on("mira:list-notes", (_e, limit?: number) => listNotes(limit ?? 50));
  on("mira:search-notes", (_e, query?: string) =>
    searchNotes(query ?? "", 20),
  );
  on(
    "mira:upsert-note",
    (
      _e,
      payload: {
        id?: string;
        title: string;
        body: string;
        tags?: string;
        sessionId?: string | null;
      },
    ) => upsertNote(payload),
  );
  on("mira:list-calendar-events", () => listEvents());
  on("mira:list-timers", () => listTimers());
  on(
    "mira:create-calendar-event",
    (
      _e,
      payload: {
        title: string;
        startsAt: string;
        endsAt?: string | null;
        remindAt?: string | null;
      },
    ) => createEvent(payload),
  );
  on(
    "mira:start-timer",
    (_e, label: string, seconds: number) => startTimer(label, seconds),
  );
  on("mira:cancel-timer", (_e, id?: string) => cancelTimer(id));
  on("mira:list-cameras", () => listCameras());
  on(
    "mira:upsert-camera",
    (
      _e,
      payload: { id?: string; name: string; url: string; enabled?: boolean },
    ) => upsertCamera(payload),
  );
  on("mira:list-iot-devices", () => listIotDevices());
  on("mira:get-mail-policy", () => getMailPolicy());
  on("mira:list-mail", (_e, folder?: string) => listMail(folder ?? "inbox"));
  on("mira:get-media-status", () => getMediaStatus());
  on("mira:search-files", (_e, query?: string) => searchFiles(query ?? "", 30));

  on("mira:list-profiles", () => listProfiles());
  on("mira:get-profiles-snapshot", () => getProfilesSnapshot());
  on("mira:get-active-profile", () => getActiveProfile());
  on("mira:set-active-profile", (_e, id: string) => setActiveProfile(id));
  on(
    "mira:upsert-profile",
    (
      _e,
      payload: {
        id?: string;
        name: string;
        voiceId?: string | null;
        llmProvider?: string | null;
        llmModel?: string | null;
        locale?: "ru" | "en";
        notes?: string;
      },
    ) => upsertProfile(payload),
  );
  on("mira:delete-profile", (_e, id: string) => deleteProfile(id));
  on("mira:get-hud-policy", () => ({ ...getHudPolicy(), open: isHudOpen() }));
  on("mira:toggle-hud", async () => toggleHud({ isDev }));


  on("mira:get-backup-status", () => getBackupStatus());

  on(
    "mira:export-backup",
    async (_e, opts?: { includeSecrets?: boolean }) => exportBackup(opts),
    { privileged: true },
  );
  on(
    "mira:import-backup",
    async (_e, packagePath: string) => importBackup(String(packagePath ?? "")),
    { privileged: true },
  );
  on(
    "mira:forget-data",
    async (_e, scope: ForgetScope) => forgetData(scope),
    { privileged: true },
  );
  on(
    "mira:test-blender-demo",
    async () => {
      try {
        const job = await runDemoScene();
        return {
          ok: job.ok,
          detail: job.detail,
          mode: job.mode,
          scriptPath: job.scriptPath,
          outputBlend: job.outputBlend,
        };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          mode: "dry-run",
          scriptPath: null,
          outputBlend: null,
        };
      }
    },
    { privileged: true },
  );

  on(
    "mira:read-voice-preview",
    (_e, filePath: string) => {
      const { dataRoot, seedRoot } = require("./appPaths") as typeof import("./appPaths");
      const abs = path.resolve(filePath);
      const root = dataRoot("voice-studio");
      const seed = seedRoot("voice-studio");
      if (
        !(abs === root || abs.startsWith(root + path.sep)) &&
        !(abs === seed || abs.startsWith(seed + path.sep))
      ) {
        throw new Error("Превью только из voice-studio");
      }
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime =
        ext === ".wav"
          ? "audio/wav"
          : ext === ".mp3"
            ? "audio/mpeg"
            : ext === ".ogg"
              ? "audio/ogg"
              : ext === ".m4a"
                ? "audio/mp4"
                : "audio/webm";
      return `data:${mime};base64,${buf.toString("base64")}`;
    },
    { privileged: true },
  );

  on("mira:get-update-status", () => getUpdateStatus());
  on("mira:check-for-updates", async () => checkForUpdates());
  on(
    "mira:download-update",
    async () => downloadUpdate(),
    { privileged: true },
  );
  on(
    "mira:quit-and-install",
    () => quitAndInstall(),
    { privileged: true },
  );
  on("mira:open-releases-page", async () => openReleasesPage());

  createWindow();

  if (bootError) {
    void dialog.showMessageBox({
      type: "error",
      title: "Mira — ошибка запуска",
      message: "Часть модулей не поднялась",
      detail:
        `${bootError}\n\nОкно всё равно открыто. Данные пишутся в:\n${app.getPath("userData")}`,
    });
  }

  calendarTick = setInterval(() => {
    void tickCalendarNotifications().catch(() => undefined);
  }, 5_000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (calendarTick) {
    clearInterval(calendarTick);
    calendarTick = null;
  }
  disposeAllTerminals();
  closeStore();
  if (process.platform !== "darwin") app.quit();
});

