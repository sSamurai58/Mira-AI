import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

export type MiraPublicConfig = {
  llmProvider: "openai" | "mock";
  llmModel: string;
  hasOpenAiKey: boolean;
  openaiBaseUrl: string;
  databasePath: string;
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

export type MiraChatEvent =
  | { type: "user"; utterance: MiraUtterance }
  | { type: "assistant_start"; sessionId: string }
  | { type: "token"; text: string }
  | {
      type: "assistant_done";
      utterance: MiraUtterance;
      memoryUsed: MiraMemoryHit[];
    }
  | { type: "error"; message: string };

contextBridge.exposeInMainWorld("mira", {
  getHealth: () => ipcRenderer.invoke("mira:get-health"),
  getConfig: (): Promise<MiraPublicConfig> =>
    ipcRenderer.invoke("mira:get-config"),
  listSessions: (): Promise<MiraSession[]> =>
    ipcRenderer.invoke("mira:list-sessions"),
  createSession: (title?: string): Promise<MiraSession> =>
    ipcRenderer.invoke("mira:create-session", title),
  getSession: (
    sessionId: string,
  ): Promise<{ session: MiraSession; utterances: MiraUtterance[] } | null> =>
    ipcRenderer.invoke("mira:get-session", sessionId),
  searchMemory: (query: string): Promise<MiraMemoryHit[]> =>
    ipcRenderer.invoke("mira:search-memory", query),
  testLlm: (): Promise<{ ok: boolean; detail: string }> =>
    ipcRenderer.invoke("mira:test-llm"),
  sendChat: (payload: {
    sessionId?: string | null;
    text: string;
    requestId: string;
  }): Promise<{ ok: boolean; sessionId?: string; error?: string; requestId: string }> =>
    ipcRenderer.invoke("mira:send-chat", payload),
  abortChat: (requestId: string) =>
    ipcRenderer.invoke("mira:abort-chat", requestId),
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
});
