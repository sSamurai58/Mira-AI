/**
 * Local post-synth FX: pitch / speed(+pauses) / energy / gain / soft limiter.
 * Pure Web Audio — no third-party APIs or native addons.
 */
import {
  getVoiceSettings,
  type VoiceSettings,
} from "./voiceSettings";

function resampleToLength(
  ctx: AudioContext,
  source: AudioBuffer,
  targetFrames: number,
): AudioBuffer {
  const frames = Math.max(1, Math.round(targetFrames));
  if (frames === source.length) return source;
  const out = ctx.createBuffer(
    source.numberOfChannels,
    frames,
    source.sampleRate,
  );
  const ratio = source.length / frames;
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const src = source.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < frames; i++) {
      const x = i * ratio;
      const i0 = Math.floor(x);
      const i1 = Math.min(src.length - 1, i0 + 1);
      const t = x - i0;
      dst[i] = src[i0]! * (1 - t) + src[i1]! * t;
    }
  }
  return out;
}

/** Raise/lower pitch while keeping duration (resample + stretch back). */
function applyPitchSemitones(
  ctx: AudioContext,
  buf: AudioBuffer,
  semitones: number,
): AudioBuffer {
  if (Math.abs(semitones) < 0.05) return buf;
  const ratio = Math.pow(2, semitones / 12);
  // Higher pitch → shorter intermediate buffer, then stretch to original length.
  const pitched = resampleToLength(ctx, buf, buf.length / ratio);
  return resampleToLength(ctx, pitched, buf.length);
}

/**
 * Effective time scale: speed up/down and pauseScale (wider pauses ≈ slower).
 * pauseScale > 1 lengthens; speed > 1 shortens.
 */
function applyTimeScale(
  ctx: AudioContext,
  buf: AudioBuffer,
  speed: number,
  pauseScale: number,
): AudioBuffer {
  const effective = Math.max(0.55, Math.min(1.6, speed / pauseScale));
  if (Math.abs(effective - 1) < 0.02) return buf;
  return resampleToLength(ctx, buf, buf.length / effective);
}

function applyGainEnergyLimiter(
  buf: AudioBuffer,
  gain: number,
  energy: number,
): void {
  const g = Math.max(0, Math.min(1.6, gain * energy));
  if (Math.abs(g - 1) < 0.02) {
    // Still run a light peak pass if already hot.
  }
  const ceiling = 0.95;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    let peak = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i]! * g;
      d[i] = v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    if (peak > ceiling) {
      const scale = ceiling / peak;
      for (let i = 0; i < d.length; i++) d[i]! *= scale;
    }
  }
}

/**
 * Apply character FX to a synthesized / stitched buffer before playback.
 */
export function applyVoiceFx(
  ctx: AudioContext,
  buffer: AudioBuffer,
  settings: VoiceSettings = getVoiceSettings(),
): AudioBuffer {
  let out = buffer;
  out = applyPitchSemitones(ctx, out, settings.pitchSemitones);
  out = applyTimeScale(ctx, out, settings.speed, settings.pauseScale);
  // Copy if still shared with input so we never mutate cached corpus clips.
  if (out === buffer) {
    const copy = ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      copy.copyToChannel(buffer.getChannelData(ch), ch);
    }
    out = copy;
  }
  applyGainEnergyLimiter(out, settings.gain, settings.energy);
  return out;
}
