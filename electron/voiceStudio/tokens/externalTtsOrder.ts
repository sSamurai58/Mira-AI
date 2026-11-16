/**
 * Preferred order for optional Python TTS sidecars.
 * MIRA_TTS_SIDECAR=auto|f5|chatterbox|cosy|off
 */
export type ExternalTtsId = "f5" | "chatterbox" | "cosy";

export function resolveExternalTtsOrder(): ExternalTtsId[] {
  const raw = (process.env.MIRA_TTS_SIDECAR ?? "auto").trim().toLowerCase();
  if (raw === "off" || raw === "none" || raw === "0") return [];
  if (raw === "f5" || raw === "f5-tts") return ["f5"];
  if (raw === "chatterbox" || raw === "cb") return ["chatterbox"];
  if (raw === "cosy" || raw === "cosyvoice") return ["cosy"];
  // auto: quality/RU first (F5), then Chatterbox, then Cosy
  return ["f5", "chatterbox", "cosy"];
}
