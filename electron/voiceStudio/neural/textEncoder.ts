/**
 * Real text encoder: grapheme embeddings + phone-ish features → hidden states.
 * Not tokenization-only.
 */
import {
  createDense,
  denseForward,
  denseBackward,
  adamUpdateDense,
  loadDense,
  serializeDense,
  softmax,
  tanhArr,
  zeros,
  type AdamState,
  type Dense,
  type SerializedDense,
  type Vec,
  zeroGrad,
} from "./tensor";

export const ENC_EMB = 32;
export const ENC_HID = 48;
export const ENC_OUT = 40;

const SPECIAL = ["<pad>", "<bos>", "<eos>", "<unk>", " ", "-", "'"] as const;

function buildCharVocab(): Map<string, number> {
  const map = new Map<string, number>();
  let i = 0;
  for (const s of SPECIAL) map.set(s, i++);
  // Digits
  for (let d = 0; d <= 9; d++) map.set(String(d), i++);
  // Latin
  for (let c = 97; c <= 122; c++) map.set(String.fromCharCode(c), i++);
  // Cyrillic а–я + ё
  const cyr = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
  for (const ch of cyr) map.set(ch, i++);
  return map;
}

export const CHAR_VOCAB = buildCharVocab();
export const VOCAB_SIZE = CHAR_VOCAB.size;

const VOWELS = new Set(
  "aeiouyаеёиоуыэюяAEIOUYАЕЁИОУЫЭЮЯ".split(""),
);

export type EncodedToken = {
  char: string;
  id: number;
  /** Phone-ish: [isVowel, isDigit, isSpace, posNorm, lenNorm, stressHint] */
  feats: Vec;
};

export function normalizeForEncoder(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** Grapheme sequence with phone-ish side features. */
export function tokenizeGraphemes(text: string): EncodedToken[] {
  const norm = normalizeForEncoder(text);
  const chars = Array.from(norm);
  const n = Math.max(1, chars.length);
  const out: EncodedToken[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const id = CHAR_VOCAB.get(ch) ?? CHAR_VOCAB.get("<unk>")!;
    const feats = new Float64Array(6);
    feats[0] = VOWELS.has(ch) ? 1 : 0;
    feats[1] = /\d/.test(ch) ? 1 : 0;
    feats[2] = ch === " " ? 1 : 0;
    feats[3] = i / n;
    feats[4] = Math.min(1, n / 64);
    // Stress heuristic: vowel after consonant cluster near word start.
    feats[5] =
      feats[0] && i > 0 && !VOWELS.has(chars[i - 1]!) && i / n < 0.55
        ? 0.8
        : feats[0]
          ? 0.35
          : 0;
    out.push({ char: ch, id, feats });
  }
  if (out.length === 0) {
    out.push({
      char: "<pad>",
      id: CHAR_VOCAB.get("<pad>")!,
      feats: new Float64Array(6),
    });
  }
  return out;
}

export type TextEncoder = {
  emb: Vec; // VOCAB_SIZE × ENC_EMB
  embM: Vec;
  embV: Vec;
  proj: Dense; // (ENC_EMB+6) → ENC_HID
  out: Dense; // ENC_HID → ENC_OUT
};

export type SerializedTextEncoder = {
  emb: number[];
  proj: SerializedDense;
  out: SerializedDense;
  embDim: number;
  vocabSize: number;
};

export function createTextEncoder(): TextEncoder {
  const embN = VOCAB_SIZE * ENC_EMB;
  const emb = new Float64Array(embN);
  for (let i = 0; i < embN; i++) {
    emb[i] = (Math.random() * 2 - 1) * (0.12 / Math.sqrt(ENC_EMB));
  }
  return {
    emb,
    embM: zeros(embN),
    embV: zeros(embN),
    proj: createDense(ENC_EMB + 6, ENC_HID, 0.1),
    out: createDense(ENC_HID, ENC_OUT, 0.1),
  };
}

export type EncoderForwardCache = {
  tokens: EncodedToken[];
  embRows: Vec[];
  projIns: Vec[];
  projYs: Vec[];
  hid: Vec[];
  outs: Vec[];
};

export function encodeForward(
  enc: TextEncoder,
  text: string,
): { states: Vec[]; cache: EncoderForwardCache } {
  const tokens = tokenizeGraphemes(text);
  const embRows: Vec[] = [];
  const projIns: Vec[] = [];
  const projYs: Vec[] = [];
  const hid: Vec[] = [];
  const outs: Vec[] = [];
  const states: Vec[] = [];

  for (const tok of tokens) {
    const row = new Float64Array(ENC_EMB);
    const off = tok.id * ENC_EMB;
    for (let i = 0; i < ENC_EMB; i++) row[i] = enc.emb[off + i]!;
    embRows.push(row);

    const pin = new Float64Array(ENC_EMB + 6);
    pin.set(row, 0);
    pin.set(tok.feats, ENC_EMB);
    projIns.push(pin);

    const { y: py } = denseForward(enc.proj, pin);
    projYs.push(py);
    const h = tanhArr(py);
    hid.push(h);

    const { y: oy } = denseForward(enc.out, h);
    const st = tanhArr(oy);
    outs.push(oy);
    states.push(st);
  }

  return {
    states,
    cache: { tokens, embRows, projIns, projYs, hid, outs },
  };
}

export type EncoderGrads = {
  dEmb: Vec;
  dProjW: Vec;
  dProjB: Vec;
  dOutW: Vec;
  dOutB: Vec;
};

export function createEncoderGrads(enc: TextEncoder): EncoderGrads {
  return {
    dEmb: zeros(enc.emb.length),
    dProjW: zeros(enc.proj.w.length),
    dProjB: zeros(enc.proj.b.length),
    dOutW: zeros(enc.out.w.length),
    dOutB: zeros(enc.out.b.length),
  };
}

/** Backprop encoder given dL/d state for each token. */
export function encodeBackward(
  enc: TextEncoder,
  cache: EncoderForwardCache,
  dStates: Vec[],
  grads: EncoderGrads,
): void {
  for (let t = 0; t < cache.tokens.length; t++) {
    const dSt = dStates[t] ?? zeros(ENC_OUT);
    const dyOut = new Float64Array(ENC_OUT);
    // outs[t] is pre-activation; state = tanh(oy)
    const st = tanhArr(cache.outs[t]!);
    for (let i = 0; i < ENC_OUT; i++) {
      dyOut[i] = dSt[i]! * (1 - st[i]! * st[i]!);
    }
    const dHid = denseBackward(
      enc.out,
      cache.hid[t]!,
      dyOut,
      { dw: grads.dOutW, db: grads.dOutB },
    );
    // hid = tanh(projY)
    const dProjY = new Float64Array(ENC_HID);
    for (let i = 0; i < ENC_HID; i++) {
      dProjY[i] = dHid[i]! * (1 - cache.hid[t]![i]! * cache.hid[t]![i]!);
    }
    const dPin = denseBackward(
      enc.proj,
      cache.projIns[t]!,
      dProjY,
      { dw: grads.dProjW, db: grads.dProjB },
    );
    const tok = cache.tokens[t]!;
    const off = tok.id * ENC_EMB;
    for (let i = 0; i < ENC_EMB; i++) {
      grads.dEmb[off + i]! += dPin[i]!;
    }
  }
}

export function applyEncoderGrads(
  enc: TextEncoder,
  grads: EncoderGrads,
  adam: AdamState,
): void {
  const stepBefore = adam.step;
  // Embeddings via Adam
  {
    const t = stepBefore + 1;
    const b1 = adam.beta1;
    const b2 = adam.beta2;
    const lr = adam.lr;
    const eps = adam.eps;
    const bc1 = 1 - b1 ** t;
    const bc2 = 1 - b2 ** t;
    for (let i = 0; i < enc.emb.length; i++) {
      const g = grads.dEmb[i]!;
      enc.embM[i] = b1 * enc.embM[i]! + (1 - b1) * g;
      enc.embV[i] = b2 * enc.embV[i]! + (1 - b2) * g * g;
      const mHat = enc.embM[i]! / bc1;
      const vHat = enc.embV[i]! / bc2;
      enc.emb[i]! -= (lr * mHat) / (Math.sqrt(vHat) + eps);
    }
  }
  adam.step = stepBefore;
  adamUpdateDense(enc.proj, grads.dProjW, grads.dProjB, adam);
  adam.step = stepBefore;
  adamUpdateDense(enc.out, grads.dOutW, grads.dOutB, adam);

  zeroGrad(grads.dEmb);
  zeroGrad(grads.dProjW);
  zeroGrad(grads.dProjB);
  zeroGrad(grads.dOutW);
  zeroGrad(grads.dOutB);
}

export function serializeTextEncoder(enc: TextEncoder): SerializedTextEncoder {
  return {
    emb: Array.from(enc.emb),
    proj: serializeDense(enc.proj),
    out: serializeDense(enc.out),
    embDim: ENC_EMB,
    vocabSize: VOCAB_SIZE,
  };
}

export function loadTextEncoder(data: SerializedTextEncoder): TextEncoder {
  const enc = createTextEncoder();
  if (data.emb.length === enc.emb.length) enc.emb.set(data.emb);
  enc.proj = loadDense(data.proj);
  enc.out = loadDense(data.out);
  return enc;
}

/** Softmax attention over encoder states for a query vector. */
export function attentionPool(
  states: Vec[],
  query: Vec,
): { context: Vec; weights: Vec } {
  const n = states.length;
  const logits = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const st = states[i]!;
    const dim = Math.min(st.length, query.length);
    for (let d = 0; d < dim; d++) s += st[d]! * query[d]!;
    logits[i] = s / Math.sqrt(Math.max(1, dim));
  }
  const weights = softmax(logits);
  const context = zeros(states[0]?.length ?? ENC_OUT);
  for (let i = 0; i < n; i++) {
    const w = weights[i]!;
    const st = states[i]!;
    for (let d = 0; d < context.length; d++) context[d]! += w * st[d]!;
  }
  return { context, weights };
}
