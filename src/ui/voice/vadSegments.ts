/**
 * Lightweight energy VAD + numbered speech segments for dictation.
 * Works with AnalyserNode levels; ASR finals are attached as segment text.
 */

export type SpeechSegment = {
  index: number;
  text: string;
  startedAt: string;
  endedAt: string;
  /** Peak level 0…1 while open */
  peak: number;
};

export type VadConfig = {
  /** RMS-ish threshold 0…1 */
  threshold: number;
  /** Silence ms before closing a segment */
  silenceMs: number;
  /** Min speech ms to keep a segment */
  minSpeechMs: number;
};

const DEFAULT: VadConfig = {
  threshold: 0.08,
  silenceMs: 700,
  minSpeechMs: 250,
};

let config: VadConfig = { ...DEFAULT };
let segments: SpeechSegment[] = [];
let open:
  | { index: number; startedAt: number; peak: number; text: string }
  | null = null;
let lastVoiceAt = 0;
let nextIndex = 1;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function getVadConfig(): VadConfig {
  return { ...config };
}

export function setVadConfig(patch: Partial<VadConfig>): VadConfig {
  config = { ...config, ...patch };
  return getVadConfig();
}

export function subscribeVad(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listVadSegments(): SpeechSegment[] {
  return segments.slice();
}

export function clearVadSegments(): void {
  segments = [];
  open = null;
  nextIndex = 1;
  notify();
}

export function resetVadSession(): void {
  clearVadSegments();
}

/** Feed instantaneous level 0…1 (e.g. from micLevel). */
export function vadPushLevel(level: number, now = Date.now()): void {
  const hot = level >= config.threshold;
  if (hot) {
    lastVoiceAt = now;
    if (!open) {
      open = {
        index: nextIndex,
        startedAt: now,
        peak: level,
        text: "",
      };
    } else {
      open.peak = Math.max(open.peak, level);
    }
    return;
  }
  if (open && now - lastVoiceAt >= config.silenceMs) {
    closeOpen(now);
  }
}

function closeOpen(now: number) {
  if (!open) return;
  const dur = now - open.startedAt;
  if (dur >= config.minSpeechMs) {
    segments.push({
      index: open.index,
      text: open.text,
      startedAt: new Date(open.startedAt).toISOString(),
      endedAt: new Date(now).toISOString(),
      peak: open.peak,
    });
    nextIndex += 1;
    notify();
  }
  open = null;
}

/** Attach ASR final text to the current/last segment. */
export function vadAttachTranscript(text: string): SpeechSegment | null {
  const piece = text.trim();
  if (!piece) return null;
  if (open) {
    open.text = open.text ? `${open.text} ${piece}` : piece;
    closeOpen(Date.now());
  } else {
    const last = segments[segments.length - 1];
    if (last && !last.text) {
      last.text = piece;
      notify();
      return last;
    }
    const seg: SpeechSegment = {
      index: nextIndex,
      text: piece,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      peak: 0,
    };
    nextIndex += 1;
    segments.push(seg);
    notify();
    return seg;
  }
  return segments[segments.length - 1] ?? null;
}

export function formatSegmentsPlain(segs = segments): string {
  return segs
    .filter((s) => s.text.trim())
    .map((s) => `[${s.index}] ${s.text.trim()}`)
    .join("\n");
}
