/**
 * Smoke: interaction mode, dictation versions, journal, classify, STT score, TTS normalize.
 */
import assert from "node:assert/strict";

// Minimal localStorage for Node
const store = new Map<string, string>();
(
  globalThis as unknown as {
    localStorage: Storage;
  }
).localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => {
    store.set(k, String(v));
  },
  removeItem: (k) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: () => null,
  get length() {
    return store.size;
  },
};

async function main() {
  const { classifyCommand, setInteractionMode, requestConfirm, answerPendingConfirm, getInteractionMode } =
    await import("../src/ui/voice/interactionMode");
  const {
    appendDictation,
    saveDictationVersion,
    getDictationSession,
    newDictationSession,
    getActiveBody,
  } = await import("../src/ui/voice/dictationSession");
  const { logJournal, getActionJournal } = await import(
    "../src/ui/voice/actionJournal"
  );
  const { normalizeForTts } = await import("../src/ui/voice/ttsNormalize");
  const { statusPhrase } = await import("../src/ui/voice/statusPhrases");
  const { scoreSttResult, STT_TEST_PHRASES } = await import(
    "../src/ui/voice/sttTestSet"
  );
  const { routeVoiceTranscript } = await import("../src/ui/voice/voiceRoute");
  const { setVoiceStyleId, getVoiceStyleInstruction } = await import(
    "../src/ui/voice/voiceStyle"
  );
  const { splitParagraphs, remapParagraphIndex, saveDictationVersion: saveVer } =
    await import("../src/ui/voice/dictationSession");
  const { proofreadLocal } = await import("../src/ui/voice/proofreadLocal");
  const { upsertNameEntry, applyNameDictionary } = await import(
    "../src/ui/voice/nameDictionary"
  );
  const { runInPhase, getPipelinePhase } = await import(
    "../src/ui/voice/modelQueue"
  );
  const { vadPushLevel, vadAttachTranscript, listVadSegments, clearVadSegments } =
    await import("../src/ui/voice/vadSegments");
  const { setExternalPolicy, gateExternalTts, grantExternalOnce, gateExternalTtsWithGrant } =
    await import("../src/ui/voice/externalPolicy");
  const {
    saveDictationToDisk,
    exportDictationBackupPackage,
    verifyDictationBackup,
  } = await import("../electron/dictation/fsStore");

  // 1 modes + confirm
  setInteractionMode("command");
  assert.equal(getInteractionMode(), "command");
  const { prompt } = requestConfirm({
    action: "delete_note",
    objectLabel: "Тест",
  });
  assert.match(prompt, /подтверждаю/i);
  assert.equal(answerPendingConfirm("подтверждаю").answer, "yes");

  // classify
  assert.equal(classifyCommand("Стоп").kind, "stop");
  assert.equal(classifyCommand("Сохрани версию").kind, "save_version");
  assert.equal(classifyCommand("Читай с третьего абзаца").kind, "read_from");
  assert.equal(classifyCommand("Режим диктовки").kind, "switch_dictation");

  // 2 versions
  newDictationSession();
  appendDictation("Раз два три.");
  appendDictation("Четыре.");
  const src = getDictationSession().sourceDictation;
  const { version, statusPhrase: sp } = saveDictationVersion("smoke");
  assert.equal(version.number, 1);
  assert.match(sp, /версия 1/);
  assert.equal(getDictationSession().sourceDictation, src);
  assert.ok(getDictationSession().lockedSource);
  appendDictation("после фиксации");
  assert.equal(getDictationSession().sourceDictation, src);
  assert.ok(getActiveBody().includes("после фиксации") || getActiveBody().includes("Раз"));

  // 3 journal
  logJournal({ type: "stt", tool: "asr", transcript: "привет" });
  assert.ok(getActionJournal().length >= 1);

  // 4 paragraphs / read helpers
  const paras = splitParagraphs("A\n\nB\n\nC");
  assert.deepEqual(paras, ["A", "B", "C"]);

  // 5 normalize + status (numbers→words, lowercase)
  assert.match(normalizeForTts("Проверь API и TTS"), /эй пи ай/i);
  assert.match(normalizeForTts("У меня 42 яблока"), /сорок два/);
  assert.ok(!/[A-Z]/.test(normalizeForTts("Hello API")));
  assert.match(statusPhrase("draft_saved", { version: "2" }), /версия 2/);

  // 6 styles
  setVoiceStyleId("operator");
  assert.match(getVoiceStyleInstruction(), /оператор/i);

  // 7 STT score
  assert.ok(STT_TEST_PHRASES.length >= 6);
  const ok = scoreSttResult("Сохрани версию", "Сохрани версию");
  assert.equal(ok.ok, true);
  const bad = scoreSttResult("Сохрани версию", "Удали файл");
  assert.equal(bad.ok, false);

  // route dictation
  setInteractionMode("dictation");
  const r = routeVoiceTranscript("новый абзац текста");
  assert.equal(r.handled, true);
  if (r.handled) assert.equal(r.kind, "dictation_append");

  setInteractionMode("command");
  const r2 = routeVoiceTranscript("режим диктовки");
  assert.equal(r2.handled, true);

  // proofread + dictionary
  const pr = proofreadLocal("Привет  привет мир мир.");
  assert.ok(pr.issues.length >= 1);
  upsertNameEntry("мираа", "Мира");
  assert.match(applyNameDictionary("привет мираа").text, /Мира/i);

  // remap
  const mapped = remapParagraphIndex(
    "Абзац один про котов.\n\nАбзац два про собак.",
    "Абзац один про котов и чай.\n\nАбзац два про собак.\n\nНовый.",
    1,
  );
  assert.equal(mapped, 1);

  // VAD segments
  clearVadSegments();
  vadPushLevel(0.5, 1000);
  vadPushLevel(0.5, 1100);
  vadPushLevel(0.0, 2000);
  vadAttachTranscript("раз два");
  assert.ok(listVadSegments().length >= 1);

  // external policy
  setExternalPolicy({ blockExternal: true, confirmEachExternal: false });
  assert.equal(gateExternalTts().allow, false);
  setExternalPolicy({ blockExternal: false, confirmEachExternal: true });
  assert.equal(gateExternalTts().allow, false);
  grantExternalOnce();
  assert.equal(gateExternalTtsWithGrant().allow, true);

  // model queue ordering
  const order: string[] = [];
  await runInPhase("asr", async () => {
    order.push("asr");
  });
  await runInPhase("llm", async () => {
    order.push("llm");
  });
  await runInPhase("tts", async () => {
    order.push("tts");
  });
  assert.deepEqual(order, ["asr", "llm", "tts"]);
  assert.equal(getPipelinePhase(), "idle");

  // disk dictation + backup verify
  newDictationSession();
  appendDictation("Тест бэкапа диктовки с именем Анна.");
  saveVer("smoke-disk");
  const disk = saveDictationToDisk({
    meta: {
      session_id: getDictationSession().sessionId,
      created_at: getDictationSession().createdAt,
      status: "draft",
      source: "dictation",
      current_version: getDictationSession().currentVersion,
      locked_source: true,
      read_position: "paragraph-0",
    },
    sourceDictation: getDictationSession().sourceDictation,
    cleanedText: getDictationSession().cleanedText,
    versions: getDictationSession().versions.map((v) => ({
      number: v.number,
      operation: v.operation,
      body: v.body,
      createdAt: v.createdAt,
    })),
    segments: getDictationSession().segments,
  });
  assert.equal(disk.ok, true);
  const bak = exportDictationBackupPackage();
  assert.equal(bak.ok, true);
  const ver = verifyDictationBackup(bak.packagePath);
  assert.equal(ver.ok, true);

  console.log("voice-pipeline-smoke: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
