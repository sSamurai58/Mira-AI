/**
 * Best-effort mic level (0…1) via Web Audio AnalyserNode.
 * Used by Home HUD voice bars when getUserMedia is available.
 */

let sharedStream: MediaStream | null = null;
let sharedCtx: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let sharedData: Uint8Array | null = null;
let refCount = 0;

export async function acquireMicLevel(): Promise<() => number> {
  refCount += 1;
  try {
    if (!sharedStream) {
      sharedStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    }
    if (!sharedCtx || sharedCtx.state === "closed") {
      sharedCtx = new AudioContext();
    }
    if (sharedCtx.state === "suspended") {
      await sharedCtx.resume().catch(() => undefined);
    }
    if (!sharedAnalyser) {
      const src = sharedCtx.createMediaStreamSource(sharedStream);
      sharedAnalyser = sharedCtx.createAnalyser();
      sharedAnalyser.fftSize = 256;
      sharedAnalyser.smoothingTimeConstant = 0.7;
      src.connect(sharedAnalyser);
      sharedData = new Uint8Array(sharedAnalyser.frequencyBinCount);
    }
  } catch {
    /* no mic — return quiet level */
    return () => 0;
  }

  return () => {
    if (!sharedAnalyser || !sharedData) return 0;
    sharedAnalyser.getByteTimeDomainData(
      sharedData as unknown as Uint8Array<ArrayBuffer>,
    );
    let sum = 0;
    for (let i = 0; i < sharedData.length; i++) {
      const v = (sharedData[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / sharedData.length);
    return Math.max(0, Math.min(1, rms * 3.2));
  };
}

export function releaseMicLevel(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  try {
    sharedStream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  sharedStream = null;
  sharedAnalyser = null;
  sharedData = null;
  if (sharedCtx) {
    void sharedCtx.close().catch(() => undefined);
    sharedCtx = null;
  }
}
