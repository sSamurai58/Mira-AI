import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  exportBackup,
  forgetData,
  getBackupStatus,
  importBackup,
} from "../electron/backup";
import { loadConfig } from "../electron/config";
import {
  addUtterance,
  closeStore,
  createSession,
  ensureBootstrapSession,
  listSessions,
  listUtterances,
  openStore,
} from "../electron/store";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.MIRA_CONFIRM_AUTO = "accept";
loadConfig(true);
openStore();
ensureBootstrapSession();

async function main() {
  const session = createSession("F11 smoke memory");
  addUtterance(session.id, "user", "секретный факт для forget-теста");
  assert.ok(listUtterances(session.id).length >= 1);

  const before = getBackupStatus();
  assert.ok(before.health.utterances >= 1);

  const exported = await exportBackup({ includeSecrets: false });
  assert.equal(exported.ok, true);
  assert.equal(exported.manifest.includeSecrets, false);
  assert.ok(exported.manifest.parts.includes("mira.db"));
  assert.ok(!exported.manifest.parts.includes("secrets.env"));
  assert.ok(fs.existsSync(path.join(exported.packagePath, "manifest.json")));
  assert.ok(fs.existsSync(path.join(exported.packagePath, "mira.db")));

  const forgot = await forgetData("memory");
  assert.equal(forgot.ok, true);
  const afterForget = listSessions();
  // bootstrap recreated
  assert.ok(afterForget.length >= 1);
  const userSessions = afterForget.filter((s) => s.title === "F11 smoke memory");
  assert.equal(userSessions.length, 0);

  // recreate something then import restores backup
  const s2 = createSession("should-be-replaced");
  addUtterance(s2.id, "user", "temp");
  const imported = await importBackup(exported.packagePath);
  assert.equal(imported.ok, true);
  const restored = listSessions();
  assert.ok(
    restored.some((s) => s.title === "F11 smoke memory"),
    "import should restore exported session",
  );

  // secrets never auto-applied: export with secrets creates secrets.env only if .env exists
  // deny path outside data/
  let blocked = false;
  try {
    await importBackup("/tmp/not-mira-backup");
  } catch {
    blocked = true;
  }
  assert.equal(blocked, true);

  const status = getBackupStatus();
  assert.ok(status.packages.length >= 1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        package: path.basename(exported.packagePath),
        parts: exported.manifest.parts,
        packages: status.packages.length,
        restoredSessions: restored.length,
      },
      null,
      2,
    ),
  );
  closeStore();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
