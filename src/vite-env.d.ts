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
  llmProvider: "openai" | "mock";
  llmModel: string;
  hasOpenAiKey: boolean;
  openaiBaseUrl: string;
  databasePath: string;
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
    }
  | { type: "error"; message: string };

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
};

interface MiraBridge {
  getHealth: () => Promise<MiraHealth>;
  getConfig: () => Promise<MiraPublicConfig>;
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
  }>;
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
}

interface Window {
  mira?: MiraBridge;
}
