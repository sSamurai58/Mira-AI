export type VoiceInfo = {
  id: string;
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
  /** Studio custom voice (#15 → #11) */
  custom?: boolean;
  previewPath?: string | null;
};

export type AsrResult = {
  transcript: string;
  interim?: string;
};

export type VoiceEngineStatus = {
  asr: "ready" | "unavailable";
  tts: "ready" | "unavailable";
  detail: string;
};
