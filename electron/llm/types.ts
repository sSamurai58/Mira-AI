export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type StreamHandlers = {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
};

export type LlmAdapter = {
  id: string;
  model: string;
  testConnection: () => Promise<{ ok: boolean; detail: string }>;
  streamChat: (
    messages: ChatMessage[],
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ) => Promise<void>;
};
