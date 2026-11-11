import assert from "node:assert/strict";
import fs from "node:fs";
import { loadConfig } from "../electron/config";
import {
  inspectSkillSelection,
  sendChatMessage,
} from "../electron/orchestrator";
import { closeStore, openStore } from "../electron/store";
import {
  getBlenderPolicy,
  isBlenderSkill,
  looksLikeBlenderIntent,
  runDemoScene,
} from "../electron/tools/blender";
import { loadMarkdownCatalog } from "../electron/markdownCatalog";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.BLENDER_ENABLED = "true";
process.env.BLENDER_MODE = "dry-run";
process.env.MIRA_CONFIRM_AUTO = "accept";
loadConfig(true);
openStore();

assert.equal(
  looksLikeBlenderIntent("Собери простую сцену с кубом и светом в Blender"),
  true,
);
assert.equal(looksLikeBlenderIntent("привет"), false);

const catalog = loadMarkdownCatalog("skills");
const blenderSkill = catalog.find((s) => s.id === "blender-scene");
assert.ok(blenderSkill, "blender-scene skill missing");
assert.equal(blenderSkill.enabled, false, "must stay default-off");
assert.equal(isBlenderSkill(blenderSkill), true);

const selected = inspectSkillSelection(
  "Собери простую сцену с кубом и светом в Blender",
);
assert.ok(
  selected.selected.includes("blender-scene"),
  `expected blender-scene on-demand, got ${selected.selected.join(",")}`,
);
const idle = inspectSkillSelection("какие скиллы у тебя есть?");
assert.equal(
  idle.selected.includes("blender-scene"),
  false,
  "blender skill must stay inactive outside Blender tasks",
);

async function main() {
  const policy = getBlenderPolicy();
  assert.equal(policy.enabled, true);
  assert.equal(policy.mode, "dry-run");

  const job = await runDemoScene({ forceDry: true });
  assert.equal(job.ok, true);
  assert.equal(job.mode, "dry-run");
  assert.ok(fs.existsSync(job.scriptPath));
  assert.ok(fs.existsSync(job.logPath));

  let blenderUsed: string | null = null;
  let skillsUsed: string[] = [];
  await sendChatMessage(
    {
      sessionId: null,
      text: "Собери простую сцену с кубом и светом в Blender",
    },
    (e) => {
      if (e.type === "assistant_done") {
        blenderUsed = e.blenderUsed;
        skillsUsed = e.skillsUsed.map((s) => s.id);
      }
    },
  );
  assert.ok(
    blenderUsed === "blender:demo-cube-light:dry-run" ||
      blenderUsed?.startsWith("blender:demo-cube-light:"),
    `unexpected blenderUsed=${blenderUsed}`,
  );
  assert.ok(skillsUsed.includes("blender-scene"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        policyMode: policy.mode,
        found: policy.found,
        blenderUsed,
        skillsUsed,
        scriptPath: job.scriptPath,
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
