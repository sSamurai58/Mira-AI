/** Protocol body as a sequence of custom commands + native actions. */

import {
  ACTION_TYPES,
  runCustomCommandById,
  runCustomCommandStep,
  type CommandRunResult,
  type CustomCommandActionType,
  type CustomCommandStep,
} from "./future/customCommands";
import { loadMarkdownCatalog } from "./markdownCatalog";

export type ProtocolActionType = CustomCommandActionType;

export type ProtocolSeqStep =
  | { id: string; type: "command"; commandId: string }
  | { id: string; type: "action"; action: ProtocolActionType; value: string };

let seqCounter = 0;
function newId(): string {
  seqCounter += 1;
  return `ps-${Date.now().toString(36)}-${seqCounter}`;
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
        steps.push({ id: newId(), type: "command", commandId });
      }
      continue;
    }
    const act = /^@act(?:\s+|:)(\S+)(?:\s+(.+))?$/i.exec(line);
    if (act) {
      const actionRaw = act[1]!.trim().toLowerCase();
      if (isActionType(actionRaw)) {
        steps.push({
          id: newId(),
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
        id: newId(),
        type: "action",
        action: "say",
        value: say[1]!.trim(),
      });
      continue;
    }
    const pause = /^@pause(?:\s+|:)(\S+)$/i.exec(line);
    if (pause) {
      steps.push({
        id: newId(),
        type: "action",
        action: "pause",
        value: pause[1]!.trim() || "1",
      });
      continue;
    }
    const direct = /^@([a-z_]+)(?:\s+|:)(.*)$/i.exec(line);
    if (direct) {
      const actionRaw = direct[1]!.toLowerCase();
      if (isActionType(actionRaw)) {
        steps.push({
          id: newId(),
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

export type ProtocolRunResult = {
  ok: boolean;
  mode: "sequence" | "llm";
  detail: string;
  reply: string;
  stepDetails: string[];
};

export async function runProtocolSequence(
  protocolId: string,
  opts?: { dryRun?: boolean },
): Promise<ProtocolRunResult> {
  const item = loadMarkdownCatalog("protocols").find((p) => p.id === protocolId);
  if (!item) {
    return {
      ok: false,
      mode: "sequence",
      detail: "Протокол не найден",
      reply: "",
      stepDetails: [],
    };
  }
  if (!item.enabled) {
    return {
      ok: false,
      mode: "sequence",
      detail: "Протокол выключен",
      reply: "",
      stepDetails: [],
    };
  }

  const { steps, isSequence } = parseProtocolSequence(item.body);
  if (!isSequence) {
    return {
      ok: true,
      mode: "llm",
      detail: "LLM-протокол (текстовые шаги)",
      reply: "",
      stepDetails: [],
    };
  }

  const dryRun = Boolean(opts?.dryRun);
  const stepDetails: string[] = [];
  const spoken: string[] = [];
  let allOk = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.type === "command") {
      const res = await runCustomCommandById(step.commandId, { dryRun });
      if ("command" in res && res.command) {
        const cr = res as CommandRunResult;
        stepDetails.push(
          `${i + 1}. команда «${cr.command.name}»: ${cr.ok ? "ok" : "fail"}`,
        );
        if (cr.spoken?.length) spoken.push(...cr.spoken);
        if (!cr.ok) allOk = false;
      } else {
        stepDetails.push(
          `${i + 1}. команда ${step.commandId}: ${(res as { detail: string }).detail}`,
        );
        allOk = false;
      }
      continue;
    }

    const actionStep: CustomCommandStep = {
      id: step.id,
      type: step.action,
      value: step.value,
    };
    const res = await runCustomCommandStep(actionStep, i, { dryRun });
    stepDetails.push(`${i + 1}. ${res.type}: ${res.detail}`);
    if (
      (step.action === "say" || step.action === "hud_say") &&
      res.ok &&
      step.value.trim()
    ) {
      spoken.push(step.value.trim());
    }
    if (!res.ok) allOk = false;
  }

  const reply =
    spoken.join(" ") ||
    (dryRun
      ? `Проверка протокола «${item.name}»: ${allOk ? "ок" : "есть ошибки"}`
      : `Протокол «${item.name}» ${allOk ? "выполнен" : "выполнен с ошибками"}`);

  return {
    ok: allOk,
    mode: "sequence",
    detail: stepDetails.join("\n") || "Нет шагов",
    reply,
    stepDetails,
  };
}
