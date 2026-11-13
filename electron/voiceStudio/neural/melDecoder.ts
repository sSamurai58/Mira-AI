/**
 * Frame-level mel decoder with teacher forcing schedule + stop head.
 * Trained with real Adam backprop (tiny MLP).
 */
import { MEL_N_MELS, type MelSpectrogram } from "../melSpectrogram";
import { softAttention } from "./attention";
import { ENC_OUT } from "./textEncoder";
import {
  adamUpdateDense,
  createAdam,
  createDense,
  denseBackward,
  denseForward,
  loadDense,
  serializeDense,
  sigmoid,
  tanhArr,
  zeros,
  type AdamState,
  type Dense,
  type SerializedDense,
  type Vec,
  zeroGrad,
} from "./tensor";

export const DEC_HID = 64;

export type MelDecoder = {
  /** Input: [context ENC_OUT | prevMel MEL_N_MELS | stopPrev 1] */
  in1: Dense;
  outMel: Dense; // DEC_HID → MEL_N_MELS
  stopHead: Dense; // DEC_HID → 1
};

export type SerializedMelDecoder = {
  in1: SerializedDense;
  outMel: SerializedDense;
  stopHead: SerializedDense;
};

export function createMelDecoder(): MelDecoder {
  const inDim = ENC_OUT + MEL_N_MELS + 1;
  return {
    in1: createDense(inDim, DEC_HID, 0.1),
    outMel: createDense(DEC_HID, MEL_N_MELS, 0.08),
    stopHead: createDense(DEC_HID, 1, 0.08),
  };
}

export function serializeMelDecoder(dec: MelDecoder): SerializedMelDecoder {
  return {
    in1: serializeDense(dec.in1),
    outMel: serializeDense(dec.outMel),
    stopHead: serializeDense(dec.stopHead),
  };
}

export function loadMelDecoder(data: SerializedMelDecoder): MelDecoder {
  return {
    in1: loadDense(data.in1),
    outMel: loadDense(data.outMel),
    stopHead: loadDense(data.stopHead),
  };
}

export type DecoderStepCache = {
  input: Vec;
  hPre: Vec;
  h: Vec;
  melPre: Vec;
  mel: Vec;
  stopLogit: number;
  stopProb: number;
  attnWeights: Vec;
  context: Vec;
};

function readMelFrame(mel: MelSpectrogram, frame: number): Vec {
  const out = new Float64Array(MEL_N_MELS);
  const base = Math.min(mel.frameCount - 1, Math.max(0, frame)) * mel.nMels;
  for (let m = 0; m < MEL_N_MELS; m++) {
    out[m] = mel.frames[base + m] ?? -10;
  }
  return out;
}

export function decoderStep(
  dec: MelDecoder,
  encoderStates: Vec[],
  prevMel: Vec,
  prevStop: number,
  querySeed?: Vec,
): DecoderStepCache {
  const query = querySeed ?? prevMel;
  const { context, weights } = softAttention(encoderStates, query);
  const input = new Float64Array(ENC_OUT + MEL_N_MELS + 1);
  input.set(context.subarray(0, ENC_OUT), 0);
  input.set(prevMel.subarray(0, MEL_N_MELS), ENC_OUT);
  input[ENC_OUT + MEL_N_MELS] = prevStop;

  const { y: hPre } = denseForward(dec.in1, input);
  const h = tanhArr(hPre);
  const { y: melPre } = denseForward(dec.outMel, h);
  // Mel as linear (log-mel space already)
  const mel = Float64Array.from(melPre);
  const { y: stopY } = denseForward(dec.stopHead, h);
  const stopLogit = stopY[0]!;
  const stopProb = sigmoid(stopLogit);

  return {
    input,
    hPre,
    h,
    melPre,
    mel,
    stopLogit,
    stopProb,
    attnWeights: weights,
    context,
  };
}

export type DecoderGrads = {
  dIn1W: Vec;
  dIn1B: Vec;
  dMelW: Vec;
  dMelB: Vec;
  dStopW: Vec;
  dStopB: Vec;
};

export function createDecoderGrads(dec: MelDecoder): DecoderGrads {
  return {
    dIn1W: zeros(dec.in1.w.length),
    dIn1B: zeros(dec.in1.b.length),
    dMelW: zeros(dec.outMel.w.length),
    dMelB: zeros(dec.outMel.b.length),
    dStopW: zeros(dec.stopHead.w.length),
    dStopB: zeros(dec.stopHead.b.length),
  };
}

/**
 * Backprop one decoder step.
 * dMel / dStop provided from loss; returns dContext (for encoder attention approx).
 */
export function decoderStepBackward(
  dec: MelDecoder,
  cache: DecoderStepCache,
  dMel: Vec,
  dStopLogit: number,
  grads: DecoderGrads,
): Vec {
  const dH = zeros(DEC_HID);

  // stop head
  const dStopY = new Float64Array([dStopLogit]);
  const dHFromStop = denseBackward(
    dec.stopHead,
    cache.h,
    dStopY,
    { dw: grads.dStopW, db: grads.dStopB },
  );
  addInto(dH, dHFromStop);

  // mel head
  const dHFromMel = denseBackward(
    dec.outMel,
    cache.h,
    dMel,
    { dw: grads.dMelW, db: grads.dMelB },
  );
  addInto(dH, dHFromMel);

  // tanh
  const dHPre = new Float64Array(DEC_HID);
  for (let i = 0; i < DEC_HID; i++) {
    dHPre[i] = dH[i]! * (1 - cache.h[i]! * cache.h[i]!);
  }

  const dInput = denseBackward(
    dec.in1,
    cache.input,
    dHPre,
    { dw: grads.dIn1W, db: grads.dIn1B },
  );
  // context portion
  const dContext = dInput.subarray(0, ENC_OUT);
  return Float64Array.from(dContext);
}

function addInto(a: Vec, b: Vec): void {
  for (let i = 0; i < a.length; i++) a[i]! += b[i] ?? 0;
}

export function applyDecoderGrads(
  dec: MelDecoder,
  grads: DecoderGrads,
  adam: AdamState,
): void {
  const step = adam.step;
  adamUpdateDense(dec.in1, grads.dIn1W, grads.dIn1B, adam);
  adam.step = step;
  adamUpdateDense(dec.outMel, grads.dMelW, grads.dMelB, adam);
  adam.step = step;
  adamUpdateDense(dec.stopHead, grads.dStopW, grads.dStopB, adam);
  zeroGrad(grads.dIn1W);
  zeroGrad(grads.dIn1B);
  zeroGrad(grads.dMelW);
  zeroGrad(grads.dMelB);
  zeroGrad(grads.dStopW);
  zeroGrad(grads.dStopB);
}

/** Target stop labels: ramp up on low-energy tail frames. */
export function stopTargetsFromMel(mel: MelSpectrogram): Float64Array {
  const n = mel.frameCount;
  const targets = new Float64Array(n);
  if (n < 2) {
    targets[0] = 1;
    return targets;
  }
  const energies = new Float64Array(n);
  let midSum = 0;
  const midEnd = Math.max(1, Math.floor(n * 0.75));
  for (let f = 0; f < n; f++) {
    energies[f] = 0;
    for (let m = 0; m < mel.nMels; m++) {
      energies[f]! += Math.exp(mel.frames[f * mel.nMels + m]!);
    }
    if (f < midEnd) midSum += energies[f]!;
  }
  const midAvg = midSum / midEnd;
  for (let f = 0; f < n; f++) {
    const ratio = midAvg > 1e-12 ? energies[f]! / midAvg : 1;
    const prog = f / (n - 1);
    // Stop rises near end or when energy collapses.
    let p = 0;
    if (prog > 0.82) p = (prog - 0.82) / 0.18;
    if (ratio < 0.25 && prog > 0.55) p = Math.max(p, 0.55);
    if (f === n - 1) p = 1;
    targets[f] = Math.max(0, Math.min(1, p));
  }
  return targets;
}

export type TeacherForceSchedule = {
  /** Probability of using ground-truth previous mel (1 = full TF). */
  ratio: number;
};

/** Linear TF anneal from start→end across epochs. */
export function teacherForceRatio(
  epoch: number,
  epochs: number,
  start = 1,
  end = 0.35,
): number {
  if (epochs <= 1) return end;
  const t = (epoch - 1) / (epochs - 1);
  return start + (end - start) * t;
}

/**
 * Autoregressive decode over target length with TF schedule.
 * Returns predicted mel frames + stop probs + caches for backprop.
 */
export function decodeSequence(
  dec: MelDecoder,
  encoderStates: Vec[],
  targetMel: MelSpectrogram,
  opts: {
    teacherForceRatio: number;
    freeRun?: boolean;
  },
): {
  predFrames: Float64Array;
  stopProbs: Float64Array;
  caches: DecoderStepCache[];
  melL1: number;
  stopBce: number;
} {
  const F = targetMel.frameCount;
  const predFrames = new Float64Array(F * MEL_N_MELS);
  const stopProbs = new Float64Array(F);
  const caches: DecoderStepCache[] = [];
  const stopT = stopTargetsFromMel(targetMel);

  let prevMel = zeros(MEL_N_MELS);
  // Start from silence-ish
  for (let m = 0; m < MEL_N_MELS; m++) prevMel[m] = -8;
  let prevStop = 0;
  let l1 = 0;
  let bce = 0;

  for (let f = 0; f < F; f++) {
    const cache = decoderStep(dec, encoderStates, prevMel, prevStop);
    caches.push(cache);
    for (let m = 0; m < MEL_N_MELS; m++) {
      predFrames[f * MEL_N_MELS + m] = cache.mel[m]!;
      const tgt = targetMel.frames[f * targetMel.nMels + m]!;
      l1 += Math.abs(cache.mel[m]! - tgt);
    }
    stopProbs[f] = cache.stopProb;
    const y = stopT[f]!;
    const p = Math.min(1 - 1e-6, Math.max(1e-6, cache.stopProb));
    bce += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));

    const useTf =
      !opts.freeRun && Math.random() < opts.teacherForceRatio;
    if (useTf) {
      prevMel = readMelFrame(targetMel, f);
    } else {
      prevMel = Float64Array.from(cache.mel);
    }
    prevStop = useTf ? y : cache.stopProb;
  }

  const count = Math.max(1, F * MEL_N_MELS);
  return {
    predFrames,
    stopProbs,
    caches,
    melL1: l1 / count,
    stopBce: bce / Math.max(1, F),
  };
}

/**
 * Backprop through decodeSequence caches (BPTT truncated to last frames if long).
 */
export function decodeSequenceBackward(
  dec: MelDecoder,
  targetMel: MelSpectrogram,
  caches: DecoderStepCache[],
  encoderStates: Vec[],
  grads: DecoderGrads,
  dEncoderAcc: Vec[],
): { stopLoss: number } {
  const F = caches.length;
  const stopT = stopTargetsFromMel(targetMel);
  let stopLoss = 0;
  const maxBack = Math.min(F, 48);
  const start = Math.max(0, F - maxBack);

  for (let f = F - 1; f >= start; f--) {
    const cache = caches[f]!;
    const dMel = new Float64Array(MEL_N_MELS);
    for (let m = 0; m < MEL_N_MELS; m++) {
      const tgt = targetMel.frames[f * targetMel.nMels + m]!;
      // d(L1)/d pred = sign(pred - tgt)
      const diff = cache.mel[m]! - tgt;
      dMel[m] = diff === 0 ? 0 : diff > 0 ? 1 / (F * MEL_N_MELS) : -1 / (F * MEL_N_MELS);
    }
    const y = stopT[f]!;
    const p = Math.min(1 - 1e-6, Math.max(1e-6, cache.stopProb));
    // d BCE / d logit = p - y
    const dStop = (p - y) / F;
    stopLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));

    const dCtx = decoderStepBackward(dec, cache, dMel, dStop, grads);
    // Distribute dContext to encoder states via attention weights
    for (let i = 0; i < encoderStates.length; i++) {
      const w = cache.attnWeights[i] ?? 0;
      const dest = dEncoderAcc[i]!;
      for (let d = 0; d < dest.length; d++) {
        dest[d]! += w * (dCtx[d] ?? 0);
      }
    }
  }
  return { stopLoss: stopLoss / Math.max(1, F) };
}

export function createDecoderAdam(lr = 0.01): AdamState {
  return createAdam(lr);
}

/** Free-running inference decode for `frameCount` frames or until stop. */
export function decodeInfer(
  dec: MelDecoder,
  encoderStates: Vec[],
  opts?: { maxFrames?: number; stopThreshold?: number },
): { frames: Float64Array; frameCount: number; stopProbs: Float64Array } {
  const maxFrames = opts?.maxFrames ?? 200;
  const stopThreshold = opts?.stopThreshold ?? 0.55;
  const frames: number[] = [];
  const stops: number[] = [];
  let prevMel = zeros(MEL_N_MELS);
  for (let m = 0; m < MEL_N_MELS; m++) prevMel[m] = -8;
  let prevStop = 0;
  let count = 0;
  for (let f = 0; f < maxFrames; f++) {
    const step = decoderStep(dec, encoderStates, prevMel, prevStop);
    for (let m = 0; m < MEL_N_MELS; m++) frames.push(step.mel[m]!);
    stops.push(step.stopProb);
    prevMel = Float64Array.from(step.mel);
    prevStop = step.stopProb;
    count += 1;
    if (f > 8 && step.stopProb >= stopThreshold) break;
  }
  return {
    frames: Float64Array.from(frames),
    frameCount: count,
    stopProbs: Float64Array.from(stops),
  };
}
