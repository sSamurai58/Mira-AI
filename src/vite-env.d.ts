/// <reference types="vite/client" />

type MiraHealth = {
  phase: string;
  ok: boolean;
  path: string;
  databasePath: string;
  sessions: number;
  utterances: number;
};

type MiraSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

interface MiraBridge {
  getHealth: () => Promise<MiraHealth>;
  listSessions: () => Promise<MiraSession[]>;
}

interface Window {
  mira?: MiraBridge;
}
