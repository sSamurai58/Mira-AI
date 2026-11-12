import fs from "node:fs";
import path from "node:path";
import { openStore } from "../store";
import { getOwnerId } from "../owner";
import {
  VOICE_PACK_ENGINE,
  buildVoiceModelPack,
  normalizeLexKey,
  readVoiceModelPack,
  tokenizeSpeechWords,
  type LinkedTrainClip,
  type TrainProgressEvent,
  type VoiceModelPack,
} from "./modelPack";

export type VoiceProjectRow = {
  id: string;
  name: string;
  lang: string;
  status: string;
  recommendation: string | null;
  llm_profile: string | null;
  custom_voice_id: string | null;
  created_at: string;
  updated_at: string;
};

export type VoicePhraseRow = {
  id: string;
  project_id: string;
  text: string;
  recorded: number;
  created_at: string;
};

export type VoiceClipRow = {
  id: string;
  project_id: string;
  phrase_id: string | null;
  file_path: string;
  qa_json: string | null;
  accepted: number;
  created_at: string;
};

export type CustomVoiceRow = {
  id: string;
  project_id: string;
  name: string;
  lang: string;
  preview_path: string | null;
  meta_json: string | null;
  created_at: string;
  updated_at: string;
};

/** Short replies Mira often speaks — train these first so TTS stays studio voice. */
const ASSISTANT_COMMON_RU = [
  "Привет, я Mira — твой голосовой помощник.",
  "Слушаю.",
  "Да, сделаю это сейчас.",
  "Хорошо.",
  "Готово.",
  "Секунду.",
  "Принято.",
  "Спасибо, сообщение отправлено.",
  "Не совсем поняла, уточни пожалуйста.",
  "Я на связи.",
  "До связи.",
  "Проверяю.",
  "Нашла.",
  "Открываю.",
  "Записываю.",
  "Готово, можно продолжать.",
];

const ASSISTANT_COMMON_EN = [
  "Hello, I am Mira — your voice assistant.",
  "Listening.",
  "Yes, I will do that now.",
  "Okay.",
  "Done.",
  "One moment.",
  "Got it.",
  "Thanks, message sent.",
  "I am here if you need me.",
];

/** Variety / diction bank — fills remaining slots after real assistant lines. */
const PHRASE_BANK_RU = [
  "Сегодня хороший день, чтобы закончить важную задачу.",
  "Повтори за мной: мягко верни внимание к дыханию.",
  "Номер телефона: плюс семь девятьсот двенадцать.",
  "Открой терминал и выполни проверку статуса.",
  "Я могу искать в памяти прошлые разговоры.",
  "Добавь встречу на пятницу в пятнадцать ноль ноль.",
  "Проверь погоду в Москве на завтра.",
  "Фраза для дикции: шесть шипящих шагов по шоссе.",
  "Длинная фраза нужна, чтобы проверить естественные паузы и темп речи помощника.",
  "Произнеси спокойно: один, два, три, четыре, пять.",
  "Эмоция радости: отличная новость, получилось!",
  "Эмоция нейтральная: принято к исполнению.",
  "Техническая фраза: JSON, API, SQLite, Electron.",
  "Вопрос: что у меня сейчас на экране?",
  "Команда: сохрани черновик и закрой вкладку.",
  "Имя и адрес: улица Ленина, дом двенадцать, квартира семь.",
  "Финал сессии: до связи, я на связи, когда понадоблюсь.",
];

const PHRASE_BANK_EN = [
  "Please repeat after me: bring your attention back gently.",
  "Technical line: JSON, API, SQLite, Electron.",
  "Longer line to test pacing, pauses, and natural intonation in speech.",
  "Check the weather in London for tomorrow.",
  "Open the terminal and run a status check.",
];

const MIN_PHRASE_CHARS = 4;
/** Hard ceiling for a single training passage (~500 words with room to spare). */
const MAX_PHRASE_CHARS = 12000;

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function clampWordRange(
  minWords?: number,
  maxWords?: number,
): { minWords: number; maxWords: number } {
  const minW = Math.max(1, Math.min(Number(minWords) || 1, 400));
  const maxW = Math.max(minW, Math.min(Number(maxWords) || 80, 500));
  return { minWords: minW, maxWords: maxW };
}

function phraseCharBudget(maxWords: number): number {
  return Math.min(MAX_PHRASE_CHARS, Math.max(1200, maxWords * 14 + 160));
}

function inWordRange(
  text: string,
  minWords: number,
  maxWords: number,
): boolean {
  const n = countWords(text);
  return n >= minWords && n <= maxWords;
}

/** Stretch short seed text toward minWords without inventing unrelated topics. */
function expandTowardMinWords(
  text: string,
  minWords: number,
  charBudget = MAX_PHRASE_CHARS,
): string {
  let out = text.trim().replace(/\s+/g, " ");
  if (countWords(out) >= minWords) return out;
  const fillersRu = [
    "Это помогает лучше передать интонацию и ритм речи при обучении голоса.",
    "Повторите спокойно, чётко и без спешки, сохраняя естественные паузы.",
    "Длинный фрагмент даёт модели больше материала для устойчивого тембра.",
  ];
  const fillersEn = [
    "This longer line helps capture tone and pacing for voice training.",
    "Speak clearly and steadily, keeping natural pauses between clauses.",
    "A longer passage gives the model more material for a stable timbre.",
  ];
  const looksRu = /[А-Яа-яЁё]/.test(out);
  const fillers = looksRu ? fillersRu : fillersEn;
  let i = 0;
  let guard = 0;
  while (countWords(out) < minWords && guard < 800) {
    const add = fillers[i % fillers.length]!;
    const next = `${out} ${add}`.trim();
    if (next.length > charBudget) break;
    out = next;
    i += 1;
    guard += 1;
  }
  return out;
}

function trimToMaxWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ");
}

function fitPhraseToWordRange(
  text: string,
  minWords: number,
  maxWords: number,
): string | null {
  const budget = phraseCharBudget(maxWords);
  let out = text.trim().replace(/\s+/g, " ");
  if (!out) return null;
  out = trimToMaxWords(out, maxWords);
  out = expandTowardMinWords(out, minWords, budget);
  out = trimToMaxWords(out, maxWords);
  if (out.length > budget) {
    out = out.slice(0, budget).replace(/\s+\S*$/, "").trim();
    out = trimToMaxWords(out, maxWords);
  }
  if (!inWordRange(out, minWords, maxWords)) {
    // Last resort: build a filler passage that hits the requested word range.
    const seed = /[А-Яа-яЁё]/.test(text) ? "Обучение голоса." : "Voice training.";
    out = expandTowardMinWords(seed, minWords, budget);
    out = trimToMaxWords(out, maxWords);
  }
  if (!inWordRange(out, minWords, maxWords)) return null;
  return out;
}

export type GeneratePhrasesOptions = {
  count?: number;
  minWords?: number;
  maxWords?: number;
};

const MAX_GENERATE_COUNT = 40;

/** Strip markdown/code noise the same way chat TTS does (lightweight). */
function stripForPhraseSeed(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulSpeechPhrase(p: string): boolean {
  if (p.length < MIN_PHRASE_CHARS || p.length > MAX_PHRASE_CHARS) return false;
  // Skip pure URLs / code-ish lines.
  if (/^https?:\/\//i.test(p)) return false;
  if (/[{}<>;=]/.test(p) && /[{}]/.test(p)) return false;
  // Skip mock / env / tooling chatter — not what Mira says in real speech.
  if (/mock-модели|LLM_PROVIDER|API-ключ|\.env\b/i.test(p)) return false;
  if (/skills?\s+в\s+контексте|skills\s+on-demand/i.test(p)) return false;
  if (/интернет-инструменты/i.test(p)) return false;
  // Skip chat echo / memory scaffolding — not natural assistant speech.
  if (/^вы сказали:/i.test(p)) return false;
  if (/дополнительных фрагментов памяти/i.test(p)) return false;
  if (/в контекст подтянуты фрагменты/i.test(p)) return false;
  if (/учтены интернет-данные/i.test(p)) return false;
  return true;
}

function splitPhraseCandidates(text: string): string[] {
  const cleaned = stripForPhraseSeed(text);
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((p) => p.trim().replace(/^["«»„]+|["«»„]+$/g, "").trim())
    .filter(isUsefulSpeechPhrase);
}

export type AssistantSpeechStats = {
  /** Phrase candidates ranked by frequency (then recency). */
  phrases: Array<{ text: string; count: number; score: number }>;
  /** Word tokens ranked by frequency across assistant speech. */
  words: Array<{ word: string; key: string; count: number }>;
};

/**
 * Assistant chat → phrase + word frequency stats.
 * Frequency dominates; recency is a tie-break so the most-used speech wins.
 */
export function collectAssistantSpeechStats(opts?: {
  limitUtterances?: number;
  limitPhrases?: number;
  limitWords?: number;
}): AssistantSpeechStats {
  const limitU = opts?.limitUtterances ?? 80;
  const limitP = opts?.limitPhrases ?? 40;
  const limitW = opts?.limitWords ?? 80;
  try {
    const store = openStore();
    const owner = getOwnerId();
    const rows = store
      .prepare(
        `SELECT u.content AS content
         FROM utterances u
         JOIN sessions s ON s.id = u.session_id
         WHERE s.owner_id = ? AND u.role = 'assistant'
         ORDER BY u.created_at DESC
         LIMIT ?`,
      )
      .all(owner, limitU) as Array<{ content: string }>;

    const phraseFreq = new Map<
      string,
      { text: string; count: number; recency: number }
    >();
    const wordFreq = new Map<string, { word: string; count: number }>();

    rows.forEach((row, idx) => {
      const recency = Math.max(1, limitU - idx);
      for (const part of splitPhraseCandidates(row.content)) {
        const key = part.toLowerCase();
        const prev = phraseFreq.get(key);
        if (prev) {
          prev.count += 1;
          prev.recency = Math.max(prev.recency, recency);
        } else {
          phraseFreq.set(key, { text: part, count: 1, recency });
        }
      }
      for (const raw of tokenizeSpeechWords(row.content)) {
        const key = normalizeLexKey(raw);
        if (!key || key.length < 2) continue;
        const prev = wordFreq.get(key);
        if (prev) prev.count += 1;
        else wordFreq.set(key, { word: raw, count: 1 });
      }
    });

    const phrases = [...phraseFreq.values()]
      .map((p) => ({
        text: p.text,
        count: p.count,
        // Frequency first (×100), short replies get a small boost, then recency.
        score: p.count * 100 + (p.text.length <= 80 ? 8 : 0) + p.recency,
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.count - a.count ||
          a.text.length - b.text.length,
      )
      .slice(0, limitP);

    const words = [...wordFreq.entries()]
      .map(([key, w]) => ({ word: w.word, key, count: w.count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, limitW);

    return { phrases, words };
  } catch {
    return { phrases: [], words: [] };
  }
}

/** Recent assistant chat lines → phrase candidates (frequency + recency). */
export function collectAssistantUsedPhrases(opts?: {
  limitUtterances?: number;
  limitPhrases?: number;
}): string[] {
  return collectAssistantSpeechStats(opts).phrases.map((p) => p.text);
}

/** Words already covered by project corpus / trained lexicon (custom TTS). */
function projectCoveredWordKeys(projectId: string): Set<string> {
  const covered = new Set<string>();
  for (const phrase of listPhrases(projectId)) {
    for (const raw of tokenizeSpeechWords(phrase.text)) {
      const key = normalizeLexKey(raw);
      if (key) covered.add(key);
    }
  }
  const project = getVoiceProject(projectId);
  if (!project?.custom_voice_id) return covered;
  try {
    const packDir = studioRoot(project.id, "model-pack");
    const pack = readVoiceModelPack(packDir);
    if (pack?.lexicon) {
      for (const key of Object.keys(pack.lexicon)) covered.add(key);
    }
  } catch {
    // pack optional
  }
  return covered;
}

/**
 * Pack most-frequent uncovered words into training sentences.
 * Uncovered tokens keep falling back to system TTS until recorded+trained.
 */
function buildFrequentUncoveredSeeds(
  words: Array<{ word: string; key: string; count: number }>,
  covered: Set<string>,
  lang: string,
  minWords: number,
  maxWords: number,
): string[] {
  const uncovered = words.filter((w) => !covered.has(w.key));
  if (!uncovered.length) return [];
  const looksEn = lang.toLowerCase().startsWith("en");
  const lead = looksEn
    ? "Please say clearly:"
    : "Произнесите чётко:";
  const seeds: string[] = [];
  let bucket: string[] = [];
  for (const w of uncovered) {
    bucket.push(w.word);
    if (bucket.length >= Math.min(12, Math.max(4, minWords))) {
      const raw = `${lead} ${bucket.join(" ")}.`;
      const fitted = fitPhraseToWordRange(raw, minWords, maxWords);
      if (fitted) seeds.push(fitted);
      bucket = [];
      if (seeds.length >= 24) break;
    }
  }
  if (bucket.length && seeds.length < 24) {
    const raw = `${lead} ${bucket.join(" ")}.`;
    const fitted = fitPhraseToWordRange(raw, minWords, maxWords);
    if (fitted) seeds.push(fitted);
  }
  return seeds;
}

function phrasePoolForLang(lang: string): {
  common: string[];
  variety: string[];
} {
  if (lang.toLowerCase().startsWith("en")) {
    return { common: ASSISTANT_COMMON_EN, variety: PHRASE_BANK_EN };
  }
  return { common: ASSISTANT_COMMON_RU, variety: PHRASE_BANK_RU };
}

function studioRoot(...parts: string[]): string {
  const { dataRoot } = require("../appPaths") as typeof import("../appPaths");
  const dir = dataRoot("voice-studio", ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function assertStudioPath(absPath: string): void {
  const { seedRoot } = require("../appPaths") as typeof import("../appPaths");
  const root = studioRoot();
  const resolved = path.resolve(absPath);
  if (!(resolved === root || resolved.startsWith(root + path.sep))) {
    const seed = seedRoot("voice-studio");
    if (!(resolved === seed || resolved.startsWith(seed + path.sep))) {
      throw new Error("Импорт клипов только из data/voice-studio или seed/voice-studio");
    }
  }
}

export function listVoiceProjects(): VoiceProjectRow[] {
  return openStore()
    .prepare(
      `SELECT id, name, lang, status, recommendation, llm_profile, custom_voice_id, created_at, updated_at
       FROM voice_projects ORDER BY updated_at DESC`,
    )
    .all() as VoiceProjectRow[];
}

export function getVoiceProject(id: string): VoiceProjectRow | null {
  return (
    (openStore()
      .prepare(
        `SELECT id, name, lang, status, recommendation, llm_profile, custom_voice_id, created_at, updated_at
         FROM voice_projects WHERE id = ?`,
      )
      .get(id) as VoiceProjectRow | undefined) ?? null
  );
}

export function createVoiceProject(input: {
  name: string;
  lang?: string;
}): VoiceProjectRow {
  const now = new Date().toISOString();
  const row: VoiceProjectRow = {
    id: crypto.randomUUID(),
    name: input.name.trim() || "Новый голос",
    lang: (input.lang ?? "ru-RU").trim() || "ru-RU",
    status: "created",
    recommendation:
      "Шаг 1: сгенерируйте или добавьте фразы 1…N для начитки корпуса.",
    llm_profile: null,
    custom_voice_id: null,
    created_at: now,
    updated_at: now,
  };
  openStore()
    .prepare(
      `INSERT INTO voice_projects
        (id, name, lang, status, recommendation, llm_profile, custom_voice_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.name,
      row.lang,
      row.status,
      row.recommendation,
      row.llm_profile,
      row.custom_voice_id,
      row.created_at,
      row.updated_at,
    );
  studioRoot(row.id, "clips");
  return row;
}

function touchProject(
  id: string,
  patch: Partial<{
    status: string;
    recommendation: string | null;
    llm_profile: string | null;
    custom_voice_id: string | null;
  }>,
): VoiceProjectRow {
  const cur = getVoiceProject(id);
  if (!cur) throw new Error("Проект не найден");
  const next = {
    ...cur,
    status: patch.status ?? cur.status,
    recommendation:
      patch.recommendation !== undefined
        ? patch.recommendation
        : cur.recommendation,
    llm_profile:
      patch.llm_profile !== undefined ? patch.llm_profile : cur.llm_profile,
    custom_voice_id:
      patch.custom_voice_id !== undefined
        ? patch.custom_voice_id
        : cur.custom_voice_id,
    updated_at: new Date().toISOString(),
  };
  openStore()
    .prepare(
      `UPDATE voice_projects
       SET status = ?, recommendation = ?, llm_profile = ?, custom_voice_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.status,
      next.recommendation,
      next.llm_profile,
      next.custom_voice_id,
      next.updated_at,
      id,
    );
  return next;
}

export function listPhrases(projectId: string): VoicePhraseRow[] {
  return openStore()
    .prepare(
      `SELECT id, project_id, text, recorded, created_at
       FROM voice_phrases
       WHERE project_id = ?
       ORDER BY created_at ASC, rowid ASC`,
    )
    .all(projectId) as VoicePhraseRow[];
}

export function generatePhrases(
  projectId: string,
  countOrOpts: number | GeneratePhrasesOptions = 5,
): VoicePhraseRow[] {
  const project = getVoiceProject(projectId);
  if (!project) throw new Error("Проект не найден");
  const opts: GeneratePhrasesOptions =
    typeof countOrOpts === "number" ? { count: countOrOpts } : countOrOpts;
  const want = Math.max(1, Math.min(opts.count ?? 5, MAX_GENERATE_COUNT));
  const { minWords, maxWords } = clampWordRange(opts.minWords, opts.maxWords);
  const existing = new Set(
    listPhrases(projectId).map((p) => p.text.toLowerCase()),
  );
  const { common, variety } = phrasePoolForLang(project.lang);

  // Priority for maximum learning:
  // (1) most-frequent assistant phrases,
  // (2) packs of frequent uncovered words (still system TTS until trained),
  // (3) common short replies, (4) variety bank.
  const stats = collectAssistantSpeechStats({
    limitUtterances: 120,
    limitPhrases: 100,
    limitWords: 100,
  });
  const covered = projectCoveredWordKeys(projectId);
  const frequentUncovered = buildFrequentUncoveredSeeds(
    stats.words,
    covered,
    project.lang,
    minWords,
    maxWords,
  );
  // Phrase frequency stays primary; uncovered high-freq words are a tie-break
  // so we close lexicon gaps without demoting the most-used replies.
  const uncoveredRank = new Map(
    stats.words
      .filter((w) => !covered.has(w.key))
      .map((w, i) => [w.key, w.count * 10 - i] as const),
  );
  const usedRanked = stats.phrases
    .map((p) => {
      const uncoveredBoost = tokenizeSpeechWords(p.text).reduce((sum, raw) => {
        const key = normalizeLexKey(raw);
        return sum + (uncoveredRank.get(key) ?? 0);
      }, 0);
      return {
        text: p.text,
        rank: p.score * 10_000 + uncoveredBoost,
      };
    })
    .sort((a, b) => b.rank - a.rank)
    .map((p) => p.text);

  const ordered: string[] = [];
  const fromChatKeys = new Set<string>();
  const fromUncoveredKeys = new Set<string>();
  const pushFresh = (
    list: string[],
    mark: "chat" | "uncovered" | null = null,
  ) => {
    for (const raw of list) {
      if (ordered.length >= want) return;
      const fitted = fitPhraseToWordRange(raw, minWords, maxWords);
      if (!fitted) continue;
      const key = fitted.toLowerCase();
      if (existing.has(key)) continue;
      if (ordered.some((x) => x.toLowerCase() === key)) continue;
      ordered.push(fitted);
      if (mark === "chat") fromChatKeys.add(key);
      if (mark === "uncovered") fromUncoveredKeys.add(key);
    }
  };
  pushFresh(usedRanked, "chat");
  pushFresh(frequentUncovered, "uncovered");
  pushFresh(common);
  pushFresh(variety);
  // If still short of want (small banks + tight range), re-expand unique seeds
  // with slight filler rotation so long corpora can still grow.
  if (ordered.length < want) {
    const extras = [...usedRanked, ...frequentUncovered, ...common, ...variety];
    for (const raw of extras) {
      if (ordered.length >= want) break;
      const fitted = fitPhraseToWordRange(`${raw} ${raw}`, minWords, maxWords);
      if (!fitted) continue;
      const key = fitted.toLowerCase();
      if (existing.has(key)) continue;
      if (ordered.some((x) => x.toLowerCase() === key)) continue;
      ordered.push(fitted);
    }
  }
  // Always be able to fill the requested count for long word ranges.
  let synth = 0;
  while (ordered.length < want && synth < want + 8) {
    synth += 1;
    const seed = project.lang.toLowerCase().startsWith("en")
      ? `Training passage ${synth}.`
      : `Учебный текст ${synth}.`;
    const fitted = fitPhraseToWordRange(seed, minWords, maxWords);
    if (!fitted) break;
    const key = fitted.toLowerCase();
    if (existing.has(key)) continue;
    if (ordered.some((x) => x.toLowerCase() === key)) continue;
    ordered.push(fitted);
  }
  const pick = ordered.slice(0, want);

  if (!pick.length) {
    touchProject(projectId, {
      recommendation: `Не удалось собрать тексты на ${minWords}–${maxWords} слов. Уменьшите диапазон или добавьте свою фразу ниже.`,
    });
    return [];
  }

  const store = openStore();
  const insert = store.prepare(
    `INSERT INTO voice_phrases (id, project_id, text, recorded, created_at)
     VALUES (?, ?, ?, 0, ?)`,
  );
  const baseMs = Date.now();
  const rows: VoicePhraseRow[] = [];
  let fromChat = 0;
  let fromUncovered = 0;
  for (let i = 0; i < pick.length; i++) {
    const text = pick[i]!;
    // Stagger created_at so 1…N order stays stable across refreshes/collapse.
    const row: VoicePhraseRow = {
      id: crypto.randomUUID(),
      project_id: projectId,
      text,
      recorded: 0,
      created_at: new Date(baseMs + i).toISOString(),
    };
    try {
      insert.run(row.id, row.project_id, row.text, row.created_at);
      rows.push(row);
      if (fromChatKeys.has(text.toLowerCase())) fromChat += 1;
      if (fromUncoveredKeys.has(text.toLowerCase())) fromUncovered += 1;
    } catch {
      // unique dedup race
    }
  }
  const uncoveredWordCount = stats.words.filter(
    (w) => !covered.has(w.key),
  ).length;
  touchProject(projectId, {
    status: "phrases",
    recommendation: rows.length
      ? `Добавлено ${rows.length} текстов (${minWords}–${maxWords} слов)` +
        (fromChat ? ` · частые фразы диалога: ${fromChat}` : "") +
        (fromUncovered
          ? ` · частые непокрытые слова: ${fromUncovered}`
          : uncoveredWordCount
            ? ` · непокрытых частых слов в речи: ${uncoveredWordCount}`
            : "") +
        (!fromChat && !fromUncovered ? " · частые ответы Mira / банк" : "") +
        ". Непокрытые слова пока говорит системный TTS — запишите и переобучите."
      : "Новых фраз нет. Добавьте свою.",
  });
  return rows;
}
export function listClips(projectId: string): VoiceClipRow[] {
  return openStore()
    .prepare(
      `SELECT id, project_id, phrase_id, file_path, qa_json, accepted, created_at
       FROM voice_clips WHERE project_id = ? ORDER BY created_at DESC`,
    )
    .all(projectId) as VoiceClipRow[];
}

function analyzeClipFile(filePath: string, phraseText: string | null) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const issues: string[] = [];
  if (![".wav", ".flac", ".webm", ".mp3", ".ogg", ".m4a"].includes(ext)) {
    issues.push("unexpected_format");
  }
  if (size < 800) issues.push("too_short_or_empty");
  if (size > 15_000_000) issues.push("too_large");
  // Heuristic "duration proxy" without decoding: assume ~16kB/s for compressed speech
  const approxSec = size / 16000;
  if (approxSec < 0.3) issues.push("likely_silence_or_too_short");
  if (approxSec > 45) issues.push("too_long");
  const textMatch =
    phraseText && phraseText.length > 0
      ? { expectedChars: phraseText.length, note: "text_provided" }
      : { expectedChars: 0, note: "no_phrase_link" };
  const accepted = issues.length === 0;
  return {
    size,
    approxSec: Number(approxSec.toFixed(2)),
    issues,
    textMatch,
    loudness: accepted ? "ok_stub" : "unknown",
    clipping: "not_detected_stub",
    accepted,
  };
}

const MIN_TRAIN_CLIPS = 3;
const TARGET_TRAIN_CLIPS = 5;

function qaProjectClips(projectId: string): {
  analyses: ReturnType<typeof analyzeClipFile>[];
  acceptedCount: number;
  linkedAccepted: number;
  phraseCount: number;
} {
  const clips = listClips(projectId);
  const phrases = listPhrases(projectId);
  const store = openStore();
  const analyses = [];
  let acceptedCount = 0;
  let linkedAccepted = 0;
  for (const clip of clips) {
    const phrase = clip.phrase_id
      ? (store
          .prepare(`SELECT text FROM voice_phrases WHERE id = ?`)
          .get(clip.phrase_id) as { text: string } | undefined)
      : null;
    const qa = analyzeClipFile(clip.file_path, phrase?.text ?? null);
    analyses.push(qa);
    store
      .prepare(
        `UPDATE voice_clips SET qa_json = ?, accepted = ? WHERE id = ?`,
      )
      .run(JSON.stringify(qa), qa.accepted ? 1 : 0, clip.id);
    if (qa.accepted) {
      acceptedCount += 1;
      if (clip.phrase_id) linkedAccepted += 1;
    }
  }
  return {
    analyses,
    acceptedCount,
    linkedAccepted,
    phraseCount: phrases.length,
  };
}

export type VoiceTrainReport = {
  ok: boolean;
  stage: string;
  phraseCount: number;
  acceptedClips: number;
  linkedAccepted: number;
  coveragePct: number;
  detail: string;
  steps?: Array<{ step: string; label: string; pct: number }>;
  packPath?: string | null;
  wordUnitCount?: number;
  fragmentUnitCount?: number;
};

export type VoiceTrainProgressHandler = (ev: TrainProgressEvent) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Per-step pause scales with corpus so training is visibly non-instant. */
function trainStepBudgetMs(linkedAccepted: number, wordsHint = 8): number {
  return Math.min(2200, 160 + linkedAccepted * 85 + wordsHint * 3);
}

/**
 * Train / rebuild local voice model from phrase↔audio corpus.
 * Pipeline: validate → segment → lexicon → pack → publish (with progress).
 */
export async function trainVoiceModel(
  projectId: string,
  onProgress?: VoiceTrainProgressHandler,
): Promise<{
  project: VoiceProjectRow;
  analysis: ReturnType<typeof analyzeClipFile>[];
  voice: CustomVoiceRow | null;
  report: VoiceTrainReport;
  pack: VoiceModelPack | null;
}> {
  const cur = getVoiceProject(projectId);
  if (!cur) throw new Error("Проект не найден");

  const steps: Array<{ step: string; label: string; pct: number }> = [];
  const emit = (
    step: TrainProgressEvent["step"],
    pct: number,
    label: string,
    detail?: string,
  ) => {
    steps.push({ step, label, pct });
    if (step !== "done" && step !== "error") {
      touchProject(projectId, { status: "training", recommendation: label });
    }
    onProgress?.({ projectId, step, pct, label, detail });
  };

  emit("validate", 4, "Обучение: проверка клипов и привязок…");
  await sleep(trainStepBudgetMs(1, 0));

  const qa = qaProjectClips(projectId);
  const coveragePct =
    qa.phraseCount > 0
      ? Math.round((qa.linkedAccepted / qa.phraseCount) * 100)
      : 0;

  const fail = (
    status: string,
    detail: string,
    stage: string,
  ): Awaited<ReturnType<typeof trainVoiceModel>> => {
    emit("error", 100, detail);
    const project = touchProject(projectId, {
      status,
      recommendation: detail,
    });
    return {
      project,
      analysis: qa.analyses,
      voice: null,
      pack: null,
      report: {
        ok: false,
        stage,
        phraseCount: qa.phraseCount,
        acceptedClips: qa.acceptedCount,
        linkedAccepted: qa.linkedAccepted,
        coveragePct: qa.phraseCount > 0 ? coveragePct : 0,
        detail,
        steps,
        packPath: null,
      },
    };
  };

  if (qa.phraseCount < 1) {
    return fail(
      "needs_data",
      "Обучение невозможно: нет фраз. Сгенерируйте или добавьте фразы 1…N, затем привяжите аудио.",
      "needs_data",
    );
  }
  if (qa.acceptedCount === 0) {
    return fail(
      "needs_data",
      "Обучение невозможно: нет принятых клипов. Запишите или загрузите wav/webm к пронумерованным фразам.",
      "needs_data",
    );
  }
  if (qa.linkedAccepted < MIN_TRAIN_CLIPS) {
    return fail(
      "ready_to_train",
      `Для обучения нужно минимум ${MIN_TRAIN_CLIPS} принятых клипов, привязанных к фразам (сейчас linked=${qa.linkedAccepted}, accepted=${qa.acceptedCount}).`,
      "ready_to_train",
    );
  }

  emit(
    "validate",
    16,
    `QA ок: ${qa.linkedAccepted} привязанных клипов, покрытие ${coveragePct}%`,
  );
  await sleep(trainStepBudgetMs(qa.linkedAccepted, 2));

  const project = getVoiceProject(projectId)!;
  const store = openStore();
  const voiceId =
    project.custom_voice_id ?? `mira-studio-${projectId.slice(0, 8)}`;
  const refreshed = listClips(projectId);
  const phraseById = new Map(
    listPhrases(projectId).map((p) => [p.id, p] as const),
  );
  const linkedClips: LinkedTrainClip[] = [];
  const seenPhrase = new Set<string>();
  for (const clip of refreshed) {
    if (clip.accepted !== 1 || !clip.phrase_id) continue;
    if (seenPhrase.has(clip.phrase_id)) continue;
    const phrase = phraseById.get(clip.phrase_id);
    if (!phrase) continue;
    seenPhrase.add(clip.phrase_id);
    linkedClips.push({
      clipId: clip.id,
      phraseId: phrase.id,
      phraseText: phrase.text,
      filePath: clip.file_path,
    });
  }

  const quality =
    qa.acceptedCount >= TARGET_TRAIN_CLIPS && coveragePct >= 80
      ? "high"
      : qa.acceptedCount >= TARGET_TRAIN_CLIPS
        ? "medium"
        : "draft";

  emit(
    "segment",
    26,
    `Сегментация единиц речи (${linkedClips.length} клипов)…`,
  );
  await sleep(Math.max(100, trainStepBudgetMs(linkedClips.length, 4) / 2));

  const packDir = studioRoot(projectId, "model-pack");
  const pack = buildVoiceModelPack({
    packDir,
    projectId,
    voiceId,
    name: project.name,
    lang: project.lang,
    quality,
    linkedAccepted: qa.linkedAccepted,
    phraseCount: qa.phraseCount,
    coveragePct,
    clips: linkedClips,
    onProgress: (pct, label) => {
      emit("segment", 26 + Math.round((pct / 100) * 40), label);
    },
  });

  emit(
    "lexicon",
    72,
    `Лексикон: ${Object.keys(pack.lexicon).length} слов · ${pack.wordUnitCount} wav-единиц`,
  );
  await sleep(
    trainStepBudgetMs(linkedClips.length, Object.keys(pack.lexicon).length),
  );

  emit(
    "pack",
    84,
    `Пакет модели сохранён (${pack.units.length} units)`,
    packDir,
  );
  await sleep(
    trainStepBudgetMs(Math.max(1, Math.floor(linkedClips.length / 2)), 1),
  );

  emit("publish", 92, "Публикация голоса в каталог…");
  await sleep(120);

  const preview =
    pack.phrases[0]?.clipPath ??
    refreshed.find((c) => c.accepted === 1)?.file_path ??
    refreshed[0]?.file_path ??
    null;
  const stamp = pack.trainedAt;
  const meta = {
    engine: VOICE_PACK_ENGINE,
    legacyEngine: "mira-local-corpus-v1",
    trainedAt: stamp,
    quality,
    acceptedClips: qa.acceptedCount,
    linkedAccepted: qa.linkedAccepted,
    phraseCount: qa.phraseCount,
    coveragePct,
    packDir,
    wordUnitCount: pack.wordUnitCount,
    fragmentUnitCount: pack.fragmentUnitCount,
    unitCount: pack.units.length,
    lexiconSize: Object.keys(pack.lexicon).length,
    synthesis: `${VOICE_PACK_ENGINE}: unit-selection TTS — склейка слов/фрагментов из обученных клипов; непокрытые токены — запасной Web Speech.`,
    curriculum: [
      "1. Валидация клипов",
      "2. Сегментация единиц (фраза/слово)",
      "3. Лексикон + аудио-индекс",
      "4. Сохранение model-pack",
      "5. Публикация в каталог",
    ],
  };
  const existing = store
    .prepare(`SELECT id FROM custom_voices WHERE id = ?`)
    .get(voiceId) as { id: string } | undefined;
  if (existing) {
    store
      .prepare(
        `UPDATE custom_voices
         SET name = ?, lang = ?, preview_path = ?, meta_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        project.name,
        project.lang,
        preview,
        JSON.stringify(meta),
        stamp,
        voiceId,
      );
  } else {
    store
      .prepare(
        `INSERT INTO custom_voices
          (id, project_id, name, lang, preview_path, meta_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        voiceId,
        projectId,
        project.name,
        project.lang,
        preview,
        JSON.stringify(meta),
        stamp,
        stamp,
      );
  }

  const llmProfile = JSON.stringify({
    style: "calm-assistant",
    voiceId,
    trainedQuality: quality,
    engine: VOICE_PACK_ENGINE,
    promptHint: `Отвечай в характере голоса «${project.name}»: спокойно, коротко, по делу.`,
  });

  const needMore = qa.acceptedCount < TARGET_TRAIN_CLIPS || coveragePct < 80;
  const detail = needMore
    ? `Модель «${project.name}» обучена (${quality}, ${pack.wordUnitCount} слов / ${pack.fragmentUnitCount} фрагм.). Для лучшего качества: ещё ${Math.max(0, TARGET_TRAIN_CLIPS - qa.acceptedCount)} клипов и привязка к фразам (покрытие ${coveragePct}%).`
    : `Модель «${project.name}» обучена (${quality}, ${pack.wordUnitCount} слов / ${pack.fragmentUnitCount} фрагм.). Голос в каталоге; можно донабирать фразы и переобучать.`;

  const updated = touchProject(projectId, {
    status: needMore ? "ready_partial" : "ready",
    custom_voice_id: voiceId,
    llm_profile: llmProfile,
    recommendation: detail,
  });

  const voice = store
    .prepare(
      `SELECT id, project_id, name, lang, preview_path, meta_json, created_at, updated_at
       FROM custom_voices WHERE id = ?`,
    )
    .get(voiceId) as CustomVoiceRow;

  emit("done", 100, detail);

  return {
    project: updated,
    analysis: qa.analyses,
    voice,
    pack,
    report: {
      ok: true,
      stage: updated.status,
      phraseCount: qa.phraseCount,
      acceptedClips: qa.acceptedCount,
      linkedAccepted: qa.linkedAccepted,
      coveragePct,
      detail,
      steps,
      packPath: packDir,
      wordUnitCount: pack.wordUnitCount,
      fragmentUnitCount: pack.fragmentUnitCount,
    },
  };
}


/** After clip import: QA only; training is an explicit step. */
function prepareCorpusAfterImport(projectId: string): {
  project: VoiceProjectRow;
  analysis: ReturnType<typeof analyzeClipFile>[];
  voice: CustomVoiceRow | null;
} {
  const qa = qaProjectClips(projectId);
  if (qa.acceptedCount === 0) {
    const project = touchProject(projectId, {
      status: "needs_data",
      recommendation:
        "Клип не прошёл QA. Запишите длиннее/чище (wav/webm) и привяжите к номеру фразы.",
    });
    return { project, analysis: qa.analyses, voice: null };
  }
  const coveragePct =
    qa.phraseCount > 0
      ? Math.round((qa.linkedAccepted / qa.phraseCount) * 100)
      : 0;
  const ready =
    qa.phraseCount >= 1 && qa.linkedAccepted >= MIN_TRAIN_CLIPS;
  const project = touchProject(projectId, {
    status: ready ? "ready_to_train" : "collecting",
    recommendation: ready
      ? `Корпус готов к обучению: ${qa.linkedAccepted} клипов привязано к фразам, покрытие ${coveragePct}%. Нажмите «Обучить модель».`
      : `Нужно ≥${MIN_TRAIN_CLIPS} принятых клипов с привязкой к фразам (сейчас linked=${qa.linkedAccepted}). Нумерация 1…N.`,
  });
  return { project, analysis: qa.analyses, voice: null };
}

const MAX_CLIP_BYTES = 15_000_000;

function resolvePhraseForProject(
  projectId: string,
  phraseId: string | null | undefined,
): string | null {
  if (!phraseId) return null;
  const row = openStore()
    .prepare(
      `SELECT id, project_id FROM voice_phrases WHERE id = ?`,
    )
    .get(phraseId) as { id: string; project_id: string } | undefined;
  if (!row) throw new Error("Фраза не найдена");
  if (row.project_id !== projectId) {
    throw new Error("Фраза принадлежит другому проекту голоса");
  }
  return row.id;
}

export function importClip(opts: {
  projectId: string;
  sourcePath: string;
  phraseId?: string | null;
  originalName?: string;
}): {
  clip: VoiceClipRow;
  processed: ReturnType<typeof prepareCorpusAfterImport>;
} {
  const project = getVoiceProject(opts.projectId);
  if (!project) throw new Error("Проект не найден");
  const phraseId = resolvePhraseForProject(opts.projectId, opts.phraseId);
  const abs = path.resolve(opts.sourcePath);
  assertStudioPath(abs);
  const destDir = studioRoot(opts.projectId, "clips");
  const base =
    opts.originalName?.replace(/[^\w.\-]+/g, "_") ||
    path.basename(abs) ||
    `clip-${Date.now()}.webm`;
  // Avoid double-write when source is already inside this project's clips dir
  // (importClipBytes writes once, then calls importClip).
  const alreadyInDest =
    abs === destDir || abs.startsWith(destDir + path.sep);
  const dest = alreadyInDest
    ? abs
    : path.join(destDir, `${Date.now()}-${base}`);
  if (!alreadyInDest) fs.copyFileSync(abs, dest);

  const clip: VoiceClipRow = {
    id: crypto.randomUUID(),
    project_id: opts.projectId,
    phrase_id: phraseId,
    file_path: dest,
    qa_json: null,
    accepted: 0,
    created_at: new Date().toISOString(),
  };
  openStore()
    .prepare(
      `INSERT INTO voice_clips
        (id, project_id, phrase_id, file_path, qa_json, accepted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      clip.id,
      clip.project_id,
      clip.phrase_id,
      clip.file_path,
      clip.qa_json,
      clip.accepted,
      clip.created_at,
    );

  if (phraseId) {
    openStore()
      .prepare(`UPDATE voice_phrases SET recorded = 1 WHERE id = ?`)
      .run(phraseId);
  }

  touchProject(opts.projectId, { status: "processing" });
  const processed = prepareCorpusAfterImport(opts.projectId);
  return { clip, processed };
}

/** Import raw bytes (from renderer MediaRecorder / file picker read). */
export function importClipBytes(opts: {
  projectId: string;
  bytes: Uint8Array | Buffer;
  fileName: string;
  phraseId?: string | null;
}): ReturnType<typeof importClip> {
  const buf = Buffer.from(opts.bytes);
  if (buf.byteLength > MAX_CLIP_BYTES) {
    throw new Error(
      `Клип слишком большой (${buf.byteLength} B). Лимит ${MAX_CLIP_BYTES} B.`,
    );
  }
  if (buf.byteLength < 1) throw new Error("Пустой аудиофайл");
  const destDir = studioRoot(opts.projectId, "clips");
  const safe = opts.fileName.replace(/[^\w.\-]+/g, "_") || "clip.webm";
  const dest = path.join(destDir, `${Date.now()}-${safe}`);
  fs.writeFileSync(dest, buf);
  return importClip({
    projectId: opts.projectId,
    sourcePath: dest,
    phraseId: opts.phraseId,
    originalName: safe,
  });
}

export function listCustomVoices(): CustomVoiceRow[] {
  return openStore()
    .prepare(
      `SELECT id, project_id, name, lang, preview_path, meta_json, created_at, updated_at
       FROM custom_voices ORDER BY updated_at DESC`,
    )
    .all() as CustomVoiceRow[];
}

export function getCustomVoice(id: string): CustomVoiceRow | null {
  return (
    (openStore()
      .prepare(
        `SELECT id, project_id, name, lang, preview_path, meta_json, created_at, updated_at
         FROM custom_voices WHERE id = ?`,
      )
      .get(id) as CustomVoiceRow | undefined) ?? null
  );
}

export type CustomVoiceCorpusUnit = {
  phraseId: string;
  text: string;
  filePath: string;
  /** Pre-aligned slice from model pack (optional). */
  startFrac?: number;
  endFrac?: number;
};

export type CustomVoiceCorpus = {
  voice: CustomVoiceRow;
  units: CustomVoiceCorpusUnit[];
};

/** Phrase + word/fragment units for compositional corpus TTS. */
export function getCustomVoiceCorpus(voiceId: string): CustomVoiceCorpus {
  const voice = getCustomVoice(voiceId);
  if (!voice) throw new Error("Голос не найден");

  const packDir = studioRoot(voice.project_id, "model-pack");
  const pack = readVoiceModelPack(packDir);
  if (pack && pack.units.length) {
    const phraseDur = new Map<string, number>();
    for (const u of pack.units) {
      if (u.kind === "phrase") phraseDur.set(u.sourcePhraseId, u.endMs || 1);
    }
    const units: CustomVoiceCorpusUnit[] = [];
    for (const u of pack.units) {
      if (u.kind === "phrase") {
        units.push({
          phraseId: u.sourcePhraseId,
          text: u.text,
          filePath: u.file,
        });
        continue;
      }
      // Word / fragment: sliced WAV → full file; else frac into phrase clip.
      const sliced = u.kind === "word" && u.file.endsWith(".wav");
      if (sliced) {
        units.push({
          phraseId: u.sourcePhraseId,
          text: u.text,
          filePath: u.file,
          startFrac: 0,
          endFrac: 1,
        });
      } else {
        const total = Math.max(1, phraseDur.get(u.sourcePhraseId) ?? u.endMs);
        units.push({
          phraseId: u.sourcePhraseId,
          text: u.text,
          filePath: u.file,
          startFrac: Math.max(0, u.startMs / total),
          endFrac: Math.min(1, Math.max(u.startMs + 1, u.endMs) / total),
        });
      }
    }
    return { voice, units };
  }

  const rows = openStore()
    .prepare(
      `SELECT c.phrase_id AS phraseId, p.text AS text, c.file_path AS filePath, c.created_at AS createdAt
       FROM voice_clips c
       JOIN voice_phrases p ON p.id = c.phrase_id
       WHERE c.project_id = ?
         AND c.accepted = 1
         AND c.phrase_id IS NOT NULL
       ORDER BY c.created_at DESC`,
    )
    .all(voice.project_id) as Array<{
    phraseId: string;
    text: string;
    filePath: string;
    createdAt: string;
  }>;
  const seen = new Set<string>();
  const units: CustomVoiceCorpusUnit[] = [];
  for (const row of rows) {
    if (seen.has(row.phraseId)) continue;
    seen.add(row.phraseId);
    units.push({
      phraseId: row.phraseId,
      text: row.text,
      filePath: row.filePath,
    });
  }
  return { voice, units };
}

export function updateVoiceProject(
  id: string,
  patch: { name?: string; lang?: string },
): VoiceProjectRow {
  const cur = getVoiceProject(id);
  if (!cur) throw new Error("Проект не найден");
  const name = patch.name !== undefined ? patch.name.trim() || cur.name : cur.name;
  const lang =
    patch.lang !== undefined ? patch.lang.trim() || cur.lang : cur.lang;
  const updated_at = new Date().toISOString();
  openStore()
    .prepare(
      `UPDATE voice_projects SET name = ?, lang = ?, updated_at = ? WHERE id = ?`,
    )
    .run(name, lang, updated_at, id);
  if (cur.custom_voice_id) {
    openStore()
      .prepare(
        `UPDATE custom_voices SET name = ?, lang = ?, updated_at = ? WHERE id = ?`,
      )
      .run(name, lang, updated_at, cur.custom_voice_id);
  }
  return getVoiceProject(id)!;
}

export function updateCustomVoice(
  id: string,
  patch: { name?: string; lang?: string },
): CustomVoiceRow {
  const cur = getCustomVoice(id);
  if (!cur) throw new Error("Голос не найден");
  const name = patch.name !== undefined ? patch.name.trim() || cur.name : cur.name;
  const lang =
    patch.lang !== undefined ? patch.lang.trim() || cur.lang : cur.lang;
  const updated_at = new Date().toISOString();
  openStore()
    .prepare(
      `UPDATE custom_voices SET name = ?, lang = ?, updated_at = ? WHERE id = ?`,
    )
    .run(name, lang, updated_at, id);
  openStore()
    .prepare(
      `UPDATE voice_projects SET name = ?, lang = ?, updated_at = ? WHERE id = ?`,
    )
    .run(name, lang, updated_at, cur.project_id);
  return getCustomVoice(id)!;
}

export function deleteCustomVoice(id: string): {
  ok: boolean;
  detail: string;
  clearedVoiceId: string | null;
} {
  const cur = getCustomVoice(id);
  if (!cur) return { ok: false, detail: "Голос не найден", clearedVoiceId: null };
  openStore().prepare(`DELETE FROM custom_voices WHERE id = ?`).run(id);
  openStore()
    .prepare(
      `UPDATE voice_projects
       SET custom_voice_id = NULL, status = 'created', recommendation = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      "Голос удалён из каталога. Загрузите клипы заново, чтобы собрать TTS.",
      new Date().toISOString(),
      cur.project_id,
    );
  return { ok: true, detail: `Удалён ${id}`, clearedVoiceId: id };
}

export function deleteVoiceProject(id: string): {
  ok: boolean;
  detail: string;
  clearedVoiceId: string | null;
} {
  const cur = getVoiceProject(id);
  if (!cur) return { ok: false, detail: "Проект не найден", clearedVoiceId: null };
  const clearedVoiceId = cur.custom_voice_id;
  const store = openStore();
  store.prepare(`DELETE FROM voice_clips WHERE project_id = ?`).run(id);
  store.prepare(`DELETE FROM voice_phrases WHERE project_id = ?`).run(id);
  store.prepare(`DELETE FROM custom_voices WHERE project_id = ?`).run(id);
  store.prepare(`DELETE FROM voice_projects WHERE id = ?`).run(id);
  const dir = studioRoot(id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return {
    ok: true,
    detail: `Проект ${cur.name} удалён`,
    clearedVoiceId,
  };
}

export function addCustomPhrase(
  projectId: string,
  text: string,
): VoicePhraseRow {
  const project = getVoiceProject(projectId);
  if (!project) throw new Error("Проект не найден");
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Пустая фраза");
  const row: VoicePhraseRow = {
    id: crypto.randomUUID(),
    project_id: projectId,
    text: trimmed,
    recorded: 0,
    created_at: new Date().toISOString(),
  };
  openStore()
    .prepare(
      `INSERT INTO voice_phrases (id, project_id, text, recorded, created_at)
       VALUES (?, ?, ?, 0, ?)`,
    )
    .run(row.id, row.project_id, row.text, row.created_at);
  touchProject(projectId, {
    status: "phrases",
    recommendation: "Запишите или загрузите аудио для новой фразы.",
  });
  return row;
}

export function getStudioSnapshot(projectId?: string) {
  const projects = listVoiceProjects();
  const project = projectId
    ? getVoiceProject(projectId)
    : projects[0] ?? null;
  return {
    projects,
    project,
    phrases: project ? listPhrases(project.id) : [],
    clips: project ? listClips(project.id) : [],
    customVoices: listCustomVoices(),
  };
}
