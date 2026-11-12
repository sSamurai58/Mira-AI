/**
 * Headless P2 smoke for voice helpers (no mic/GUI required).
 */
import assert from "node:assert/strict";
import {
  getActiveVoiceId,
  isCustomVoiceId,
  listSystemVoices,
  pickDefaultVoiceId,
  setActiveVoiceId,
} from "../src/ui/voice/catalog.ts";
import {
  phraseMatchScore,
  planCorpusSpeech,
} from "../src/ui/voice/corpusTts.ts";
import { getVoiceEngineStatus } from "../src/ui/voice/engineStatus.ts";
import { getActiveTtsEngine } from "../src/ui/voice/ttsEngines.ts";

// catalog helpers must work with empty speechSynthesis (node)
const empty = listSystemVoices();
assert.equal(empty.length, 0);

const fake = [
  {
    id: "uri-a::ru-RU",
    name: "Mira RU Neural",
    lang: "ru-RU",
    localService: true,
  },
  {
    id: "uri-b::en-US",
    name: "English",
    lang: "en-US",
    localService: true,
    default: true,
  },
];

const picked = pickDefaultVoiceId(fake);
assert.equal(picked, "uri-a::ru-RU");

// localStorage shim for node
const mem = new Map<string, string>();
(
  globalThis as unknown as {
    localStorage: Storage;
  }
).localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

setActiveVoiceId("uri-b::en-US");
assert.equal(getActiveVoiceId(fake), "uri-b::en-US");

const studioId = "mira-studio-deadbeef";
assert.equal(isCustomVoiceId(studioId), true);
setActiveVoiceId(studioId);
assert.equal(getActiveVoiceId(fake), studioId);
assert.equal(getActiveTtsEngine(), "neural-pack");

const units = [
  {
    phraseId: "p1",
    text: "Привет, я Mira — твой голосовой помощник.",
    filePath: "/tmp/a.wav",
  },
  {
    phraseId: "p2",
    text: "Спасибо, сообщение отправлено.",
    filePath: "/tmp/b.wav",
  },
];
assert.ok(phraseMatchScore(units[0].text, units[0].text) >= 0.99);
const corpusPlan = planCorpusSpeech(units[0].text, units);
assert.equal(corpusPlan.mode, "corpus");
assert.equal(corpusPlan.clipCount, 1);
const hybrid = planCorpusSpeech(
  "Спасибо, сообщение отправлено. А ещё расскажи анекдот про кота.",
  units,
);
assert.equal(hybrid.mode, "hybrid");
assert.ok(hybrid.clipCount >= 1);
assert.ok(hybrid.webspeechCount >= 1);
const fallback = planCorpusSpeech("Совершенно новая фраза вне корпуса.", units);
assert.equal(fallback.mode, "webspeech-fallback");
const preview = planCorpusSpeech("Совершенно новая фраза вне корпуса.", units, {
  preferPreview: true,
  previewPath: "/tmp/preview.wav",
});
assert.equal(preview.mode, "preview");

const status = getVoiceEngineStatus();
assert.equal(status.asr, "unavailable");
// neural-pack is considered available even without speechSynthesis in node
assert.equal(status.tts, "ready");

console.log(
  JSON.stringify(
    {
      ok: true,
      pickedDefaultRu: picked,
      activeAfterSet: getActiveVoiceId(fake),
      studioEngine: getActiveTtsEngine(),
      corpusPlan: corpusPlan.mode,
      hybridPlan: hybrid.mode,
      fallbackPlan: fallback.mode,
      previewPlan: preview.mode,
      engine: status,
      note: "UI ASR/TTS require Electron/Chromium speech APIs; studio uses corpus clips",
    },
    null,
    2,
  ),
);
