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

type MiraChatEvent =
  | { type: "user"; utterance: MiraUtterance }
  | { type: "assistant_start"; sessionId: string }
  | { type: "token"; text: string }
  | {
      type: "assistant_done";
      utterance: MiraUtterance;
      memoryUsed: MiraMemoryHit[];
    }
  | { type: "error"; message: string };

type MiraHealth = {
  phase: string;
  ok: boolean;
  path: string;
  databasePath: string;
  sessions: number;
  utterances: number;
  llm?: MiraPublicConfig;
  llmOk?: boolean;
  llmReason?: string | null;
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
  }) => Promise<{
    ok: boolean;
    sessionId?: string;
    error?: string;
    requestId: string;
  }>;
  abortChat: (requestId: string) => Promise<{ ok: boolean }>;
  onChatEvent: (
    handler: (payload: { requestId: string; event: MiraChatEvent }) => void,
  ) => () => void;
}

interface Window {
  mira?: MiraBridge;
}
