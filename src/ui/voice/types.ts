export type VoiceInfo = {
  id: string;
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
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
