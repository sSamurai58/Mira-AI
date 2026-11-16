/**
 * Lightweight formant filler for uncovered words in unit-stitch.
 * Not a clone of the user's voice — but phonemes stay intelligible,
 * unlike noisy neural mel→Griffin-Lim on novel text.
 */
import { writeMonoWavFile } from "./melSpectrogram";

type PhoneKind = "vowel" | "voiced" | "noise" | "pause";
type Phone = {
  kind: PhoneKind;
  f: [number, number, number];
  dur: number;
  voice: number;
  noise: number;
};

const SR = 16000;

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
  к: [450, 1600, 2800],
  п: [400, 1400, 2800],
};

function phoneForChar(ch: string): Phone {
  const c = ch.toLowerCase();
  if (/\s/.test(c) || /[.,!?;:—-]/.test(c)) {
    return { kind: "pause", f: [0, 0, 0], dur: 0.05, voice: 0, noise: 0 };
  }
  if (VOWELS[c]) {
    return { kind: "vowel", f: VOWELS[c]!, dur: 0.09, voice: 1, noise: 0.02 };
  }
  if (VOICED[c]) {
    return { kind: "voiced", f: VOICED[c]!, dur: 0.055, voice: 0.85, noise: 0.08 };
  }
  if (NOISE[c]) {
    return { kind: "noise", f: NOISE[c]!, dur: 0.05, voice: 0.15, noise: 0.9 };
  }
  return { kind: "voiced", f: [400, 1400, 2400], dur: 0.05, voice: 0.7, noise: 0.15 };
}

function textToPhones(text: string): Phone[] {
  const out: Phone[] = [];
  for (const ch of text) {
    out.push(phoneForChar(ch));
  }
  return out;
}

type Res = { y1: number; y2: number };

function resonatorStep(
  r: Res,
  x: number,
  freq: number,
  bw: number,
  sr: number,
): number {
  const r_ = Math.exp(-Math.PI * bw / sr);
  const cos = Math.cos((2 * Math.PI * freq) / sr);
  const a = 2 * r_ * cos;
  const b = -(r_ * r_);
  const y = x + a * r.y1 + b * r.y2;
  r.y2 = r.y1;
  r.y1 = y;
  return y;
}

/** Formant PCM for a short word/phrase (intelligible filler). */
export function synthesizeParametricFillPcm(
  text: string,
  sampleRate = SR,
  opts?: { f0?: number; speed?: number },
): Float32Array {
  const phones = textToPhones(text.trim());
  if (!phones.length) return new Float32Array(1);
  const f0Base = opts?.f0 ?? 175;
  const timeScale = 1 / Math.max(0.75, Math.min(1.35, opts?.speed ?? 1));
  const segs = phones.map((phone) => ({
    phone,
    frames: Math.max(1, Math.round(phone.dur * timeScale * sampleRate)),
  }));
  let total = segs.reduce((s, x) => s + x.frames, 0) + Math.round(0.03 * sampleRate);
  const out = new Float32Array(total);
  const r1: Res = { y1: 0, y2: 0 };
  const r2: Res = { y1: 0, y2: 0 };
  const r3: Res = { y1: 0, y2: 0 };
  let phase = 0;
  let i = 0;
  let idx = 0;
  for (const { phone, frames } of segs) {
    const t = idx / Math.max(1, segs.length - 1);
    const f0 = Math.max(80, Math.min(280, f0Base * (1 + 0.04 * Math.sin(Math.PI * t) - 0.03 * t)));
    for (let n = 0; n < frames; n++) {
      const env =
        phone.kind === "pause"
          ? 0
          : Math.min(1, n / Math.max(1, sampleRate * 0.006)) *
            Math.min(1, (frames - n) / Math.max(1, sampleRate * 0.01));
      let source = 0;
      if (phone.kind !== "pause" && phone.voice > 0.01) {
        phase += f0 / sampleRate;
        if (phase >= 1) phase -= 1;
        source += Math.exp(-phase * 6) * (phase < 0.35 ? 1 : 0.15) * phone.voice;
      }
      if (phone.kind !== "pause" && phone.noise > 0.01) {
        source += (Math.random() * 2 - 1) * phone.noise * 0.5;
      }
      let y = 0;
      if (phone.kind !== "pause") {
        const b1 = resonatorStep(r1, source, Math.max(80, phone.f[0]!), 90, sampleRate);
        const b2 = resonatorStep(r2, source, Math.max(200, phone.f[1]!), 120, sampleRate);
        const b3 = resonatorStep(r3, source, Math.max(400, phone.f[2]!), 180, sampleRate);
        y = (0.55 * b1 + 0.32 * b2 + 0.18 * b3) * env * 0.45;
      }
      out[i++] = y;
    }
    idx += 1;
  }
  let peak = 1e-8;
  for (let s = 0; s < out.length; s++) {
    const a = Math.abs(out[s]!);
    if (a > peak) peak = a;
  }
  const scale = 0.85 / peak;
  for (let s = 0; s < out.length; s++) out[s]! *= scale;
  return out;
}

export function writeParametricFillWav(
  text: string,
  outPath: string,
  opts?: { f0?: number; speed?: number; sampleRate?: number },
): string {
  const sr = opts?.sampleRate ?? SR;
  const samples = synthesizeParametricFillPcm(text, sr, opts);
  writeMonoWavFile(outPath, samples, sr);
  return outPath;
}
