import assert from "node:assert/strict";
import { loadConfig } from "../electron/config";
import { sendChatMessage } from "../electron/orchestrator";
import {
  createTerminalSession,
  disposeAllTerminals,
  getTerminalHistory,
  listTerminalSessions,
  runCommandInTerminal,
  writeTerminal,
} from "../electron/terminal/manager";
import {
  extractTerminalCommand,
  isDangerousTerminalCommand,
  looksLikeTerminalIntent,
} from "../electron/tools/terminal";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.TERMINAL_ENABLED = "true";
process.env.TERMINAL_CONFIRM_DANGEROUS = "true";
process.env.MIRA_CONFIRM_AUTO = "accept";
loadConfig(true);

assert.equal(looksLikeTerminalIntent("Выполни в терминале: echo hi"), true);
assert.equal(looksLikeTerminalIntent("привет"), false);
assert.equal(extractTerminalCommand("Выполни в терминале: ls -la"), "ls -la");
assert.equal(isDangerousTerminalCommand("rm -rf /"), true);
assert.equal(isDangerousTerminalCommand("echo ok"), false);

async function main() {
  const session = createTerminalSession({ title: "smoke" });
  assert.ok(session.id);
  assert.ok(session.backend === "node-pty" || session.backend === "spawn");

  writeTerminal(session.id, "export PS1='$ '\n");
  const ran = await runCommandInTerminal("echo mira-p7 && pwd", {
    sessionId: session.id,
    waitMs: 5000,
  });
  assert.equal(ran.sessionId, session.id);
  assert.match(ran.output, /mira-p7/);

  const hist = getTerminalHistory(session.id);
  assert.ok(hist.length > 0);

  const second = createTerminalSession({ title: "smoke-2" });
  assert.equal(listTerminalSessions().length >= 2, true);
  void second;

  let terminalUsed: string | null = null;
  await sendChatMessage(
    { sessionId: null, text: "Выполни в терминале: echo from-chat" },
    (e) => {
      if (e.type === "assistant_done") terminalUsed = e.terminalUsed;
    },
  );
  assert.equal(terminalUsed, "terminal:ran");

  process.env.MIRA_CONFIRM_AUTO = "deny";
  terminalUsed = null;
  await sendChatMessage(
    { sessionId: null, text: "Выполни в терминале: echo denied" },
    (e) => {
      if (e.type === "assistant_done") terminalUsed = e.terminalUsed;
    },
  );
  assert.equal(terminalUsed, "terminal:denied");

  console.log(
    JSON.stringify(
      {
        ok: true,
        backend: session.backend,
        outputSample: ran.output.slice(0, 120),
        sessions: listTerminalSessions().length,
        chatTerminal: "terminal:ran",
        denied: terminalUsed,
      },
      null,
      2,
    ),
  );
  disposeAllTerminals();
}

main().catch((err) => {
  console.error(err);
  disposeAllTerminals();
  process.exit(1);
});
