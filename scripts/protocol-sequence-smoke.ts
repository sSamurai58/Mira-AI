/**
 * Smoke: protocol body as custom-command sequence + orchestrator early-return.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../electron/config";
import {
  deleteCustomCommand,
  listCustomCommands,
  upsertCustomCommand,
} from "../electron/future/customCommands";
import {
  deleteCatalogItem,
  ensureSeededCatalog,
  loadMarkdownCatalog,
  writeCatalogItem,
} from "../electron/markdownCatalog";
import { sendChatMessage } from "../electron/orchestrator";
import {
  parseProtocolSequence,
  runProtocolSequence,
} from "../electron/protocolSequence";
import { closeStore, openStore } from "../electron/store";

const tmpDb = path.join(
  os.tmpdir(),
  `mira-protocol-seq-smoke-${Date.now()}.sqlite`,
);
process.env.DATABASE_PATH = tmpDb;
loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.MIRA_CONFIRM_AUTO = "accept";
loadConfig(true);
openStore();
ensureSeededCatalog("protocols");

async function main() {
  const morning = loadMarkdownCatalog("protocols").find(
    (p) => p.id === "morning-check",
  );
  assert.ok(morning);
  const morningParsed = parseProtocolSequence(morning!.body);
  assert.equal(morningParsed.isSequence, false, "seed morning stays LLM");

  const beforeCmds = listCustomCommands().length;
  const cmd = upsertCustomCommand({
    name: "Proto Smoke Cmd",
    phrases: ["proto smoke cmd never match xyz"],
    steps: [{ id: "s1", type: "say", value: "шаг команды" }],
    reply: "готово",
    enabled: true,
  });

  const protoId = `proto-seq-smoke-${Date.now().toString(36)}`;
  writeCatalogItem("protocols", {
    id: protoId,
    name: "Smoke Sequence",
    description: "test",
    triggers: ["протокол smoke seq unique"],
    tags: ["test"],
    enabled: true,
    body: [
      "# Sequence",
      `@cmd ${cmd.id}`,
      "@say протокол готов",
      "@pause 0.01",
      "@act open_url https://example.com",
      "@act notify Smoke|Protocol act",
      "",
    ].join("\n"),
  });

  const loaded = loadMarkdownCatalog("protocols").find((p) => p.id === protoId);
  assert.ok(loaded);
  const parsed = parseProtocolSequence(loaded!.body);
  assert.equal(parsed.isSequence, true);
  assert.equal(parsed.steps.length, 5);
  assert.ok(parsed.steps[0]!.type === "command");
  if (parsed.steps[0]!.type === "command") {
    assert.equal(parsed.steps[0].commandId, cmd.id);
  }
  assert.ok(parsed.steps[3]!.type === "action");
  if (parsed.steps[3]!.type === "action") {
    assert.equal(parsed.steps[3].action, "open_url");
  }

  const dry = await runProtocolSequence(protoId, { dryRun: true });
  assert.equal(dry.mode, "sequence");
  assert.equal(dry.ok, true);
  assert.ok(dry.detail.includes("команда"));
  assert.ok(dry.detail.includes("open_url"));

  const live = await runProtocolSequence(protoId, { dryRun: false });
  assert.equal(live.mode, "sequence");
  assert.equal(live.ok, true);

  let desktopUsed: string | null = null;
  let reply = "";
  await sendChatMessage(
    {
      sessionId: null,
      text: "Выполни протокол",
      forceProtocolId: protoId,
    },
    (e) => {
      if (e.type === "context") desktopUsed = e.desktop;
      if (e.type === "assistant_done") reply = e.utterance.content;
    },
  );
  assert.ok(
    desktopUsed?.startsWith(`protocol:seq:${protoId}:`),
    `expected protocol seq desktop, got ${desktopUsed}`,
  );
  assert.ok(reply.length > 0);

  deleteCatalogItem("protocols", protoId);
  deleteCustomCommand(cmd.id);
  assert.equal(listCustomCommands().length, beforeCmds);

  console.log(
    JSON.stringify(
      {
        ok: true,
        morningLlm: !morningParsed.isSequence,
        sequenceDryOk: dry.ok,
        sequenceLiveOk: live.ok,
        orchestratorDesktop: desktopUsed,
      },
      null,
      2,
    ),
  );

  closeStore();
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err);
  closeStore();
  process.exit(1);
});
