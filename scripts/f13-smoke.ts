import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formatDoctorText, runDoctor } from "../electron/doctor";
import { loadConfig } from "../electron/config";
import {
  appendAppLog,
  clearAppLogs,
  getLoggingStatus,
  listAppLogs,
  readLogFileTail,
} from "../electron/logging";
import { closeStore, openStore } from "../electron/store";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
loadConfig(true);
openStore();

async function main() {
  clearAppLogs();
  appendAppLog({
    level: "error",
    category: "test",
    message: "synthetic doctor error for F13",
    meta: { n: 1 },
  });
  appendAppLog({
    category: "test",
    message: "info line",
  });

  const rows = listAppLogs({ limit: 10 });
  assert.ok(rows.some((r) => r.message.includes("synthetic doctor error")));

  const status = getLoggingStatus();
  assert.ok(status.dbCount >= 2);
  assert.ok(status.latestFile);
  assert.ok(
    fs.existsSync(path.join(process.cwd(), "data", "logs", status.latestFile!)),
  );

  const tail = readLogFileTail(status.latestFile!, 20);
  assert.ok(tail.includes("synthetic doctor error"));

  const doctor = runDoctor();
  assert.equal(doctor.phase, "F13");
  assert.ok(doctor.findings.some((f) => f.id === "session-logs"));
  assert.ok(doctor.findings.some((f) => f.id === "api-llm"));
  assert.ok(doctor.recentErrors.some((e) => e.message.includes("synthetic")));
  const text = formatDoctorText(doctor);
  assert.ok(text.includes("Doctor (F13)"));
  assert.ok(text.includes("Последние ошибки"));

  // doctor itself appends a log
  const after = listAppLogs({ category: "doctor", limit: 5 });
  assert.ok(after.length >= 1);

  const cleared = clearAppLogs();
  assert.equal(cleared.ok, true);
  assert.ok(cleared.deleted >= 1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: doctor.phase,
        findings: doctor.findings.length,
        recentErrors: doctor.recentErrors.length,
        logFile: status.latestFile,
        summary: doctor.summary,
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
