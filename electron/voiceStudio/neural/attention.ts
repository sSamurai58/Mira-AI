/**
 * Real text↔mel alignment: DTW on encoder/energy features + soft attention weights.
 * Replaces flux-valley-only proxy.
 */
import type { MelSpectrogram } from "../melSpectrogram";
import { ENC_OUT } from "./textEncoder";
import { zeros, type Vec } from "./tensor";

export type AlignBound = {
  startMs: number;
  endMs: number;
  /** Soft attention mass for this token over mel frames (sum≈1). */
  attnMass: number;
};

function melFrameEnergy(mel: MelSpectrogram, frame: number): number {
  let e = 0;
  const base = frame * mel.nMels;
  for (let m = 0; m < mel.nMels; m++) {
    e += Math.exp(mel.frames[base + m]!);
  }
  return e;
}

function encoderTokenEnergy(state: Vec): number {
  let e = 0;
  for (let i = 0; i < state.length; i++) e += state[i]! * state[i]!;
  return Math.sqrt(e) + 1e-6;
}

/**
 * DTW alignment between encoder token sequence and mel frames.
 * Cost = |log(tokenEnergy) - log(frameEnergy)| + mild local continuity.
 */
export function dtwAlignTokensToMel(
  states: Vec[],
  mel: MelSpectrogram,
): {
  /** For each mel frame → token index */
  frameToToken: Int32Array;
  /** Soft attention weights [token × frame] row-major normalized per token */
  attn: Float64Array;
  bounds: AlignBound[];
} {
  const T = Math.max(1, states.length);
  const F = Math.max(1, mel.frameCount);
  const tokE = states.map((s) => Math.log(encoderTokenEnergy(s) + 1e-9));
  const frE = new Float64Array(F);
  for (let f = 0; f < F; f++) {
    frE[f] = Math.log(melFrameEnergy(mel, f) + 1e-9);
  }

  // Normalize
  const meanT = tokE.reduce((a, b) => a + b, 0) / T;
  const meanF = frE.reduce((a, b) => a + b, 0) / F;
  for (let t = 0; t < T; t++) tokE[t] = tokE[t]! - meanT;
  for (let f = 0; f < F; f++) frE[f]! -= meanF;

  const INF = 1e12;
  const dp = new Float64Array(T * F);
  const bt = new Int32Array(T * F); // 0=diag, 1=left(frame++), 2=up(token++)
  dp.fill(INF);

  const cost = (t: number, f: number) => Math.abs(tokE[t]! - frE[f]!);

  dp[0] = cost(0, 0);
  bt[0] = 0;
  for (let f = 1; f < F; f++) {
    dp[f] = dp[f - 1]! + cost(0, f);
    bt[f] = 1;
  }
  for (let t = 1; t < T; t++) {
    dp[t * F] = dp[(t - 1) * F]! + cost(t, 0);
    bt[t * F] = 2;
  }
  for (let t = 1; t < T; t++) {
    for (let f = 1; f < F; f++) {
      const c = cost(t, f);
      const diag = dp[(t - 1) * F + (f - 1)]! + c;
      const left = dp[t * F + (f - 1)]! + c * 1.05;
      const up = dp[(t - 1) * F + f]! + c * 1.05;
      let best = diag;
      let arg = 0;
      if (left < best) {
        best = left;
        arg = 1;
      }
      if (up < best) {
        best = up;
        arg = 2;
      }
      dp[t * F + f] = best;
      bt[t * F + f] = arg;
    }
  }

  const frameToToken = new Int32Array(F);
  frameToToken.fill(T - 1);
  let t = T - 1;
  let f = F - 1;
  while (t >= 0 && f >= 0) {
    frameToToken[f] = t;
    const move = bt[t * F + f]!;
    if (t === 0 && f === 0) break;
    if (move === 0) {
      t -= 1;
      f -= 1;
    } else if (move === 1) {
      f -= 1;
    } else {
      t -= 1;
    }
    if (t < 0) t = 0;
    if (f < 0) f = 0;
    if (t === 0 && f === 0) {
      frameToToken[0] = 0;
      break;
    }
  }

  // Soft attention: gaussian bump around DTW path + energy match
  const attn = new Float64Array(T * F);
  for (let fi = 0; fi < F; fi++) {
    const center = frameToToken[fi]!;
    for (let ti = 0; ti < T; ti++) {
      const dist = ti - center;
      const match = Math.exp(-0.5 * dist * dist);
      const eMatch = Math.exp(-Math.abs(tokE[ti]! - frE[fi]!));
      attn[ti * F + fi] = match * (0.65 + 0.35 * eMatch);
    }
  }
  // Normalize per token
  for (let ti = 0; ti < T; ti++) {
    let sum = 0;
    for (let fi = 0; fi < F; fi++) sum += attn[ti * F + fi]!;
    const inv = sum > 1e-12 ? 1 / sum : 1 / F;
    for (let fi = 0; fi < F; fi++) attn[ti * F + fi]! *= inv;
  }

  const frameMs = (mel.hopLength / mel.sampleRate) * 1000;
  const bounds: AlignBound[] = [];
  for (let ti = 0; ti < T; ti++) {
    let start = F;
    let end = 0;
    let mass = 0;
    for (let fi = 0; fi < F; fi++) {
      if (frameToToken[fi] === ti) {
        if (fi < start) start = fi;
        if (fi > end) end = fi;
      }
      mass += attn[ti * F + fi]!;
    }
    if (start > end) {
      // Fallback equal share
      start = Math.floor((ti / T) * F);
      end = Math.max(start, Math.floor(((ti + 1) / T) * F) - 1);
    }
    bounds.push({
      startMs: start * frameMs,
      endMs: Math.max(start * frameMs + 8, (end + 1) * frameMs),
      attnMass: mass,
    });
  }
  // Ensure coverage of full clip
  if (bounds.length) {
    bounds[0]!.startMs = 0;
    bounds[bounds.length - 1]!.endMs = mel.durationMs;
  }
  return { frameToToken, attn, bounds };
}

/**
 * Content-based soft attention for decoder step:
 * query from decoder state → weights over encoder states.
 */
export function softAttention(
  encoderStates: Vec[],
  query: Vec,
): { context: Vec; weights: Vec } {
  const n = encoderStates.length;
  const dim = encoderStates[0]?.length ?? ENC_OUT;
  const logits = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const st = encoderStates[i]!;
    for (let d = 0; d < Math.min(dim, query.length); d++) {
      s += st[d]! * query[d]!;
    }
    logits[i] = s / Math.sqrt(Math.max(1, dim));
  }
  // softmax
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i]! > max) max = logits[i]!;
  const weights = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(logits[i]! - max);
    weights[i] = e;
    sum += e;
  }
  const inv = sum > 0 ? 1 / sum : 0;
  for (let i = 0; i < n; i++) weights[i]! *= inv;

  const context = zeros(dim);
  for (let i = 0; i < n; i++) {
    const w = weights[i]!;
    const st = encoderStates[i]!;
    for (let d = 0; d < dim; d++) context[d]! += w * (st[d] ?? 0);
  }
  return { context, weights };
}

/** Word-level bounds from grapheme DTW by merging spaces. */
export function wordBoundsFromGraphemeAlign(
  text: string,
  graphemeBounds: AlignBound[],
): Array<{ startMs: number; endMs: number }> {
  const norm = text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(norm);
  if (chars.length !== graphemeBounds.length) {
    // Fallback equal-time words
    const words = norm.split(" ").filter(Boolean);
    const total = graphemeBounds[graphemeBounds.length - 1]?.endMs ?? 1000;
    const out: Array<{ startMs: number; endMs: number }> = [];
    const step = total / Math.max(1, words.length);
    for (let i = 0; i < words.length; i++) {
      out.push({ startMs: i * step, endMs: (i + 1) * step });
    }
    return out;
  }
  const words: Array<{ startMs: number; endMs: number }> = [];
  let curStart: number | null = null;
  let curEnd = 0;
  let inWord = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const b = graphemeBounds[i]!;
    if (ch === " ") {
      if (inWord && curStart != null) {
        words.push({ startMs: curStart, endMs: curEnd });
      }
      inWord = false;
      curStart = null;
      continue;
    }
    if (!inWord) {
      inWord = true;
      curStart = b.startMs;
    }
    curEnd = b.endMs;
  }
  if (inWord && curStart != null) {
    words.push({ startMs: curStart, endMs: curEnd });
  }
  return words.length ? words : [{ startMs: 0, endMs: graphemeBounds.at(-1)?.endMs ?? 0 }];
}
