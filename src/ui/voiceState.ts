export type VoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export const VOICE_STATES: VoiceState[] = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "error",
];

export function nextVoiceState(current: VoiceState): VoiceState {
  const idx = VOICE_STATES.indexOf(current);
  return VOICE_STATES[(idx + 1) % VOICE_STATES.length];
}
