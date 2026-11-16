/**
 * T2 prosody: duration / F0 / energy per T1 token (+ global plan).
 */
import type { PhonemeToken } from "./g2pRu";

export type ProsodyFrame = {
  /** Relative duration multiplier (1 = neutral). */
  dur: number;
  /** F0 in Hz; 0 = unvoiced / silence. */
  f0Hz: number;
  /** Energy dB-ish relative (-12…+6). */
  energyDb: number;
};

export type ProsodyPlan = {
  frames: ProsodyFrame[];
  globalSpeed: number;
  globalPauseScale: number;
  globalEnergy: number;
  /** Emotion / instruct channel — never mixed into spoken RU text. */
  instruct?: string;
  seed?: number;
};

const BASE_DUR: Record<string, number> = {
  "<sil>": 1.4,
  "<sp>": 0.55,
  "<breath>": 1.1,
  a: 1.15,
  e: 1.05,
  i: 0.95,
  o: 1.15,
  u: 1.05,
  y: 1.0,
};

export function buildProsodyPlan(
  tokens: PhonemeToken[],
  opts?: {
    speed?: number;
    pauseScale?: number;
    energy?: number;
    pitchBiasSemitones?: number;
    instruct?: string;
    seed?: number;
  },
): ProsodyPlan {
  const speed = opts?.speed ?? 1;
  const pauseScale = opts?.pauseScale ?? 1;
  const energy = opts?.energy ?? 1;
  const pitchBias = opts?.pitchBiasSemitones ?? 0;
  const baseF0 = 175 * Math.pow(2, pitchBias / 12);

  const frames: ProsodyFrame[] = tokens.map((t, i) => {
    const isSil = t.symbol.startsWith("<");
    let dur = BASE_DUR[t.symbol] ?? (t.symbol.length > 1 ? 1.1 : 0.85);
    if (t.stressed) dur *= 1.18;
    if (isSil) dur *= pauseScale;
    else dur /= Math.max(0.5, speed);

    // Gentle phrase-final drop
    const progress = tokens.length <= 1 ? 0.5 : i / (tokens.length - 1);
    const f0 = isSil
      ? 0
      : baseF0 * (1.04 - progress * 0.1) * (t.stressed ? 1.06 : 1);

    const energyDb = isSil
      ? -24
      : (energy - 1) * 6 + (t.stressed ? 1.5 : 0) - progress * 1.2;

    return { dur, f0Hz: f0, energyDb };
  });

  return {
    frames,
    globalSpeed: speed,
    globalPauseScale: pauseScale,
    globalEnergy: energy,
    instruct: opts?.instruct?.trim() || undefined,
    seed: opts?.seed,
  };
}

/** Serialize prosody as interleaved float32 [dur, f0, energy] × N */
export function encodeProsodyBinary(plan: ProsodyPlan): Buffer {
  const n = plan.frames.length;
  const buf = Buffer.alloc(4 + n * 12);
  buf.writeUInt32LE(n, 0);
  for (let i = 0; i < n; i++) {
    const o = 4 + i * 12;
    const f = plan.frames[i]!;
    buf.writeFloatLE(f.dur, o);
    buf.writeFloatLE(f.f0Hz, o + 4);
    buf.writeFloatLE(f.energyDb, o + 8);
  }
  return buf;
}

export function decodeProsodyBinary(buf: Buffer): ProsodyFrame[] {
  if (buf.length < 4) return [];
  const n = buf.readUInt32LE(0);
  const frames: ProsodyFrame[] = [];
  for (let i = 0; i < n; i++) {
    const o = 4 + i * 12;
    if (o + 12 > buf.length) break;
    frames.push({
      dur: buf.readFloatLE(o),
      f0Hz: buf.readFloatLE(o + 4),
      energyDb: buf.readFloatLE(o + 8),
    });
  }
  return frames;
}
