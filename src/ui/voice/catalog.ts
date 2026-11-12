import { setActiveTtsEngine } from "./ttsEngines";
import type { VoiceInfo } from "./types";

const STORAGE_KEY = "mira.activeVoiceId";

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
    voices.find((v) => v.lang.toLowerCase().startsWith("ru") && /neural|premium|enhanced/i.test(v.name)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("ru")) ||
    voices.find((v) => v.default) ||
    voices[0];
  return ru.id;
}

export function getActiveVoiceId(voices: VoiceInfo[]): string | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && voices.some((v) => v.id === stored)) return stored;
  // Keep custom studio selection even if catalog list is still loading /
  // caller only passed system voices — never silently clobber it.
  if (stored && isCustomVoiceId(stored)) return stored;
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

export function resolveSpeechVoice(voiceId: string | null): SpeechSynthesisVoice | null {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voiceId) return voices.find((v) => v.default) ?? voices[0] ?? null;
  // Custom studio voices are spoken via corpus clips in tts.ts — do not
  // silently map them onto a system SpeechSynthesisVoice here.
  if (isCustomVoiceId(voiceId)) {
    return null;
  }
  const [uri, lang] = voiceId.split("::");
  return (
    voices.find((v) => v.voiceURI === uri && v.lang === lang) ||
    voices.find((v) => v.voiceURI === uri) ||
    null
  );
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
  return [...mapped, ...system];
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
