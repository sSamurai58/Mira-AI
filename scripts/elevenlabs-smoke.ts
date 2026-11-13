/**
 * Headless smoke for ElevenLabs TTS wiring (no network / no real key).
 */
import assert from "node:assert/strict";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODELS,
  getElevenLabsModelId,
  getElevenLabsStatus,
  getElevenLabsVoiceId,
  synthesizeElevenLabs,
} from "../electron/tts/elevenlabs.ts";
import {
  DEFAULT_ELEVENLABS_VOICE_ID as UiDefaultVoice,
  getActiveTtsEngine,
  listTtsEngines,
  setActiveTtsEngine,
} from "../src/ui/voice/ttsEngines.ts";

async function main() {
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

  assert.equal(DEFAULT_ELEVENLABS_VOICE_ID, "YjESejviApN7SHrbfnA2");
  assert.equal(UiDefaultVoice, "YjESejviApN7SHrbfnA2");
  assert.equal(DEFAULT_ELEVENLABS_MODEL_ID, "eleven_multilingual_v2");
  assert.ok(ELEVENLABS_MODELS.some((m) => m.id === "eleven_multilingual_v2"));
  assert.ok(ELEVENLABS_MODELS.some((m) => m.id === "eleven_v3"));

  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
  delete process.env.ELEVENLABS_MODEL_ID;

  assert.equal(getElevenLabsVoiceId(), DEFAULT_ELEVENLABS_VOICE_ID);
  assert.equal(getElevenLabsModelId(), DEFAULT_ELEVENLABS_MODEL_ID);

  const statusMissing = await getElevenLabsStatus(false);
  assert.equal(statusMissing.hasKey, false);
  assert.equal(statusMissing.connected, false);
  assert.match(statusMissing.detail, /ключ|key/i);

  const synthMissing = await synthesizeElevenLabs({ text: "Привет" });
  assert.equal(synthMissing.ok, false);
  assert.match(synthMissing.detail, /ELEVENLABS_API_KEY/);

  // edge-stub migrates to elevenlabs
  mem.set("mira.ttsEngine", "edge-stub");
  assert.equal(getActiveTtsEngine(), "elevenlabs");
  assert.equal(setActiveTtsEngine("edge-stub"), "elevenlabs");

  const engines = listTtsEngines();
  assert.ok(engines.some((e) => e.id === "elevenlabs"));
  assert.ok(!engines.some((e) => e.id === "edge-stub"));
  assert.equal(setActiveTtsEngine("elevenlabs"), "elevenlabs");
  assert.equal(getActiveTtsEngine(), "elevenlabs");

  // Without Electron bridge, elevenlabs reports not ready (browser path)
  const eleven = engines.find((e) => e.id === "elevenlabs");
  assert.ok(eleven);
  assert.equal(eleven!.ready, false);

  console.log(
    JSON.stringify(
      {
        ok: true,
        defaultVoiceId: DEFAULT_ELEVENLABS_VOICE_ID,
        defaultModelId: DEFAULT_ELEVENLABS_MODEL_ID,
        models: ELEVENLABS_MODELS.map((m) => m.id),
        statusWithoutKey: statusMissing.detail,
        synthWithoutKey: synthMissing.detail,
        migratedEngine: getActiveTtsEngine(),
        note: "Live synth requires ELEVENLABS_API_KEY + network in Electron",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
