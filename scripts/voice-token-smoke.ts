/**
 * Smoke: TokenStore T0–T4 — normalize, G2P, prosody, acoustic VQ, speaker, pipeline.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../electron/config";
import { closeStore } from "../electron/store";
import {
  chunkSpeechText,
  crossfadeJoinInt16,
  g2pRussian,
  normalizeSpeechText,
  numberToRussianWords,
  buildProsodyPlan,
  encodeProsodyBinary,
  buildProjectAcousticCodebook,
  exportFineTunePairs,
  saveSpeakerPack,
  loadSpeakerPack,
  speakerPackStatus,
  tokenizeAndStoreUtterance,
  projectTokenCoverage,
  speakTokenPipeline,
  cosyVoiceAvailable,
} from "../electron/voiceStudio/tokens";
import { parseWavInfo } from "../electron/voiceStudio/modelPack";

loadConfig(true);

function writeSilentWav(file: string, seconds = 0.4, sr = 16000): void {
  const n = Math.floor(sr * seconds);
  const pcm = Buffer.alloc(n * 2);
  // Soft tone so x-vector / mel have energy
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const v = Math.sin(2 * Math.PI * 220 * t) * 0.2;
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
}

async function main() {
  // T0
  assert.match(numberToRussianWords(42), /сорок два/);
  const norm = normalizeSpeechText("Проверь API: 12% и 3.");
  assert.match(norm.text, /эй пи ай/);
  assert.match(norm.text, /двенадцать процентов/);
  assert.match(norm.text, /три/);
  assert.ok(!/[A-ZА-Я]/.test(norm.text), "T0 lowercase");

  // T1
  const phones = g2pRussian("молоко");
  assert.ok(phones.length >= 5, "g2p phones");
  assert.ok(phones.every((p) => typeof p.id === "number"));

  // T2
  const plan = buildProsodyPlan(phones, { speed: 1.1, instruct: "calm" });
  assert.equal(plan.frames.length, phones.length);
  assert.equal(plan.instruct, "calm");
  const bin = encodeProsodyBinary(plan);
  assert.ok(bin.byteLength > 8);

  // Chunk + crossfade
  const chunks = chunkSpeechText("Первое предложение. Второе предложение! Третье.");
  assert.ok(chunks.length >= 1);
  const a = new Int16Array(1600);
  const b = new Int16Array(1600);
  a.fill(1000);
  b.fill(2000);
  const joined = crossfadeJoinInt16([a, b], 16000, 32);
  assert.ok(joined.length < a.length + b.length);
  assert.ok(joined.length > a.length);

  // Cosy optional (default off)
  const cosy = cosyVoiceAvailable();
  assert.equal(cosy.ok, false);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mira-token-"));
  try {
    const wav = path.join(root, "ref.wav");
    writeSilentWav(wav, 0.5);

    // T4 speaker
    const pack = saveSpeakerPack({
      projectRoot: root,
      voiceId: "v-test",
      projectId: "p-test",
      label: "Test",
      style: "default",
      sourceWav: wav,
    });
    assert.equal(pack.meta.dim, pack.emb.length);
    assert.ok(loadSpeakerPack(root, "default"));
    assert.equal(speakerPackStatus(root).defaultReady, true);

    // T3 codebook + tokenize
    const book = buildProjectAcousticCodebook(root, [wav]);
    assert.ok(book, "codebook");
    const tok = tokenizeAndStoreUtterance({
      projectRoot: root,
      text: "Привет мир 5",
      clipPath: wav,
      writeAcoustic: true,
    });
    assert.ok(tok.tokens.length > 0);
    assert.ok((tok.acousticTokens ?? 0) > 0);
    assert.ok(
      fs.existsSync(
        path.join(root, "tokens", "utterances", tok.utteranceId, "t1.phonemes.json"),
      ),
    );
    assert.ok(
      fs.existsSync(
        path.join(root, "tokens", "utterances", tok.utteranceId, "t2.prosody.bin"),
      ),
    );
    assert.ok(
      fs.existsSync(
        path.join(root, "tokens", "utterances", tok.utteranceId, "t3.codec.u16"),
      ),
    );

    const cov = projectTokenCoverage(root);
    assert.ok(cov.utterances >= 1);
    assert.ok(cov.symbolCounts.length >= 1);

    const ft = exportFineTunePairs(root, [{ wavPath: wav, text: "Привет мир 5" }]);
    assert.equal(ft.count, 1);
    assert.ok(fs.existsSync(path.join(ft.dir, "manifest.json")));

    // Pipeline without neural weights → fail gracefully
    const packDir = path.join(root, "model-pack");
    fs.mkdirSync(packDir, { recursive: true });
    const speak = speakTokenPipeline({
      projectRoot: root,
      packDir,
      voiceId: "v-test",
      text: "Привет.",
      style: "default",
    });
    assert.equal(speak.ok, false);
    assert.equal(speak.speakerReady, true);
    assert.match(speak.normalizedText, /привет/);

    // Sanity: wav still readable
    assert.ok(parseWavInfo(wav));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    closeStore();
  }

  console.log("voice-token-smoke: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
