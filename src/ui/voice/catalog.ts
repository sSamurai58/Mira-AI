import { saveSettingsEnv } from "../settingsEnvClient";
import { setActiveTtsEngine } from "./ttsEngines";
import type { VoiceInfo } from "./types";

const STORAGE_KEY = "mira.activeVoiceId";

/** Catalog id for an ElevenLabs voice: `elevenlabs:<voiceId>` */
export const ELEVENLABS_VOICE_PREFIX = "elevenlabs:";

export function isElevenLabsVoiceId(
  voiceId: string | null | undefined,
): boolean {
  return Boolean(voiceId && voiceId.startsWith(ELEVENLABS_VOICE_PREFIX));
}

export function elevenLabsIdFromCatalog(voiceId: string): string {
  return voiceId.slice(ELEVENLABS_VOICE_PREFIX.length);
}

export function catalogIdForElevenLabs(voiceId: string): string {
  return `${ELEVENLABS_VOICE_PREFIX}${voiceId}`;
}

export function notifyCatalogVoicesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("mira:catalog-voices-changed"));
}

export function listSystemVoices(): VoiceInfo[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  return voices.map((v) => ({
    id: `${v.voiceURI}::${v.lang}`,
    name: v.name,
    lang: v.lang,
    localService: v.localService,
    default: v.default,
  }));
}

/** Prefer Russian / neural-sounding local voices when present. */
export function pickDefaultVoiceId(voices: VoiceInfo[]): string | null {
  if (!voices.length) return null;
  const ru =
    voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith("ru") &&
        /neural|premium|enhanced/i.test(v.name),
    ) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("ru")) ||
    voices.find((v) => v.default) ||
    voices[0];
  return ru.id;
}

export function getActiveVoiceId(voices: VoiceInfo[]): string | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && voices.some((v) => v.id === stored)) return stored;
  // Keep custom / ElevenLabs selection even if catalog list is still loading.
  if (stored && (isCustomVoiceId(stored) || isElevenLabsVoiceId(stored))) {
    return stored;
  }
  const fallback = pickDefaultVoiceId(voices);
  if (fallback) localStorage.setItem(STORAGE_KEY, fallback);
  return fallback;
}

export function setActiveVoiceId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
  // Selecting a studio voice should drive the corpus / neural-pack engine,
  // not leave the user on plain Web Speech while the catalog says «студия».
  if (isCustomVoiceId(id)) {
    setActiveTtsEngine("neural-pack");
    return;
  }
  if (isElevenLabsVoiceId(id)) {
    setActiveTtsEngine("elevenlabs");
    const voiceId = elevenLabsIdFromCatalog(id);
    void saveSettingsEnv({ ELEVENLABS_VOICE_ID: voiceId })
      .then(() => notifyCatalogVoicesChanged())
      .catch(() => undefined);
  }
}

export function clearActiveVoiceId(matchId?: string | null): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  if (matchId && stored !== matchId) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function peekActiveVoiceId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function isCustomVoiceId(voiceId: string | null | undefined): boolean {
  return Boolean(voiceId && voiceId.startsWith("mira-studio-"));
}

export function resolveSpeechVoice(
  voiceId: string | null,
): SpeechSynthesisVoice | null {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voiceId) return voices.find((v) => v.default) ?? voices[0] ?? null;
  // Custom / ElevenLabs voices are not SpeechSynthesisVoice entries.
  if (isCustomVoiceId(voiceId) || isElevenLabsVoiceId(voiceId)) {
    return null;
  }
  const [uri, lang] = voiceId.split("::");
  return (
    voices.find((v) => v.voiceURI === uri && v.lang === lang) ||
    voices.find((v) => v.voiceURI === uri) ||
    null
  );
}

async function listElevenLabsCatalogVoices(): Promise<VoiceInfo[]> {
  if (!window.mira?.listElevenLabsVoices) return [];
  try {
    const res = await window.mira.listElevenLabsVoices();
    // Only list when API key works — otherwise chat dropdown stays studio+system.
    if (!res?.ok) return [];
    const rows = res.voices ?? [];
    if (!rows.length) return [];
    return rows.map((v) => {
      const lang =
        v.labels?.language ||
        v.labels?.accent ||
        (v.labels?.ru ? "ru" : "multilingual");
      return {
        id: catalogIdForElevenLabs(v.voiceId),
        name: `${v.name} (ElevenLabs)`,
        lang: String(lang),
        localService: false,
        elevenLabs: true,
      };
    });
  } catch {
    return [];
  }
}

export async function listCatalogVoices(): Promise<VoiceInfo[]> {
  const { getHiddenSystemVoiceIds, listLocalCustomVoices } = await import(
    "./studioLocal"
  );
  const hidden = new Set(getHiddenSystemVoiceIds());
  const system = (await waitForVoices()).filter((v) => !hidden.has(v.id));

  let customRows: MiraCustomVoice[] = [];
  if (window.mira?.listCustomVoices) {
    try {
      customRows = await window.mira.listCustomVoices();
    } catch {
      customRows = listLocalCustomVoices();
    }
  } else {
    customRows = listLocalCustomVoices();
  }

  const mapped: VoiceInfo[] = customRows.map((c) => ({
    id: c.id,
    name: `${c.name} (студия)`,
    lang: c.lang,
    localService: true,
    custom: true,
    previewPath: c.preview_path,
    projectId: c.project_id,
  }));

  const eleven = await listElevenLabsCatalogVoices();
  // Studio → ElevenLabs (when key works) → system
  return [...mapped, ...eleven, ...system];
}

export function waitForVoices(timeoutMs = 2500): Promise<VoiceInfo[]> {
  return new Promise((resolve) => {
    const ready = () => resolve(listSystemVoices());
    const existing = listSystemVoices();
    if (existing.length) {
      ready();
      return;
    }
    if (!window.speechSynthesis) {
      resolve([]);
      return;
    }
    const timer = setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null;
      ready();
    }, timeoutMs);
    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timer);
      window.speechSynthesis.onvoiceschanged = null;
      ready();
    };
  });
}
