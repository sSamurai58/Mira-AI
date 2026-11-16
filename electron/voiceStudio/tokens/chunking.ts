/**
 * Sentence/chunk splitting + PCM crossfade join (CosyVoice junction lesson).
 */
import { normalizeSpeechText } from "./textNormalize";

export type TextChunk = {
  text: string;
  index: number;
};

/** Split normalized text into speakable chunks (sentences / soft length). */
export function chunkSpeechText(
  raw: string,
  opts?: { maxChars?: number },
): TextChunk[] {
  const maxChars = opts?.maxChars ?? 220;
  const { text } = normalizeSpeechText(raw);
  if (!text) return [];

  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push({ text: t, index: chunks.length });
    buf = "";
  };

  for (const s of sentences) {
    if (!buf) {
      buf = s;
    } else if (buf.length + 1 + s.length <= maxChars) {
      buf = `${buf} ${s}`;
    } else {
      flush();
      buf = s;
    }
    // Hard split very long sentence on commas
    while (buf.length > maxChars * 1.5) {
      const cut = buf.lastIndexOf(",", maxChars);
      const at = cut > maxChars * 0.4 ? cut + 1 : maxChars;
      chunks.push({ text: buf.slice(0, at).trim(), index: chunks.length });
      buf = buf.slice(at).trim();
    }
  }
  flush();
  return chunks;
}

/** Overlap-add two mono Float32 buffers with equal-power crossfade. */
export function crossfadeJoinFloat32(
  a: Float32Array,
  b: Float32Array,
  fadeSamples: number,
): Float32Array {
  const fade = Math.max(
    0,
    Math.min(fadeSamples, a.length, b.length, Math.floor(a.length / 2)),
  );
  if (fade <= 0) {
    const out = new Float32Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }
  const outLen = a.length + b.length - fade;
  const out = new Float32Array(outLen);
  out.set(a.subarray(0, a.length - fade), 0);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    const wa = Math.cos((t * Math.PI) / 2);
    const wb = Math.sin((t * Math.PI) / 2);
    out[a.length - fade + i] = a[a.length - fade + i]! * wa + b[i]! * wb;
  }
  out.set(b.subarray(fade), a.length);
  return out;
}

export function crossfadeJoinInt16(
  parts: Int16Array[],
  sampleRate: number,
  fadeMs = 32,
): Int16Array {
  if (!parts.length) return new Int16Array(0);
  const fadeSamples = Math.round((fadeMs / 1000) * sampleRate);
  let acc: Float32Array = new Float32Array(parts[0]!.length);
  for (let i = 0; i < parts[0]!.length; i++) acc[i] = parts[0]![i]! / 32768;
  for (let p = 1; p < parts.length; p++) {
    const next = new Float32Array(parts[p]!.length);
    for (let i = 0; i < parts[p]!.length; i++) next[i] = parts[p]![i]! / 32768;
    acc = new Float32Array(crossfadeJoinFloat32(acc, next, fadeSamples));
  }
  const out = new Int16Array(acc.length);
  for (let i = 0; i < acc.length; i++) {
    const s = Math.max(-1, Math.min(1, acc[i]!));
    out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
  }
  return out;
}
