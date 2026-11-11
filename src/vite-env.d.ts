/// <reference types="vite/client" />

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

type MiraPublicConfig = {
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



type MiraSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MiraUtterance = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type MiraMemoryHit = {
  utterance_id: string;
  session_id: string;
  session_title: string;
  role: string;
  content: string;
  created_at: string;
};

type MiraCatalogItem = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  tags: string[];
  enabled: boolean;
  body: string;
  filePath: string;
  relativePath: string;
};

type MiraConfirmRequest = {
  id: string;
  title: string;
  body: string;
  confirmLabel?: string;
};

type MiraChatEvent =
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

type MiraLibraryItem = {
  id: string;
  title: string;
  kind: string;
  source_path: string;
  status: string;
  media_type: string;
  extracted_text: string | null;
  analysis_json: string | null;
  skill_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type MiraLearnedUnit = {
  id: string;
  library_item_id: string;
  kind: string;
  title: string;
  content: string;
  source_ref: string;
  created_at: string;
};

type MiraVoiceProject = {
  id: string;
  name: string;
  lang: string;
  status: string;
  recommendation: string | null;
  llm_profile: string | null;
  custom_voice_id: string | null;
  created_at: string;
  updated_at: string;
};

type MiraVoicePhrase = {
  id: string;
  project_id: string;
  text: string;
  recorded: number;
  created_at: string;
};

type MiraVoiceClip = {
  id: string;
  project_id: string;
  phrase_id: string | null;
  file_path: string;
  qa_json: string | null;
  accepted: number;
  created_at: string;
};

type MiraCustomVoice = {
  id: string;
  project_id: string;
  name: string;
  lang: string;
  preview_path: string | null;
  meta_json: string | null;
  created_at: string;
  updated_at: string;
};

type MiraTerminalSession = {
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

type MiraHealth = {
  phase: string;
  ok: boolean;
  path: string;
  databasePath: string;
  sessions: number;
  utterances: number;
  browserVisits?: number;
  llm?: MiraPublicConfig;
  llmOk?: boolean;
  llmReason?: string | null;
  skills?: number;
  protocols?: number;
  web?: {
    enabled: boolean;
    allowlist: string[];
    requireConfirmForFetch: boolean;
  };
  screen?: {
    enabled: boolean;
    controlEnabled: boolean;
    osPriority: string;
  };
  browser?: {
    enabled: boolean;
    preferred: string;
    requireConfirmOpen: boolean;
  };
  messaging?: {
    enabled: boolean;
    primary: string;
    telegramConfigured: boolean;
    requireConfirm: boolean;
    mode: "live" | "dry-run";
    stubs: Array<{ provider: string; status: string }>;
  };
  messengerContacts?: number;
  messengerMessages?: number;
  terminal?: {
    enabled: boolean;
    requireConfirmDangerous: boolean;
    prefs: {
      shell: string;
      fontSize: number;
      scrollback: number;
      defaultCwd: string;
    };
  };
  terminalSessions?: number;
  libraryItems?: number;
  learnedUnits?: number;
  voiceProjects?: number;
  customVoices?: number;
  blender?: {
    enabled: boolean;
    binaryPath: string | null;
    found: boolean;
    mode: "live" | "dry-run";
    requireConfirm: boolean;
    outputDir: string;
  };
};

type MiraUpdateStatus = {
  channel:
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error"
    | string;
  currentVersion: string;
  availableVersion: string | null;
  progress: number | null;
  detail: string;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
  packaged: boolean;
};

interface MiraBridge {
  getHealth: () => Promise<MiraHealth>;
  getConfig: () => Promise<MiraPublicConfig>;
  getSettingsEnv: () => Promise<{
    values: Record<string, string>;
    secretsSet: Record<string, boolean>;
    envFile: string;
    exists: boolean;
  }>;
  setSettingsEnv: (
    patch: Record<string, string>,
  ) => Promise<{
    ok: boolean;
    detail: string;
    values: Record<string, string>;
    secretsSet: Record<string, boolean>;
  }>;
  listSessions: () => Promise<MiraSession[]>;
  createSession: (title?: string) => Promise<MiraSession>;
  getSession: (
    sessionId: string,
  ) => Promise<{ session: MiraSession; utterances: MiraUtterance[] } | null>;
  searchMemory: (query: string) => Promise<MiraMemoryHit[]>;
  testLlm: () => Promise<{ ok: boolean; detail: string }>;
  sendChat: (payload: {
    sessionId?: string | null;
    text: string;
    requestId: string;
    forceProtocolId?: string | null;
  }) => Promise<{
    ok: boolean;
    sessionId?: string;
    error?: string;
    requestId: string;
  }>;
  abortChat: (requestId: string) => Promise<{ ok: boolean }>;
  listSkills: () => Promise<MiraCatalogItem[]>;
  listProtocols: () => Promise<MiraCatalogItem[]>;
  setSkillEnabled: (
    id: string,
    enabled: boolean,
  ) => Promise<MiraCatalogItem | null>;
  setProtocolEnabled: (
    id: string,
    enabled: boolean,
  ) => Promise<MiraCatalogItem | null>;
  saveProtocol: (item: {
    id: string;
    name: string;
    description: string;
    triggers: string[];
    tags?: string[];
    enabled: boolean;
    body: string;
  }) => Promise<MiraCatalogItem>;
  saveSkill: (item: {
    id: string;
    name: string;
    description: string;
    triggers: string[];
    tags?: string[];
    enabled: boolean;
    body: string;
  }) => Promise<MiraCatalogItem>;
  getWebPolicy: () => Promise<{
    enabled: boolean;
    allowlist: string[];
    requireConfirmForFetch: boolean;
  }>;
  getScreenPolicy: () => Promise<{
    enabled: boolean;
    controlEnabled: boolean;
    osPriority: string;
  }>;
  getBrowserPolicy: () => Promise<{
    enabled: boolean;
    preferred: string;
    requireConfirmOpen: boolean;
    installed: Array<{
      id: string;
      name: string;
      path: string | null;
      installed: boolean;
    }>;
  }>;
  listInstalledBrowsers: () => Promise<
    Array<{
      id: string;
      name: string;
      path: string | null;
      installed: boolean;
    }>
  >;
  testWeb: (
    query?: string,
  ) => Promise<{ ok: boolean; detail: string; hits: unknown[] }>;
  testScreen: () => Promise<{
    ok: boolean;
    detail: string;
    path: string | null;
  }>;
  testBrowserOpen: (
    url?: string,
  ) => Promise<{ ok: boolean; detail: string; url: string | null }>;
  searchBrowserHistory: (
    query?: string,
  ) => Promise<
    Array<{
      id: string;
      url: string;
      title: string;
      source: string;
      visited_at: string;
    }>
  >;
  getMessagingPolicy: () => Promise<{
    enabled: boolean;
    primary: string;
    telegramConfigured: boolean;
    requireConfirm: boolean;
    mode: "live" | "dry-run";
    stubs: Array<{ provider: string; status: string }>;
  }>;
  getMessagingStatus: () => Promise<{
    policy: {
      enabled: boolean;
      primary: string;
      telegramConfigured: boolean;
      requireConfirm: boolean;
      mode: "live" | "dry-run";
      stubs: Array<{ provider: string; status: string }>;
    };
    contacts: Array<{
      id: string;
      provider: string;
      display_name: string;
      handle: string;
      chat_id: string;
      enabled: number;
      created_at: string;
    }>;
    recent: Array<{
      id: string;
      provider: string;
      contact_id: string | null;
      chat_id: string;
      direction: string;
      body: string;
      status: string;
      external_id: string | null;
      created_at: string;
    }>;
  }>;
  listMessengerContacts: (provider?: string) => Promise<
    Array<{
      id: string;
      provider: string;
      display_name: string;
      handle: string;
      chat_id: string;
      enabled: number;
      created_at: string;
    }>
  >;
  listMessengerMessages: (limit?: number) => Promise<
    Array<{
      id: string;
      provider: string;
      contact_id: string | null;
      chat_id: string;
      direction: string;
      body: string;
      status: string;
      external_id: string | null;
      created_at: string;
    }>
  >;
  upsertMessengerContact: (item: {
    id?: string;
    provider: string;
    displayName: string;
    handle: string;
    chatId: string;
    enabled?: boolean;
  }) => Promise<{
    id: string;
    provider: string;
    display_name: string;
    handle: string;
    chat_id: string;
    enabled: number;
    created_at: string;
  }>;
  testMessagingSend: (payload?: {
    text?: string;
    recipient?: string;
    body?: string;
  }) => Promise<{ ok: boolean; detail: string; result: unknown }>;
  getTerminalPolicy: () => Promise<{
    enabled: boolean;
    requireConfirmDangerous: boolean;
    prefs: {
      shell: string;
      fontSize: number;
      scrollback: number;
      defaultCwd: string;
    };
  }>;
  getTerminalPrefs: () => Promise<{
    shell: string;
    fontSize: number;
    scrollback: number;
    defaultCwd: string;
  }>;
  listTerminalSessions: () => Promise<MiraTerminalSession[]>;
  createTerminalSession: (opts?: {
    title?: string;
    cwd?: string;
    cols?: number;
    rows?: number;
  }) => Promise<MiraTerminalSession>;
  ensureTerminal: () => Promise<MiraTerminalSession>;
  getTerminalSession: (id: string) => Promise<MiraTerminalSession | null>;
  writeTerminal: (id: string, data: string) => Promise<boolean>;
  resizeTerminal: (
    id: string,
    cols: number,
    rows: number,
  ) => Promise<boolean>;
  killTerminal: (id: string) => Promise<boolean>;
  clearTerminal: (id: string) => Promise<string>;
  getTerminalHistory: (id: string) => Promise<string>;
  setTerminalCwd: (id: string, cwd: string) => Promise<MiraTerminalSession>;
  runTerminalCommand: (
    command: string,
    sessionId?: string | null,
  ) => Promise<{
    ok: boolean;
    dangerous: boolean;
    sessionId: string | null;
    output: string;
    backend: string | null;
    detail?: string;
  }>;
  respondConfirm: (
    id: string,
    accepted: boolean,
  ) => Promise<{ ok: boolean }>;
  onConfirmRequest: (handler: (req: MiraConfirmRequest) => void) => () => void;
  onChatEvent: (
    handler: (payload: { requestId: string; event: MiraChatEvent }) => void,
  ) => () => void;
  onTerminalData: (
    handler: (payload: { sessionId: string; data: string }) => void,
  ) => () => void;
  onTerminalExit: (
    handler: (payload: { sessionId: string; exitCode: number }) => void,
  ) => () => void;
  getUpdateStatus: () => Promise<MiraUpdateStatus>;
  checkForUpdates: () => Promise<MiraUpdateStatus>;
  downloadUpdate: () => Promise<MiraUpdateStatus>;
  quitAndInstall: () => Promise<{ ok: boolean; detail: string }>;
  onUpdateEvent: (handler: (status: MiraUpdateStatus) => void) => () => void;
  listLibraryItems: () => Promise<MiraLibraryItem[]>;
  getLibraryItem: (id: string) => Promise<MiraLibraryItem | null>;
  getLibrarySnapshot: () => Promise<{
    items: MiraLibraryItem[];
    learned: MiraLearnedUnit[];
  }>;
  importLibraryFile: (
    filePath: string,
    title?: string,
  ) => Promise<MiraLibraryItem>;
  importLibraryText: (payload: {
    title: string;
    text: string;
    fileName?: string;
  }) => Promise<MiraLibraryItem>;
  processLibraryItem: (id: string) => Promise<{
    item: MiraLibraryItem;
    analysis: unknown;
    plan: string[];
    units: MiraLearnedUnit[];
  }>;
  proposeLibrarySkill: (
    id: string,
  ) => Promise<{ ok: boolean; detail: string; skillId: string | null }>;
  listLearnedUnits: (libraryItemId?: string) => Promise<MiraLearnedUnit[]>;
  searchLearnedUnits: (query?: string) => Promise<MiraLearnedUnit[]>;
  getLearnPlan: (
    libraryItemId: string,
  ) => Promise<{
    id: string;
    library_item_id: string;
    steps_json: string;
    created_at: string;
    updated_at: string;
  } | null>;
  voiceStudioSnapshot: (projectId?: string) => Promise<{
    projects: MiraVoiceProject[];
    project: MiraVoiceProject | null;
    phrases: MiraVoicePhrase[];
    clips: MiraVoiceClip[];
    customVoices: MiraCustomVoice[];
  }>;
  listVoiceProjects: () => Promise<MiraVoiceProject[]>;
  listCustomVoices: () => Promise<MiraCustomVoice[]>;
  createVoiceProject: (payload?: {
    name?: string;
    lang?: string;
  }) => Promise<MiraVoiceProject>;
  updateVoiceProject: (payload: {
    id: string;
    name?: string;
    lang?: string;
  }) => Promise<MiraVoiceProject>;
  deleteVoiceProject: (id: string) => Promise<{
    ok: boolean;
    detail: string;
    clearedVoiceId: string | null;
  }>;
  updateCustomVoice: (payload: {
    id: string;
    name?: string;
    lang?: string;
  }) => Promise<MiraCustomVoice>;
  deleteCustomVoice: (id: string) => Promise<{
    ok: boolean;
    detail: string;
    clearedVoiceId: string | null;
  }>;
  addVoicePhrase: (
    projectId: string,
    text: string,
  ) => Promise<MiraVoicePhrase>;
  trainVoiceModel: (projectId: string) => Promise<{
    project: MiraVoiceProject;
    analysis: unknown[];
    voice: MiraCustomVoice | null;
    report: {
      ok: boolean;
      stage: string;
      phraseCount: number;
      acceptedClips: number;
      linkedAccepted: number;
      coveragePct: number;
      detail: string;
    };
  }>;
  generateVoicePhrases: (
    projectId: string,
    count?: number,
  ) => Promise<MiraVoicePhrase[]>;
  importVoiceClip: (payload: {
    projectId: string;
    sourcePath: string;
    phraseId?: string | null;
  }) => Promise<{
    clip: MiraVoiceClip;
    processed: {
      project: MiraVoiceProject;
      analysis: unknown[];
      voice: MiraCustomVoice | null;
    };
  }>;
  importVoiceClipBytes: (payload: {
    projectId: string;
    bytes: number[] | Uint8Array;
    fileName: string;
    phraseId?: string | null;
  }) => Promise<{
    clip: MiraVoiceClip;
    processed: {
      project: MiraVoiceProject;
      analysis: unknown[];
      voice: MiraCustomVoice | null;
    };
  }>;
  readVoicePreview: (filePath: string) => Promise<string>;
  getBlenderPolicy: () => Promise<{
    enabled: boolean;
    binaryPath: string | null;
    found: boolean;
    mode: "live" | "dry-run";
    requireConfirm: boolean;
    outputDir: string;
  }>;
  testBlenderDemo: () => Promise<{
    ok: boolean;
    detail: string;
    mode: string;
    scriptPath: string | null;
    outputBlend: string | null;
  }>;
  runDoctor: () => Promise<{
    ok: boolean;
    phase: string;
    generatedAt: string;
    summary: string;
    text: string;
    recentErrors?: Array<{
      created_at: string;
      category: string;
      message: string;
    }>;
    findings: Array<{
      id: string;
      area: string;
      ok: boolean;
      title: string;
      detail: string;
      fix?: string;
      severity?: string;
    }>;
  }>;
  listAppLogs: (opts?: {
    limit?: number;
    category?: string;
    level?: "info" | "warn" | "error" | "debug";
  }) => Promise<
    Array<{
      id: string;
      level: string;
      category: string;
      message: string;
      meta_json: string | null;
      created_at: string;
    }>
  >;
  getLoggingStatus: () => Promise<{
    dir: string;
    files: string[];
    dbCount: number;
    latestFile: string | null;
  }>;
  readLogFile: (fileName: string, maxLines?: number) => Promise<string>;
  clearAppLogs: () => Promise<{ ok: boolean; deleted: number }>;
  getBackupStatus: () => Promise<{
    databasePath: string;
    libraryDir: string;
    voiceStudioDir: string;
    backupsDir: string;
    packages: string[];
    health: {
      sessions: number;
      utterances: number;
      libraryItems: number;
      learnedUnits: number;
    };
  }>;
  exportBackup: (opts?: {
    includeSecrets?: boolean;
  }) => Promise<{
    ok: boolean;
    packagePath: string;
    manifest: {
      format: string;
      createdAt: string;
      includeSecrets: boolean;
      parts: string[];
      dbFile: string;
      note: string;
    };
    detail: string;
  }>;
  importBackup: (packagePath: string) => Promise<{
    ok: boolean;
    detail: string;
    packagePath: string;
  }>;
  forgetData: (
    scope: "memory" | "learned" | "library" | "voice-studio" | "all",
  ) => Promise<{
    ok: boolean;
    scope: string;
    detail: string;
    deleted: Record<string, number>;
  }>;
  getConfirmPolicy: () => Promise<{
    mode: "always" | "smart" | "dangerous-list";
    dangerousList: string[];
  }>;
  setConfirmPolicy: (payload: {
    mode?: "always" | "smart" | "dangerous-list";
    dangerousList?: string[];
  }) => Promise<{
    mode: "always" | "smart" | "dangerous-list";
    dangerousList: string[];
  }>;
  listNotes: (limit?: number) => Promise<
    Array<{
      id: string;
      title: string;
      body: string;
      tags: string | null;
      session_id: string | null;
      created_at: string;
      updated_at: string;
    }>
  >;
  searchNotes: (query?: string) => Promise<
    Array<{
      id: string;
      title: string;
      body: string;
      tags: string | null;
      session_id: string | null;
      created_at: string;
      updated_at: string;
    }>
  >;
  upsertNote: (payload: {
    id?: string;
    title: string;
    body: string;
    tags?: string;
    sessionId?: string | null;
  }) => Promise<{
    id: string;
    title: string;
    body: string;
    tags: string | null;
    session_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  listCalendarEvents: () => Promise<unknown[]>;
  listTimers: () => Promise<unknown[]>;
  createCalendarEvent: (payload: {
    title: string;
    startsAt: string;
    endsAt?: string | null;
    remindAt?: string | null;
  }) => Promise<unknown>;
  startTimer: (label: string, seconds: number) => Promise<unknown>;
  cancelTimer: (id?: string) => Promise<unknown>;
  listCameras: () => Promise<unknown[]>;
  upsertCamera: (payload: {
    id?: string;
    name: string;
    url: string;
    enabled?: boolean;
  }) => Promise<unknown>;
  listIotDevices: () => Promise<unknown[]>;
  getMailPolicy: () => Promise<{
    enabled: boolean;
    mode: string;
    account: string | null;
  }>;
  listMail: (folder?: string) => Promise<unknown[]>;
  getMediaStatus: () => Promise<unknown>;
  searchFiles: (query?: string) => Promise<string[]>;
  listProfiles: () => Promise<
    Array<{
      id: string;
      name: string;
      voiceId: string | null;
      llmProvider: string | null;
      llmModel: string | null;
      locale: "ru" | "en";
      notes: string;
      createdAt: string;
      updatedAt: string;
    }>
  >;
  getProfilesSnapshot: () => Promise<{
    activeId: string;
    profiles: unknown[];
    path: string;
    secretsNote: string;
  }>;
  getActiveProfile: () => Promise<{
    id: string;
    name: string;
    voiceId: string | null;
    llmProvider: string | null;
    llmModel: string | null;
    locale: "ru" | "en";
    notes: string;
    createdAt: string;
    updatedAt: string;
  }>;
  setActiveProfile: (id: string) => Promise<unknown>;
  upsertProfile: (payload: {
    id?: string;
    name: string;
    voiceId?: string | null;
    llmProvider?: string | null;
    llmModel?: string | null;
    locale?: "ru" | "en";
    notes?: string;
  }) => Promise<unknown>;
  deleteProfile: (id: string) => Promise<{ ok: boolean; detail: string }>;
  getHudPolicy: () => Promise<{
    enabled: boolean;
    alwaysOnTop: boolean;
    open: boolean;
  }>;
  toggleHud: () => Promise<{ open: boolean }>;
}


interface Window {
  mira?: MiraBridge;
}
