/**
 * Orchestrator: transcript → mode → handler → optional TTS status.
 */

import { logJournal } from "./actionJournal";
import {
  appendDictation,
  newDictationSession,
  saveDictationVersion,
  setDictationNoteId,
} from "./dictationSession";
import {
  answerPendingConfirm,
  classifyCommand,
  getInteractionMode,
  getPendingConfirm,
  requestConfirm,
  setInteractionMode,
  type CommandIntent,
  type DangerousAction,
} from "./interactionMode";
import { applyNameDictionary } from "./nameDictionary";
import {
  continueReading,
  nextParagraph,
  readFirst,
  readFromParagraph,
  repeatReading,
  stopReading,
  type ReadControllerHandlers,
} from "./readController";
import { statusPhrase } from "./statusPhrases";
import { vadAttachTranscript } from "./vadSegments";

export type RouteResult =
  | {
      handled: true;
      kind: string;
      speak?: string;
      /** Pass remaining text to chat LLM */
      chatText?: string;
      /** Dangerous confirm was requested — wait for yes/no */
      awaitingConfirm?: boolean;
    }
  | { handled: false };

export type RouteDeps = {
  readHandlers?: ReadControllerHandlers;
  /** Called when delete confirmed — UI supplies real file tool */
  onDeleteNote?: (title?: string) => void | Promise<void>;
  onCreateNote?: (title?: string) => void | string | Promise<void | string>;
  onSendExternal?: () => void | Promise<void>;
};

/** Ask user to confirm cloud/external send (TTS etc.). */
export function requestExternalSendConfirm(objectLabel: string): string {
  const { prompt } = requestConfirm({
    action: "send_external" satisfies DangerousAction,
    objectLabel,
  });
  return prompt;
}

/**
 * Route a final ASR transcript. Returns handled=true when Mira should NOT
 * treat the phrase as a normal chat message (or when chatText is provided).
 */
export function routeVoiceTranscript(
  transcript: string,
  deps: RouteDeps = {},
): RouteResult {
  const text = transcript.trim();
  if (!text) return { handled: false };

  logJournal({
    type: "stt",
    tool: "asr",
    transcript: text,
  });

  // Pending confirmation always wins.
  if (getPendingConfirm()) {
    const { answer, pending } = answerPendingConfirm(text);
    if (answer === "yes" && pending) {
      logJournal({
        type: "confirm",
        tool: pending.action,
        result: "ok",
        transcript: text,
      });
      if (pending.action === "delete_note") {
        void deps.onDeleteNote?.(pending.payload?.title);
      }
      if (pending.action === "send_external") {
        void deps.onSendExternal?.();
      }
      return {
        handled: true,
        kind: "confirm_yes",
        speak: statusPhrase("confirm_yes"),
      };
    }
    if (answer === "no" && pending) {
      logJournal({
        type: "confirm",
        tool: pending.action,
        result: "cancel",
        transcript: text,
      });
      return {
        handled: true,
        kind: "confirm_no",
        speak: statusPhrase("confirm_no"),
      };
    }
    // Unrelated while pending — re-prompt
    return {
      handled: true,
      kind: "confirm_wait",
      speak: `${pending?.label ?? "Подтверждение"} «${pending?.objectLabel ?? ""}»? Скажите «подтверждаю» или «нет».`,
      awaitingConfirm: true,
    };
  }

  const mode = getInteractionMode();

  if (mode === "dictation") {
    // Escape hatches in dictation
    const lower = text.toLowerCase();
    if (/^(режим команд|командный режим|включи команды)(?:\s|$|[.,!?])/i.test(lower)) {
      setInteractionMode("command");
      logJournal({ type: "mode", tool: "command", transcript: text });
      return {
        handled: true,
        kind: "switch_command",
        speak: statusPhrase("mode_command"),
      };
    }
    if (/^(стоп|останови|хватит)(?:\s|$|[.,!?])/i.test(lower)) {
      const msg = stopReading();
      return { handled: true, kind: "stop", speak: msg };
    }
    const { text: withNames } = applyNameDictionary(text);
    vadAttachTranscript(withNames);
    appendDictation(withNames);
    logJournal({
      type: "command",
      tool: "append_dictation",
      transcript: withNames,
    });
    return {
      handled: true,
      kind: "dictation_append",
      speak: statusPhrase("dictation_appended"),
    };
  }

  // Command mode
  const intent = classifyCommand(text);
  return handleIntent(intent, text, deps);
}

function handleIntent(
  intent: CommandIntent,
  raw: string,
  deps: RouteDeps,
): RouteResult {
  const h = deps.readHandlers ?? {};

  switch (intent.kind) {
    case "stop": {
      const msg = stopReading();
      logJournal({ type: "command", tool: "stop", transcript: raw });
      return { handled: true, kind: "stop", speak: msg || statusPhrase("stop") };
    }
    case "continue_read": {
      const msg = continueReading(h);
      return { handled: true, kind: "continue_read", speak: msg };
    }
    case "repeat_read": {
      const msg = repeatReading(h);
      return { handled: true, kind: "repeat_read", speak: msg };
    }
    case "next_paragraph": {
      const msg = nextParagraph(h);
      return { handled: true, kind: "next_paragraph", speak: msg };
    }
    case "read_first": {
      const msg = readFirst(h);
      return { handled: true, kind: "read_first", speak: msg };
    }
    case "read_from": {
      const msg = readFromParagraph(intent.paragraph, h);
      return { handled: true, kind: "read_from", speak: msg };
    }
    case "save_version": {
      const { statusPhrase: sp } = saveDictationVersion("voice_save");
      logJournal({ type: "save", tool: "save_version", transcript: raw });
      return { handled: true, kind: "save_version", speak: sp };
    }
    case "switch_dictation": {
      setInteractionMode("dictation");
      logJournal({ type: "mode", tool: "dictation", transcript: raw });
      return {
        handled: true,
        kind: "switch_dictation",
        speak: statusPhrase("mode_dictation"),
      };
    }
    case "switch_command": {
      setInteractionMode("command");
      return {
        handled: true,
        kind: "switch_command",
        speak: statusPhrase("mode_command"),
      };
    }
    case "create_note": {
      newDictationSession(intent.title);
      void Promise.resolve(deps.onCreateNote?.(intent.title)).then((id) => {
        if (typeof id === "string") setDictationNoteId(id);
      });
      logJournal({ type: "command", tool: "create_note", transcript: raw });
      return {
        handled: true,
        kind: "create_note",
        speak: statusPhrase("note_created"),
      };
    }
    case "delete_note": {
      const { prompt } = requestConfirm({
        action: "delete_note",
        objectLabel: intent.title || "текущая заметка",
        payload: intent.title ? { title: intent.title } : undefined,
      });
      logJournal({
        type: "confirm",
        tool: "delete_note",
        result: "ok",
        detail: "requested",
        transcript: raw,
      });
      return {
        handled: true,
        kind: "delete_confirm",
        speak: prompt,
        awaitingConfirm: true,
      };
    }
    case "chat":
    default:
      logJournal({ type: "command", tool: "chat", transcript: raw });
      return { handled: false };
  }
}
