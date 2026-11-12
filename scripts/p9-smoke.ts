import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig } from "../electron/config";
import {
  addUtterance,
  closeStore,
  createSession,
  openStore,
} from "../electron/store";
import {
  createVoiceProject,
  generatePhrases,
  getCustomVoiceCorpus,
  getStudioSnapshot,
  importClip,
  listCustomVoices,
  listPhrases,
  trainVoiceModel,
} from "../electron/voiceStudio/studio";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
loadConfig(true);
openStore();

async function main() {
  // Seed chat so generation prefers real assistant lines first.
  const session = createSession("voice-phrase-seed");
  addUtterance(session.id, "assistant", "Слушаю вас внимательно.");
  addUtterance(session.id, "assistant", "Готово, задача выполнена.");

  const project = createVoiceProject({ name: "Smoke Voice", lang: "ru-RU" });
  assert.equal(project.status, "created");

  const batch1 = generatePhrases(project.id, 5);
  assert.equal(batch1.length, 5);
  const texts1 = new Set(batch1.map((p) => p.text));
  assert.equal(texts1.size, 5);
  assert.ok(
    batch1.some((p) => /слушаю|готово/i.test(p.text)),
    "generation should prioritize assistant-used phrases",
  );

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
  const phrases = listPhrases(project.id);
  for (let i = 0; i < 3; i++) {
    const imported = importClip({
      projectId: project.id,
      sourcePath: sample,
      phraseId: phrases[i]?.id,
    });
    assert.equal(imported.processed.voice, null, "train is explicit");
    assert.ok(
      ["collecting", "ready_to_train", "processing", "needs_data"].includes(
        imported.processed.project.status,
      ),
    );
  }

  // Unlinked-only corpus must not train
  const unlinkedProject = createVoiceProject({ name: "Unlinked", lang: "ru-RU" });
  for (let i = 0; i < 3; i++) {
    importClip({
      projectId: unlinkedProject.id,
      sourcePath: sample,
      phraseId: null,
    });
  }
  const trainBlocked = trainVoiceModel(unlinkedProject.id);
  assert.equal(
    trainBlocked.report.ok,
    false,
    "train without phrases/links must fail",
  );
  assert.equal(trainBlocked.voice, null);

  const trained = trainVoiceModel(project.id);
  assert.ok(trained.report.ok, trained.report.detail);
  assert.ok(trained.voice, "custom voice not built");
  assert.ok(trained.project.custom_voice_id, "project missing custom_voice_id");
  assert.ok(trained.project.llm_profile, "llm profile missing");
  assert.ok(["ready", "ready_partial"].includes(trained.project.status));
  assert.ok(trained.report.linkedAccepted >= 3);

  // retrain after another clip keeps stable voice id
  importClip({
    projectId: project.id,
    sourcePath: sample,
    phraseId: phrases[3]?.id,
  });
  const again = trainVoiceModel(project.id);
  assert.equal(
    again.voice?.id,
    trained.voice!.id,
    "voice id should be stable on retrain",
  );

  const catalog = listCustomVoices();
  assert.ok(catalog.some((v) => v.id === trained.voice!.id));

  const corpus = getCustomVoiceCorpus(trained.voice!.id);
  assert.equal(corpus.voice.id, trained.voice!.id);
  assert.ok(
    corpus.units.length >= 3,
    "trained voice corpus should expose accepted phrase clips",
  );

  const snap = getStudioSnapshot(project.id);
  assert.ok(snap.phrases.length >= 6);
  assert.ok(snap.clips.length >= 3);
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
        customVoiceId: trained.voice!.id,
        status: again.project.status,
        recommendation: again.project.recommendation,
        report: again.report,
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
