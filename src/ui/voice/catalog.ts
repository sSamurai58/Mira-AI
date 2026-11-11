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
  const fallback = pickDefaultVoiceId(voices);
  if (fallback) localStorage.setItem(STORAGE_KEY, fallback);
  return fallback;
}

export function setActiveVoiceId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

export function isCustomVoiceId(voiceId: string | null | undefined): boolean {
  return Boolean(voiceId && voiceId.startsWith("mira-studio-"));
}

export function resolveSpeechVoice(voiceId: string | null): SpeechSynthesisVoice | null {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voiceId) return voices.find((v) => v.default) ?? voices[0] ?? null;
  // Custom studio voices: synthesis falls back to a local RU/system voice
  // until a neural TTS engine is wired (P9 corpus pack stub).
  if (isCustomVoiceId(voiceId)) {
    return (
      voices.find((v) => v.lang.toLowerCase().startsWith("ru") && /neural|premium|enhanced/i.test(v.name)) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("ru")) ||
      voices.find((v) => v.default) ||
      voices[0] ||
      null
    );
  }
  const [uri, lang] = voiceId.split("::");
  return (
    voices.find((v) => v.voiceURI === uri && v.lang === lang) ||
    voices.find((v) => v.voiceURI === uri) ||
    null
  );
}

export async function listCatalogVoices(): Promise<VoiceInfo[]> {
  const system = await waitForVoices();
  if (!window.mira?.listCustomVoices) return system;
  try {
    const custom = await window.mira.listCustomVoices();
    const mapped: VoiceInfo[] = custom.map((c) => ({
      id: c.id,
      name: `${c.name} (студия)`,
      lang: c.lang,
      localService: true,
      custom: true,
      previewPath: c.preview_path,
    }));
    return [...mapped, ...system];
  } catch {
    return system;
  }
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
