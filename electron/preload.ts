import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

export type MiraPublicConfig = {
  llmProvider: "openai" | "claude" | "gemini" | "grok" | "offline" | "mock";
  llmModel: string;
  hasOpenAiKey: boolean;
  hasAnthropicKey?: boolean;
  hasGeminiKey?: boolean;
  hasXaiKey?: boolean;
  openaiBaseUrl: string;
  xaiBaseUrl?: string;
  databasePath: string;
  visionEnabled?: boolean;
  activeProfileId?: string;
  webEnabled?: boolean;
  webAllowlist?: string;
  webFetchConfirm?: boolean;
};



export type MiraSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type MiraUtterance = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export type MiraMemoryHit = {
  utterance_id: string;
  session_id: string;
  session_title: string;
  role: string;
  content: string;
  created_at: string;
};

export type MiraCatalogItem = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  enabled: boolean;
  body: string;
  filePath: string;
  relativePath: string;
};

export type MiraConfirmRequest = {
  id: string;
  title: string;
  body: string;
  confirmLabel?: string;
};

export type MiraChatEvent =
  | { type: "user"; utterance: MiraUtterance }
  | {
      type: "context";
      skills: Array<{ id: string; name: string }>;
      protocol: { id: string; name: string } | null;
      web?: string | null;
      desktop?: string | null;
      messaging?: string | null;
      terminal?: string | null;
      learned?: string | null;
      blender?: string | null;
      addon?: string | null;
    }
  | { type: "phase"; phase: "tools" | "llm"; detail: string }
  | { type: "assistant_start"; sessionId: string }
  | { type: "token"; text: string }
  | {
      type: "assistant_done";
      utterance: MiraUtterance;
      memoryUsed: MiraMemoryHit[];
      skillsUsed: Array<{ id: string; name: string }>;
      protocolUsed: { id: string; name: string } | null;
      webUsed: string | null;
      desktopUsed: string | null;
      messagingUsed: string | null;
      terminalUsed: string | null;
      learnedUsed: string | null;
      blenderUsed: string | null;
      addonUsed: string | null;
    }
  | { type: "error"; message: string };

export type MiraTerminalSession = {
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

const IPC_TOKEN = process.env.MIRA_IPC_TOKEN ?? "";
const call = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, IPC_TOKEN, ...args);

contextBridge.exposeInMainWorld("mira", {
  getHealth: () => call("mira:get-health"),
  getConfig: (): Promise<MiraPublicConfig> => call("mira:get-config"),
  getSettingsEnv: (): Promise<{
    values: Record<string, string>;
    secretsSet: Record<string, boolean>;
    envFile: string;
    exists: boolean;
  }> => call("mira:get-settings-env"),
  setSettingsEnv: (
    patch: Record<string, string>,
  ): Promise<{
    ok: boolean;
    detail: string;
    values: Record<string, string>;
    secretsSet: Record<string, boolean>;
  }> => call("mira:set-settings-env", patch),
  listSessions: (): Promise<MiraSession[]> => call("mira:list-sessions"),
  createSession: (title?: string): Promise<MiraSession> =>
    call("mira:create-session", title),
  getSession: (
    sessionId: string,
  ): Promise<{ session: MiraSession; utterances: MiraUtterance[] } | null> =>
    call("mira:get-session", sessionId),
  searchMemory: (query: string): Promise<MiraMemoryHit[]> =>
    call("mira:search-memory", query),
  testLlm: (): Promise<{ ok: boolean; detail: string }> => call("mira:test-llm"),
  sendChat: (payload: {
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
  }): Promise<{
    ok: boolean;
    sessionId?: string;
    error?: string;
    requestId: string;
  }> => call("mira:send-chat", payload),
  abortChat: (requestId: string) => call("mira:abort-chat", requestId),
  listSkills: (): Promise<MiraCatalogItem[]> => call("mira:list-skills"),
  listProtocols: (): Promise<MiraCatalogItem[]> => call("mira:list-protocols"),
  setSkillEnabled: (id: string, enabled: boolean) =>
    call("mira:set-skill-enabled", id, enabled),
  setProtocolEnabled: (id: string, enabled: boolean) =>
    call("mira:set-protocol-enabled", id, enabled),
  saveProtocol: (item: {
    id: string;
    name: string;
    description: string;
    triggers: string[];
    tags?: string[];
    enabled: boolean;
    body: string;
  }) => call("mira:save-protocol", item),
  saveSkill: (item: {
    id: string;
    name: string;
    description: string;
    triggers: string[];
    tags?: string[];
    enabled: boolean;
    body: string;
  }) => call("mira:save-skill", item),
  deleteSkill: (id: string) => call("mira:delete-skill", id),
  deleteProtocol: (id: string) => call("mira:delete-protocol", id),
  getWebPolicy: () => call("mira:get-web-policy"),
  getScreenPolicy: () => call("mira:get-screen-policy"),
  getBrowserPolicy: () => call("mira:get-browser-policy"),
  listInstalledBrowsers: (): Promise<
    Array<{
      id: string;
      name: string;
      path: string | null;
      installed: boolean;
    }>
  > => call("mira:list-installed-browsers"),
  testWeb: (query?: string) => call("mira:test-web", query),
  testScreen: () => call("mira:test-screen"),
  testBrowserOpen: (url?: string) => call("mira:test-browser-open", url),
  searchBrowserHistory: (query?: string) =>
    call("mira:search-browser-history", query),
  getMessagingPolicy: () => call("mira:get-messaging-policy"),
  getMessagingStatus: () => call("mira:get-messaging-status"),
  listMessengerContacts: (provider?: string) =>
    call("mira:list-messenger-contacts", provider),
  listMessengerMessages: (limit?: number) =>
    call("mira:list-messenger-messages", limit),
  upsertMessengerContact: (item: {
    id?: string;
    provider: string;
    displayName: string;
    handle: string;
    chatId: string;
    enabled?: boolean;
  }) => call("mira:upsert-messenger-contact", item),
  testMessagingSend: (payload?: {
    text?: string;
    recipient?: string;
    body?: string;
  }) => call("mira:test-messaging-send", payload),
  getTerminalPolicy: () => call("mira:get-terminal-policy"),
  getTerminalPrefs: () => call("mira:get-terminal-prefs"),
  listTerminalSessions: (): Promise<MiraTerminalSession[]> =>
    call("mira:list-terminal-sessions"),
  createTerminalSession: (opts?: {
    title?: string;
    cwd?: string;
    cols?: number;
    rows?: number;
  }): Promise<MiraTerminalSession> => call("mira:create-terminal-session", opts),
  ensureTerminal: (): Promise<MiraTerminalSession> => call("mira:ensure-terminal"),
  getTerminalSession: (id: string): Promise<MiraTerminalSession | null> =>
    call("mira:get-terminal-session", id),
  writeTerminal: (id: string, data: string) =>
    call("mira:write-terminal", id, data),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    call("mira:resize-terminal", id, cols, rows),
  killTerminal: (id: string) => call("mira:kill-terminal", id),
  clearTerminal: (id: string) => call("mira:clear-terminal", id),
  getTerminalHistory: (id: string): Promise<string> =>
    call("mira:get-terminal-history", id),
  setTerminalCwd: (id: string, cwd: string): Promise<MiraTerminalSession> =>
    call("mira:set-terminal-cwd", id, cwd),
  runTerminalCommand: (command: string, sessionId?: string | null) =>
    call("mira:run-terminal-command", command, sessionId),
  listLibraryItems: () => call("mira:list-library-items"),
  getLibraryItem: (id: string) => call("mira:get-library-item", id),
  getLibrarySnapshot: () => call("mira:get-library-snapshot"),
  importLibraryFile: (filePath: string, title?: string) =>
    call("mira:import-library-file", filePath, title),
  importLibraryText: (payload: {
    title: string;
    text: string;
    fileName?: string;
  }) => call("mira:import-library-text", payload),
  importLibraryBytes: (payload: {
    bytes: number[] | Uint8Array;
    fileName: string;
    title?: string;
    extractedText?: string;
  }) => call("mira:import-library-bytes", payload),
  processLibraryItem: (id: string) => call("mira:process-library-item", id),
  deleteLibraryItem: (id: string) => call("mira:delete-library-item", id),
  proposeLibrarySkill: (id: string) => call("mira:propose-library-skill", id),
  listLearnedUnits: (libraryItemId?: string) =>
    call("mira:list-learned-units", libraryItemId),
  searchLearnedUnits: (query?: string) => call("mira:search-learned-units", query),
  getLearnPlan: (libraryItemId: string) =>
    call("mira:get-learn-plan", libraryItemId),
  voiceStudioSnapshot: (projectId?: string) =>
    call("mira:voice-studio-snapshot", projectId),
  listVoiceProjects: () => call("mira:list-voice-projects"),
  listCustomVoices: () => call("mira:list-custom-voices"),
  createVoiceProject: (payload?: { name?: string; lang?: string }) =>
    call("mira:create-voice-project", payload),
  updateVoiceProject: (payload: { id: string; name?: string; lang?: string }) =>
    call("mira:update-voice-project", payload),
  deleteVoiceProject: (id: string) => call("mira:delete-voice-project", id),
  updateCustomVoice: (payload: { id: string; name?: string; lang?: string }) =>
    call("mira:update-custom-voice", payload),
  deleteCustomVoice: (id: string) => call("mira:delete-custom-voice", id),
  addVoicePhrase: (projectId: string, text: string) =>
    call("mira:add-voice-phrase", projectId, text),
  trainVoiceModel: (projectId: string) =>
    call("mira:train-voice-model", projectId),
  generateVoicePhrases: (projectId: string, count?: number) =>
    call("mira:generate-voice-phrases", projectId, count),
  importVoiceClip: (payload: {
    projectId: string;
    sourcePath: string;
    phraseId?: string | null;
  }) => call("mira:import-voice-clip", payload),
  importVoiceClipBytes: (payload: {
    projectId: string;
    bytes: number[] | Uint8Array;
    fileName: string;
    phraseId?: string | null;
  }) => call("mira:import-voice-clip-bytes", payload),
  readVoicePreview: (filePath: string) =>
    call("mira:read-voice-preview", filePath),
  getBlenderPolicy: () => call("mira:get-blender-policy"),
  testBlenderDemo: () => call("mira:test-blender-demo"),
  runDoctor: () => call("mira:run-doctor"),
  listAppLogs: (opts?: {
    limit?: number;
    category?: string;
    level?: "info" | "warn" | "error" | "debug";
  }) => call("mira:list-app-logs", opts),
  getLoggingStatus: () => call("mira:get-logging-status"),
  readLogFile: (fileName: string, maxLines?: number) =>
    call("mira:read-log-file", fileName, maxLines),
  clearAppLogs: () => call("mira:clear-app-logs"),
  getBackupStatus: () => call("mira:get-backup-status"),
  exportBackup: (opts?: { includeSecrets?: boolean }) =>
    call("mira:export-backup", opts),
  importBackup: (packagePath: string) =>
    call("mira:import-backup", packagePath),
  forgetData: (
    scope: "memory" | "learned" | "library" | "voice-studio" | "all",
  ) => call("mira:forget-data", scope),
  getConfirmPolicy: () => call("mira:get-confirm-policy"),
  setConfirmPolicy: (payload: {
    mode?: "always" | "smart" | "dangerous-list";
    dangerousList?: string[];
  }) => call("mira:set-confirm-policy", payload),
  listNotes: (limit?: number) => call("mira:list-notes", limit),
  searchNotes: (query?: string) => call("mira:search-notes", query),
  upsertNote: (payload: {
    id?: string;
    title: string;
    body: string;
    tags?: string;
    sessionId?: string | null;
  }) => call("mira:upsert-note", payload),
  listCalendarEvents: () => call("mira:list-calendar-events"),
  listTimers: () => call("mira:list-timers"),
  createCalendarEvent: (payload: {
    title: string;
    startsAt: string;
    endsAt?: string | null;
    remindAt?: string | null;
  }) => call("mira:create-calendar-event", payload),
  startTimer: (label: string, seconds: number) =>
    call("mira:start-timer", label, seconds),
  cancelTimer: (id?: string) => call("mira:cancel-timer", id),
  listCameras: () => call("mira:list-cameras"),
  upsertCamera: (payload: {
    id?: string;
    name: string;
    url: string;
    enabled?: boolean;
  }) => call("mira:upsert-camera", payload),
  listIotDevices: () => call("mira:list-iot-devices"),
  getMailPolicy: () => call("mira:get-mail-policy"),
  listMail: (folder?: string) => call("mira:list-mail", folder),
  getMediaStatus: () => call("mira:get-media-status"),
  searchFiles: (query?: string) => call("mira:search-files", query),
  listProfiles: () => call("mira:list-profiles"),
  getProfilesSnapshot: () => call("mira:get-profiles-snapshot"),
  getActiveProfile: () => call("mira:get-active-profile"),
  setActiveProfile: (id: string) => call("mira:set-active-profile", id),
  upsertProfile: (payload: {
    id?: string;
    name: string;
    voiceId?: string | null;
    llmProvider?: string | null;
    llmModel?: string | null;
    locale?: "ru" | "en";
    notes?: string;
  }) => call("mira:upsert-profile", payload),
  deleteProfile: (id: string) => call("mira:delete-profile", id),
  getHudPolicy: () => call("mira:get-hud-policy"),
  toggleHud: () => call("mira:toggle-hud"),
  respondConfirm: (
    id: string,
    accepted: boolean,
    fields?: { skillId?: string; skillName?: string },
  ) => call("mira:confirm-response", id, accepted, fields),
  getUpdateStatus: () => call("mira:get-update-status"),
  checkForUpdates: () => call("mira:check-for-updates"),
  downloadUpdate: () => call("mira:download-update"),
  quitAndInstall: () => call("mira:quit-and-install"),
  openReleasesPage: () => call("mira:open-releases-page"),

  onConfirmRequest: (handler: (req: MiraConfirmRequest) => void) => {
    const listener = (_event: IpcRendererEvent, req: MiraConfirmRequest) =>
      handler(req);
    ipcRenderer.on("mira:confirm-request", listener);
    return () => ipcRenderer.removeListener("mira:confirm-request", listener);
  },
  onChatEvent: (
    handler: (payload: { requestId: string; event: MiraChatEvent }) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      payload: { requestId: string; event: MiraChatEvent },
    ) => handler(payload);
    ipcRenderer.on("mira:chat-event", listener);
    return () => ipcRenderer.removeListener("mira:chat-event", listener);
  },
  onTerminalData: (
    handler: (payload: { sessionId: string; data: string }) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      payload: { sessionId: string; data: string },
    ) => handler(payload);
    ipcRenderer.on("mira:terminal-data", listener);
    return () => ipcRenderer.removeListener("mira:terminal-data", listener);
  },
  onTerminalExit: (
    handler: (payload: { sessionId: string; exitCode: number }) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      payload: { sessionId: string; exitCode: number },
    ) => handler(payload);
    ipcRenderer.on("mira:terminal-exit", listener);
    return () => ipcRenderer.removeListener("mira:terminal-exit", listener);
  },
  onUpdateEvent: (
    handler: (status: {
      channel: string;
      currentVersion: string;
      availableVersion: string | null;
      progress: number | null;
      detail: string;
      canCheck: boolean;
      canDownload: boolean;
      canInstall: boolean;
      packaged: boolean;
    }) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      status: {
        channel: string;
        currentVersion: string;
        availableVersion: string | null;
        progress: number | null;
        detail: string;
        canCheck: boolean;
        canDownload: boolean;
        canInstall: boolean;
        packaged: boolean;
      },
    ) => handler(status);
    ipcRenderer.on("mira:update-event", listener);
    return () => ipcRenderer.removeListener("mira:update-event", listener);
  },
});
