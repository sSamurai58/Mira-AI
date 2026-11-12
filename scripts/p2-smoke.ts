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
  buildFragmentInventory,
  phraseMatchScore,
  planCorpusSpeech,
  tokenizeSpeech,
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
assert.ok(tokenizeSpeech("Привет, Mira!").length >= 2);

const inventory = buildFragmentInventory(units);
assert.ok(
  inventory.some((f) => f.tokens.length === 1 && f.tokens[0] === "привет"),
  "inventory should expose word units",
);

const corpusPlan = planCorpusSpeech(units[0].text, units);
assert.equal(corpusPlan.mode, "corpus");
assert.ok(corpusPlan.clipCount >= 1);
assert.equal(corpusPlan.webspeechCount, 0);
assert.ok(corpusPlan.coverage >= 0.99);

// Novel LLM-style reply: stitch words from multiple trained phrases.
const composed = planCorpusSpeech(
  "Привет, сообщение отправлено — я на связи.",
  units,
);
assert.ok(
  composed.mode === "corpus" || composed.mode === "hybrid",
  "composition should reuse trained words",
);
assert.ok(composed.clipCount >= 1);
assert.ok(composed.coveredTokens >= 3);
assert.ok(
  composed.segments.some((s) => s.kind === "fragment"),
  "should emit fragment slices for stitching",
);

const hybrid = planCorpusSpeech(
  "Спасибо, сообщение отправлено. А ещё расскажи анекдот про кота.",
  units,
);
assert.equal(hybrid.mode, "hybrid");
assert.ok(hybrid.clipCount >= 1);
assert.ok(hybrid.webspeechCount >= 1);
assert.ok(hybrid.coverage > 0 && hybrid.coverage < 1);

const fallback = planCorpusSpeech("Ксилофон квазар фтор", units);
assert.equal(fallback.mode, "webspeech-fallback");
assert.ok(/системный TTS/i.test(fallback.status));

const preview = planCorpusSpeech("Ксилофон квазар фтор", units, {
  preferPreview: true,
  previewPath: "/tmp/preview.wav",
});
assert.equal(preview.mode, "preview");

// Meaning match: trained «хорошо» can cover synonym «ладно»
const meaningUnits = [
  {
    phraseId: "p3",
    text: "Хорошо.",
    filePath: "/tmp/c.wav",
  },
];
const meaning = planCorpusSpeech("Ладно", meaningUnits);
assert.ok(meaning.clipCount >= 1);
assert.ok(meaning.coveredTokens >= 1);

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
      composedPlan: composed.mode,
      composedCoverage: composed.coverage,
      hybridPlan: hybrid.mode,
      fallbackPlan: fallback.mode,
      previewPlan: preview.mode,
      meaningCoverage: meaning.coverage,
      engine: status,
      note: "UI ASR/TTS require Electron/Chromium; studio uses compositional unit selection",
    },
    null,
    2,
  ),
);
