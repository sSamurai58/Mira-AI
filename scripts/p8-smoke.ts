import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig } from "../electron/config";
import {
  importLibraryFile,
  looksLikeLibraryLearnIntent,
  processLibraryItem,
  proposeSkillFromItem,
  searchLearnedUnits,
} from "../electron/library/learn";
import { loadMarkdownCatalog } from "../electron/markdownCatalog";
import { sendChatMessage } from "../electron/orchestrator";
import { closeStore, getLearnPlan, listLearnedUnits, openStore } from "../electron/store";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.MIRA_CONFIRM_AUTO = "accept";
loadConfig(true);
openStore();

assert.equal(
  looksLikeLibraryLearnIntent("Говори в стиле книги Внимание и фокус"),
  true,
);
assert.equal(looksLikeLibraryLearnIntent("привет"), false);

async function main() {
  const sample = path.resolve(
    process.cwd(),
    "seed",
    "library",
    "attention-notes.md",
  );
  const item = importLibraryFile({
    filePath: sample,
    title: "Внимание и фокус",
  });
  assert.equal(item.status, "new");
  assert.ok(item.extracted_text && item.extracted_text.length > 20);

  const processed = processLibraryItem(item.id);
  assert.equal(processed.item.status, "ready");
  assert.ok(processed.units.length >= 4);
  assert.ok(processed.plan.length >= 3);

  const plan = getLearnPlan(item.id);
  assert.ok(plan);

  const units = listLearnedUnits({ libraryItemId: item.id });
  assert.ok(units.some((u) => u.kind === "thesis"));

  const found = searchLearnedUnits("внимание", 5);
  assert.ok(found.length >= 1);

  // 14.8 reprocess bumps version
  const again = processLibraryItem(item.id);
  assert.equal(again.item.version, processed.item.version + 1);

  const skill = await proposeSkillFromItem(item.id);
  assert.equal(skill.ok, true);
  assert.ok(skill.skillId);
  const catalog = loadMarkdownCatalog("skills");
  const created = catalog.find((s) => s.id === skill.skillId);
  assert.ok(created);
  assert.equal(created.enabled, false);

  let learnedUsed: string | null = null;
  await sendChatMessage(
    {
      sessionId: null,
      text: "Говори в стиле книги Внимание и фокус, мягко верни внимание",
    },
    (e) => {
      if (e.type === "assistant_done") learnedUsed = e.learnedUsed;
    },
  );
  assert.ok(learnedUsed && learnedUsed.startsWith("learned:"));
  assert.notEqual(learnedUsed, "learned:none");

  console.log(
    JSON.stringify(
      {
        ok: true,
        itemId: item.id,
        status: again.item.status,
        version: again.item.version,
        units: units.length,
        skillId: skill.skillId,
        chatLearned: learnedUsed,
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
