/** Compositional corpus TTS: unit selection from trained phrase clips. */

export type CorpusUnit = {
  phraseId: string;
  text: string;
  filePath: string;
  /**
   * Optional pre-alignment from the trained model pack.
   * When set, the unit is used as-is (no further equal-time split).
   */
  startFrac?: number;
  endFrac?: number;
};

/** Slice of a trained clip aligned to one or more words/fragments. */
export type CorpusFragment = {
  phraseId: string;
  phraseText: string;
  filePath: string;
  /** Normalized tokens covered by this fragment. */
  tokens: string[];
  /** Inclusive start / exclusive end as fraction of the clip [0..1]. */
  startFrac: number;
  endFrac: number;
};

export type CorpusPlanSegment =
  | {
      kind: "fragment";
      filePath: string;
      startFrac: number;
      endFrac: number;
      score: number;
      tokens: string[];
      phraseText: string;
    }
  | { kind: "webspeech"; text: string };

export type CorpusSpeechPlan = {
  segments: CorpusPlanSegment[];
  /** Number of fragment (clip-slice) segments. */
  clipCount: number;
  webspeechCount: number;
  /** Fraction of target tokens covered by trained fragments. */
  coverage: number;
  coveredTokens: number;
  totalTokens: number;
  mode: "corpus" | "hybrid" | "preview" | "webspeech-fallback";
  status: string;
};

const MAX_GRAM = 4;
const CROSS_PHRASE_EXACT = 1;
const STEM_SCORE = 0.82;
const SYNONYM_SCORE = 0.78;

/** Light RU/EN synonym buckets so novel replies can reuse trained intonation. */
const MEANING_GROUPS: string[][] = [
  ["привет", "здравствуй", "здравствуйте", "hello", "hi"],
  ["хорошо", "ладно", "ок", "окей", "okay", "ok"],
  ["готово", "сделано", "выполнено", "done"],
  ["секунду", "минутку", "момент", "подожди", "подождите"],
  ["слушаю", "слушаюсь"],
  ["спасибо", "благодарю", "thanks", "thank"],
  ["да", "ага", "угу", "yes"],
  ["нет", "неа", "no"],
  ["приняла", "принято", "поняла", "понял", "got"],
  ["открываю", "открою", "открыла"],
  ["проверяю", "проверю"],
  ["нашла", "нашёл", "нашел"],
  ["записываю", "запишу", "записала"],
  ["пока", "бай"],
];

const SYNONYM_OF = (() => {
  const map = new Map<string, string>();
  for (const group of MEANING_GROUPS) {
    const canon = group[0]!;
    for (const w of group) map.set(normalizeToken(w), canon);
  }
  return map;
})();

export function normalizeSpeechText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е");
}

export type SpeechToken = {
  /** Normalized form used for matching. */
  norm: string;
  /** Original slice from the utterance (for Web Speech fallback text). */
  raw: string;
  start: number;
  end: number;
};

/** Prefer Russian word boundaries; keeps Latin/digits as tokens too. */
export function tokenizeSpeech(text: string): SpeechToken[] {
  const tokens: SpeechToken[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0]!;
    tokens.push({
      norm: normalizeToken(raw),
      raw,
      start: m.index,
      end: m.index + raw.length,
    });
  }
  return tokens;
}

/** Very light Russian stem — enough to reuse clip words across forms. */
export function stemToken(token: string): string {
  const t = normalizeToken(token);
  if (t.length <= 3) return t;
  const endings = [
    "иями",
    "ями",
    "ами",
    "иях",
    "ях",
    "ием",
    "ием",
    "ого",
    "ему",
    "ому",
    "ыми",
    "ими",
    "ешь",
    "ете",
    "ишь",
    "ите",
    "ать",
    "ять",
    "ить",
    "еть",
    "ться",
    "тся",
    "ами",
    "ями",
    "ов",
    "ев",
    "ей",
    "ой",
    "ий",
    "ый",
    "ая",
    "яя",
    "ое",
    "ее",
    "ые",
    "ие",
    "ых",
    "их",
    "ым",
    "им",
    "ом",
    "ем",
    "ам",
    "ям",
    "ую",
    "юю",
    "ла",
    "ло",
    "ли",
    "ть",
    "ти",
    "ет",
    "ют",
    "ат",
    "ят",
    "но",
    "на",
    "ны",
    "ен",
    "ан",
    "ed",
    "ing",
    "es",
    "s",
  ];
  for (const end of endings) {
    if (t.endsWith(end) && t.length - end.length >= 3) {
      return t.slice(0, t.length - end.length);
    }
  }
  return t;
}

function meaningKey(token: string): string {
  const n = normalizeToken(token);
  return SYNONYM_OF.get(n) ?? stemToken(n);
}

function tokenSet(s: string): Set<string> {
  return new Set(tokenizeSpeech(s).map((t) => t.norm));
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

/**
 * Build selectable units from phrase texts + clip paths.
 * Alignment is best-effort equal-time split by word count (no forced aligner).
 */
export function buildFragmentInventory(units: CorpusUnit[]): CorpusFragment[] {
  const out: CorpusFragment[] = [];
  for (const unit of units) {
    const tokens = tokenizeSpeech(unit.text).map((t) => t.norm);
    if (!tokens.length) continue;
    const n = tokens.length;
    const preAligned =
      typeof unit.startFrac === "number" &&
      typeof unit.endFrac === "number" &&
      unit.endFrac > unit.startFrac;

    if (preAligned) {
      // Model-pack word/fragment slice — already time-aligned.
      out.push({
        phraseId: unit.phraseId,
        phraseText: unit.text,
        filePath: unit.filePath,
        tokens: [...tokens],
        startFrac: Math.max(0, Math.min(1, unit.startFrac!)),
        endFrac: Math.max(0, Math.min(1, unit.endFrac!)),
      });
      continue;
    }

    // Whole phrase — preferred when the reply matches the trained line.
    out.push({
      phraseId: unit.phraseId,
      phraseText: unit.text,
      filePath: unit.filePath,
      tokens: [...tokens],
      startFrac: 0,
      endFrac: 1,
    });
    for (let i = 0; i < n; i++) {
      for (let len = 1; len <= MAX_GRAM && i + len <= n; len++) {
        if (len === n) continue; // already added whole phrase
        out.push({
          phraseId: unit.phraseId,
          phraseText: unit.text,
          filePath: unit.filePath,
          tokens: tokens.slice(i, i + len),
          startFrac: i / n,
          endFrac: (i + len) / n,
        });
      }
    }
  }
  return out;
}

function sequencesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sequencesMeaningEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (meaningKey(a[i]!) !== meaningKey(b[i]!)) return false;
  }
  return true;
}

function findBestFragment(
  needle: string[],
  inventory: CorpusFragment[],
): { frag: CorpusFragment; score: number } | null {
  let best: { frag: CorpusFragment; score: number } | null = null;
  for (const frag of inventory) {
    if (frag.tokens.length !== needle.length) continue;
    let score = 0;
    if (sequencesEqual(frag.tokens, needle)) {
      score = CROSS_PHRASE_EXACT + needle.length * 0.05;
    } else if (
      needle.length === 1 &&
      stemToken(frag.tokens[0]!) === stemToken(needle[0]!)
    ) {
      score = STEM_SCORE;
    } else if (sequencesMeaningEqual(frag.tokens, needle)) {
      score = SYNONYM_SCORE + needle.length * 0.02;
    } else {
      continue;
    }
    // Prefer longer clips' mid-phrase fragments slightly less than exact whole.
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        frag.tokens.length === best.frag.tokens.length &&
        frag.endFrac - frag.startFrac > best.frag.endFrac - best.frag.startFrac)
    ) {
      best = { frag, score };
    }
  }
  return best;
}

function joinRawTokens(
  fullText: string,
  tokens: SpeechToken[],
  from: number,
  to: number,
): string {
  if (from >= to) return "";
  const start = tokens[from]!.start;
  const end = tokens[to - 1]!.end;
  return fullText.slice(start, end).trim();
}

function formatStatus(plan: {
  mode: CorpusSpeechPlan["mode"];
  coveredTokens: number;
  totalTokens: number;
  coverage: number;
}): string {
  const pct = Math.round(plan.coverage * 100);
  if (plan.mode === "corpus") {
    return `Студийный голос: склейка ${plan.coveredTokens}/${plan.totalTokens} слов (${pct}%) из обученных клипов`;
  }
  if (plan.mode === "hybrid") {
    return `Студийный голос: склейка ${plan.coveredTokens}/${plan.totalTokens} слов (${pct}%); без покрытия — системный TTS`;
  }
  if (plan.mode === "preview") {
    return "Студийный голос: превью клипа (нет словесного покрытия в корпусе)";
  }
  return "Студийный голос: нет слов в корпусе — запасной системный TTS";
}

/**
 * Plan compositional speech: match target tokens to trained word/fragment
 * units, stitch-ready segments, Web Speech only for uncovered spans.
 */
export function planCorpusSpeech(
  text: string,
  units: CorpusUnit[],
  opts?: { preferPreview?: boolean; previewPath?: string | null },
): CorpusSpeechPlan {
  const clean = text.trim();
  if (!clean) {
    return {
      segments: [],
      clipCount: 0,
      webspeechCount: 0,
      coverage: 0,
      coveredTokens: 0,
      totalTokens: 0,
      mode: "webspeech-fallback",
      status: "Пустой текст",
    };
  }

  const target = tokenizeSpeech(clean);
  if (!target.length) {
    return {
      segments: [{ kind: "webspeech", text: clean }],
      clipCount: 0,
      webspeechCount: 1,
      coverage: 0,
      coveredTokens: 0,
      totalTokens: 0,
      mode: "webspeech-fallback",
      status: "Студийный голос: нет слов для склейки — системный TTS",
    };
  }

  const inventory = buildFragmentInventory(units);
  const segments: CorpusPlanSegment[] = [];
  let covered = 0;
  let i = 0;
  let pendingUncoveredFrom: number | null = null;

  const flushUncovered = (until: number) => {
    if (pendingUncoveredFrom === null) return;
    const raw = joinRawTokens(clean, target, pendingUncoveredFrom, until);
    if (raw) segments.push({ kind: "webspeech", text: raw });
    pendingUncoveredFrom = null;
  };

  while (i < target.length) {
    let hit: { frag: CorpusFragment; score: number; len: number } | null = null;
    const maxLen = Math.min(MAX_GRAM, target.length - i);
    for (let len = maxLen; len >= 1; len--) {
      const needle = target.slice(i, i + len).map((t) => t.norm);
      const found = findBestFragment(needle, inventory);
      if (found) {
        hit = { ...found, len };
        break;
      }
    }

    if (hit) {
      flushUncovered(i);
      segments.push({
        kind: "fragment",
        filePath: hit.frag.filePath,
        startFrac: hit.frag.startFrac,
        endFrac: hit.frag.endFrac,
        score: hit.score,
        tokens: hit.frag.tokens,
        phraseText: hit.frag.phraseText,
      });
      covered += hit.len;
      i += hit.len;
    } else {
      if (pendingUncoveredFrom === null) pendingUncoveredFrom = i;
      i += 1;
    }
  }
  flushUncovered(target.length);

  const clipCount = segments.filter((s) => s.kind === "fragment").length;
  const webspeechCount = segments.filter((s) => s.kind === "webspeech").length;
  const coverage = covered / target.length;
  const base = {
    segments,
    clipCount,
    webspeechCount,
    coverage,
    coveredTokens: covered,
    totalTokens: target.length,
  };

  if (clipCount > 0 && webspeechCount === 0) {
    const mode = "corpus" as const;
    return {
      ...base,
      mode,
      status: formatStatus({
        mode,
        coveredTokens: covered,
        totalTokens: target.length,
        coverage,
      }),
    };
  }
  if (clipCount > 0) {
    const mode = "hybrid" as const;
    return {
      ...base,
      mode,
      status: formatStatus({
        mode,
        coveredTokens: covered,
        totalTokens: target.length,
        coverage,
      }),
    };
  }

  if (opts?.preferPreview && opts.previewPath) {
    return {
      segments: [
        {
          kind: "fragment",
          filePath: opts.previewPath,
          startFrac: 0,
          endFrac: 1,
          score: 1,
          tokens: [],
          phraseText: "(preview)",
        },
      ],
      clipCount: 1,
      webspeechCount: 0,
      coverage: 1,
      coveredTokens: target.length,
      totalTokens: target.length,
      mode: "preview",
      status: formatStatus({
        mode: "preview",
        coveredTokens: 0,
        totalTokens: target.length,
        coverage: 0,
      }),
    };
  }

  return {
    segments: [{ kind: "webspeech", text: clean }],
    clipCount: 0,
    webspeechCount: 1,
    coverage: 0,
    coveredTokens: 0,
    totalTokens: target.length,
    mode: "webspeech-fallback",
    status: formatStatus({
      mode: "webspeech-fallback",
      coveredTokens: 0,
      totalTokens: target.length,
      coverage: 0,
    }),
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
