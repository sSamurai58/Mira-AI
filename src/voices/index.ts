/** Voice catalog — P2 (#11). */
export type VoiceInfo = { id: string; name: string; stub?: boolean };

export function listVoices(): VoiceInfo[] {
  return [{ id: "default", name: "Default (stub)", stub: true }];
}
