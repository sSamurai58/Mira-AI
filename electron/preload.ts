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
    forceProtocolId?: string | null;
  }): Promise<{
    ok: boolean;
    sessionId?: string;
    error?: string;
    requestId: string;
  }> => ipcRenderer.invoke("mira:send-chat", payload),
  abortChat: (requestId: string) =>
    ipcRenderer.invoke("mira:abort-chat", requestId),
  listSkills: (): Promise<MiraCatalogItem[]> =>
    ipcRenderer.invoke("mira:list-skills"),
  listProtocols: (): Promise<MiraCatalogItem[]> =>
    ipcRenderer.invoke("mira:list-protocols"),
  setSkillEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke("mira:set-skill-enabled", id, enabled),
  setProtocolEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke("mira:set-protocol-enabled", id, enabled),
  saveProtocol: (item: {
    id: string;
    name: string;
    description: string;
    triggers: string[];
    enabled: boolean;
    body: string;
  }) => ipcRenderer.invoke("mira:save-protocol", item),
  getWebPolicy: () => ipcRenderer.invoke("mira:get-web-policy"),
  getScreenPolicy: () => ipcRenderer.invoke("mira:get-screen-policy"),
  getBrowserPolicy: () => ipcRenderer.invoke("mira:get-browser-policy"),
  testWeb: (query?: string) => ipcRenderer.invoke("mira:test-web", query),
  testScreen: () => ipcRenderer.invoke("mira:test-screen"),
  testBrowserOpen: (url?: string) =>
    ipcRenderer.invoke("mira:test-browser-open", url),
  searchBrowserHistory: (query?: string) =>
    ipcRenderer.invoke("mira:search-browser-history", query),
  getMessagingPolicy: () => ipcRenderer.invoke("mira:get-messaging-policy"),
  getMessagingStatus: () => ipcRenderer.invoke("mira:get-messaging-status"),
  listMessengerContacts: (provider?: string) =>
    ipcRenderer.invoke("mira:list-messenger-contacts", provider),
  listMessengerMessages: (limit?: number) =>
    ipcRenderer.invoke("mira:list-messenger-messages", limit),
  upsertMessengerContact: (item: {
    id?: string;
    provider: string;
    displayName: string;
    handle: string;
    chatId: string;
    enabled?: boolean;
  }) => ipcRenderer.invoke("mira:upsert-messenger-contact", item),
  testMessagingSend: (payload?: {
    text?: string;
    recipient?: string;
    body?: string;
  }) => ipcRenderer.invoke("mira:test-messaging-send", payload),
  respondConfirm: (id: string, accepted: boolean) =>
    ipcRenderer.invoke("mira:confirm-response", id, accepted),
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
});
