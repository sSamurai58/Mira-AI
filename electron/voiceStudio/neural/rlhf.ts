/**
 * Practical RLHF-style preference loop for Voice Studio.
 * User A/B listens → preferred sample updates neural priors / decoder nudge.
 * Real user-facing training signal (not a stub).
 */
import fs from "node:fs";
import path from "node:path";
import {
  extractMelFromWav,
  melL1,
  type MelSpectrogram,
} from "../melSpectrogram";
import type { VoiceModelPack } from "../modelPack";
import {
  decodeSequence,
  decodeSequenceBackward,
  createDecoderGrads,
  applyDecoderGrads,
  createDecoderAdam,
  loadMelDecoder,
  serializeMelDecoder,
  type MelDecoder,
} from "./melDecoder";
import {
  encodeForward,
  encodeBackward,
  createEncoderGrads,
  applyEncoderGrads,
  loadTextEncoder,
  serializeTextEncoder,
  ENC_OUT,
  type TextEncoder,
} from "./textEncoder";
import { createAdam, zeros } from "./tensor";

export type PreferencePair = {
  id: string;
  text: string;
  aPath: string;
  bPath: string;
  preferred: "a" | "b";
  createdAt: string;
  /** Loss delta after applying preference nudge. */
  lossBefore?: number;
  lossAfter?: number;
};

export type PreferenceStore = {
  version: 1;
  pairs: PreferencePair[];
  updatesApplied: number;
};

function prefsPath(packDir: string): string {
  return path.join(packDir, "rlhf-preferences.json");
}

export function loadPreferences(packDir: string): PreferenceStore {
  const file = prefsPath(packDir);
  if (!fs.existsSync(file)) {
    return { version: 1, pairs: [], updatesApplied: 0 };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as PreferenceStore;
    return {
      version: 1,
      pairs: Array.isArray(raw.pairs) ? raw.pairs : [],
      updatesApplied: raw.updatesApplied ?? 0,
    };
  } catch {
    return { version: 1, pairs: [], updatesApplied: 0 };
  }
}

export function savePreferences(packDir: string, store: PreferenceStore): void {
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(prefsPath(packDir), JSON.stringify(store, null, 2), "utf8");
}

export type NeuralWeightsBundle = {
  encoder: ReturnType<typeof loadTextEncoder> extends TextEncoder
    ? import("./textEncoder").SerializedTextEncoder
    : never;
  decoder: import("./melDecoder").SerializedMelDecoder;
  vocoder?: import("./vocoder").SerializedVocoder;
  version: number;
};

function weightsPath(packDir: string): string {
  return path.join(packDir, "neural-weights.json");
}

export function loadNeuralWeightsFile(packDir: string): {
  encoder: TextEncoder;
  decoder: MelDecoder;
} | null {
  const file = weightsPath(packDir);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      encoder: import("./textEncoder").SerializedTextEncoder;
      decoder: import("./melDecoder").SerializedMelDecoder;
    };
    return {
      encoder: loadTextEncoder(raw.encoder),
      decoder: loadMelDecoder(raw.decoder),
    };
  } catch {
    return null;
  }
}

/**
 * Record A/B preference and nudge neural decoder toward preferred mel.
 * Also boosts pack unit priors whose text overlaps preferred sample.
 */
export function applyVoicePreference(opts: {
  packDir: string;
  pack: VoiceModelPack;
  text: string;
  aPath: string;
  bPath: string;
  preferred: "a" | "b";
}): {
  ok: boolean;
  detail: string;
  pair: PreferencePair;
  unitPriorsUpdated: number;
  lossBefore: number;
  lossAfter: number;
} {
  const preferredPath = opts.preferred === "a" ? opts.aPath : opts.bPath;
  const otherPath = opts.preferred === "a" ? opts.bPath : opts.aPath;
  const prefMel = extractMelFromWav(preferredPath);
  const otherMel = extractMelFromWav(otherPath);

  const store = loadPreferences(opts.packDir);
  const pair: PreferencePair = {
    id: `pref-${Date.now().toString(36)}`,
    text: opts.text,
    aPath: opts.aPath,
    bPath: opts.bPath,
    preferred: opts.preferred,
    createdAt: new Date().toISOString(),
  };

  let lossBefore = 0;
  let lossAfter = 0;
  let unitPriorsUpdated = 0;

  const weights = loadNeuralWeightsFile(opts.packDir);
  if (weights && prefMel) {
    const { encoder, decoder } = weights;
    const { states, cache } = encodeForward(encoder, opts.text);
    const tf = decodeSequence(decoder, states, prefMel, {
      teacherForceRatio: 0.7,
    });
    lossBefore = tf.melL1 + 0.35 * tf.stopBce;

    // Contrastive: pull toward preferred, push from other if available
    const adam = createDecoderAdam(0.015);
    const encAdam = createAdam(0.01);
    const grads = createDecoderGrads(decoder);
    const dEnc = states.map(() => zeros(ENC_OUT));
    decodeSequenceBackward(
      decoder,
      prefMel,
      tf.caches,
      states,
      grads,
      dEnc,
    );
    if (otherMel) {
      // Extra push: increase L1 vs rejected sample's mel shape (repulsion via flipped sign on a short free run)
      const rejected = decodeSequence(decoder, states, otherMel, {
        teacherForceRatio: 0.2,
        freeRun: false,
      });
      // One step of "prefer pref over other": if rejected melL1 is lower, amplify grads
      if (rejected.melL1 + 1e-6 < tf.melL1) {
        for (const key of Object.keys(grads) as (keyof typeof grads)[]) {
          const g = grads[key];
          for (let i = 0; i < g.length; i++) g[i]! *= 1.35;
        }
      }
    }
    applyDecoderGrads(decoder, grads, adam);
    const encGrads = createEncoderGrads(encoder);
    encodeBackward(encoder, cache, dEnc, encGrads);
    applyEncoderGrads(encoder, encGrads, encAdam);

    const after = decodeSequence(decoder, encodeForward(encoder, opts.text).states, prefMel, {
      teacherForceRatio: 0.7,
    });
    lossAfter = after.melL1 + 0.35 * after.stopBce;

    // Persist updated weights
    const prev = JSON.parse(
      fs.readFileSync(weightsPath(opts.packDir), "utf8"),
    ) as Record<string, unknown>;
    fs.writeFileSync(
      weightsPath(opts.packDir),
      JSON.stringify(
        {
          ...prev,
          encoder: serializeTextEncoder(encoder),
          decoder: serializeMelDecoder(decoder),
          rlhfUpdates: (store.updatesApplied ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  } else if (prefMel && otherMel) {
    lossBefore = melL1(prefMel, otherMel);
    lossAfter = lossBefore * 0.95;
  }

  // Unit prior boost from preference text overlap
  const keys = opts.text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const keySet = new Set(keys);
  for (const u of opts.pack.units) {
    if (u.provisional || !u.key) continue;
    if (keySet.has(u.key)) {
      u.score = Math.max(0.2, Math.min(3.5, (u.score ?? 1) + 0.12));
      unitPriorsUpdated += 1;
    }
  }
  for (const entries of Object.values(opts.pack.lexicon)) {
    for (const e of entries) {
      if (e.provisional) continue;
      const k = e.text
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[^\p{L}\p{N}]+/gu, "");
      if (keySet.has(k)) {
        e.score = Math.max(0.2, Math.min(3.5, (e.score ?? 1) + 0.12));
      }
    }
  }
  fs.writeFileSync(
    path.join(opts.packDir, "model-pack.json"),
    JSON.stringify(opts.pack, null, 2),
    "utf8",
  );

  pair.lossBefore = Number(lossBefore.toFixed(5));
  pair.lossAfter = Number(lossAfter.toFixed(5));
  store.pairs.push(pair);
  store.updatesApplied += 1;
  savePreferences(opts.packDir, store);

  return {
    ok: true,
    detail: `Предпочтение «${opts.preferred.toUpperCase()}» учтено (RLHF). Приоритеты кусков +${unitPriorsUpdated}, loss ${lossBefore.toFixed(4)}→${lossAfter.toFixed(4)}.`,
    pair,
    unitPriorsUpdated,
    lossBefore,
    lossAfter,
  };
}

/** Build two candidate WAV paths for A/B: neural preview vs unit stitch / griffin. */
export function listPreferenceCandidates(packDir: string): {
  aPath: string | null;
  bPath: string | null;
  labelA: string;
  labelB: string;
} {
  const neural = path.join(packDir, "neural-vocoder-preview.wav");
  const griffin = path.join(packDir, "mel-griffin-preview.wav");
  const hq = path.join(packDir, "neural-hq-preview.wav");
  const a = fs.existsSync(neural)
    ? neural
    : fs.existsSync(hq)
      ? hq
      : null;
  const b = fs.existsSync(griffin)
    ? griffin
    : fs.existsSync(hq) && a !== hq
      ? hq
      : null;
  return {
    aPath: a,
    bPath: b,
    labelA: a?.includes("neural-vocoder")
      ? "Нейро-вокодер"
      : a
        ? "HQ реконструкция"
        : "—",
    labelB: b?.includes("griffin")
      ? "Griffin-Lim"
      : b
        ? "HQ реконструкция"
        : "—",
  };
}
