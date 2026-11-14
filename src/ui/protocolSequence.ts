/** Protocol body as a sequence of custom commands + native actions. */

import {
  ACTION_LABEL,
  ACTION_QUICK_ADD,
  ACTION_TYPES,
  ACTION_VALUELESS,
  defaultActionValue,
  type CustomCommandActionType,
} from "./customCommandsLocal";

export type ProtocolActionType = CustomCommandActionType;

export type ProtocolSeqStep =
  | { id: string; type: "command"; commandId: string }
  | { id: string; type: "action"; action: ProtocolActionType; value: string };

export const PROTOCOL_ACTION_TYPES: ProtocolActionType[] = [...ACTION_TYPES];

export const PROTOCOL_ACTION_LABEL: Record<ProtocolActionType, string> = {
  ...ACTION_LABEL,
};

/** Quick-add pills — same actions as Commands, plus «кастомная команда». */
export const PROTOCOL_QUICK_ADD: Array<"command" | ProtocolActionType> = [
  "command",
  ...ACTION_QUICK_ADD,
];

export const PROTOCOL_VALUELESS: ProtocolActionType[] = [...ACTION_VALUELESS];

export function newProtocolStepId(): string {
  return `ps-${crypto.randomUUID().slice(0, 8)}`;
}

export function emptyCommandStep(commandId = ""): ProtocolSeqStep {
  return {
    id: newProtocolStepId(),
    type: "command",
    commandId,
  };
}

export function emptyActionStep(
  action: ProtocolActionType = "say",
): ProtocolSeqStep {
  return {
    id: newProtocolStepId(),
    type: "action",
    action,
    value: defaultActionValue(action),
  };
}

function isActionType(raw: string): raw is ProtocolActionType {
  return (ACTION_TYPES as string[]).includes(raw);
}

export function parseProtocolSequence(body: string): {
  steps: ProtocolSeqStep[];
  notes: string;
  isSequence: boolean;
} {
  const steps: ProtocolSeqStep[] = [];
  const notes: string[] = [];
  for (const raw of (body || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#+\s/.test(line)) continue;
    const cmd = /^@cmd(?:\s+|:)(.+)$/i.exec(line);
    if (cmd) {
      const commandId = cmd[1]!.trim();
      if (commandId) {
        steps.push({
          id: newProtocolStepId(),
          type: "command",
          commandId,
        });
      }
      continue;
    }
    // @act <type> [value]  OR  legacy @say / @pause
    const act = /^@act(?:\s+|:)(\S+)(?:\s+(.+))?$/i.exec(line);
    if (act) {
      const actionRaw = act[1]!.trim().toLowerCase();
      if (isActionType(actionRaw)) {
        steps.push({
          id: newProtocolStepId(),
          type: "action",
          action: actionRaw,
          value: (act[2] ?? "").trim(),
        });
      }
      continue;
    }
    const say = /^@say(?:\s+|:)(.+)$/i.exec(line);
    if (say) {
      steps.push({
        id: newProtocolStepId(),
        type: "action",
        action: "say",
        value: say[1]!.trim(),
      });
      continue;
    }
    const pause = /^@pause(?:\s+|:)(\S+)$/i.exec(line);
    if (pause) {
      steps.push({
        id: newProtocolStepId(),
        type: "action",
        action: "pause",
        value: pause[1]!.trim() || "1",
      });
      continue;
    }
    // Direct @open_url / @launch / … aliases
    const direct = /^@([a-z_]+)(?:\s+|:)(.*)$/i.exec(line);
    if (direct) {
      const actionRaw = direct[1]!.toLowerCase();
      if (isActionType(actionRaw)) {
        steps.push({
          id: newProtocolStepId(),
          type: "action",
          action: actionRaw,
          value: (direct[2] ?? "").trim(),
        });
        continue;
      }
    }
    notes.push(raw);
  }
  return {
    steps,
    notes: notes.join("\n").trim(),
    isSequence: steps.length > 0,
  };
}

export function serializeProtocolSequence(
  steps: ProtocolSeqStep[],
  notes = "",
): string {
  const lines = [
    "# Sequence",
    "# @cmd <id> · @act <тип> [значение] · @say / @pause",
    "",
  ];
  for (const step of steps) {
    if (step.type === "command" && step.commandId.trim()) {
      lines.push(`@cmd ${step.commandId.trim()}`);
    } else if (step.type === "action") {
      if (step.action === "say" && step.value.trim()) {
        lines.push(`@say ${step.value.trim()}`);
      } else if (step.action === "pause") {
        lines.push(`@pause ${step.value.trim() || "1"}`);
      } else if (PROTOCOL_VALUELESS.includes(step.action)) {
        lines.push(`@act ${step.action}`);
      } else {
        // Always persist the step (even empty clipboard_paste).
        const v = step.value.trim();
        lines.push(v ? `@act ${step.action} ${v}` : `@act ${step.action}`);
      }
    }
  }
  const n = notes.trim();
  if (n) {
    lines.push("", "## Notes", n);
  }
  return `${lines.join("\n").trim()}\n`;
}

export function summarizeProtocolSteps(
  steps: ProtocolSeqStep[],
  nameById: Map<string, string>,
): string {
  if (!steps.length) return "Нет шагов";
  const parts = steps.map((s) => {
    if (s.type === "command") {
      return nameById.get(s.commandId) || s.commandId || "?";
    }
    return PROTOCOL_ACTION_LABEL[s.action] || s.action;
  });
  return `${steps.length} шаг. · ${parts.slice(0, 3).join(" → ")}${
    parts.length > 3 ? "…" : ""
  }`;
}

export function stepPlaceholder(action: ProtocolActionType): string {
  switch (action) {
    case "open_url":
      return "https://example.com";
    case "launch":
      return "Из Путей или путь к программе/файлу/папке";
    case "open_path":
      return "id или имя из Путей";
    case "open_folder":
      return "Из Путей или путь к папке";
    case "keys":
      return "ctrl+shift+s";
    case "type":
      return "Текст для ввода";
    case "click":
      return "x, y — например 100, 200";
    case "clipboard_copy":
      return "Текст в буфер обмена";
    case "clipboard_paste":
      return "Текст (необязательно) или пусто = вставить";
    case "pause":
      return "Секунды, напр. 1.5";
    case "say":
      return "Текст для озвучки";
    case "notify":
      return "Заголовок|Текст или просто текст";
    case "hud_say":
      return "Текст в HUD / уведомление";
    case "window_minimize":
    case "window_minimize_all":
    case "window_close":
    case "desktop_new":
    case "desktop_close":
      return "";
    case "window_snap":
      return "left | right | maximize | fullscreen";
    case "desktop_switch":
      return "next | prev";
    case "terminal":
      return "Команда (с подтверждением)";
  }
}
