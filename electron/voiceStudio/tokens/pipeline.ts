/**
 * End-to-end token pipeline: normalize → chunk → (Cosy|neural) → cache.
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
import { chunkSpeechText, crossfadeJoinInt16 } from "./chunking";
import { cosyVoiceAvailable, synthesizeViaCosy } from "./cosySidecar";
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
  backend: "cosyvoice" | "unit-stitch" | "neural-mel" | "cache";
  chunks: number;
  normalizedText: string;
  speakerReady: boolean;
  cached?: boolean;
};

function readWavPcm16Mono(wavPath: string): Int16Array | null {
  const info = parseWavInfo(wavPath);
  if (!info || info.bitsPerSample !== 16) return null;
  const buf = fs.readFileSync(wavPath);
  const bytes = Math.min(info.dataSize, buf.length - info.dataOffset);
  const samples = new Int16Array(
    buf.buffer,
    buf.byteOffset + info.dataOffset,
    Math.floor(bytes / 2),
  );
  if (info.channels === 1) return samples;
  const frames = Math.floor(samples.length / info.channels);
  const mono = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < info.channels; c++) {
      acc += samples[i * info.channels + c]!;
    }
    mono[i] = Math.round(acc / info.channels);
  }
  return mono;
}

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

/** Join chunk WAVs with crossfade (32 ms). */
function joinChunkWavs(wavPaths: string[], outPath: string): boolean {
  if (!wavPaths.length) return false;
  if (wavPaths.length === 1) {
    fs.copyFileSync(wavPaths[0]!, outPath);
    return true;
  }
  const parts: Int16Array[] = [];
  let sr = 16000;
  for (const p of wavPaths) {
    const info = parseWavInfo(p);
    if (info) sr = info.sampleRate;
    const pcm = readWavPcm16Mono(p);
    if (pcm) parts.push(pcm);
  }
  if (!parts.length) return false;
  const joined = crossfadeJoinInt16(parts, sr, 32);
  writePcm16Wav(outPath, joined, sr);
  return true;
}

/**
 * Full speak path with T0 normalize, chunking, speaker pack awareness,
 * CosyVoice sidecar (optional), neural fallback, expanded cache key.
 */
export function speakTokenPipeline(opts: PipelineSpeakOpts): PipelineSpeakResult {
  const norm = normalizeSpeechText(opts.text);
  const style = opts.style ?? "default";
  const pack = loadSpeakerPack(opts.projectRoot, style);
  const speakerReady = Boolean(pack);
  const instruct = opts.prosody?.instruct?.trim() || undefined;

  const cacheKey = synthCacheKey(opts.voiceId, norm.text, {
    speed: opts.prosody?.speed,
    pauseScale: opts.prosody?.pauseScale,
    energy: opts.prosody?.energy,
    quality: opts.prosody?.quality,
    // Extended fields via quality string bake-in for instruct/seed/style
    // (localSynthCache v1) — append into text channel for hash stability:
  });
  // Bake instruct/style/seed into key by synthesizing a composite text key
  const compositeKey = synthCacheKey(
    `${opts.voiceId}::${style}::${instruct ?? ""}::${opts.prosody?.seed ?? ""}`,
    norm.text,
    opts.prosody ?? {},
  );
  void cacheKey;
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

  // Prefer recorded corpus stitch when coverage is high — tiny neural mel
  // path is still noisy; unit WAVs are the intelligible voice the user trained.
  const stitch = synthesizeUnitStitch(opts.packDir, norm.text, {
    // Partial lexicon OK — uncovered words get formant fill (intelligible).
    minCoverage: 0.35,
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

  // Neural-mel Griffin-Lim must NOT be chunked for short replies: each chunk
  // gets independent phase → robotic jumps + crossfade whoosh.
  // CosyVoice still benefits from sentence chunks on long text.
  const cosyProbe = cosyVoiceAvailable();
  const preferWhole =
    !cosyProbe.ok || norm.text.length < 280;
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

  const cosy = cosyProbe;
  const cosyPt = speakerPackPaths(opts.projectRoot, style).cosyPt;
  const useCosy = cosy.ok && (fs.existsSync(cosyPt) || Boolean(pack?.meta.sourceWav));

  for (const ch of chunks) {
    const out = path.join(tmpDir, `c${ch.index}-${Date.now()}.wav`);
    if (useCosy) {
      const res = synthesizeViaCosy({
        text: ch.text,
        speakerPt: fs.existsSync(cosyPt) ? cosyPt : undefined,
        refWav: pack?.meta.sourceWav,
        outWav: out,
        speed: opts.prosody?.speed,
        instruct,
      });
      if (res.ok) {
        chunkWavs.push(out);
        backend = "cosyvoice";
        continue;
      }
    }
    // Per-chunk: try word stitch before neural mush.
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
          "Нет нейро-весов и CosyVoice недоступен. Соберите голос в Studio.",
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

  // Cleanup chunk temps
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
