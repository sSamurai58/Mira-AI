/** Shared store shapes (SQLite lives in Electron main). */
export type Session = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type UtteranceRole = "user" | "assistant" | "system";

export type Utterance = {
  id: string;
  sessionId: string;
  role: UtteranceRole;
  content: string;
  createdAt: string;
};
