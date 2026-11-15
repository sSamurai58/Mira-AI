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
  const { splitParagraphs } = await import("../src/ui/voice/dictationSession");

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

  // 5 normalize + status
  assert.match(normalizeForTts("Проверь API и TTS"), /эй пи ай/i);
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

  console.log("voice-pipeline-smoke: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
