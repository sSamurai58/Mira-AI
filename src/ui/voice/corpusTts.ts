/** Corpus / neural-pack TTS helpers for Voice Studio custom voices. */

export type CorpusUnit = {
  phraseId: string;
  text: string;
  filePath: string;
};

export type CorpusPlanSegment =
  | { kind: "clip"; filePath: string; score: number; phraseText: string }
  | { kind: "webspeech"; text: string };

export type CorpusSpeechPlan = {
  segments: CorpusPlanSegment[];
  clipCount: number;
  webspeechCount: number;
  coverage: number;
  mode: "corpus" | "hybrid" | "preview" | "webspeech-fallback";
  status: string;
};

const MATCH_THRESHOLD = 0.55;

export function normalizeSpeechText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeSpeechText(s).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Similarity of a spoken sentence to a trained phrase (0..1). */
export function phraseMatchScore(phrase: string, sentence: string): number {
  const np = normalizeSpeechText(phrase);
  const ns = normalizeSpeechText(sentence);
  if (!np || !ns) return 0;
  if (np === ns) return 1;
  const tokens = jaccard(tokenSet(np), tokenSet(ns));
  if (np.includes(ns) || ns.includes(np)) {
    const ratio =
      Math.min(np.length, ns.length) / Math.max(np.length, ns.length);
    // Near-equal lengths → strong match; a short phrase inside a long reply
    // must not look like a full-utterance hit (that caused silent hybrid miss).
    if (ratio >= 0.85) return 0.75 + 0.25 * ratio;
    return Math.max(tokens, 0.35 + 0.35 * ratio);
  }
  return tokens;
}

export function splitSpeechSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [cleaned];
}

function bestUnit(
  sentence: string,
  units: CorpusUnit[],
): { unit: CorpusUnit; score: number } | null {
  let best: { unit: CorpusUnit; score: number } | null = null;
  for (const unit of units) {
    const score = phraseMatchScore(unit.text, sentence);
    if (!best || score > best.score) best = { unit, score };
  }
  if (!best || best.score < MATCH_THRESHOLD) return null;
  return best;
}

export function planCorpusSpeech(
  text: string,
  units: CorpusUnit[],
  opts?: { preferPreview?: boolean; previewPath?: string | null },
): CorpusSpeechPlan {
  const sentences = splitSpeechSentences(text);
  if (!sentences.length) {
    return {
      segments: [],
      clipCount: 0,
      webspeechCount: 0,
      coverage: 0,
      mode: "webspeech-fallback",
      status: "Пустой текст",
    };
  }

  // Whole-utterance match first (common for short replies / bank phrases).
  if (units.length) {
    const whole = bestUnit(text, units);
    if (whole && whole.score >= 0.85) {
      return {
        segments: [
          {
            kind: "clip",
            filePath: whole.unit.filePath,
            score: whole.score,
            phraseText: whole.unit.text,
          },
        ],
        clipCount: 1,
        webspeechCount: 0,
        coverage: 1,
        mode: "corpus",
        status: "Студийный голос: клип из корпуса",
      };
    }
  }

  const segments: CorpusPlanSegment[] = [];
  let clipChars = 0;
  let totalChars = 0;
  for (const sentence of sentences) {
    totalChars += sentence.length;
    const hit = units.length ? bestUnit(sentence, units) : null;
    if (hit) {
      clipChars += sentence.length;
      segments.push({
        kind: "clip",
        filePath: hit.unit.filePath,
        score: hit.score,
        phraseText: hit.unit.text,
      });
    } else {
      segments.push({ kind: "webspeech", text: sentence });
    }
  }

  const clipCount = segments.filter((s) => s.kind === "clip").length;
  const webspeechCount = segments.filter((s) => s.kind === "webspeech").length;
  const coverage = totalChars > 0 ? clipChars / totalChars : 0;

  if (clipCount > 0 && webspeechCount === 0) {
    return {
      segments,
      clipCount,
      webspeechCount,
      coverage,
      mode: "corpus",
      status: "Студийный голос: озвучка корпусом",
    };
  }
  if (clipCount > 0) {
    return {
      segments,
      clipCount,
      webspeechCount,
      coverage,
      mode: "hybrid",
      status:
        "Студийный голос: совпадения — ваши клипы; остальное — запасной системный TTS",
    };
  }

  if (opts?.preferPreview && opts.previewPath) {
    return {
      segments: [
        {
          kind: "clip",
          filePath: opts.previewPath,
          score: 1,
          phraseText: "(preview)",
        },
      ],
      clipCount: 1,
      webspeechCount: 0,
      coverage: 1,
      mode: "preview",
      status:
        "Студийный голос: превью вашего клипа (произвольный текст пока без neural TTS)",
    };
  }

  return {
    segments: [{ kind: "webspeech", text: text.trim() }],
    clipCount: 0,
    webspeechCount: 1,
    coverage: 0,
    mode: "webspeech-fallback",
    status:
      "Студийный голос выбран, но фраза не из корпуса — запасной системный TTS до neural trainer",
  };
}

export async function loadCustomVoiceCorpus(voiceId: string): Promise<{
  voice: {
    id: string;
    preview_path: string | null;
    name: string;
    lang: string;
  };
  units: CorpusUnit[];
}> {
  if (window.mira?.getCustomVoiceCorpus) {
    try {
      return await window.mira.getCustomVoiceCorpus(voiceId);
    } catch {
      // fall through to local demo store
    }
  }
  const { getLocalCustomVoiceCorpus } = await import("./studioLocal");
  return getLocalCustomVoiceCorpus(voiceId);
}
