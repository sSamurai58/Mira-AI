/**
 * Headless P2 smoke for voice helpers (no mic/GUI required).
 */
import assert from "node:assert/strict";
import {
  getActiveVoiceId,
  listSystemVoices,
  pickDefaultVoiceId,
  setActiveVoiceId,
} from "../src/ui/voice/catalog.ts";
import { getVoiceEngineStatus } from "../src/ui/voice/engineStatus.ts";

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

const status = getVoiceEngineStatus();
assert.equal(status.asr, "unavailable");
assert.equal(status.tts, "unavailable");

console.log(
  JSON.stringify(
    {
      ok: true,
      pickedDefaultRu: picked,
      activeAfterSet: getActiveVoiceId(fake),
      engine: status,
      note: "UI ASR/TTS require Electron/Chromium speech APIs",
    },
    null,
    2,
  ),
);
