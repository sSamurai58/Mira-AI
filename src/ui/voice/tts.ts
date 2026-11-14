import { isCustomVoiceId, resolveSpeechVoice } from "./catalog";
import {
  loadCustomVoiceCorpus,
  planCorpusSpeech,
  type CorpusPlanSegment,
  type CorpusSpeechPlan,
} from "./corpusTts";
import { synthesizeParametricBuffer } from "./parametricSynth";
import { getActiveTtsEngine } from "./ttsEngines";
import { applyVoiceFx } from "./voiceFx";
import { splitSpeakPhrases } from "./voicePhrases";
import {
  getVoiceSettings,
  neuralProsodyFromSettings,
} from "./voiceSettings";

export type SpeakHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  /** Honest status for studio / hybrid / compositional synthesis. */
  onStatus?: (message: string) => void;
  /**
   * For custom voices: if corpus has no word coverage, play the trained
   * preview clip instead of silently using a system voice (Settings listen).
   */
  preferPreview?: boolean;
};

let speakGeneration = 0;
let activeCustomAudio: HTMLAudioElement | null = null;
let activeBufferSource: AudioBufferSourceNode | null = null;
let sharedAudioCtx: AudioContext | null = null;

/** Default join length; adaptive path stretches 22–55 ms by edge energy. */
const CROSSFADE_SEC = 0.036;
const CROSSFADE_MIN_SEC = 0.022;
const CROSSFADE_MAX_SEC = 0.055;

export function isTtsAvailable(): boolean {
  const engine = getActiveTtsEngine();
  // Parametric + neural-pack work without speechSynthesis (local AudioContext).
  if (engine === "parametric" || engine === "neural-pack") return true;
  if (engine === "elevenlabs") {
    return Boolean(
      typeof window !== "undefined" && window.mira?.synthesizeElevenLabs,
    );
  }
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function getAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    const Ctx =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext: typeof AudioContext;
        }
      ).webkitAudioContext;
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

/** Public hook for warmup — creates/resumes shared AudioContext. */
export function ensureAudioContext(): AudioContext {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

export function stopSpeaking(): void {
  speakGeneration += 1;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (activeCustomAudio) {
    try {
      activeCustomAudio.pause();
      activeCustomAudio.src = "";
    } catch {
      /* ignore */
    }
    activeCustomAudio = null;
  }
  if (activeBufferSource) {
    try {
      activeBufferSource.stop();
    } catch {
      /* ignore */
    }
    activeBufferSource = null;
  }
}

function speakWebSpeech(
  text: string,
  voiceId: string | null,
  handlers: SpeakHandlers,
  isCurrent: () => boolean,
): void {
  if (!isCurrent()) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    handlers.onError?.("TTS недоступен в этой среде (speechSynthesis).");
    return;
  }
  const clean = text.trim();
  if (!clean) {
    handlers.onEnd?.();
    return;
  }

  const engine = getActiveTtsEngine();
  const utter = new SpeechSynthesisUtterance(clean);
  // Never bind a system SpeechSynthesisVoice for custom studio ids —
  // resolveSpeechVoice would pick a RU system stub and sound "wrong".
  const resolvedId = isCustomVoiceId(voiceId) ? null : voiceId;
  const voice = resolveSpeechVoice(resolvedId);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = "ru-RU";
  }
  const vs = getVoiceSettings();
  const baseRate = engine === "neural-pack" ? 0.98 : 1.02;
  const basePitch = engine === "neural-pack" ? 1.02 : 1;
  const pitchRatio = Math.pow(2, vs.pitchSemitones / 12);
  // pauseScale slows Web Speech slightly (wider pacing).
  const rateMul = vs.speed / Math.max(0.85, Math.min(1.25, vs.pauseScale));
  utter.rate = Math.min(1.4, Math.max(0.7, baseRate * rateMul));
  utter.pitch = Math.min(
    1.4,
    Math.max(0.7, basePitch * pitchRatio * (0.92 + 0.08 * vs.energy)),
  );
  utter.volume = Math.min(1, Math.max(0, vs.gain * Math.min(1.15, vs.energy)));
  utter.onstart = () => {
    if (!isCurrent()) {
      window.speechSynthesis.cancel();
      return;
    }
    handlers.onStart?.();
  };
  utter.onend = () => {
    if (!isCurrent()) return;
    handlers.onEnd?.();
  };
  utter.onerror = (ev) => {
    if (!isCurrent()) return;
    const code = ev.error || "TTS error";
    if (
      code === "synthesis-failed" ||
      code === "synthesis-unavailable" ||
      code === "language-unavailable" ||
      code === "voice-unavailable" ||
      code === "not-allowed" ||
      code === "interrupted" ||
      code === "canceled"
    ) {
      handlers.onEnd?.();
      return;
    }
    handlers.onError?.(code);
  };
  window.speechSynthesis.speak(utter);
}

async function readClipDataUrl(filePath: string): Promise<string> {
  if (!window.mira?.readVoicePreview) {
    throw new Error("Превью клипов доступно в Electron");
  }
  return window.mira.readVoicePreview(filePath);
}

async function decodeClip(
  ctx: AudioContext,
  filePath: string,
  cache: Map<string, AudioBuffer>,
): Promise<AudioBuffer> {
  const hit = cache.get(filePath);
  if (hit) return hit;
  const dataUrl = await readClipDataUrl(filePath);
  const res = await fetch(dataUrl);
  const raw = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(raw.slice(0));
  cache.set(filePath, decoded);
  return decoded;
}

function sliceBuffer(
  ctx: AudioContext,
  source: AudioBuffer,
  startFrac: number,
  endFrac: number,
): AudioBuffer {
  const start = Math.max(
    0,
    Math.min(source.length - 1, Math.floor(startFrac * source.length)),
  );
  const end = Math.max(
    start + 1,
    Math.min(source.length, Math.ceil(endFrac * source.length)),
  );
  const frames = end - start;
  const out = ctx.createBuffer(
    source.numberOfChannels,
    frames,
    source.sampleRate,
  );
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const src = source.getChannelData(ch);
    out.copyToChannel(src.subarray(start, end), ch);
  }
  return out;
}

/** Naive linear resample so mixed clip rates do not pitch-shift on stitch. */
function resampleBuffer(
  ctx: AudioContext,
  source: AudioBuffer,
  targetRate: number,
): AudioBuffer {
  if (source.sampleRate === targetRate) return source;
  const ratio = targetRate / source.sampleRate;
  const frames = Math.max(1, Math.round(source.length * ratio));
  const out = ctx.createBuffer(source.numberOfChannels, frames, targetRate);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const src = source.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < frames; i++) {
      const x = i / ratio;
      const i0 = Math.floor(x);
      const i1 = Math.min(src.length - 1, i0 + 1);
      const t = x - i0;
      dst[i] = src[i0]! * (1 - t) + src[i1]! * t;
    }
  }
  return out;
}

function channelRms(data: Float32Array, from = 0, count?: number): number {
  const n = Math.min(data.length - from, count ?? data.length);
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = data[from + i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

function snapZeroCrossFloat(
  data: Float32Array,
  around: number,
  window: number,
): number {
  const lo = Math.max(1, around - window);
  const hi = Math.min(data.length - 1, around + window);
  let best = around;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = lo; i <= hi; i++) {
    const a = data[i - 1]!;
    const b = data[i]!;
    const crosses = (a <= 0 && b >= 0) || (a >= 0 && b <= 0);
    const mag = Math.min(Math.abs(a), Math.abs(b));
    const score = (crosses ? 0 : 2) + mag + Math.abs(i - around) * 0.0004;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function scaleBufferInPlace(buf: AudioBuffer, gain: number): void {
  if (Math.abs(gain - 1) < 0.02) return;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i]! *= gain;
  }
}

/**
 * Concatenate buffers with adaptive equal-power overlap-add:
 * resample → RMS level-match → zero-cross aligned crossfade (22–55 ms).
 * Fixed short fades in 0.1.4 still clicked when unit levels / phases differed.
 */
export function concatenateWithCrossfade(
  ctx: AudioContext,
  buffers: AudioBuffer[],
  crossfadeSec = CROSSFADE_SEC,
): AudioBuffer {
  if (!buffers.length) {
    return ctx.createBuffer(1, 1, ctx.sampleRate);
  }
  if (buffers.length === 1) return buffers[0]!;

  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const rate = buffers[0]!.sampleRate;
  const normalized = buffers.map((b) => resampleBuffer(ctx, b, rate));

  // Match each unit toward median RMS so joins are not stepped in loudness.
  const rmsList = normalized.map((b) => channelRms(b.getChannelData(0)));
  const sortedRms = [...rmsList].sort((a, b) => a - b);
  const targetRms = Math.max(
    1e-5,
    sortedRms[Math.floor(sortedRms.length / 2)] ?? rmsList[0] ?? 0.05,
  );
  for (let i = 0; i < normalized.length; i++) {
    const r = Math.max(1e-5, rmsList[i]!);
    const gain = Math.max(0.65, Math.min(1.45, targetRms / r));
    scaleBufferInPlace(normalized[i]!, gain);
  }

  const minXf = Math.max(1, Math.floor(CROSSFADE_MIN_SEC * rate));
  const maxXf = Math.max(
    minXf,
    Math.floor(Math.max(crossfadeSec, CROSSFADE_MAX_SEC) * rate),
  );

  // Grow per-channel accumulators (length changes with ZC-aligned overlaps).
  const acc: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const src0 =
      ch < normalized[0]!.numberOfChannels
        ? normalized[0]!.getChannelData(ch)
        : new Float32Array(normalized[0]!.length);
    acc.push(Float32Array.from(src0));
  }

  for (let i = 1; i < normalized.length; i++) {
    const buf = normalized[i]!;
    const edgePrev = channelRms(
      acc[0]!,
      Math.max(0, acc[0]!.length - minXf),
      minXf,
    );
    const edgeNext = channelRms(
      buf.numberOfChannels > 0
        ? buf.getChannelData(0)
        : new Float32Array(buf.length),
      0,
      minXf,
    );
    const edge = Math.max(edgePrev, edgeNext);
    const t = Math.max(0, Math.min(1, (edge - 0.02) / 0.12));
    let xf = Math.round(minXf + (maxXf - minXf) * (0.35 + 0.65 * t));
    xf = Math.min(
      xf,
      Math.floor(acc[0]!.length * 0.45),
      Math.floor(buf.length * 0.45),
    );
    xf = Math.max(1, xf);

    const joinAt = snapZeroCrossFloat(
      acc[0]!,
      acc[0]!.length - xf,
      Math.min(64, xf),
    );
    const start = Math.max(0, joinAt);
    const useOverlap = Math.min(xf, acc[0]!.length - start, buf.length);
    const nextLen = start + buf.length;
    for (let ch = 0; ch < channels; ch++) {
      const prev = acc[ch]!;
      const src =
        ch < buf.numberOfChannels
          ? buf.getChannelData(ch)
          : new Float32Array(buf.length);
      const grown = new Float32Array(nextLen);
      grown.set(prev.subarray(0, start + useOverlap), 0);
      for (let n = 0; n < useOverlap; n++) {
        const u = useOverlap <= 1 ? 1 : n / (useOverlap - 1);
        const a = Math.cos(u * 0.5 * Math.PI);
        const b = Math.sin(u * 0.5 * Math.PI);
        grown[start + n] = (prev[start + n] ?? 0) * a + src[n]! * b;
      }
      if (buf.length > useOverlap) {
        grown.set(src.subarray(useOverlap), start + useOverlap);
      }
      acc[ch] = grown;
    }
  }

  const out = ctx.createBuffer(channels, Math.max(1, acc[0]!.length), rate);
  for (let ch = 0; ch < channels; ch++) {
    const dst = out.getChannelData(ch);
    dst.set(acc[ch]!);
  }
  return out;
}

async function playAudioBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  isCurrent: () => boolean,
): Promise<void> {
  if (!isCurrent()) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
  await new Promise<void>((resolve, reject) => {
    if (!isCurrent()) {
      resolve();
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    activeBufferSource = src;
    src.onended = () => {
      if (activeBufferSource === src) activeBufferSource = null;
      resolve();
    };
    try {
      src.start(0);
    } catch (err) {
      if (activeBufferSource === src) activeBufferSource = null;
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

async function playFragmentRun(
  fragments: Extract<CorpusPlanSegment, { kind: "fragment" }>[],
  isCurrent: () => boolean,
  cache: Map<string, AudioBuffer>,
): Promise<void> {
  if (!fragments.length || !isCurrent()) return;
  const ctx = getAudioContext();
  const slices: AudioBuffer[] = [];
  for (const frag of fragments) {
    if (!isCurrent()) return;
    const full = await decodeClip(ctx, frag.filePath, cache);
    slices.push(sliceBuffer(ctx, full, frag.startFrac, frag.endFrac));
  }
  if (!isCurrent()) return;
  const stitched = concatenateWithCrossfade(ctx, slices, CROSSFADE_SEC);
  const shaped = applyVoiceFx(ctx, stitched, getVoiceSettings());
  await playAudioBuffer(ctx, shaped, isCurrent);
}

/**
 * Neural gate: only reject near-silence / clipped garbage.
 * Do NOT use the strict chat ZCR gate — Griffin-Lim synth is hissier than
 * mic speech and used to trip the gate → bad corpus clip-stitch fallback.
 */
export function audioBufferSoundsLikeNeuralSynth(buf: AudioBuffer): boolean {
  if (!buf || buf.length < 32) return false;
  const data = buf.getChannelData(0);
  const rms = channelRms(data);
  if (rms < 0.004 || rms > 0.99) return false;
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]!);
    if (a > peak) peak = a;
  }
  return peak >= 0.02;
}

/** Try neural synth for one phrase → shaped AudioBuffer, or null. */
async function tryNeuralPhraseBuffer(
  voiceId: string,
  phrase: string,
  isCurrent: () => boolean,
): Promise<{ buffer: AudioBuffer; detail: string } | null> {
  if (!window.mira?.synthesizeCustomVoiceNeural || !window.mira?.readVoicePreview) {
    return null;
  }
  try {
    const prosody = neuralProsodyFromSettings(getVoiceSettings());
    const neural = await window.mira.synthesizeCustomVoiceNeural(
      voiceId,
      phrase,
      prosody,
    );
    if (!isCurrent() || !neural.ok || !neural.wavPath) return null;
    const ctx = getAudioContext();
    const decodeCache = new Map<string, AudioBuffer>();
    const buf = await decodeClip(ctx, neural.wavPath, decodeCache);
    if (!isCurrent()) return null;
    if (!audioBufferSoundsLikeNeuralSynth(buf)) return null;
    const shaped = applyVoiceFx(ctx, buf, getVoiceSettings());
    const detail = neural.cached
      ? "Нейро-синтез (кэш)"
      : neural.detail || "Нейро-синтез (encoder→decoder→vocoder)";
    return { buffer: shaped, detail };
  } catch {
    return null;
  }
}

async function speakCorpusPlan(
  clean: string,
  voiceId: string,
  handlers: SpeakHandlers,
  isCurrent: () => boolean,
  markStart: () => void,
): Promise<boolean> {
  let plan: CorpusSpeechPlan;
  try {
    const corpus = await loadCustomVoiceCorpus(voiceId);
    if (!isCurrent()) return true;
    plan = planCorpusSpeech(clean, corpus.units, {
      preferPreview: handlers.preferPreview,
      previewPath: corpus.voice.preview_path,
    });
  } catch (err) {
    if (!isCurrent()) return true;
    handlers.onStatus?.(
      err instanceof Error
        ? `Студийный голос: ${err.message}`
        : "Студийный голос недоступен",
    );
    return false;
  }

  handlers.onStatus?.(plan.status);

  if (plan.mode === "webspeech-fallback") {
    return false;
  }

  const canPlayClips = Boolean(window.mira?.readVoicePreview);
  if (!canPlayClips) {
    handlers.onStatus?.(
      "Browser-demo: клипы студии без файлов — запасной Web Speech",
    );
    return false;
  }

  const cache = new Map<string, AudioBuffer>();
  try {
    let i = 0;
    while (i < plan.segments.length) {
      if (!isCurrent()) return true;
      const seg = plan.segments[i]!;
      if (seg.kind === "fragment") {
        const run: Extract<CorpusPlanSegment, { kind: "fragment" }>[] = [];
        while (i < plan.segments.length && plan.segments[i]!.kind === "fragment") {
          run.push(
            plan.segments[i] as Extract<
              CorpusPlanSegment,
              { kind: "fragment" }
            >,
          );
          i += 1;
        }
        markStart();
        await playFragmentRun(run, isCurrent, cache);
      } else {
        i += 1;
        await new Promise<void>((resolve) => {
          speakWebSpeech(
            seg.text,
            null,
            {
              onStart: markStart,
              onEnd: resolve,
              onError: () => resolve(),
            },
            isCurrent,
          );
        });
      }
    }
    return true;
  } catch (err) {
    if (!isCurrent()) return true;
    handlers.onStatus?.(
      err instanceof Error
        ? `Студия: ${err.message}; запасной системный TTS`
        : "Студия: ошибка склейки; запасной системный TTS",
    );
    return false;
  }
}

/**
 * Custom / Voice Studio voices: GENERATE speech (neural pack), never play
 * cut/stitched recording fragments. Wrong word-slice alignment used to shred
 * clips — that path is retired for playback.
 *
 * Fallback when weights are missing / synth fails: system Web Speech only.
 * Opt-in legacy stitch: localStorage mira.tts.allowCorpusStitch = "1".
 */
async function speakCustomVoice(
  text: string,
  voiceId: string,
  handlers: SpeakHandlers,
  isCurrent: () => boolean,
): Promise<void> {
  const clean = text.trim();
  if (!clean) {
    handlers.onEnd?.();
    return;
  }

  const allowStitch =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("mira.tts.allowCorpusStitch") === "1";

  const phrases = splitSpeakPhrases(clean);
  let started = false;
  const markStart = () => {
    if (!started) {
      started = true;
      handlers.onStart?.();
    }
  };

  // Phrase pipeline: synthesize next while playing current (local only).
  const prefetch = (phrase: string) =>
    tryNeuralPhraseBuffer(voiceId, phrase, isCurrent);

  let nextJob =
    phrases.length > 0 ? prefetch(phrases[0]!) : Promise.resolve(null);
  let usedNeural = false;
  let neuralFailedAll = phrases.length > 0;

  for (let i = 0; i < phrases.length; i++) {
    if (!isCurrent()) return;
    const ready = await nextJob;
    if (i + 1 < phrases.length) {
      nextJob = prefetch(phrases[i + 1]!);
    }

    if (ready) {
      neuralFailedAll = false;
      usedNeural = true;
      handlers.onStatus?.(
        phrases.length > 1
          ? `${ready.detail} · фраза ${i + 1}/${phrases.length}`
          : ready.detail,
      );
      markStart();
      await playAudioBuffer(getAudioContext(), ready.buffer, isCurrent);
      continue;
    }

    const phrase = phrases[i]!;
    // Default: no clip stitching — synthesize failed → Web Speech for this phrase.
    if (allowStitch) {
      const okCorpus = await speakCorpusPlan(
        phrase,
        voiceId,
        {
          ...handlers,
          preferPreview: handlers.preferPreview && phrases.length === 1,
          onStart: markStart,
          onEnd: undefined,
        },
        isCurrent,
        markStart,
      );
      if (okCorpus) continue;
    } else {
      handlers.onStatus?.(
        "Нейро-веса нет — параметрический синтез по настройкам (без записи)",
      );
      markStart();
      await speakParametricPhrase(phrase, isCurrent, handlers);
      continue;
    }
    await new Promise<void>((resolve) => {
      speakWebSpeech(
        phrase,
        null,
        {
          onStart: markStart,
          onEnd: resolve,
          onError: () => resolve(),
          onStatus: handlers.onStatus,
        },
        isCurrent,
      );
    });
  }

  if (!isCurrent()) return;
  if (!started) {
    if (neuralFailedAll && !usedNeural && allowStitch) {
      const ok = await speakCorpusPlan(
        clean,
        voiceId,
        handlers,
        isCurrent,
        markStart,
      );
      if (!ok) {
        handlers.onStatus?.(
          "Склейка не вышла — параметрический синтез по настройкам",
        );
        await speakParametricFull(clean, handlers, isCurrent);
        return;
      }
    } else if (neuralFailedAll && !usedNeural) {
      handlers.onStatus?.(
        "Параметрический синтез (высота / скорость / энергия) — без записи аудио",
      );
      await speakParametricFull(clean, handlers, isCurrent);
      return;
    } else {
      handlers.onStart?.();
    }
  }
  handlers.onEnd?.();
}

async function speakParametricPhrase(
  phrase: string,
  isCurrent: () => boolean,
  handlers: SpeakHandlers,
): Promise<void> {
  if (!isCurrent()) return;
  try {
    const ctx = getAudioContext();
    const buf = synthesizeParametricBuffer(ctx, phrase, getVoiceSettings());
    // FX already baked into parametric (pitch/speed/energy); light gain pass ok.
    const shaped = applyVoiceFx(ctx, buf, {
      ...getVoiceSettings(),
      // Avoid double pitch/time — parametric already applied them.
      pitchSemitones: 0,
      speed: 1,
      pauseScale: 1,
    });
    handlers.onStatus?.("Параметрический синтез");
    await playAudioBuffer(ctx, shaped, isCurrent);
  } catch (err) {
    handlers.onStatus?.(
      err instanceof Error
        ? `Параметрический синтез: ${err.message}`
        : "Параметрический синтез не удался",
    );
  }
}

async function speakParametricFull(
  text: string,
  handlers: SpeakHandlers,
  isCurrent: () => boolean,
): Promise<void> {
  const clean = text.trim();
  if (!clean) {
    handlers.onEnd?.();
    return;
  }
  const phrases = splitSpeakPhrases(clean);
  let started = false;
  for (let i = 0; i < phrases.length; i++) {
    if (!isCurrent()) return;
    if (!started) {
      started = true;
      handlers.onStart?.();
    }
    handlers.onStatus?.(
      phrases.length > 1
        ? `Параметрический синтез · фраза ${i + 1}/${phrases.length}`
        : "Параметрический синтез (настройки, без записи)",
    );
    await speakParametricPhrase(phrases[i]!, isCurrent, handlers);
  }
  if (!isCurrent()) return;
  if (!started) handlers.onStart?.();
  handlers.onEnd?.();
}

/** Reject near-silence / white-noise buffers so we never leave screech as output. */
export function audioBufferSoundsLikeSpeech(buf: AudioBuffer): boolean {
  if (!buf || buf.length < 32) return false;
  const data = buf.getChannelData(0);
  const rms = channelRms(data);
  if (rms < 0.008 || rms > 0.98) return false;
  let zc = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i - 1]! >= 0) !== (data[i]! >= 0)) zc += 1;
  }
  const zcr = zc / data.length;
  // Speech ZCR is moderate; raw PCM-as-float / white noise sits near ~0.5.
  if (zcr > 0.38) return false;
  return true;
}

async function decodeDataUrlToBuffer(
  ctx: AudioContext,
  dataUrl: string,
): Promise<AudioBuffer> {
  const res = await fetch(dataUrl);
  const raw = await res.arrayBuffer();
  return ctx.decodeAudioData(raw.slice(0));
}

async function speakElevenLabs(
  text: string,
  handlers: SpeakHandlers,
  isCurrent: () => boolean,
): Promise<void> {
  const clean = text.trim();
  if (!clean) {
    handlers.onEnd?.();
    return;
  }
  if (!window.mira?.synthesizeElevenLabs) {
    handlers.onError?.(
      "ElevenLabs доступен только в приложении Electron. Ключ API не уходит в браузер.",
    );
    return;
  }

  handlers.onStatus?.("ElevenLabs: синтез…");
  let result: Awaited<ReturnType<NonNullable<typeof window.mira.synthesizeElevenLabs>>>;
  try {
    // Prefer validated MP3; main process falls back from /stream → convert.
    result = await window.mira.synthesizeElevenLabs({ text: clean });
  } catch (err) {
    if (!isCurrent()) return;
    handlers.onError?.(
      err instanceof Error
        ? `ElevenLabs: ${err.message}`
        : "ElevenLabs: ошибка запроса",
    );
    return;
  }
  if (!isCurrent()) return;
  if (!result.ok || !result.dataUrl) {
    handlers.onStatus?.(
      result.detail ||
        "ElevenLabs не ответил — запасной Web Speech",
    );
    speakWebSpeech(clean, null, handlers, isCurrent);
    return;
  }

  handlers.onStatus?.(result.detail || "ElevenLabs");

  // Decode + speech-likeness gate before play — never blast corrupt stream/PCM.
  try {
    const ctx = getAudioContext();
    const buf = await decodeDataUrlToBuffer(ctx, result.dataUrl);
    if (!isCurrent()) return;
    if (!audioBufferSoundsLikeSpeech(buf)) {
      handlers.onStatus?.(
        "ElevenLabs: аудио похоже на шум — запасной Web Speech",
      );
      speakWebSpeech(clean, null, handlers, isCurrent);
      return;
    }
    handlers.onStart?.();
    await playAudioBuffer(ctx, buf, isCurrent);
    if (!isCurrent()) return;
    handlers.onEnd?.();
  } catch {
    if (!isCurrent()) return;
    handlers.onStatus?.(
      "ElevenLabs: не удалось декодировать — запасной Web Speech",
    );
    speakWebSpeech(clean, null, handlers, isCurrent);
  }
}

export function speakText(
  text: string,
  voiceId: string | null,
  handlers: SpeakHandlers = {},
): void {
  const engine = getActiveTtsEngine();

  const gen = ++speakGeneration;
  const isCurrent = () => gen === speakGeneration;

  // Cancel any prior utterance / clip before starting.
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (activeCustomAudio) {
    try {
      activeCustomAudio.pause();
      activeCustomAudio.src = "";
    } catch {
      /* ignore */
    }
    activeCustomAudio = null;
  }
  if (activeBufferSource) {
    try {
      activeBufferSource.stop();
    } catch {
      /* ignore */
    }
    activeBufferSource = null;
  }

  // Custom / Voice Studio: neural pack if trained, else parametric settings.
  // Never cloud; never cut/stitch recording clips for playback.
  if (isCustomVoiceId(voiceId) && voiceId) {
    void speakCustomVoice(text, voiceId, handlers, isCurrent);
    return;
  }

  if (engine === "elevenlabs") {
    void speakElevenLabs(text, handlers, isCurrent);
    return;
  }

  // Default local path: synthesize from VoiceSettings only (no mic recordings).
  if (engine === "parametric" || engine === "neural-pack") {
    void speakParametricFull(text, handlers, isCurrent);
    return;
  }

  if (!isTtsAvailable()) {
    handlers.onError?.("TTS недоступен в этой среде.");
    return;
  }
  speakWebSpeech(text, voiceId, handlers, isCurrent);
}
