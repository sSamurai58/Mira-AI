/**
 * Headless P3 smoke: skill selection on-demand + protocol match.
 */
import assert from "node:assert/strict";
import {
  ensureSeededCatalog,
  loadMarkdownCatalog,
} from "../electron/markdownCatalog";
import {
  inspectSkillSelection,
  selectProtocolForTurn,
  selectSkillsForTurn,
  sendChatMessage,
} from "../electron/orchestrator";
import { loadConfig } from "../electron/config";
import { closeStore, openStore } from "../electron/store";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
loadConfig(true);

ensureSeededCatalog("skills");
ensureSeededCatalog("protocols");
openStore();

const skills = loadMarkdownCatalog("skills");
const protocols = loadMarkdownCatalog("protocols");
assert.ok(skills.length >= 2, "expected seeded skills");
assert.ok(protocols.some((p) => p.id === "morning-check"));

const idle = inspectSkillSelection("Привет, как дела?");
assert.equal(idle.selected.length, 0, "idle chat must not load skills");
assert.ok(idle.catalogSize >= 2);

const code = selectSkillsForTurn("Напиши функцию на typescript");
assert.ok(code.some((s) => s.id === "code-helper"));
assert.ok(code.length < skills.length, "must not attach all skills");

const explicit = selectSkillsForTurn("включи skill summarizer");
assert.deepEqual(
  explicit.map((s) => s.id),
  ["summarizer"],
);

const proto = selectProtocolForTurn("протокол утро");
assert.equal(proto?.id, "morning-check");

async function main() {
  const events: string[] = [];
  let skillsUsed: string[] = [];
  await sendChatMessage(
    { sessionId: null, text: "Напиши функцию на python" },
    (e) => {
      events.push(e.type);
      if (e.type === "assistant_done") {
        skillsUsed = e.skillsUsed.map((s) => s.id);
      }
    },
  );

  assert.ok(events.includes("context"));
  assert.ok(skillsUsed.includes("code-helper"));
  assert.ok(!skills.every((s) => skillsUsed.includes(s.id)));

  console.log(
    JSON.stringify(
      {
        ok: true,
        skillsCatalog: skills.map((s) => s.id),
        protocolsCatalog: protocols.map((p) => p.id),
        idleSelected: idle.selected,
        codeSelected: code.map((s) => s.id),
        protocol: proto?.id,
        chatSkillsUsed: skillsUsed,
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
