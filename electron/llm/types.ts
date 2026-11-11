export type ChatRole = "system" | "user" | "assistant";

export type ChatImagePart = {
  mimeType: string;
  dataBase64: string;
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** Optional inline images for vision-capable providers. */
  images?: ChatImagePart[];
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
