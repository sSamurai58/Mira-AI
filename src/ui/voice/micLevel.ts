/**
 * Best-effort mic level (0…1) + frequency bins via Web Audio AnalyserNode.
 * Used by Home HUD voice bars and Settings → mic test.
 */

import {
  audioConstraintsForDevice,
  getMicDeviceId,
} from "./micDevices";

let sharedStream: MediaStream | null = null;
let sharedCtx: AudioContext | null = null;
let sharedSource: MediaStreamAudioSourceNode | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let sharedTimeData: Uint8Array | null = null;
let sharedFreqData: Uint8Array | null = null;
let sharedDeviceId: string | null = null;
let refCount = 0;

async function ensurePipeline(deviceId?: string): Promise<boolean> {
  const wantId = deviceId ?? getMicDeviceId();
  if (
    sharedStream &&
    sharedAnalyser &&
    sharedDeviceId === wantId &&
    sharedStream.active
  ) {
    if (sharedCtx?.state === "suspended") {
      await sharedCtx.resume().catch(() => undefined);
    }
    return true;
  }

  // Rebuild when device changes.
  teardownPipeline(false);

  try {
    sharedStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraintsForDevice(wantId),
      video: false,
    });
    sharedDeviceId = wantId;
  } catch {
    // Fallback to default device if exact id fails.
    if (wantId) {
      try {
        sharedStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        sharedDeviceId = "";
      } catch {
        return false;
      }
    } else {
      return false;
    }
  }

  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioContext();
  }
  if (sharedCtx.state === "suspended") {
    await sharedCtx.resume().catch(() => undefined);
  }

  sharedSource = sharedCtx.createMediaStreamSource(sharedStream);
  sharedAnalyser = sharedCtx.createAnalyser();
  sharedAnalyser.fftSize = 512;
  sharedAnalyser.smoothingTimeConstant = 0.55;
  sharedSource.connect(sharedAnalyser);
  sharedTimeData = new Uint8Array(sharedAnalyser.fftSize);
  sharedFreqData = new Uint8Array(sharedAnalyser.frequencyBinCount);
  return true;
}

function teardownPipeline(closeCtx: boolean): void {
  try {
    sharedSource?.disconnect();
  } catch {
    /* ignore */
  }
  sharedSource = null;
  sharedAnalyser = null;
  sharedTimeData = null;
  sharedFreqData = null;
  try {
    sharedStream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  sharedStream = null;
  sharedDeviceId = null;
  if (closeCtx && sharedCtx) {
    void sharedCtx.close().catch(() => undefined);
    sharedCtx = null;
  }
}

export type MicMeter = {
  /** RMS loudness 0…1 */
  level: () => number;
  /** Normalized frequency bins 0…1 (length = binCount). */
  spectrum: (binCount?: number) => number[];
  stop: () => void;
};

export async function acquireMicLevel(
  deviceId?: string,
): Promise<() => number> {
  refCount += 1;
  const ok = await ensurePipeline(deviceId);
  if (!ok) {
    return () => 0;
  }

  return () => readRms();
}

export async function acquireMicMeter(
  deviceId?: string,
): Promise<MicMeter> {
  refCount += 1;
  const ok = await ensurePipeline(deviceId);
  if (!ok) {
    return {
      level: () => 0,
      spectrum: (n = 24) => Array.from({ length: n }, () => 0),
      stop: () => releaseMicLevel(),
    };
  }
  return {
    level: () => readRms(),
    spectrum: (binCount = 24) => readSpectrum(binCount),
    stop: () => releaseMicLevel(),
  };
}

function readRms(): number {
  if (!sharedAnalyser || !sharedTimeData) return 0;
  sharedAnalyser.getByteTimeDomainData(
    sharedTimeData as unknown as Uint8Array<ArrayBuffer>,
  );
  let sum = 0;
  for (let i = 0; i < sharedTimeData.length; i++) {
    const v = (sharedTimeData[i]! - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / sharedTimeData.length);
  return Math.max(0, Math.min(1, rms * 3.2));
}

function readSpectrum(binCount: number): number[] {
  if (!sharedAnalyser || !sharedFreqData || binCount <= 0) {
    return Array.from({ length: Math.max(0, binCount) }, () => 0);
  }
  sharedAnalyser.getByteFrequencyData(
    sharedFreqData as unknown as Uint8Array<ArrayBuffer>,
  );
  // Skip very low bins (rumble); focus speech band roughly.
  const start = Math.floor(sharedFreqData.length * 0.04);
  const end = Math.floor(sharedFreqData.length * 0.55);
  const span = Math.max(1, end - start);
  const out: number[] = [];
  for (let i = 0; i < binCount; i++) {
    const a = start + Math.floor((i * span) / binCount);
    const b = start + Math.floor(((i + 1) * span) / binCount);
    let peak = 0;
    for (let j = a; j < b; j++) {
      peak = Math.max(peak, sharedFreqData[j] ?? 0);
    }
    out.push(Math.max(0, Math.min(1, peak / 255)));
  }
  return out;
}

/** Force reopen on next acquire (e.g. after device change). */
export function resetMicLevelPipeline(): void {
  const keep = refCount;
  teardownPipeline(true);
  refCount = keep;
}

export function releaseMicLevel(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  teardownPipeline(true);
}
