import assert from "node:assert/strict";
import {
  matchWakeWord,
  normalizeSpeech,
  stripWakePhrase,
} from "../src/ui/voice/handsFree";

assert.equal(normalizeSpeech("  Ми́ра,  привет! "), "мира привет");

assert.equal(matchWakeWord("Мира", "мира", "strict"), true);
assert.equal(matchWakeWord("мира расскажи погоду", "мира", "strict"), true);
assert.equal(matchWakeWord("расскажи мира", "мира", "strict"), true);
assert.equal(matchWakeWord("привет", "мира", "strict"), false);

assert.equal(matchWakeWord("эй мира помоги", "мира", "normal"), true);
assert.equal(matchWakeWord("эй помощник", "мира", "normal"), false);

assert.equal(
  matchWakeWord("эй моя милая мира сегодня", "моя мира", "loose"),
  true,
);

assert.equal(stripWakePhrase("Мира, какая погода?", "мира"), "какая погода?");
assert.equal(stripWakePhrase("просто текст", "мира"), "просто текст");

console.log(
  JSON.stringify(
    {
      ok: true,
      wake: "matchWakeWord + stripWakePhrase",
      note: "UI barge-in/hands-free in ChatPage + Settings → Голос",
    },
    null,
    2,
  ),
);
