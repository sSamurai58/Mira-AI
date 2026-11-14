/**
 * Warm local VoiceEngine: AudioContext + neural pack + tiny synth.
 */
import { isCustomVoiceId, listCatalogVoices, peekActiveVoiceId } from "./catalog";
import { getActiveTtsEngine, setActiveTtsEngine } from "./ttsEngines";
import { ensureAudioContext } from "./tts";
import { neuralProsodyFromSettings, getVoiceSettings } from "./voiceSettings";

let warmedVoiceId: string | null = null;
let warming: Promise<{ ok: boolean; detail: string }> | null = null;

export async function warmupVoiceEngine(
  voiceId?: string | null,
): Promise<{ ok: boolean; detail: string }> {
  if (warming) return warming;

  warming = (async () => {
    try {
      ensureAudioContext();
      const voices = await listCatalogVoices();
      const id =
        voiceId && voiceId.length
          ? voiceId
          : peekActiveVoiceId() ||
            voices.find((v) => isCustomVoiceId(v.id))?.id ||
            null;

      if (id && isCustomVoiceId(id)) {
        if (getActiveTtsEngine() === "elevenlabs") {
          setActiveTtsEngine("neural-pack");
        }
        if (warmedVoiceId === id) {
          return { ok: true, detail: "Уже прогрето" };
        }
        if (window.mira?.warmupCustomVoiceNeural) {
          const res = await window.mira.warmupCustomVoiceNeural(id);
          warmedVoiceId = id;
          // Touch prosody shape so settings are read once.
          void neuralProsodyFromSettings(getVoiceSettings());
          return {
            ok: res.ok,
            detail: res.detail || "Локальный голос прогрет",
          };
        }
        warmedVoiceId = id;
        return {
          ok: true,
          detail: "AudioContext готов (warmup IPC недоступен)",
        };
      }

      return { ok: true, detail: "Системный TTS — AudioContext готов" };
    } catch (err) {
      return {
        ok: false,
        detail:
          err instanceof Error ? err.message : "Warmup не удался",
      };
    } finally {
      warming = null;
    }
  })();

  return warming;
}

export function resetWarmupState(): void {
  warmedVoiceId = null;
}
