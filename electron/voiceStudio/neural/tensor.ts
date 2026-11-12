/**
 * Tiny CPU tensor + Adam for Voice Studio neural TTS.
 * Real gradients / backprop — not gradient-free priors.
 */

export type Vec = Float64Array;

export function zeros(n: number): Vec {
  return new Float64Array(n);
}

export function randn(n: number, scale = 0.08): Vec {
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Box–Muller
    const u = Math.max(1e-12, Math.random());
    const w = Math.random();
    v[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w) * scale;
  }
  return v;
}

export function copy(a: Vec): Vec {
  return Float64Array.from(a);
}

export function addInPlace(a: Vec, b: Vec, scale = 1): void {
  for (let i = 0; i < a.length; i++) a[i]! += b[i]! * scale;
}

export function scaleInPlace(a: Vec, s: number): void {
  for (let i = 0; i < a.length; i++) a[i]! *= s;
}

export function tanhArr(x: Vec): Vec {
  const o = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) o[i] = Math.tanh(x[i]!);
  return o;
}

export function tanhDeriv(y: Vec): Vec {
  // y = tanh(x) → 1 - y²
  const o = new Float64Array(y.length);
  for (let i = 0; i < y.length; i++) o[i] = 1 - y[i]! * y[i]!;
  return o;
}

export function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

export function softmax(logits: Vec): Vec {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i]! > max) max = logits[i]!;
  }
  const out = new Float64Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(logits[i]! - max);
    out[i] = e;
    sum += e;
  }
  const inv = sum > 0 ? 1 / sum : 0;
  for (let i = 0; i < out.length; i++) out[i]! *= inv;
  return out;
}

/** Dense layer: y = W x + b  (W: out×in row-major). */
export type Dense = {
  inDim: number;
  outDim: number;
  w: Vec;
  b: Vec;
  /** Adam moments */
  wm: Vec;
  wv: Vec;
  bm: Vec;
  bv: Vec;
};

export function createDense(inDim: number, outDim: number, scale = 0.08): Dense {
  const n = inDim * outDim;
  return {
    inDim,
    outDim,
    w: randn(n, scale / Math.sqrt(Math.max(1, inDim))),
    b: zeros(outDim),
    wm: zeros(n),
    wv: zeros(n),
    bm: zeros(outDim),
    bv: zeros(outDim),
  };
}

export function denseForward(layer: Dense, x: Vec): { y: Vec; x: Vec } {
  const y = new Float64Array(layer.outDim);
  for (let o = 0; o < layer.outDim; o++) {
    let s = layer.b[o]!;
    const row = o * layer.inDim;
    for (let i = 0; i < layer.inDim; i++) {
      s += layer.w[row + i]! * x[i]!;
    }
    y[o] = s;
  }
  return { y, x };
}

/** Backprop dense: dL/dx, accumulate dW, db into grads. */
export function denseBackward(
  layer: Dense,
  cachedX: Vec,
  dY: Vec,
  grads: { dw: Vec; db: Vec },
): Vec {
  const dX = zeros(layer.inDim);
  for (let o = 0; o < layer.outDim; o++) {
    const g = dY[o]!;
    grads.db[o]! += g;
    const row = o * layer.inDim;
    for (let i = 0; i < layer.inDim; i++) {
      grads.dw[row + i]! += g * cachedX[i]!;
      dX[i]! += g * layer.w[row + i]!;
    }
  }
  return dX;
}

export type AdamState = {
  step: number;
  lr: number;
  beta1: number;
  beta2: number;
  eps: number;
};

export function createAdam(lr = 0.008): AdamState {
  return { step: 0, lr, beta1: 0.9, beta2: 0.999, eps: 1e-8 };
}

export function adamUpdate(
  param: Vec,
  grad: Vec,
  m: Vec,
  v: Vec,
  adam: AdamState,
): void {
  adam.step += 1;
  const t = adam.step;
  const b1 = adam.beta1;
  const b2 = adam.beta2;
  const lr = adam.lr;
  const eps = adam.eps;
  const bc1 = 1 - b1 ** t;
  const bc2 = 1 - b2 ** t;
  for (let i = 0; i < param.length; i++) {
    const g = grad[i]!;
    m[i] = b1 * m[i]! + (1 - b1) * g;
    v[i] = b2 * v[i]! + (1 - b2) * g * g;
    const mHat = m[i]! / bc1;
    const vHat = v[i]! / bc2;
    param[i]! -= (lr * mHat) / (Math.sqrt(vHat) + eps);
  }
}

export function adamUpdateDense(
  layer: Dense,
  dw: Vec,
  db: Vec,
  adam: AdamState,
): void {
  // One shared step counter bump via weights; bias uses same adam.step.
  const stepBefore = adam.step;
  adamUpdate(layer.w, dw, layer.wm, layer.wv, adam);
  // Keep step consistent for bias (don't double-count).
  adam.step = stepBefore;
  adamUpdate(layer.b, db, layer.bm, layer.bv, adam);
}

export function zeroGrad(g: Vec): void {
  g.fill(0);
}

export type SerializedDense = {
  inDim: number;
  outDim: number;
  w: number[];
  b: number[];
};

export function serializeDense(layer: Dense): SerializedDense {
  return {
    inDim: layer.inDim,
    outDim: layer.outDim,
    w: Array.from(layer.w),
    b: Array.from(layer.b),
  };
}

export function loadDense(data: SerializedDense): Dense {
  const layer = createDense(data.inDim, data.outDim, 0);
  layer.w.set(data.w);
  layer.b.set(data.b);
  return layer;
}
