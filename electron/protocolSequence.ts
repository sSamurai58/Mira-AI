/** Protocol body as a sequence of custom commands (+ say/pause). */

import {
  runCustomCommandById,
  type CommandRunResult,
} from "./future/customCommands";
import { loadMarkdownCatalog } from "./markdownCatalog";

export type ProtocolSeqStep =
  | { id: string; type: "command"; commandId: string }
  | { id: string; type: "say"; value: string }
  | { id: string; type: "pause"; value: string };

let seqCounter = 0;
function newId(): string {
  seqCounter += 1;
  return `ps-${Date.now().toString(36)}-${seqCounter}`;
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
    const say = /^@say(?:\s+|:)(.+)$/i.exec(line);
    if (say) {
      steps.push({ id: newId(), type: "say", value: say[1]!.trim() });
      continue;
    }
    const pause = /^@pause(?:\s+|:)(\S+)$/i.exec(line);
    if (pause) {
      steps.push({
        id: newId(),
        type: "pause",
        value: pause[1]!.trim() || "1",
      });
      continue;
    }
    notes.push(raw);
  }
  return {
    steps,
    notes: notes.join("\n").trim(),
    isSequence: steps.some((s) => s.type === "command"),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pauseMs(raw: string): number {
  const t = raw.trim().toLowerCase();
  if (t.endsWith("ms") || t.endsWith("мс")) {
    return Math.max(0, Number(t.replace(/(ms|мс)$/i, "")) || 0);
  }
  const sec = Number(t.replace(",", ".")) || 1;
  return Math.max(0, Math.round(sec * 1000));
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
    if (step.type === "say") {
      const text = step.value.trim();
      if (!text) {
        stepDetails.push(`${i + 1}. say: пусто`);
        allOk = false;
        continue;
      }
      spoken.push(text);
      stepDetails.push(
        `${i + 1}. say: ${dryRun ? "проверка" : "ok"} «${text.slice(0, 80)}»`,
      );
      continue;
    }
    const ms = pauseMs(step.value);
    if (!dryRun && ms > 0) await sleep(ms);
    stepDetails.push(
      `${i + 1}. pause: ${dryRun ? `проверка ${ms}ms` : `${ms}ms`}`,
    );
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
