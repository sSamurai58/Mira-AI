/// <reference types="vite/client" />

/** Injected from package.json by Vite `define` in vite.config.ts */
declare const __MIRA_VERSION__: string;

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
  hasElevenLabsKey?: boolean;
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
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
  updatedAt?: string;
  /** How the skill is stored on disk. */
  layout?: "file" | "folder";
  /** Parent path under data/skills for folder skills (includes leaf). */
  folder?: string;
};

type MiraConfirmSkillPropose = {
  defaultId: string;
  defaultName: string;
  summary: string;
  existingIds: string[];
  sourceTitle: string;
};

type MiraConfirmRequest = {
  id: string;
  title: string;
  body: string;
  confirmLabel?: string;
  skillPropose?: MiraConfirmSkillPropose;
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
  releasesUrl?: string;
};

type MiraSystemLoad = {
  cpu: number;
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
  gpu: number | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  gpuSource: "nvidia-smi" | "windows-counter" | "drm" | "none";
  ts: number;
};

interface MiraBridge {
  getHealth: () => Promise<MiraHealth>;
  getSystemLoad: () => Promise<MiraSystemLoad>;
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
  forgetMemoryTopic?: (topic: string) => Promise<{
    ok: boolean;
    detail: string;
    deletedUtterances: number;
    deletedSessions: number;
    topic: string;
  }>;
  testLlm: () => Promise<{ ok: boolean; detail: string }>;
  translateAi: (payload: {
    text: string;
    source: string;
    target: string;
  }) => Promise<{
    ok: boolean;
    text: string;
    provider?: string;
    error?: string;
  }>;
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
  }) => Promise<{
    ok: boolean;
    sessionId?: string;
    error?: string;
    requestId: string;
  }>;
  abortChat: (requestId: string) => Promise<{ ok: boolean }>;
  listSkills: () => Promise<MiraCatalogItem[]>;
  listSkillFolders?: () => Promise<string[]>;
  createSkillFolder?: (
    folderPath: string,
  ) => Promise<{ ok: boolean; detail: string; folder: string | null }>;
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
    parentFolder?: string;
    asFolder?: boolean;
  }) => Promise<MiraCatalogItem>;
  deleteSkill: (
    id: string,
  ) => Promise<{ ok: boolean; detail: string; deletedId: string | null }>;
  deleteProtocol: (
    id: string,
  ) => Promise<{ ok: boolean; detail: string; deletedId: string | null }>;
  importSkill: (
    sourcePath: string,
    opts?: { catalogName?: string },
  ) => Promise<{
    ok: boolean;
    detail: string;
    imported: MiraCatalogItem[];
  }>;
  runProtocolSequence: (
    id: string,
    opts?: { dryRun?: boolean },
  ) => Promise<{
    ok: boolean;
    mode: "sequence" | "llm";
    detail: string;
    reply: string;
    stepDetails: string[];
  }>;
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
    fields?: { skillId?: string; skillName?: string },
  ) => Promise<{ ok: boolean }>;
  onConfirmRequest: (handler: (req: MiraConfirmRequest) => void) => () => void;
  onConfirmDismiss: (
    handler: (payload: { id: string }) => void,
  ) => () => void;
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
  openReleasesPage: () => Promise<{ ok: boolean; detail: string }>;
  onUpdateEvent: (handler: (status: MiraUpdateStatus) => void) => () => void;
  /** Hide the always-on-top update HUD window (session dismiss). */
  dismissUpdateHud?: (key?: string | null) => Promise<{ ok: boolean }>;
  getNotifyPrefs: () => Promise<Record<string, unknown>>;
  setNotifyPrefs: (
    patch: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  addNotifySound: (payload: {
    name: string;
    bytes: number[] | Uint8Array;
    fileName: string;
    mime?: string;
  }) => Promise<
    | {
        ok: true;
        prefs: Record<string, unknown>;
        sound: { id: string; name: string; fileName?: string; mime?: string };
      }
    | { ok: false; detail: string }
  >;
  renameNotifySound: (
    id: string,
    name: string,
  ) => Promise<
    | { ok: true; prefs: Record<string, unknown> }
    | { ok: false; detail: string }
  >;
  deleteNotifySound: (
    id: string,
  ) => Promise<
    | { ok: true; prefs: Record<string, unknown> }
    | { ok: false; detail: string }
  >;
  getNotifySoundData: (
    id: string,
  ) => Promise<
    | { ok: true; base64: string; mime: string; name: string }
    | { ok: false; detail: string }
  >;
  testOsNotification: (payload?: {
    title?: string;
    body?: string;
  }) => Promise<{ ok: boolean; detail: string }>;
  onNotifyPrefs: (
    handler: (prefs: Record<string, unknown>) => void,
  ) => () => void;
  onCalendarToast?: (
    handler: (payload: {
      kind: string;
      title: string;
      body: string;
      id: string;
    }) => void,
  ) => () => void;
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
  importLibraryBytes: (payload: {
    bytes: number[] | Uint8Array;
    fileName: string;
    title?: string;
    extractedText?: string;
  }) => Promise<MiraLibraryItem>;
  processLibraryItem: (id: string) => Promise<{
    item: MiraLibraryItem;
    analysis: unknown;
    plan: string[];
    units: MiraLearnedUnit[];
  }>;
  deleteLibraryItem: (
    id: string,
  ) => Promise<{ ok: boolean; detail: string; deletedId: string | null }>;
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
  getCustomVoiceCorpus: (voiceId: string) => Promise<{
    voice: MiraCustomVoice;
    units: Array<{
      phraseId: string;
      text: string;
      filePath: string;
      startFrac?: number;
      endFrac?: number;
    }>;
  }>;
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
  deleteVoicePhrase: (phraseId: string) => Promise<{
    ok: boolean;
    detail: string;
    deletedId: string | null;
  }>;
  resetVoicePhraseAudio: (phraseId: string) => Promise<{
    ok: boolean;
    detail: string;
    phraseId: string | null;
    projectId: string | null;
    deletedClips: number;
    needsRebuild: boolean;
  }>;
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
      steps?: Array<{ step: string; label: string; pct: number }>;
      packPath?: string | null;
      wordUnitCount?: number;
      fragmentUnitCount?: number;
      lexiconSize?: number;
      audioLexiconSize?: number;
      provisionalLexiconSize?: number;
      epochs?: number;
      trainSteps?: number;
      initialLoss?: number;
      finalLoss?: number;
      melTargets?: number;
      curriculum?: Array<{
        concept: string;
        neural: string;
        mira: string;
        status: string;
        title?: string;
        meaning?: string;
        miraPlain?: string;
        group?: string;
      }>;
      griffinLimPreview?: string | null;
      neuralPreview?: string | null;
      method?: string;
      neuralTts?: boolean;
      teacherForceFinal?: number;
      vocoderSteps?: number;
      cudaAvailable?: boolean;
      accelDetail?: string;
      weightsPath?: string;
    };
    pack?: unknown;
  }>;
  getVoicePreferenceCandidates: (voiceId: string) => Promise<{
    voiceId: string;
    packDir: string | null;
    aPath: string | null;
    bPath: string | null;
    labelA: string;
    labelB: string;
    sampleText: string;
    preferences: {
      version: number;
      pairs: Array<{
        id: string;
        text: string;
        preferred: "a" | "b";
        createdAt: string;
        lossBefore?: number;
        lossAfter?: number;
      }>;
      updatesApplied: number;
    };
  }>;
  submitVoicePreference: (payload: {
    voiceId: string;
    preferred: "a" | "b";
    text?: string;
  }) => Promise<{
    ok: boolean;
    detail: string;
    unitPriorsUpdated: number;
    lossBefore: number;
    lossAfter: number;
  }>;
  synthesizeCustomVoiceNeural: (
    voiceId: string,
    text: string,
    prosody?: {
      speed?: number;
      pauseScale?: number;
      energy?: number;
      quality?: "fast" | "balanced" | "studio";
    },
  ) => Promise<{
    ok: boolean;
    wavPath: string | null;
    detail: string;
    frameCount?: number;
    durationMs?: number;
    method?: string;
    cached?: boolean;
  }>;
  warmupCustomVoiceNeural: (voiceId: string) => Promise<{
    ok: boolean;
    detail: string;
    hasWeights: boolean;
  }>;
  getElevenLabsStatus?: (probe?: boolean) => Promise<{
    hasKey: boolean;
    voiceId: string;
    modelId: string;
    connected: boolean;
    detail: string;
    subscription?: string | null;
    characterCount?: number | null;
    characterLimit?: number | null;
    voiceSettings?: {
      stability: number;
      similarityBoost: number;
      style: number;
      useSpeakerBoost: boolean;
    };
  }>;
  synthesizeElevenLabs?: (payload: {
    text: string;
    voiceId?: string;
    modelId?: string;
    stream?: boolean;
    voiceSettings?: {
      stability?: number;
      similarityBoost?: number;
      style?: number;
      useSpeakerBoost?: boolean;
    };
  }) => Promise<{
    ok: boolean;
    detail: string;
    mimeType?: string;
    audioBase64?: string;
    dataUrl?: string;
    tempPath?: string | null;
    bytes?: number;
    modelId?: string;
    voiceId?: string;
  }>;
  listElevenLabsModels?: () => Promise<
    Array<{ id: string; label: string; detail: string }>
  >;
  listElevenLabsVoices?: () => Promise<{
    ok: boolean;
    detail: string;
    voices: Array<{
      voiceId: string;
      name: string;
      category: string;
      previewUrl: string | null;
      labels: Record<string, string>;
    }>;
  }>;
  cloneElevenLabsVoice?: (payload: {
    name: string;
    description?: string;
    filePaths: string[];
  }) => Promise<{ ok: boolean; detail: string; voiceId?: string }>;
  mcpRuntimeList?: () => Promise<
    Record<
      string,
      {
        connectorId: string;
        state: string;
        detail: string;
        transport: string;
        tools: string[];
        lastCheckedAt: string;
        live: boolean;
      }
    >
  >;
  mcpRuntimeStatus?: (
    connectorId?: string,
  ) => Promise<
    Array<{
      connectorId: string;
      state: string;
      detail: string;
      transport: string;
      tools: string[];
      lastCheckedAt: string;
      live: boolean;
    }>
  >;
  mcpConnect?: (payload: {
    connectorId: string;
    command?: string;
    args?: string[];
    url?: string;
    fields?: Record<string, string>;
    auth?: "oauth" | "api-key" | "local" | "bridge";
  }) => Promise<{
    connectorId: string;
    state: string;
    detail: string;
    transport: string;
    tools: string[];
    lastCheckedAt: string;
    live: boolean;
  }>;
  mcpDisconnect?: (connectorId: string) => Promise<{
    connectorId: string;
    state: string;
    detail: string;
    transport: string;
    tools: string[];
    lastCheckedAt: string;
    live: boolean;
  }>;
  onVoiceTrainProgress?: (
    handler: (payload: {
      projectId: string;
      step: string;
      pct: number;
      label: string;
      detail?: string;
      epoch?: number;
      epochs?: number;
      loss?: number;
      melL1?: number;
    }) => void,
  ) => () => void;
  generateVoicePhrases: (
    projectId: string,
    countOrOpts?:
      | number
      | { count?: number; minWords?: number; maxWords?: number },
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
  listUpcomingReminders: (horizonHours?: number) => Promise<unknown[]>;
  listStopwatches: () => Promise<unknown[]>;
  getActiveStopwatch: () => Promise<unknown | null>;
  startStopwatch: (label?: string) => Promise<unknown>;
  pauseStopwatch: (id?: string) => Promise<unknown | null>;
  resetStopwatch: (id?: string) => Promise<unknown | null>;
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
  listAppPaths: () => Promise<
    Array<{
      id: string;
      kind: "program" | "folder" | "file";
      name: string;
      path: string;
      tags: string[];
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>
  >;
  upsertAppPath: (payload: {
    id?: string;
    kind: "program" | "folder" | "file";
    name: string;
    path?: string;
    tags?: string[];
    enabled?: boolean;
  }) => Promise<{
    id: string;
    kind: "program" | "folder" | "file";
    name: string;
    path: string;
    tags: string[];
    enabled: boolean;
    created_at: string;
    updated_at: string;
  }>;
  deleteAppPath: (id: string) => Promise<{ ok: boolean }>;
  setAppPathEnabled: (
    id: string,
    enabled: boolean,
  ) => Promise<{
    id: string;
    kind: "program" | "folder" | "file";
    name: string;
    path: string;
    tags: string[];
    enabled: boolean;
    created_at: string;
    updated_at: string;
  } | null>;
  autodiscoverAppPaths: () => Promise<{
    scanned: number;
    updated: number;
    created: number;
    paths: Array<{
      id: string;
      kind: "program" | "folder" | "file";
      name: string;
      path: string;
      tags: string[];
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>;
  }>;
  openAppPath: (id: string) => Promise<{
    ok: boolean;
    detail: string;
    path?: {
      id: string;
      kind: "program" | "folder" | "file";
      name: string;
      path: string;
      tags: string[];
      enabled: boolean;
      created_at: string;
      updated_at: string;
    };
  }>;
  pickAppPath: (
    kind?: "program" | "folder" | "file",
  ) => Promise<{ canceled: boolean; path: string | null }>;
  listCustomCommands: () => Promise<
    Array<{
      id: string;
      name: string;
      phrases: string[];
      steps: Array<{
        id: string;
        type: "open_url" | "launch" | "open_path" | "open_folder" | "keys" | "type" | "click" | "clipboard_copy" | "clipboard_paste" | "pause" | "say" | "notify" | "hud_say" | "window_minimize" | "window_minimize_all" | "window_close" | "window_snap" | "desktop_new" | "desktop_close" | "desktop_switch" | "terminal";
        value: string;
      }>;
      reply: string;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>
  >;
  upsertCustomCommand: (payload: {
    id?: string;
    name: string;
    phrases?: string[];
    steps?: Array<{
      id: string;
      type: "open_url" | "launch" | "open_path" | "open_folder" | "keys" | "type" | "click" | "clipboard_copy" | "clipboard_paste" | "pause" | "say" | "notify" | "hud_say" | "window_minimize" | "window_minimize_all" | "window_close" | "window_snap" | "desktop_new" | "desktop_close" | "desktop_switch" | "terminal";
      value: string;
    }>;
    reply?: string;
    enabled?: boolean;
  }) => Promise<{
    id: string;
    name: string;
    phrases: string[];
    steps: Array<{
      id: string;
      type: "open_url" | "launch" | "open_path" | "open_folder" | "keys" | "type" | "click" | "clipboard_copy" | "clipboard_paste" | "pause" | "say" | "notify" | "hud_say" | "window_minimize" | "window_minimize_all" | "window_close" | "window_snap" | "desktop_new" | "desktop_close" | "desktop_switch" | "terminal";
      value: string;
    }>;
    reply: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  }>;
  deleteCustomCommand: (id: string) => Promise<{ ok: boolean }>;
  setCustomCommandEnabled: (
    id: string,
    enabled: boolean,
  ) => Promise<{
    id: string;
    name: string;
    phrases: string[];
    steps: Array<{
      id: string;
      type: "open_url" | "launch" | "open_path" | "open_folder" | "keys" | "type" | "click" | "clipboard_copy" | "clipboard_paste" | "pause" | "say" | "notify" | "hud_say" | "window_minimize" | "window_minimize_all" | "window_close" | "window_snap" | "desktop_new" | "desktop_close" | "desktop_switch" | "terminal";
      value: string;
    }>;
    reply: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  } | null>;
  runCustomCommand: (
    id: string,
    opts?: { dryRun?: boolean },
  ) => Promise<{
    ok: boolean;
    command?: {
      id: string;
      name: string;
      phrases: string[];
      steps: Array<{
        id: string;
        type: "open_url" | "launch" | "open_path" | "open_folder" | "keys" | "type" | "click" | "clipboard_copy" | "clipboard_paste" | "pause" | "say" | "notify" | "hud_say" | "window_minimize" | "window_minimize_all" | "window_close" | "window_snap" | "desktop_new" | "desktop_close" | "desktop_switch" | "terminal";
        value: string;
      }>;
      reply: string;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    };
    steps?: Array<{
      index: number;
      type: "open_url" | "launch" | "open_path" | "open_folder" | "keys" | "type" | "click" | "clipboard_copy" | "clipboard_paste" | "pause" | "say" | "notify" | "hud_say" | "window_minimize" | "window_minimize_all" | "window_close" | "window_snap" | "desktop_new" | "desktop_close" | "desktop_switch" | "terminal";
      value: string;
      ok: boolean;
      detail: string;
    }>;
    spoken?: string[];
    reply?: string;
    detail: string;
    dryRun?: boolean;
  }>;
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
  getHudPrefs: () => Promise<Record<string, unknown>>;
  getHudWidgetMeta: () => Promise<
    Array<{ id: string; label: string; hint: string }>
  >;
  setHudPrefs: (
    patch: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  resizeHud: (height?: number) => Promise<{ ok: boolean }>;
  hudSay: (text: string) => Promise<{ ok: boolean; text: string | null }>;
  getHudMessage: () => Promise<{ text: string | null }>;
  onHudPrefs: (
    handler: (prefs: Record<string, unknown>) => void,
  ) => () => void;
  onHudTick: (
    handler: (payload: { reason?: string }) => void,
  ) => () => void;
  windowMinimize: () => Promise<{ ok: boolean }>;
  windowMaximizeToggle: () => Promise<{
    ok: boolean;
    maximized?: boolean;
    fullscreen?: boolean;
  }>;
  windowFullscreenToggle: () => Promise<{
    ok: boolean;
    fullscreen?: boolean;
  }>;
  windowSetFullscreen: (
    enabled: boolean,
  ) => Promise<{ ok: boolean; fullscreen?: boolean }>;
  windowClose: () => Promise<{ ok: boolean }>;
  windowGetState: () => Promise<{
    maximized: boolean;
    fullscreen: boolean;
    focused: boolean;
  }>;
  windowSetChrome: (payload: {
    backgroundColor?: string;
  }) => Promise<{ ok: boolean }>;
  onWindowState: (
    handler: (state: {
      maximized: boolean;
      fullscreen: boolean;
      focused: boolean;
    }) => void,
  ) => () => void;
}


interface Window {
  mira?: MiraBridge;
}
