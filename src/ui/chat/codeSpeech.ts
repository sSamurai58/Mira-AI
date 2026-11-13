/** Strip code from assistant text before TTS — code is never spoken. */

const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_RE = /`[^`\n]+`/g;

/** Plain text safe for speech synthesis (no fenced/inline code). */
export function textForSpeech(raw: string): string {
  return raw
    .replace(FENCE_RE, " ")
    .replace(INLINE_RE, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
