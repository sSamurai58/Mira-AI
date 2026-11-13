/**
 * Smoke: Workshop «Кастомные команды» — CRUD, phrase match, dry-run, orchestrator.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../electron/config";
import {
  deleteCustomCommand,
  handleCustomCommandsFromChat,
  listCustomCommands,
  looksLikeCustomCommandIntent,
  matchCustomCommandByPhrase,
  runCustomCommandById,
  upsertCustomCommand,
} from "../electron/future/customCommands";
import { sendChatMessage } from "../electron/orchestrator";
import { closeStore, openStore } from "../electron/store";
import { parseKeyCombo } from "../electron/tools/screen";

const tmpDb = path.join(
  os.tmpdir(),
  `mira-custom-commands-smoke-${Date.now()}.sqlite`,
);
process.env.DATABASE_PATH = tmpDb;
loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.MIRA_CONFIRM_AUTO = "accept";
process.env.SCREEN_CONTROL_ENABLED = "false";
loadConfig(true);
openStore();

async function main() {
  assert.deepEqual(parseKeyCombo("Ctrl + Shift + S"), ["ctrl", "shift", "s"]);
  assert.deepEqual(parseKeyCombo("win+shift+s"), ["win", "shift", "s"]);

  const before = listCustomCommands().length;

  const cmd = upsertCustomCommand({
    name: "Рабочий режим smoke",
    phrases: ["рабочий режим smoke", "включи работу smoke"],
    steps: [
      { id: "s1", type: "open_url", value: "https://example.com" },
      { id: "s2", type: "launch", value: tmpDb },
      { id: "s3", type: "keys", value: "ctrl+s" },
      { id: "s4", type: "pause", value: "0.05" },
      { id: "s5", type: "say", value: "Всё готово smoke" },
    ],
    reply: "Всё открыто, приятной работы smoke!",
    enabled: true,
  });
  assert.ok(cmd.id);
  assert.equal(cmd.steps.length, 5);
  assert.ok(cmd.phrases.includes("рабочий режим smoke"));
  assert.equal(listCustomCommands().length, before + 1);

  assert.equal(looksLikeCustomCommandIntent("рабочий режим smoke"), true);
  const matched = matchCustomCommandByPhrase(
    "пожалуйста включи рабочий режим smoke сейчас",
  );
  assert.ok(matched);
  assert.equal(matched!.id, cmd.id);

  const dry = await runCustomCommandById(cmd.id, { dryRun: true });
  assert.ok("steps" in dry && dry.ok, JSON.stringify(dry));
  if ("steps" in dry) {
    assert.equal(dry.steps.length, 5);
    assert.ok(dry.dryRun);
    assert.ok(dry.reply.includes("приятной работы") || dry.reply.includes("smoke"));
  }

  const live = await runCustomCommandById(cmd.id, { dryRun: false });
  assert.ok("steps" in live && live.ok, JSON.stringify(live));
  if ("reply" in live) {
    assert.equal(live.reply, "Всё открыто, приятной работы smoke!");
  }

  const fromChat = await handleCustomCommandsFromChat(
    "включи рабочий режим smoke",
  );
  assert.ok(fromChat.used.startsWith("custom:run:"));
  assert.ok(fromChat.block.includes("Кастомные команды"));
  assert.equal(fromChat.reply, "Всё открыто, приятной работы smoke!");

  // Orchestrator short-circuits to fixed reply (no LLM needed beyond mock)
  let desktopUsed: string | null = null;
  let assistantText = "";
  await sendChatMessage(
    { sessionId: null, text: "рабочий режим smoke" },
    (e) => {
      if (e.type === "assistant_done") {
        desktopUsed = e.desktopUsed;
        assistantText = e.utterance.content;
      }
    },
  );
  assert.ok(
    desktopUsed?.startsWith("custom:run:"),
    `expected custom desktopUsed, got ${desktopUsed}`,
  );
  assert.equal(assistantText, "Всё открыто, приятной работы smoke!");

  // Paths still works (no collision)
  const { upsertAppPath, handleAppPathsFromChat } = await import(
    "../electron/future/appPaths"
  );
  const pathRow = upsertAppPath({
    kind: "file",
    name: "Файл для paths smoke",
    path: tmpDb,
    tags: ["открой файл paths-cc-smoke"],
  });
  const pathRes = await handleAppPathsFromChat("открой файл paths-cc-smoke");
  assert.ok(pathRes.used.startsWith("paths:open:"));
  assert.equal(pathRow.kind, "file");

  deleteCustomCommand(cmd.id);
  assert.equal(
    listCustomCommands().some((c) => c.id === cmd.id),
    false,
  );

  console.log(
    JSON.stringify({
      ok: true,
      covered: [
        "upsert",
        "match",
        "dry-run",
        "run",
        "orchestrator",
        "paths-compat",
        "delete",
      ],
      desktopUsed,
    }),
  );

  closeStore();
  try {
    fs.unlinkSync(tmpDb);
    fs.unlinkSync(tmpDb + "-wal");
    fs.unlinkSync(tmpDb + "-shm");
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
