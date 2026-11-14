/**
 * VoiceEngine smoke — settings, presets, prosody, phrase split, cache key.
 * Run: npx tsx scripts/voice-engine-smoke.ts
 */
import assert from "node:assert/strict";
import {
  getCachedSynthWav,
  putCachedSynthWav,
  synthCacheKey,
} from "../electron/tts/localSynthCache";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { synthesizeParametricPcm } from "../src/ui/voice/parametricSynth";
import { analyzeVoiceProfile } from "../src/ui/voice/voiceProfileFromAudio";
import {
  applyVoicePreset,
  clampVoiceSettings,
  DEFAULT_VOICE_SETTINGS,
  listVoicePresets,
  neuralProsodyFromSettings,
  VOICE_LIMITS,
} from "../src/ui/voice/voiceSettings";
import { splitSpeakPhrases } from "../src/ui/voice/voicePhrases";

function main() {
  const presets = listVoicePresets();
  assert.ok(presets.length >= 4, "presets present");
  assert.ok(presets.some((p) => p.id === "calm"));
  assert.ok(presets.some((p) => p.id === "energetic"));

  const wild = clampVoiceSettings({
    baseHz: 999,
    speed: 99,
    pitchSemitones: -99,
    energy: 0,
    pauseScale: 99,
    gain: 2,
    emotion: "nope" as never,
    quality: "ultra" as never,
    presetId: null,
  });
  assert.equal(wild.baseHz, VOICE_LIMITS.baseHz.max);
  assert.equal(wild.speed, VOICE_LIMITS.speed.max);
  assert.equal(wild.pitchSemitones, VOICE_LIMITS.pitchSemitones.min);
  assert.equal(wild.energy, VOICE_LIMITS.energy.min);
  assert.equal(wild.pauseScale, VOICE_LIMITS.pauseScale.max);
  assert.equal(wild.gain, VOICE_LIMITS.gain.max);
  assert.equal(wild.emotion, DEFAULT_VOICE_SETTINGS.emotion);
  assert.equal(wild.quality, DEFAULT_VOICE_SETTINGS.quality);

  // Parametric synth: text → PCM without recordings.
  const pcm = synthesizeParametricPcm("Привет, я Mira.", {
    ...DEFAULT_VOICE_SETTINGS,
    baseHz: 180,
    pitchSemitones: 1,
    speed: 1.05,
  });
  assert.ok(pcm.samples.length > 1000, "parametric produces samples");
  assert.ok(pcm.durationMs > 100, "parametric duration");
  let peak = 0;
  for (let i = 0; i < pcm.samples.length; i++) {
    peak = Math.max(peak, Math.abs(pcm.samples[i]!));
  }
  assert.ok(peak > 0.05, "parametric not silent");

  // Round-trip: analyze parametric sample → suggested settings stay in range.
  const analyzed = analyzeVoiceProfile(pcm.samples, pcm.sampleRate);
  assert.ok(analyzed.suggested.baseHz >= VOICE_LIMITS.baseHz.min);
  assert.ok(analyzed.suggested.baseHz <= VOICE_LIMITS.baseHz.max);
  assert.ok(analyzed.rows.length >= 5);
  assert.ok(analyzed.durationMs > 50);

  const calm = applyVoicePreset("calm");
  assert.equal(calm.presetId, "calm");
  assert.ok(calm.speed < 1);
  assert.ok(calm.pitchSemitones < 0);
  assert.ok(calm.pauseScale > 1);

  const prosody = neuralProsodyFromSettings(calm);
  assert.equal(prosody.speed, calm.speed);
  assert.equal(prosody.pauseScale, calm.pauseScale);
  // Energy is applied in FX only.
  assert.equal(prosody.energy, 1);

  const phrases = splitSpeakPhrases(
    "Привет! Я Mira. Чем могу помочь сегодня?",
  );
  assert.ok(phrases.length >= 2, "phrase split");
  assert.ok(phrases[0]!.includes("Привет"));

  const key = synthCacheKey("mira-studio-test", "Привет", {
    speed: 1,
    quality: "fast",
  });
  assert.equal(key.length, 40);
  const tmp = path.join(os.tmpdir(), `mira-tts-smoke-${Date.now()}.wav`);
  // Minimal RIFF header stub — cache only copies bytes.
  fs.writeFileSync(tmp, Buffer.from("RIFF____WAVEfmt "));
  const stored = putCachedSynthWav(key, tmp);
  assert.ok(fs.existsSync(stored));
  assert.equal(getCachedSynthWav(key), stored);
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }

  console.log("voice-engine-smoke: ok", {
    presets: presets.map((p) => p.id),
    phrases,
    cacheKey: key.slice(0, 8),
  });
}

main();
