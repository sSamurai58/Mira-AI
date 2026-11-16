/**
 * End-to-end token pipeline: normalize → stitch → (F5|Chatterbox|Cosy|neural) → cache.
 */
import fs from "node:fs";
import path from "node:path";
import {
  getCachedSynthWav,
  putCachedSynthWav,
  synthCacheKey,
} from "../../tts/localSynthCache";
import { parseWavInfo } from "../modelPack";
import { synthesizeNeuralSpeech } from "../neural/infer";
import { synthesizeUnitStitch } from "../unitStitchSynth";
import {
  chatterboxAvailable,
  synthesizeViaChatterbox,
} from "./chatterboxSidecar";
import { chunkSpeechText, crossfadeJoinInt16 } from "./chunking";
import { cosyVoiceAvailable, synthesizeViaCosy } from "./cosySidecar";
import { resolveExternalTtsOrder } from "./externalTtsOrder";
import { f5TtsAvailable, synthesizeViaF5 } from "./f5Sidecar";
import { loadSpeakerPack, speakerPackPaths } from "./speakerPack";
import { normalizeSpeechText } from "./textNormalize";
import { tokenizeAndStoreUtterance } from "./tokenStore";

export type PipelineSpeakOpts = {
  projectRoot: string;
  packDir: string;
  voiceId: string;
  text: string;
  style?: string;
  prosody?: {
    speed?: number;
    pauseScale?: number;
    energy?: number;
    quality?: "fast" | "balanced" | "studio";
    pitchBiasSemitones?: number;
    instruct?: string;
    seed?: number;
  };
  /** Store T1/T2 for this utterance */
  storeTokens?: boolean;
};

export type PipelineSpeakResult = {
  ok: boolean;
  wavPath: string | null;
  detail: string;
  backend:
    | "f5-tts"
    | "chatterbox"
    | "cosyvoice"
    | "unit-stitch"
    | "neural-mel"
    | "cache";
  chunks: number;
  normalizedText: string;
  speakerReady: boolean;
  cached?: boolean;
};

function writePcm16Wav(
  outPath: string,
  pcm: Int16Array,
  sampleRate: number,
): void {
  const dataSize = pcm.length * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  const body = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  fs.writeFileSync(outPath, Buffer.concat([header, body]));
}

/** Join chunk WAVs with crossfade (32 ms), always @ 16 kHz (V6). */
function joinChunkWavs(wavPaths: string[], outPath: string): boolean {
  if (!wavPaths.length) return false;
  if (wavPaths.length === 1) {
    fs.copyFileSync(wavPaths[0]!, outPath);
    return true;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resamplePcmInt16Mono } =
    require("../modelPack") as typeof import("../modelPack");
  const parts: Int16Array[] = [];
  const sr = 16000;
  for (const p of wavPaths) {
    const info = parseWavInfo(p);
    if (!info || info.bitsPerSample !== 16) continue;
    const buf = fs.readFileSync(p);
    const raw = Buffer.from(
      buf.buffer,
      buf.byteOffset + info.dataOffset,
      info.dataSize,
    );
    const mono = resamplePcmInt16Mono(
      raw,
      info.sampleRate,
      sr,
      info.channels,
    );
    parts.push(
      new Int16Array(
        mono.pcm.buffer,
        mono.pcm.byteOffset,
        mono.pcm.byteLength / 2,
      ),
    );
  }
  if (!parts.length) return false;
  const joined = crossfadeJoinInt16(parts, sr, 32);
  writePcm16Wav(outPath, joined, sr);
  return true;
}

/**
 * Full speak path: stitch → F5 / Chatterbox / Cosy sidecars → neural-mel.
 */
export function speakTokenPipeline(opts: PipelineSpeakOpts): PipelineSpeakResult {
  const norm = normalizeSpeechText(opts.text);
  const style = opts.style ?? "default";
  const pack = loadSpeakerPack(opts.projectRoot, style);
  const speakerReady = Boolean(pack);
  const instruct = opts.prosody?.instruct?.trim() || undefined;
  const sidecarOrder = resolveExternalTtsOrder();
  const sidecarKey = sidecarOrder.join("+") || "off";

  const compositeKey = synthCacheKey(
    `${opts.voiceId}::${style}::${instruct ?? ""}::${opts.prosody?.seed ?? ""}::${sidecarKey}`,
    norm.text,
    opts.prosody ?? {},
  );
  const cachedPath = getCachedSynthWav(compositeKey);
  if (cachedPath) {
    return {
      ok: true,
      wavPath: cachedPath,
      detail: "Кэш (нормализованный текст + speaker style)",
      backend: "cache",
      chunks: 0,
      normalizedText: norm.text,
      speakerReady,
      cached: true,
    };
  }

  // V7 E1: TokenStore is analysis/storage only — does not drive synthesis.
  if (opts.storeTokens) {
    try {
      tokenizeAndStoreUtterance({
        projectRoot: opts.projectRoot,
        text: opts.text,
        prosody: opts.prosody,
      });
    } catch {
      /* non-fatal */
    }
  }

  // Prefer recorded corpus stitch when coverage is high (V9: ≥75%).
  const stitch = synthesizeUnitStitch(opts.packDir, norm.text, {
    minCoverage: 0.75,
  });
  if (stitch.ok && stitch.wavPath) {
    const wavPath = putCachedSynthWav(compositeKey, stitch.wavPath);
    try {
      if (stitch.wavPath !== wavPath && fs.existsSync(stitch.wavPath)) {
        fs.unlinkSync(stitch.wavPath);
      }
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      wavPath,
      detail: stitch.detail,
      backend: "unit-stitch",
      chunks: 1,
      normalizedText: norm.text,
      speakerReady,
      cached: false,
    };
  }

  const f5Probe = f5TtsAvailable();
  const cbProbe = chatterboxAvailable();
  const cosyProbe = cosyVoiceAvailable();
  const anySidecar =
    (sidecarOrder.includes("f5") && f5Probe.ok) ||
    (sidecarOrder.includes("chatterbox") && cbProbe.ok) ||
    (sidecarOrder.includes("cosy") && cosyProbe.ok);

  // Neural-mel must NOT be chunked for short replies (phase jumps).
  const preferWhole = !anySidecar || norm.text.length < 280;
  const chunks = preferWhole
    ? [{ text: norm.text, index: 0 }]
    : chunkSpeechText(norm.text);
  if (!chunks.length || !chunks[0]!.text) {
    return {
      ok: false,
      wavPath: null,
      detail: "Пустой текст после нормализации",
      backend: "neural-mel",
      chunks: 0,
      normalizedText: norm.text,
      speakerReady,
    };
  }

  const tmpDir = path.join(opts.projectRoot, "model-pack", "synth", "chunks");
  fs.mkdirSync(tmpDir, { recursive: true });
  const chunkWavs: string[] = [];
  let backend: PipelineSpeakResult["backend"] = "neural-mel";

  const cosyPt = speakerPackPaths(opts.projectRoot, style).cosyPt;
  const refWav = pack?.meta.sourceWav;
  const hasRef = Boolean(refWav && fs.existsSync(refWav));
  const useCosy =
    sidecarOrder.includes("cosy") &&
    cosyProbe.ok &&
    (fs.existsSync(cosyPt) || hasRef);
  const useF5 = sidecarOrder.includes("f5") && f5Probe.ok && hasRef;
  const useCb = sidecarOrder.includes("chatterbox") && cbProbe.ok;

  for (const ch of chunks) {
    const out = path.join(tmpDir, `c${ch.index}-${Date.now()}.wav`);
    let done = false;

    for (const engine of sidecarOrder) {
      if (done) break;
      if (engine === "f5" && useF5) {
        const res = synthesizeViaF5({
          text: ch.text,
          refWav,
          outWav: out,
          speed: opts.prosody?.speed,
          language: "ru",
        });
        if (res.ok) {
          chunkWavs.push(out);
          backend = "f5-tts";
          done = true;
        }
      } else if (engine === "chatterbox" && useCb) {
        const res = synthesizeViaChatterbox({
          text: ch.text,
          refWav: hasRef ? refWav : undefined,
          outWav: out,
          speed: opts.prosody?.speed,
          language: "ru",
        });
        if (res.ok) {
          chunkWavs.push(out);
          backend = "chatterbox";
          done = true;
        }
      } else if (engine === "cosy" && useCosy) {
        const res = synthesizeViaCosy({
          text: ch.text,
          speakerPt: fs.existsSync(cosyPt) ? cosyPt : undefined,
          refWav,
          outWav: out,
          speed: opts.prosody?.speed,
          instruct,
        });
        if (res.ok) {
          chunkWavs.push(out);
          backend = "cosyvoice";
          done = true;
        }
      }
    }
    if (done) continue;

    const chunkStitch = synthesizeUnitStitch(opts.packDir, ch.text, {
      outPath: out,
      minCoverage: 0.35,
    });
    if (chunkStitch.ok && chunkStitch.wavPath) {
      chunkWavs.push(chunkStitch.wavPath);
      backend = "unit-stitch";
      continue;
    }
    const neural = synthesizeNeuralSpeech(opts.packDir, ch.text, {
      prosody: opts.prosody,
    });
    if (!neural) {
      return {
        ok: false,
        wavPath: null,
        detail:
          "Нет нейро-весов и sidecar (F5/Chatterbox/Cosy) недоступен. Соберите голос в Studio или задайте F5_HOME.",
        backend: "neural-mel",
        chunks: chunks.length,
        normalizedText: norm.text,
        speakerReady,
      };
    }
    fs.copyFileSync(neural.wavPath, out);
    chunkWavs.push(out);
    backend = "neural-mel";
  }

  const joined = path.join(
    opts.projectRoot,
    "model-pack",
    "synth",
    `pipe-${Date.now()}.wav`,
  );
  if (!joinChunkWavs(chunkWavs, joined)) {
    return {
      ok: false,
      wavPath: null,
      detail: "Не удалось склеить чанки",
      backend,
      chunks: chunks.length,
      normalizedText: norm.text,
      speakerReady,
    };
  }

  for (const p of chunkWavs) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  const wavPath = putCachedSynthWav(compositeKey, joined);
  try {
    if (joined !== wavPath && fs.existsSync(joined)) fs.unlinkSync(joined);
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    wavPath,
    detail: `${backend} · ${chunks.length} чанк(ов) · speaker ${speakerReady ? "ok" : "нет"}`,
    backend,
    chunks: chunks.length,
    normalizedText: norm.text,
    speakerReady,
    cached: false,
  };
}
