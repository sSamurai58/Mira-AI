/**
 * Smoke: Workshop «Кастомные команды» — CRUD, phrase match, dry-run, new step kinds, orchestrator.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../electron/config";
import {
  ACTION_TYPES,
  deleteCustomCommand,
  handleCustomCommandsFromChat,
  listCustomCommands,
  looksLikeCustomCommandIntent,
  matchCustomCommandByPhrase,
  runCustomCommandById,
  upsertCustomCommand,
  type CustomCommandActionType,
} from "../electron/future/customCommands";
import { sendChatMessage } from "../electron/orchestrator";
import { closeStore, openStore } from "../electron/store";
import { parseKeyCombo } from "../electron/tools/screen";

const tmpDb = path.join(
  os.tmpdir(),
  `mira-custom-commands-smoke-${Date.now()}.sqlite`,
);
const tmpDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "mira-custom-commands-folder-"),
);
process.env.DATABASE_PATH = tmpDb;
loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.MIRA_CONFIRM_AUTO = "accept";
process.env.SCREEN_CONTROL_ENABLED = "false";
process.env.TERMINAL_ENABLED = "true";
loadConfig(true);
openStore();

async function main() {
  assert.deepEqual(parseKeyCombo("Ctrl + Shift + S"), ["ctrl", "shift", "s"]);
  assert.deepEqual(parseKeyCombo("win+shift+s"), ["win", "shift", "s"]);
  assert.ok(ACTION_TYPES.includes("type"));
  assert.ok(ACTION_TYPES.includes("click"));
  assert.ok(ACTION_TYPES.includes("terminal"));

  const before = listCustomCommands().length;

  const { upsertAppPath } = await import("../electron/future/appPaths");
  const pathRow = upsertAppPath({
    kind: "file",
    name: "Файл для paths smoke",
    path: tmpDb,
    tags: ["открой файл paths-cc-smoke"],
  });

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

  // --- New step kinds (dry-run coverage) ---
  const expanded = upsertCustomCommand({
    name: "Расширенные действия smoke",
    phrases: ["расширенные действия smoke"],
    steps: [
      { id: "n1", type: "type", value: "hello smoke" },
      { id: "n2", type: "click", value: "120, 340" },
      { id: "n3", type: "clipboard_copy", value: "clip smoke" },
      { id: "n4", type: "clipboard_paste", value: "" },
      { id: "n5", type: "open_path", value: pathRow.id },
      { id: "n6", type: "open_folder", value: tmpDir },
      { id: "n7", type: "notify", value: "Smoke|Проверка уведомления" },
      { id: "n8", type: "hud_say", value: "HUD smoke" },
      { id: "n9", type: "window_minimize", value: "" },
      { id: "n10", type: "window_close", value: "" },
      { id: "n11", type: "terminal", value: "echo custom-commands-smoke" },
      { id: "n12", type: "pause", value: "0.01" },
      { id: "n13", type: "open_url", value: "example.com" },
    ],
    reply: "Расширенные ok",
    enabled: true,
  });
  assert.equal(expanded.steps.length, 13);

  const kinds = new Set(expanded.steps.map((s) => s.type));
  const expectedKinds: CustomCommandActionType[] = [
    "type",
    "click",
    "clipboard_copy",
    "clipboard_paste",
    "open_path",
    "open_folder",
    "notify",
    "hud_say",
    "window_minimize",
    "window_close",
    "terminal",
    "pause",
    "open_url",
  ];
  for (const k of expectedKinds) {
    assert.ok(kinds.has(k), `missing kind ${k}`);
  }

  const expandedDry = await runCustomCommandById(expanded.id, { dryRun: true });
  assert.ok("steps" in expandedDry && expandedDry.ok, JSON.stringify(expandedDry));
  if ("steps" in expandedDry) {
    assert.equal(expandedDry.steps.length, 13);
    assert.ok(expandedDry.steps.every((s) => s.ok), JSON.stringify(expandedDry.steps));
    const byType = Object.fromEntries(
      expandedDry.steps.map((s) => [s.type, s.detail]),
    );
    assert.match(byType.type!, /ввести|Проверка/i);
    assert.match(byType.click!, /клик|Проверка/i);
    assert.match(byType.clipboard_copy!, /копир/i);
    assert.match(byType.open_path!, /путь|Проверка/i);
    assert.match(byType.open_folder!, /папк/i);
    assert.match(byType.notify!, /уведомлен/i);
    assert.match(byType.hud_say!, /HUD/i);
    assert.match(byType.window_minimize!, /свернут/i);
    assert.match(byType.window_close!, /закрыт/i);
    assert.match(byType.terminal!, /терминал/i);
    assert.match(byType.pause!, /задержк/i);
  }

  // Live run of non-pty new kinds (screen control off → soft dry-run ok).
  // Skip terminal here: node-pty keeps the event loop alive after smoke exits.
  const liveKinds = upsertCustomCommand({
    name: "Live kinds smoke",
    phrases: ["live kinds smoke"],
    steps: [
      { id: "l1", type: "type", value: "live" },
      { id: "l2", type: "click", value: "10, 10" },
      { id: "l3", type: "clipboard_copy", value: "live clip" },
      { id: "l4", type: "open_path", value: pathRow.id },
      { id: "l5", type: "open_folder", value: tmpDir },
      { id: "l6", type: "notify", value: "Live smoke" },
      { id: "l7", type: "hud_say", value: "HUD live" },
      { id: "l8", type: "pause", value: "0.01" },
    ],
    reply: "Live kinds ok",
    enabled: true,
  });
  const expandedLive = await runCustomCommandById(liveKinds.id, {
    dryRun: false,
  });
  assert.ok("steps" in expandedLive && expandedLive.ok, JSON.stringify(expandedLive));
  deleteCustomCommand(liveKinds.id);

  // Paths still works (no collision)
  const pathRes = await (
    await import("../electron/future/appPaths")
  ).handleAppPathsFromChat("открой файл paths-cc-smoke");
  assert.ok(pathRes.used.startsWith("paths:open:"));
  assert.equal(pathRow.kind, "file");

  deleteCustomCommand(cmd.id);
  deleteCustomCommand(expanded.id);
  assert.equal(
    listCustomCommands().some((c) => c.id === cmd.id || c.id === expanded.id),
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
        "new-kinds",
        "delete",
      ],
      actionTypes: ACTION_TYPES.length,
      desktopUsed,
    }),
  );

  closeStore();
  try {
    fs.unlinkSync(tmpDb);
    fs.unlinkSync(tmpDb + "-wal");
    fs.unlinkSync(tmpDb + "-shm");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
