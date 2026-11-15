/**
 * Long-text reading controller: stop / continue / repeat / from paragraph N.
 */

import {
  getActiveBody,
  getDictationSession,
  setReadPosition,
  splitParagraphs,
  type ReadPosition,
} from "./dictationSession";
import { logJournal } from "./actionJournal";
import { speakText, stopSpeaking } from "./tts";
import { normalizeForTts } from "./ttsNormalize";
import { statusPhrase } from "./statusPhrases";

export type ReadControllerHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
  onStatus?: (msg: string) => void;
  voiceId?: string | null;
};

let lastFragment = "";
let playing = false;

export function isReading(): boolean {
  return playing;
}

export function getReadPosition(): ReadPosition {
  return getDictationSession().readPosition;
}

function paragraphs(): string[] {
  return splitParagraphs(getActiveBody());
}

export function stopReading(): string {
  stopSpeaking();
  playing = false;
  const pos = getDictationSession().readPosition;
  setReadPosition({ status: "paused" });
  const msg = statusPhrase("read_stopped", {
    paragraph: String(pos.paragraph + 1),
  });
  logJournal({
    type: "read",
    tool: "stop",
    detail: msg,
  });
  return msg;
}

export function speakFragment(
  text: string,
  handlers: ReadControllerHandlers = {},
): void {
  const normalized = normalizeForTts(text);
  lastFragment = normalized;
  playing = true;
  setReadPosition({ status: "playing" });
  handlers.onStatus?.(statusPhrase("reading"));
  speakText(normalized, handlers.voiceId ?? null, {
    onStart: () => handlers.onStart?.(),
    onEnd: () => {
      playing = false;
      setReadPosition({ status: "idle" });
      handlers.onEnd?.();
    },
    onError: (m) => {
      playing = false;
      setReadPosition({ status: "idle" });
      handlers.onError?.(m);
    },
  });
}

export function readFromParagraph(
  paragraph1Based: number,
  handlers: ReadControllerHandlers = {},
): string {
  const paras = paragraphs();
  if (!paras.length) {
    const msg = statusPhrase("empty_doc");
    handlers.onStatus?.(msg);
    return msg;
  }
  const idx = Math.max(0, Math.min(paras.length - 1, paragraph1Based - 1));
  setReadPosition({
    paragraph: idx,
    charInParagraph: 0,
    version: getDictationSession().currentVersion,
  });
  const frag = paras[idx]!;
  speakFragment(frag, handlers);
  logJournal({
    type: "read",
    tool: "from_paragraph",
    detail: `paragraph ${idx + 1}`,
  });
  return statusPhrase("read_from", { paragraph: String(idx + 1) });
}

export function continueReading(handlers: ReadControllerHandlers = {}): string {
  const pos = getDictationSession().readPosition;
  return readFromParagraph(pos.paragraph + 1, handlers);
}

export function nextParagraph(handlers: ReadControllerHandlers = {}): string {
  const pos = getDictationSession().readPosition;
  return readFromParagraph(pos.paragraph + 2, handlers);
}

export function readFirst(handlers: ReadControllerHandlers = {}): string {
  return readFromParagraph(1, handlers);
}

export function repeatReading(handlers: ReadControllerHandlers = {}): string {
  if (!lastFragment) {
    const pos = getDictationSession().readPosition;
    return readFromParagraph(pos.paragraph + 1, handlers);
  }
  speakFragment(lastFragment, handlers);
  logJournal({ type: "read", tool: "repeat" });
  return statusPhrase("repeat");
}

export function readSourceLabel(kind: "source" | "version" | "cleaned"): string {
  const s = getDictationSession();
  if (kind === "source") return "исходная диктовка";
  if (kind === "cleaned") return "очищенный текст";
  return `версия ${s.currentVersion}`;
}
