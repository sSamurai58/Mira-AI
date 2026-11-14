/**
 * Parametric formant TTS — generate speech from text + VoiceSettings only.
 * No recordings, no neural pack, no clip stitch. Pure Web Audio math.
 */
import {
  getVoiceSettings,
  type VoiceEmotion,
  type VoiceSettings,
} from "./voiceSettings";

type PhoneKind = "vowel" | "voiced" | "noise" | "pause";

type Phone = {
  kind: PhoneKind;
  /** Formants Hz (F1,F2,F3) */
  f: [number, number, number];
  /** Relative duration */
  dur: number;
  /** Voicing mix 0…1 */
  voice: number;
  /** Noise mix 0…1 */
  noise: number;
};

const SAMPLE_RATE = 22050;

/** Fallback F0 if settings.baseHz missing. Pitch semitones multiply this. */
const DEFAULT_BASE_F0_HZ = 178;

const VOWELS: Record<string, [number, number, number]> = {
  а: [700, 1220, 2600],
  о: [500, 850, 2500],
  у: [320, 650, 2400],
  э: [520, 1750, 2500],
  е: [440, 1900, 2700],
  и: [300, 2200, 3000],
  ы: [380, 1650, 2550],
  я: [650, 1600, 2700],
  ё: [480, 1100, 2500],
  ю: [350, 900, 2500],
  a: [700, 1220, 2600],
  o: [500, 850, 2500],
  u: [320, 650, 2400],
  e: [500, 1800, 2600],
  i: [300, 2200, 3000],
  y: [380, 1650, 2550],
};

const VOICED: Record<string, [number, number, number]> = {
  м: [280, 1000, 2200],
  н: [300, 1400, 2400],
  л: [400, 1200, 2500],
  р: [450, 1300, 2400],
  в: [300, 900, 2300],
  з: [350, 1600, 2600],
  ж: [350, 1400, 2200],
  б: [300, 900, 2200],
  д: [350, 1500, 2500],
  г: [350, 1200, 2300],
  й: [300, 2000, 2800],
  m: [280, 1000, 2200],
  n: [300, 1400, 2400],
  l: [400, 1200, 2500],
  r: [450, 1300, 2400],
  v: [300, 900, 2300],
  z: [350, 1600, 2600],
  b: [300, 900, 2200],
  d: [350, 1500, 2500],
  g: [350, 1200, 2300],
  w: [320, 800, 2200],
};

const NOISE: Record<string, [number, number, number]> = {
  с: [400, 2200, 3500],
  ш: [350, 1800, 2800],
  щ: [380, 2000, 3200],
  х: [450, 1600, 2800],
  ф: [400, 1500, 3000],
  ц: [400, 2000, 3400],
  ч: [380, 1900, 3000],
  т: [400, 1800, 3200],
  к: [400, 1500, 2600],
  п: [350, 1200, 2500],
  s: [400, 2200, 3500],
  sh: [350, 1800, 2800],
  h: [450, 1600, 2800],
  f: [400, 1500, 3000],
  t: [400, 1800, 3200],
  k: [400, 1500, 2600],
  p: [350, 1200, 2500],
  c: [400, 2000, 3400],
};

function emotionF0Mul(emotion: VoiceEmotion): number {
  switch (emotion) {
    case "calm":
      return 0.92;
    case "warm":
      return 0.96;
    case "energetic":
      return 1.08;
    case "soft":
      return 0.94;
    default:
      return 1;
  }
}

function emotionBright(emotion: VoiceEmotion): number {
  switch (emotion) {
    case "energetic":
      return 1.08;
    case "soft":
      return 0.92;
    case "warm":
      return 0.96;
    case "calm":
      return 0.94;
    default:
      return 1;
  }
}

function charToPhone(ch: string): Phone | null {
  if (!ch || /\s/.test(ch)) {
    return { kind: "pause", f: [0, 0, 0], dur: 0.08, voice: 0, noise: 0 };
  }
  if (/[.,!?;:—-]/.test(ch)) {
    return { kind: "pause", f: [0, 0, 0], dur: 0.16, voice: 0, noise: 0 };
  }
  const c = ch.toLowerCase();
  if (VOWELS[c]) {
    return {
      kind: "vowel",
      f: VOWELS[c]!,
      dur: 0.11,
      voice: 1,
      noise: 0.05,
    };
  }
  if (VOICED[c]) {
    return {
      kind: "voiced",
      f: VOICED[c]!,
      dur: 0.065,
      voice: 0.75,
      noise: 0.15,
    };
  }
  if (NOISE[c]) {
    return {
      kind: "noise",
      f: NOISE[c]!,
      dur: 0.055,
      voice: 0.05,
      noise: 0.95,
    };
  }
  // Digits / unknown letters → short mid vowel
  if (/[0-9a-zа-яё]/i.test(c)) {
    return {
      kind: "vowel",
      f: [500, 1500, 2500],
      dur: 0.08,
      voice: 0.85,
      noise: 0.1,
    };
  }
  return null;
}

export function textToPhones(text: string): Phone[] {
  const phones: Phone[] = [];
  const normalized = text
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  for (const ch of normalized) {
    const p = charToPhone(ch);
    if (p) phones.push(p);
  }
  return phones;
}

/** One-pole resonator (bandpass-ish via difference of lowpasses). */
function resonatorStep(
  state: { y1: number; y2: number },
  x: number,
  freq: number,
  bw: number,
  sr: number,
): number {
  const r = Math.exp((-Math.PI * bw) / sr);
  const cosTheta = Math.cos((2 * Math.PI * freq) / sr);
  const a1 = 2 * r * cosTheta;
  const a2 = -(r * r);
  const y = x + a1 * state.y1 + a2 * state.y2;
  state.y2 = state.y1;
  state.y1 = y;
  return y;
}

function softClip(x: number): number {
  if (x > 1) return 1 - 1 / (x + 1);
  if (x < -1) return -1 + 1 / (-x + 1);
  return x;
}

/**
 * Synthesize mono PCM from text using formant synthesis + VoiceSettings.
 */
export function synthesizeParametricPcm(
  text: string,
  settings: VoiceSettings = getVoiceSettings(),
  sampleRate = SAMPLE_RATE,
): { samples: Float32Array; sampleRate: number; durationMs: number } {
  const clean = text.trim();
  if (!clean) {
    return {
      samples: new Float32Array(1),
      sampleRate,
      durationMs: 0,
    };
  }

  const phones = textToPhones(clean);
  if (!phones.length) {
    return {
      samples: new Float32Array(1),
      sampleRate,
      durationMs: 0,
    };
  }

  const f0Base =
    (settings.baseHz || DEFAULT_BASE_F0_HZ) *
    Math.pow(2, settings.pitchSemitones / 12) *
    emotionF0Mul(settings.emotion);
  const timeScale = Math.max(
    0.55,
    Math.min(1.7, settings.pauseScale / Math.max(0.75, settings.speed)),
  );
  const bright = emotionBright(settings.emotion);
  const amp =
    Math.max(0.15, Math.min(1.4, settings.gain * settings.energy)) * 0.42;

  let totalFrames = 0;
  const segs: Array<{ phone: Phone; frames: number }> = [];
  for (const phone of phones) {
    const frames = Math.max(
      1,
      Math.round(phone.dur * timeScale * sampleRate),
    );
    segs.push({ phone, frames });
    totalFrames += frames;
  }
  // Trailing breath
  totalFrames += Math.round(0.04 * sampleRate);

  const out = new Float32Array(totalFrames);
  const r1 = { y1: 0, y2: 0 };
  const r2 = { y1: 0, y2: 0 };
  const r3 = { y1: 0, y2: 0 };
  let phase = 0;
  let sampleIdx = 0;
  let phoneIndex = 0;

  for (const { phone, frames } of segs) {
    const tPhone = phoneIndex / Math.max(1, segs.length - 1);
    // Mild F0 contour: rise then fall across utterance.
    const contour = 1 + 0.04 * Math.sin(Math.PI * tPhone) - 0.03 * tPhone;
    const f0 = Math.max(70, Math.min(320, f0Base * contour));
    const f1 = phone.f[0]! * (0.98 + 0.02 * bright);
    const f2 = phone.f[1]! * bright;
    const f3 = phone.f[2]! * bright;

    for (let n = 0; n < frames; n++) {
      const env =
        phone.kind === "pause"
          ? 0
          : Math.min(1, n / Math.max(1, sampleRate * 0.008)) *
            Math.min(1, (frames - n) / Math.max(1, sampleRate * 0.012));

      let source = 0;
      if (phone.kind !== "pause" && phone.voice > 0.01) {
        phase += f0 / sampleRate;
        if (phase >= 1) phase -= 1;
        // Soft glottal pulse (not harsh saw).
        const glottal = Math.exp(-phase * 6) * (phase < 0.35 ? 1 : 0.15);
        source += glottal * phone.voice;
      }
      if (phone.kind !== "pause" && phone.noise > 0.01) {
        source += (Math.random() * 2 - 1) * phone.noise * 0.55;
      }

      let y = 0;
      if (phone.kind === "pause") {
        y = 0;
      } else {
        const b1 = resonatorStep(r1, source, Math.max(80, f1), 90, sampleRate);
        const b2 = resonatorStep(r2, source, Math.max(200, f2), 120, sampleRate);
        const b3 = resonatorStep(r3, source, Math.max(400, f3), 180, sampleRate);
        y = (0.55 * b1 + 0.32 * b2 + 0.18 * b3) * env * amp;
      }
      out[sampleIdx++] = softClip(y);
    }
    phoneIndex += 1;
  }

  // Peak normalize softly so quiet presets still audible.
  let peak = 1e-8;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]!);
    if (a > peak) peak = a;
  }
  const scale = Math.min(0.9 / peak, 2.2);
  for (let i = 0; i < out.length; i++) out[i]! *= scale;

  return {
    samples: out,
    sampleRate,
    durationMs: (out.length * 1000) / sampleRate,
  };
}

/** Build an AudioBuffer for playback in the renderer. */
export function synthesizeParametricBuffer(
  ctx: AudioContext,
  text: string,
  settings: VoiceSettings = getVoiceSettings(),
): AudioBuffer {
  const { samples, sampleRate } = synthesizeParametricPcm(text, settings);
  // Resample into context rate if needed.
  if (Math.abs(sampleRate - ctx.sampleRate) < 1) {
    const buf = ctx.createBuffer(1, Math.max(1, samples.length), sampleRate);
    buf.copyToChannel(Float32Array.from(samples), 0);
    return buf;
  }
  const ratio = ctx.sampleRate / sampleRate;
  const frames = Math.max(1, Math.round(samples.length * ratio));
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const dst = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const x = i / ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const t = x - i0;
    dst[i] = samples[i0]! * (1 - t) + samples[i1]! * t;
  }
  return buf;
}
