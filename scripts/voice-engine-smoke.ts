/**
 * Stage A VoiceEngine smoke — settings clamp, presets, prosody mapping.
 * Run: npx tsx scripts/voice-engine-smoke.ts
 */
import assert from "node:assert/strict";

// Use relative imports that don't need DOM.
import {
  applyVoicePreset,
  clampVoiceSettings,
  DEFAULT_VOICE_SETTINGS,
  listVoicePresets,
  neuralProsodyFromSettings,
  VOICE_LIMITS,
} from "../src/ui/voice/voiceSettings";

function main() {
  const presets = listVoicePresets();
  assert.ok(presets.length >= 4, "presets present");
  assert.ok(presets.some((p) => p.id === "calm"));
  assert.ok(presets.some((p) => p.id === "energetic"));

  const wild = clampVoiceSettings({
    speed: 99,
    pitchSemitones: -99,
    energy: 0,
    pauseScale: 99,
    gain: 2,
    emotion: "nope" as never,
    quality: "ultra" as never,
    presetId: null,
  });
  assert.equal(wild.speed, VOICE_LIMITS.speed.max);
  assert.equal(wild.pitchSemitones, VOICE_LIMITS.pitchSemitones.min);
  assert.equal(wild.energy, VOICE_LIMITS.energy.min);
  assert.equal(wild.pauseScale, VOICE_LIMITS.pauseScale.max);
  assert.equal(wild.gain, VOICE_LIMITS.gain.max);
  assert.equal(wild.emotion, DEFAULT_VOICE_SETTINGS.emotion);
  assert.equal(wild.quality, DEFAULT_VOICE_SETTINGS.quality);

  // localStorage may be missing in Node — applyVoicePreset still returns clamped.
  const calm = applyVoicePreset("calm");
  assert.equal(calm.presetId, "calm");
  assert.ok(calm.speed < 1);
  assert.ok(calm.pitchSemitones < 0);
  assert.ok(calm.pauseScale > 1);

  const prosody = neuralProsodyFromSettings(calm);
  assert.equal(prosody.speed, calm.speed);
  assert.equal(prosody.pauseScale, calm.pauseScale);
  assert.equal(prosody.energy, calm.energy);

  console.log("voice-engine-smoke: ok", {
    presets: presets.map((p) => p.id),
    calm: {
      speed: calm.speed,
      pitch: calm.pitchSemitones,
      energy: calm.energy,
      pause: calm.pauseScale,
    },
  });
}

main();
