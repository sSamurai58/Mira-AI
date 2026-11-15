/**
 * TTS speaking styles (SaluteTech-inspired): free speech / operator / narrator.
 * Instruction text is prepended for engines that accept style hints;
 * local engines map style → VoiceSettings emotion/speed presets.
 */

import {
  applyVoicePreset,
  getVoiceSettings,
  setVoiceSettings,
  type VoiceEmotion,
} from "./voiceSettings";

export type VoiceStyleId =
  | "freespeech"
  | "operator"
  | "narrator"
  | "custom";

export type VoiceStyle = {
  id: VoiceStyleId;
  title: string;
  description: string;
  /** Natural-language instruction for instructional TTS engines */
  instruction: string;
  emotion: VoiceEmotion;
  presetId?: string;
};

const KEY = "mira.voiceStyle.v1";
const INSTR_KEY = "mira.voiceStyleInstruction.v1";

export const VOICE_STYLES: VoiceStyle[] = [
  {
    id: "freespeech",
    title: "Живой",
    description: "Разговорный free speech для диалога",
    instruction: "Говори естественно, как в живом разговоре, с лёгкими паузами.",
    emotion: "warm",
    presetId: "warm",
  },
  {
    id: "operator",
    title: "Оператор",
    description: "Чёткие статусы и подтверждения",
    instruction: "Говори чётко и коротко, как оператор поддержки.",
    emotion: "neutral",
    presetId: "mira",
  },
  {
    id: "narrator",
    title: "Диктор",
    description: "Чтение длинных документов",
    instruction: "Читай спокойно, ровным темпом, как диктор.",
    emotion: "calm",
    presetId: "calm",
  },
  {
    id: "custom",
    title: "Свой",
    description: "Свободная текстовая инструкция",
    instruction: "",
    emotion: "neutral",
  },
];

export function getVoiceStyleId(): VoiceStyleId {
  if (typeof localStorage === "undefined") return "freespeech";
  const raw = localStorage.getItem(KEY);
  if (VOICE_STYLES.some((s) => s.id === raw)) return raw as VoiceStyleId;
  return "freespeech";
}

export function getVoiceStyleInstruction(): string {
  const id = getVoiceStyleId();
  const base = VOICE_STYLES.find((s) => s.id === id);
  if (typeof localStorage === "undefined") return base?.instruction ?? "";
  if (id === "custom") {
    return localStorage.getItem(INSTR_KEY) ?? "";
  }
  return base?.instruction ?? "";
}

export function setVoiceStyleId(id: VoiceStyleId): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, id);
  }
  const style = VOICE_STYLES.find((s) => s.id === id);
  if (style?.presetId) {
    applyVoicePreset(style.presetId);
  } else if (style) {
    setVoiceSettings({ ...getVoiceSettings(), emotion: style.emotion });
  }
}

export function setCustomStyleInstruction(text: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(INSTR_KEY, text);
    localStorage.setItem(KEY, "custom");
  }
}

/** Prefix spoken text with a light style cue for engines without native instructions. */
export function applyStyleToSpeakText(text: string): string {
  // Do not dump the full instruction into every utterance — local TTS would speak it.
  // Engines that support instructions should read getVoiceStyleInstruction() separately.
  return text;
}

export function listVoiceStyles(): VoiceStyle[] {
  return VOICE_STYLES;
}
