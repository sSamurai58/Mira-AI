import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../electron/config";
import {
  addUtterance,
  closeStore,
  createSession,
  openStore,
} from "../electron/store";
import {
  addCustomPhrase,
  createVoiceProject,
  deleteVoicePhrase,
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
  // Seed chat so generation prefers the most frequent assistant lines first.
  const session = createSession("voice-phrase-seed");
  addUtterance(session.id, "assistant", "Слушаю вас внимательно.");
  addUtterance(session.id, "assistant", "Готово, задача выполнена.");
  // Repeat a rarer line so frequency outranks a single recent one.
  for (let i = 0; i < 5; i++) {
    addUtterance(session.id, "assistant", "Проверяю статус задачи.");
  }

  const project = createVoiceProject({ name: "Smoke Voice", lang: "ru-RU" });
  assert.equal(project.status, "created");

  const batch1 = generatePhrases(project.id, 5);
  assert.equal(batch1.length, 5);
  const texts1 = new Set(batch1.map((p) => p.text));
  assert.equal(texts1.size, 5);
  assert.ok(
    batch1.some((p) => /проверяю|слушаю|готово/i.test(p.text)),
    "generation should prioritize assistant-used phrases",
  );
  assert.ok(
    batch1.some((p) => /проверяю/i.test(p.text)),
    "most frequent assistant phrase should appear in generation",
  );

  // UI always sends { count, minWords, maxWords } — must not return [].
  const optsBatch = generatePhrases(project.id, {
    count: 4,
    minWords: 20,
    maxWords: 60,
  });
  assert.equal(optsBatch.length, 4, "opts generate should return requested count");
  for (const p of optsBatch) {
    const n = p.text.trim().split(/\s+/).filter(Boolean).length;
    assert.ok(n >= 20 && n <= 60, `word range 20–60, got ${n}: ${p.text.slice(0, 80)}`);
  }

  const longBatch = generatePhrases(project.id, {
    count: 2,
    minWords: 80,
    maxWords: 120,
  });
  assert.equal(longBatch.length, 2, "long word-range generate must not be empty");
  for (const p of longBatch) {
    const n = p.text.trim().split(/\s+/).filter(Boolean).length;
    assert.ok(n >= 80 && n <= 120, `word range 80–120, got ${n}`);
  }
  assert.notEqual(
    longBatch[0]!.text,
    longBatch[1]!.text,
    "consecutive long texts must differ",
  );

  const veryLong = generatePhrases(project.id, {
    count: 2,
    minWords: 350,
    maxWords: 400,
  });
  assert.equal(veryLong.length, 2, "400-word generate must return 2");
  assert.notEqual(
    veryLong[0]!.text,
    veryLong[1]!.text,
    "two 400-word texts must not be identical",
  );
  const overlapRatio = (() => {
    const a = new Set(veryLong[0]!.text.split(/\s+/).slice(0, 80));
    const b = veryLong[1]!.text.split(/\s+/).slice(0, 80);
    const hit = b.filter((w) => a.has(w)).length;
    return hit / Math.max(1, b.length);
  })();
  assert.ok(
    overlapRatio < 0.92,
    `long texts should diversify fillers; overlap=${overlapRatio.toFixed(2)}`,
  );

  const doomed = generatePhrases(project.id, {
    count: 1,
    minWords: 4,
    maxWords: 12,
  });
  assert.equal(doomed.length, 1);
  const del = deleteVoicePhrase(doomed[0]!.id);
  assert.equal(del.ok, true, "untrained phrase should delete");
  assert.equal(
    listPhrases(project.id).some((p) => p.id === doomed[0]!.id),
    false,
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
  const progressLog: string[] = [];
  const trainBlocked = await trainVoiceModel(unlinkedProject.id);
  assert.equal(
    trainBlocked.report.ok,
    false,
    "train without phrases/links must fail",
  );
  assert.equal(trainBlocked.voice, null);

  const trained = await trainVoiceModel(project.id, (ev) => {
    progressLog.push(`${ev.step}:${ev.pct}`);
  });
  assert.ok(trained.report.ok, trained.report.detail);
  assert.ok(trained.voice, "custom voice not built");
  assert.ok(trained.project.custom_voice_id, "project missing custom_voice_id");
  assert.ok(trained.project.llm_profile, "llm profile missing");
  assert.ok(["ready", "ready_partial"].includes(trained.project.status));
  assert.ok(trained.report.linkedAccepted >= 3);
  assert.ok(
    (trained.report.steps?.length ?? 0) >= 4,
    "train should emit multi-step progress",
  );
  assert.ok(
    progressLog.some((s) => s.startsWith("segment:")),
    "train progress callback should receive segment step",
  );
  const trainMeta = JSON.parse(trained.voice!.meta_json ?? "{}") as {
    engine?: string;
    packDir?: string;
    wordUnitCount?: number;
    unitCount?: number;
  };
  assert.equal(trainMeta.engine, "mira-voice-pack-v1");
  assert.ok(trainMeta.packDir, "model pack dir missing");
  assert.ok(
    (trainMeta.wordUnitCount ?? 0) + (trainMeta.unitCount ?? 0) > 0,
    "trained pack should contain segmented units",
  );
  assert.ok(
    fs.existsSync(path.join(trainMeta.packDir!, "model-pack.json")),
    "model-pack.json should exist after train",
  );
  assert.ok(
    (trained.report.wordUnitCount ?? 0) > 0,
    "report should include word unit count",
  );
  assert.ok(
    (trained.report.lexiconSize ?? 0) >= (trained.report.audioLexiconSize ?? 0),
    "lexicon includes audio + provisional words",
  );
  const lexiconBefore = trained.report.lexiconSize ?? 0;
  assert.ok(
    (trained.report.provisionalLexiconSize ?? 0) > 0 ||
      (trained.report.lexiconSize ?? 0) >
        (trained.report.audioLexiconSize ?? 0),
    "unrecorded generated texts should contribute provisional lexicon entries",
  );

  // Novel unrecorded words must enlarge lexicon on retrain.
  addCustomPhrase(
    project.id,
    "Ксилофонный квазарный гиперболоид флуктуационно телепортирует зигзагообразный псевдоним.",
  );
  const afterNovel = await trainVoiceModel(project.id);
  assert.ok(afterNovel.report.ok, afterNovel.report.detail);
  assert.ok(
    (afterNovel.report.lexiconSize ?? 0) > lexiconBefore,
    `lexicon should grow after novel text: ${lexiconBefore} → ${afterNovel.report.lexiconSize}`,
  );

  // retrain after another clip keeps stable voice id
  importClip({
    projectId: project.id,
    sourcePath: sample,
    phraseId: phrases[3]?.id,
  });
  const again = await trainVoiceModel(project.id);
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
