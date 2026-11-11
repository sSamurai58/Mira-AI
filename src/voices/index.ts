/** Voice catalog — P2 (#11) via speechSynthesis. */
export {
  listSystemVoices,
  getActiveVoiceId,
  setActiveVoiceId,
  waitForVoices,
} from "../ui/voice/catalog";
export type { VoiceInfo } from "../ui/voice/types";
export const voicesStatus = "partial" as const;
