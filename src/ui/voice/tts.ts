import { isCustomVoiceId, resolveSpeechVoice } from "./catalog";
import {
  loadCustomVoiceCorpus,
  planCorpusSpeech,
  type CorpusPlanSegment,
  type CorpusSpeechPlan,
} from "./corpusTts";
import { getActiveTtsEngine } from "./ttsEngines";

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
  if (engine === "edge-stub") return false;
  // Corpus / neural-pack is selected as ready even without speechSynthesis
  // (Electron clip playback; headless smoke still reports engine ready).
  if (engine === "neural-pack") return true;
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
  utter.rate = engine === "neural-pack" ? 0.98 : 1.02;
  utter.pitch = engine === "neural-pack" ? 1.02 : 1;
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
  await playAudioBuffer(ctx, stitched, isCurrent);
}

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

  // Prefer real neural inference path when weights exist.
  if (window.mira?.readVoicePreview) {
    try {
      const neural = await window.mira.synthesizeCustomVoiceNeural(
        voiceId,
        clean,
      );
      if (!isCurrent()) return;
      if (neural.ok && neural.wavPath) {
        handlers.onStatus?.(
          neural.detail || "Нейро-синтез (encoder→decoder→vocoder)",
        );
        const ctx = getAudioContext();
        const cache = new Map<string, AudioBuffer>();
        const buf = await decodeClip(ctx, neural.wavPath, cache);
        if (!isCurrent()) return;
        handlers.onStart?.();
        await playAudioBuffer(ctx, buf, isCurrent);
        if (!isCurrent()) return;
        handlers.onEnd?.();
        return;
      }
    } catch {
      // Fall through to unit-stitch / Web Speech.
    }
  }

  let plan: CorpusSpeechPlan;
  try {
    const corpus = await loadCustomVoiceCorpus(voiceId);
    if (!isCurrent()) return;
    plan = planCorpusSpeech(clean, corpus.units, {
      preferPreview: handlers.preferPreview,
      previewPath: corpus.voice.preview_path,
    });
  } catch (err) {
    if (!isCurrent()) return;
    handlers.onStatus?.(
      err instanceof Error
        ? `Студийный голос: ${err.message}`
        : "Студийный голос недоступен",
    );
    speakWebSpeech(clean, null, handlers, isCurrent);
    return;
  }

  handlers.onStatus?.(plan.status);

  // Pure system fallback (no matching words / no preview preference).
  if (plan.mode === "webspeech-fallback") {
    speakWebSpeech(clean, null, handlers, isCurrent);
    return;
  }

  const canPlayClips = Boolean(window.mira?.readVoicePreview);
  if (!canPlayClips) {
    handlers.onStatus?.(
      "Browser-demo: клипы студии без файлов — запасной Web Speech",
    );
    speakWebSpeech(clean, null, handlers, isCurrent);
    return;
  }

  let started = false;
  const markStart = () => {
    if (!started) {
      started = true;
      handlers.onStart?.();
    }
  };

  const cache = new Map<string, AudioBuffer>();

  try {
    let i = 0;
    while (i < plan.segments.length) {
      if (!isCurrent()) return;
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
    if (!isCurrent()) return;
    if (!started) handlers.onStart?.();
    handlers.onEnd?.();
  } catch (err) {
    if (!isCurrent()) return;
    handlers.onStatus?.(
      err instanceof Error
        ? `Студия: ${err.message}; запасной системный TTS`
        : "Студия: ошибка склейки; запасной системный TTS",
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
  if (engine === "edge-stub") {
    handlers.onError?.(
      "Edge neural TTS — stub. Выберите Web Speech или Neural pack в Настройках.",
    );
    return;
  }

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

  if (isCustomVoiceId(voiceId) && voiceId) {
    // Studio / custom trained voice → compositional corpus engine.
    void speakCustomVoice(text, voiceId, handlers, isCurrent);
    return;
  }

  if (!isTtsAvailable()) {
    handlers.onError?.("TTS недоступен в этой среде (speechSynthesis).");
    return;
  }
  speakWebSpeech(text, voiceId, handlers, isCurrent);
}
