import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig } from "../electron/config";
import { closeStore, openStore } from "../electron/store";
import {
  createVoiceProject,
  generatePhrases,
  getStudioSnapshot,
  importClip,
  listCustomVoices,
  listPhrases,
} from "../electron/voiceStudio/studio";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
loadConfig(true);
openStore();

async function main() {
  const project = createVoiceProject({ name: "Smoke Voice", lang: "ru-RU" });
  assert.equal(project.status, "created");

  const batch1 = generatePhrases(project.id, 5);
  assert.equal(batch1.length, 5);
  const texts1 = new Set(batch1.map((p) => p.text));
  assert.equal(texts1.size, 5);

  const batch2 = generatePhrases(project.id, 5);
  assert.ok(batch2.length >= 1);
  for (const p of batch2) {
    assert.equal(texts1.has(p.text), false, "dedup failed");
  }

  const sample = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "sample-phrase.wav",
  );
  const phrase = listPhrases(project.id)[0];
  const imported = importClip({
    projectId: project.id,
    sourcePath: sample,
    phraseId: phrase.id,
  });
  assert.ok(imported.processed.voice, "custom voice not built");
  assert.ok(
    imported.processed.project.custom_voice_id,
    "project missing custom_voice_id",
  );
  assert.ok(imported.processed.project.llm_profile, "llm profile missing");
  assert.ok(
    ["ready", "ready_partial"].includes(imported.processed.project.status),
  );

  // second clip updates same custom voice
  const again = importClip({
    projectId: project.id,
    sourcePath: sample,
    phraseId: listPhrases(project.id)[1]?.id,
  });
  assert.equal(
    again.processed.voice?.id,
    imported.processed.voice!.id,
    "voice id should be stable on update",
  );

  const catalog = listCustomVoices();
  assert.ok(catalog.some((v) => v.id === imported.processed.voice!.id));

  const snap = getStudioSnapshot(project.id);
  assert.ok(snap.phrases.length >= 6);
  assert.ok(snap.clips.length >= 2);
  assert.ok(snap.project?.recommendation);

  // path allowlist
  let blocked = false;
  try {
    importClip({
      projectId: project.id,
      sourcePath: "/etc/passwd",
    });
  } catch {
    blocked = true;
  }
  assert.equal(blocked, true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: project.id,
        phrases: snap.phrases.length,
        clips: snap.clips.length,
        customVoiceId: imported.processed.voice!.id,
        status: again.processed.project.status,
        recommendation: again.processed.project.recommendation,
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
