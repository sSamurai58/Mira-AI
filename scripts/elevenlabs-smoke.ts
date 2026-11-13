/**
 * Headless smoke for ElevenLabs TTS wiring (no network / no real key).
 */
import assert from "node:assert/strict";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODELS,
  SHORT_REPLY_FLASH_MODEL_ID,
  getElevenLabsModelId,
  getElevenLabsStatus,
  getElevenLabsVoiceId,
  getElevenLabsVoiceSettings,
  looksLikeJsonPayload,
  looksLikeMp3,
  looksLikeWav,
  pickModelForText,
  sniffElevenLabsAudio,
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
  assert.ok(ELEVENLABS_MODELS.some((m) => m.id === "eleven_flash_v2_5"));

  const settings = getElevenLabsVoiceSettings();
  assert.ok(settings.stability >= 0 && settings.stability <= 1);
  assert.ok(settings.similarityBoost >= 0 && settings.similarityBoost <= 1);
  assert.equal(pickModelForText("Привет!"), SHORT_REPLY_FLASH_MODEL_ID);
  assert.equal(
    pickModelForText("x".repeat(200), "eleven_multilingual_v2"),
    "eleven_multilingual_v2",
  );

  // Audio sniff: never treat JSON/PCM as playable MP3 (dialog screech guard).
  const id3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0xff, 0xfb]);
  const mpegFrame = Buffer.from([
    0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const jsonBody = Buffer.from('{"detail":{"status":"error"}}', "utf8");
  const wavBody = Buffer.alloc(12);
  wavBody.write("RIFF", 0);
  wavBody.writeUInt32LE(36, 4);
  wavBody.write("WAVE", 8);
  assert.equal(looksLikeMp3(id3), true);
  assert.equal(looksLikeMp3(mpegFrame), true);
  assert.equal(looksLikeMp3(jsonBody), false);
  assert.equal(looksLikeJsonPayload(jsonBody), true);
  assert.equal(looksLikeWav(wavBody), true);
  assert.equal(sniffElevenLabsAudio(id3, "audio/mpeg").ok, true);
  assert.equal(sniffElevenLabsAudio(jsonBody, "application/json").ok, false);
  assert.equal(sniffElevenLabsAudio(wavBody, "audio/wav").ok, false);
  assert.equal(
    sniffElevenLabsAudio(Buffer.from([0x00, 0x01, 0x02, 0x03]), "audio/mpeg")
      .ok,
    false,
  );

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
