/** Protocol body as a sequence of custom commands (+ say/pause). */

export type ProtocolSeqStep =
  | { id: string; type: "command"; commandId: string }
  | { id: string; type: "say"; value: string }
  | { id: string; type: "pause"; value: string };

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
    const say = /^@say(?:\s+|:)(.+)$/i.exec(line);
    if (say) {
      steps.push({
        id: newProtocolStepId(),
        type: "say",
        value: say[1]!.trim(),
      });
      continue;
    }
    const pause = /^@pause(?:\s+|:)(\S+)$/i.exec(line);
    if (pause) {
      steps.push({
        id: newProtocolStepId(),
        type: "pause",
        value: pause[1]!.trim() || "1",
      });
      continue;
    }
    // Legacy numbered LLM instructions — keep as notes, not sequence.
    notes.push(raw);
  }
  return {
    steps,
    notes: notes.join("\n").trim(),
    isSequence: steps.some((s) => s.type === "command"),
  };
}

export function serializeProtocolSequence(
  steps: ProtocolSeqStep[],
  notes = "",
): string {
  const lines = [
    "# Sequence",
    "# Шаги: @cmd <id команды> · @say текст · @pause сек",
    "",
  ];
  for (const step of steps) {
    if (step.type === "command" && step.commandId.trim()) {
      lines.push(`@cmd ${step.commandId.trim()}`);
    } else if (step.type === "say" && step.value.trim()) {
      lines.push(`@say ${step.value.trim()}`);
    } else if (step.type === "pause") {
      lines.push(`@pause ${step.value.trim() || "1"}`);
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
    if (s.type === "say") return `сказать`;
    return `пауза ${s.value || "1"}с`;
  });
  return `${steps.length} шаг. · ${parts.slice(0, 3).join(" → ")}${
    parts.length > 3 ? "…" : ""
  }`;
}
