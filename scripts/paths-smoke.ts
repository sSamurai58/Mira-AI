/**
 * Smoke: Workshop «Пути» — CRUD, tag match, open (headless), autodiscovery.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../electron/config";
import {
  autodiscoverAppPaths,
  deleteAppPath,
  handleAppPathsFromChat,
  listAppPaths,
  looksLikeAppPathIntent,
  matchAppPathByTag,
  openAppPathById,
  upsertAppPath,
} from "../electron/future/appPaths";
import { closeStore, openStore } from "../electron/store";
import { sendChatMessage } from "../electron/orchestrator";

const tmpDb = path.join(
  os.tmpdir(),
  `mira-paths-smoke-${Date.now()}.sqlite`,
);
process.env.DATABASE_PATH = tmpDb;
loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.MIRA_CONFIRM_AUTO = "accept";
loadConfig(true);
openStore();

async function main() {
  // Fresh DB → seed known apps
  const seeded = listAppPaths();
  assert.ok(seeded.length >= 10, `expected seed paths, got ${seeded.length}`);

  const custom = await upsertAppPath({
    kind: "file",
    name: "Отчёт smoke",
    path: tmpDb, // exists as file
    tags: ["открой отчёт smoke", "мой отчёт smoke"],
    enabled: true,
  });
  assert.equal(custom.kind, "file");
  assert.ok(custom.tags.includes("открой отчёт smoke"));

  assert.equal(looksLikeAppPathIntent("открой отчёт smoke"), true);
  const matched = matchAppPathByTag("пожалуйста открой отчёт smoke сейчас");
  assert.ok(matched);
  assert.equal(matched!.id, custom.id);

  const opened = await openAppPathById(custom.id);
  assert.equal(opened.ok, true, opened.detail);

  const fromChat = await handleAppPathsFromChat("открой отчёт smoke");
  assert.ok(fromChat.used.startsWith("paths:open:"));
  assert.ok(fromChat.block.includes("Пути"));

  const folder = await upsertAppPath({
    kind: "folder",
    name: "Документы smoke",
    path: os.tmpdir(),
    tags: ["открой документы smoke"],
  });
  assert.equal(folder.kind, "folder");

  const ad = autodiscoverAppPaths();
  assert.ok(ad.scanned >= 10);
  assert.ok(listAppPaths().length >= seeded.length);

  // Empty path fails gracefully
  const empty = await upsertAppPath({
    kind: "program",
    name: "Empty Prog",
    path: "",
    tags: ["открой empty prog smoke"],
  });
  const fail = await openAppPathById(empty.id);
  assert.equal(fail.ok, false);

  deleteAppPath(empty.id);
  assert.equal(
    listAppPaths().some((p) => p.id === empty.id),
    false,
  );

  // Orchestrator wires tag → desktopUsed
  let desktopUsed: string | null = null;
  await sendChatMessage(
    { sessionId: null, text: "открой отчёт smoke" },
    (e) => {
      if (e.type === "assistant_done") desktopUsed = e.desktopUsed;
    },
  );
  assert.ok(
    desktopUsed?.startsWith("paths:open:"),
    `expected paths desktopUsed, got ${desktopUsed}`,
  );

  console.log(
    JSON.stringify({
      ok: true,
      seeded: seeded.length,
      total: listAppPaths().length,
      desktopUsed,
      covered: ["list", "upsert", "match", "open", "autodiscover", "orchestrator"],
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
