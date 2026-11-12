/** Browser-demo store for Voice Studio when Electron IPC is unavailable. */

import {
  localAccumulatePhrase,
  localBuildCorpusLexStats,
  localCoverageSeeds,
  localRankByNovelty,
  localScorePhraseNovelty,
} from "./phraseNoveltyLocal";

const KEY = "mira.voiceStudio.v1";
const HIDDEN_KEY = "mira.hiddenSystemVoices";

type LocalStore = {
  projects: MiraVoiceProject[];
  phrases: MiraVoicePhrase[];
  clips: MiraVoiceClip[];
  customVoices: MiraCustomVoice[];
};

function emptyStore(): LocalStore {
  return { projects: [], phrases: [], clips: [], customVoices: [] };
}

function read(): LocalStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as LocalStore;
    return {
      projects: parsed.projects ?? [],
      phrases: parsed.phrases ?? [],
      clips: parsed.clips ?? [],
      customVoices: parsed.customVoices ?? [],
    };
  } catch {
    return emptyStore();
  }
}

function write(store: LocalStore) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

function now() {
  return new Date().toISOString();
}

/** Stable corpus order: created_at, then original insertion index for ties. */
function phrasesForProject(
  store: LocalStore,
  projectId: string,
): MiraVoicePhrase[] {
  return store.phrases
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.project_id === projectId)
    .sort((a, b) => {
      const t = a.p.created_at.localeCompare(b.p.created_at);
      if (t !== 0) return t;
      return a.i - b.i;
    })
    .map(({ p }) => p);
}

export function localStudioSnapshot(projectId?: string) {
  const store = read();
  const project = projectId
    ? store.projects.find((p) => p.id === projectId) ?? null
    : store.projects[0] ?? null;
  return {
    projects: store.projects,
    project,
    phrases: project ? phrasesForProject(store, project.id) : [],
    clips: project
      ? store.clips.filter((c) => c.project_id === project.id)
      : [],
    customVoices: store.customVoices,
  };
}

export function localCreateProject(input: {
  name?: string;
  lang?: string;
}): MiraVoiceProject {
  const store = read();
  const row: MiraVoiceProject = {
    id: crypto.randomUUID(),
    name: (input.name ?? "Новый голос").trim() || "Новый голос",
    lang: (input.lang ?? "ru-RU").trim() || "ru-RU",
    status: "created",
    recommendation: "Сгенерируйте фразы или добавьте свою, затем запишите аудио.",
    llm_profile: null,
    custom_voice_id: null,
    created_at: now(),
    updated_at: now(),
  };
  store.projects.unshift(row);
  write(store);
  return row;
}

export function localUpdateProject(
  id: string,
  patch: { name?: string; lang?: string },
): MiraVoiceProject {
  const store = read();
  const idx = store.projects.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Проект не найден");
  const cur = store.projects[idx];
  const next = {
    ...cur,
    name: patch.name !== undefined ? patch.name.trim() || cur.name : cur.name,
    lang: patch.lang !== undefined ? patch.lang.trim() || cur.lang : cur.lang,
    updated_at: now(),
  };
  store.projects[idx] = next;
  if (next.custom_voice_id) {
    const vIdx = store.customVoices.findIndex((v) => v.id === next.custom_voice_id);
    if (vIdx >= 0) {
      store.customVoices[vIdx] = {
        ...store.customVoices[vIdx],
        name: next.name,
        lang: next.lang,
        updated_at: next.updated_at,
      };
    }
  }
  write(store);
  return next;
}

export function localDeleteProject(id: string): {
  ok: boolean;
  detail: string;
  clearedVoiceId: string | null;
} {
  const store = read();
  const cur = store.projects.find((p) => p.id === id);
  if (!cur) return { ok: false, detail: "Проект не найден", clearedVoiceId: null };
  const clearedVoiceId = cur.custom_voice_id;
  store.projects = store.projects.filter((p) => p.id !== id);
  store.phrases = store.phrases.filter((p) => p.project_id !== id);
  store.clips = store.clips.filter((c) => c.project_id !== id);
  store.customVoices = store.customVoices.filter((v) => v.project_id !== id);
  write(store);
  return { ok: true, detail: `Проект ${cur.name} удалён`, clearedVoiceId };
}

export function localUpdateCustomVoice(
  id: string,
  patch: { name?: string; lang?: string },
): MiraCustomVoice {
  const store = read();
  const idx = store.customVoices.findIndex((v) => v.id === id);
  if (idx < 0) throw new Error("Голос не найден");
  const cur = store.customVoices[idx];
  const next = {
    ...cur,
    name: patch.name !== undefined ? patch.name.trim() || cur.name : cur.name,
    lang: patch.lang !== undefined ? patch.lang.trim() || cur.lang : cur.lang,
    updated_at: now(),
  };
  store.customVoices[idx] = next;
  const pIdx = store.projects.findIndex((p) => p.id === cur.project_id);
  if (pIdx >= 0) {
    store.projects[pIdx] = {
      ...store.projects[pIdx],
      name: next.name,
      lang: next.lang,
      updated_at: next.updated_at,
    };
  }
  write(store);
  return next;
}

export function localDeleteCustomVoice(id: string): {
  ok: boolean;
  detail: string;
  clearedVoiceId: string | null;
} {
  const store = read();
  const cur = store.customVoices.find((v) => v.id === id);
  if (!cur) return { ok: false, detail: "Голос не найден", clearedVoiceId: null };
  store.customVoices = store.customVoices.filter((v) => v.id !== id);
  const pIdx = store.projects.findIndex((p) => p.id === cur.project_id);
  if (pIdx >= 0) {
    store.projects[pIdx] = {
      ...store.projects[pIdx],
      custom_voice_id: null,
      status: "created",
      recommendation:
        "Голос удалён из каталога. Загрузите клипы заново, чтобы собрать TTS.",
      updated_at: now(),
    };
  }
  write(store);
  return { ok: true, detail: `Удалён ${id}`, clearedVoiceId: id };
}

/** Common Mira replies first — keep studio voice during real speech. */
const ASSISTANT_COMMON = [
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

const PHRASE_BANK = [
  "Сегодня хороший день, чтобы закончить важную задачу.",
  "Повтори за мной: мягко верни внимание к дыханию.",
  "Техническая фраза: JSON, API, SQLite, Electron.",
  "Вопрос: что у меня сейчас на экране?",
  "Финал сессии: до связи, я на связи, когда понадоблюсь.",
  "Проверь погоду в Москве на завтра.",
  "Длинная фраза нужна, чтобы проверить естественные паузы и темп речи помощника.",
];

function localNormalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function localTokenizeWords(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[«»„"'(（\[]+|[»„"'.,!?;:…)）\]]+$/g, ""))
    .filter((t) => t.length > 0);
}

/** Browser-demo seeds: frequency-ranked assistant phrases (+ optional word bags). */
function localAssistantSpeechStats(): {
  phrases: string[];
  words: Array<{ word: string; key: string; count: number }>;
} {
  try {
    const raw = localStorage.getItem("mira.assistantPhraseSeed");
    if (!raw) return { phrases: [], words: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { phrases: [], words: [] };
    const phraseFreq = new Map<string, { text: string; count: number }>();
    const wordFreq = new Map<string, { word: string; count: number }>();
    for (const item of parsed) {
      const text =
        typeof item === "string"
          ? item.trim()
          : item &&
              typeof item === "object" &&
              typeof (item as { text?: unknown }).text === "string"
            ? String((item as { text: string }).text).trim()
            : "";
      if (text.length < 4 || text.length > 12000) continue;
      const key = text.toLowerCase();
      const prev = phraseFreq.get(key);
      if (prev) prev.count += 1;
      else phraseFreq.set(key, { text, count: 1 });
      for (const rawWord of localTokenizeWords(text)) {
        const wKey = localNormalizeWord(rawWord);
        if (!wKey || wKey.length < 2) continue;
        const wPrev = wordFreq.get(wKey);
        if (wPrev) wPrev.count += 1;
        else wordFreq.set(wKey, { word: rawWord, count: 1 });
      }
    }
    const phrases = [...phraseFreq.values()]
      .sort((a, b) => b.count - a.count || a.text.length - b.text.length)
      .map((p) => p.text);
    const words = [...wordFreq.entries()]
      .map(([key, w]) => ({ word: w.word, key, count: w.count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    return { phrases, words };
  } catch {
    return { phrases: [], words: [] };
  }
}


type LocalGeneratePhrasesOptions = {
  count?: number;
  minWords?: number;
  maxWords?: number;
};

const LOCAL_MAX_GENERATE = 40;
const LOCAL_MAX_PHRASE_CHARS = 12000;

function localCountWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function localClampWordRange(
  minWords?: number,
  maxWords?: number,
): { minWords: number; maxWords: number } {
  const minW = Math.max(1, Math.min(Number(minWords) || 1, 400));
  const maxW = Math.max(minW, Math.min(Number(maxWords) || 80, 500));
  return { minWords: minW, maxWords: maxW };
}

function localPhraseCharBudget(maxWords: number): number {
  return Math.min(LOCAL_MAX_PHRASE_CHARS, Math.max(1200, maxWords * 14 + 160));
}

const LOCAL_EXPAND_FILLERS = [
  "Это помогает лучше передать интонацию и ритм речи при обучении голоса.",
  "Повторите спокойно, чётко и без спешки, сохраняя естественные паузы.",
  "Длинный фрагмент даёт модели больше материала для устойчивого тембра.",
  "Скажите фразу так, будто объясняете задачу другу, без спешки и без напряжения.",
  "Смените темп: сначала медленнее, затем чуть быстрее, но сохраняйте ясность.",
  "Произнесите числа, имена и короткие команды в одном естественном потоке.",
  "Обратите внимание на мягкие согласные и ровный выдох в конце предложения.",
  "Пусть голос звучит уверенно, но без театральности и лишнего давления.",
  "Добавьте короткую паузу перед важной деталью, затем продолжите спокойно.",
  "Опишите привычный сценарий: открыть приложение, проверить статус, ответить.",
  "Тренируйте дикцию на шипящих и свистящих, не ускоряя остальные слова.",
  "Сделайте акцент на вопросительной интонации, затем на утвердительной.",
  "Произнесите техническую фразу про API, JSON и локальное хранилище данных.",
  "Говорите так, будто ведёте живой диалог, а не читаете список слов.",
  "Повторите ключевые слова с разной эмоциональной окраской: спокойно и тепло.",
  "Следите, чтобы окончание фразы не проваливалось и не становилось шёпотом.",
  "Вставьте бытовые детали: погода, время, адрес, короткое подтверждение.",
  "Пусть ритм речи остаётся ровным даже на длинном непрерывном фрагменте.",
  "Сформулируйте просьбу, уточнение и благодарность в одном связном абзаце.",
  "Проверьте, что каждое новое предложение добавляет смысл, а не копирует прошлое.",
  "Опишите действие на экране: нажать, сохранить, закрыть вкладку, продолжить.",
  "Говорите имена и адреса чётко, разделяя части короткими естественными паузами.",
  "Сделайте переход от нейтрального тона к лёгкой радости без резкого скачка.",
  "Произнесите длинный ответ так, будто помогаете пользователю шаг за шагом.",
  "Добавьте вариации: команда, вопрос, уточнение и короткое «готово» в финале.",
  "Сохраняйте естественные паузы на знаках, не дробя слова искусственными сбоями.",
  "Пусть тембр остаётся узнаваемым, даже когда меняются тема и длина фразы.",
  "Скажите о проверке статуса, поиске в памяти и отправке короткого сообщения.",
  "Тренируйте мягкий старт фразы и уверенное, но спокойное завершение мысли.",
  "Соберите абзац из разных бытовых и рабочих реплик, без дословных повторов.",
];

const LOCAL_PASSAGE_STARTERS = [
  "Учебный текст для устойчивого тембра.",
  "Длинный тренировочный фрагмент речи.",
  "Связный абзац для обучения голоса.",
  "Развернутый ответ помощника для дикции.",
  "Практика естественных пауз и ритма.",
  "Корпусная фраза с бытовыми деталями.",
  "Диалоговый текст с командами и уточнениями.",
  "Речь для проверки интонации и ясности.",
];

function localHashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function localMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function localShuffleWithSeed<T>(items: T[], seedText: string): T[] {
  const arr = [...items];
  const rng = localMulberry32(localHashSeed(seedText) || 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function localExpandTowardMinWords(
  text: string,
  minWords: number,
  charBudget = LOCAL_MAX_PHRASE_CHARS,
  variationKey = "",
): string {
  let out = text.trim().replace(/\s+/g, " ");
  if (localCountWords(out) >= minWords) return out;
  const fillers = localShuffleWithSeed(
    LOCAL_EXPAND_FILLERS,
    `${variationKey}|${out}|expand`,
  );
  let i = 0;
  let guard = 0;
  while (localCountWords(out) < minWords && guard < 800) {
    const next = `${out} ${fillers[i % fillers.length]}`.trim();
    if (next.length > charBudget) break;
    out = next;
    i += 1;
    guard += 1;
  }
  return out;
}

function localFitPhraseToWordRange(
  text: string,
  minWords: number,
  maxWords: number,
  variationKey = "",
): string | null {
  const budget = localPhraseCharBudget(maxWords);
  let out = text.trim().replace(/\s+/g, " ");
  if (!out) return null;
  let words = out.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) out = words.slice(0, maxWords).join(" ");
  out = localExpandTowardMinWords(
    out,
    minWords,
    budget,
    variationKey || out,
  );
  words = out.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) out = words.slice(0, maxWords).join(" ");
  if (out.length > budget) {
    out = out.slice(0, budget).replace(/\s+\S*$/, "").trim();
    words = out.split(/\s+/).filter(Boolean);
    if (words.length > maxWords) out = words.slice(0, maxWords).join(" ");
  }
  let n = localCountWords(out);
  if (n < minWords || n > maxWords) {
    const starter =
      LOCAL_PASSAGE_STARTERS[
        localHashSeed(`${variationKey}|${text}`) % LOCAL_PASSAGE_STARTERS.length
      ] ?? "Обучение голоса.";
    out = localExpandTowardMinWords(
      starter,
      minWords,
      budget,
      `${variationKey}|fallback|${text}`,
    );
    words = out.split(/\s+/).filter(Boolean);
    if (words.length > maxWords) out = words.slice(0, maxWords).join(" ");
    n = localCountWords(out);
  }
  if (n < minWords || n > maxWords) return null;
  return out;
}

export function localGeneratePhrases(
  projectId: string,
  countOrOpts: number | LocalGeneratePhrasesOptions = 5,
): MiraVoicePhrase[] {
  const store = read();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Проект не найден");
  const opts: LocalGeneratePhrasesOptions =
    typeof countOrOpts === "number" ? { count: countOrOpts } : countOrOpts;
  const want = Math.max(1, Math.min(opts.count ?? 5, LOCAL_MAX_GENERATE));
  const { minWords, maxWords } = localClampWordRange(
    opts.minWords,
    opts.maxWords,
  );
  const projectPhrases = store.phrases.filter((p) => p.project_id === projectId);
  const existing = new Set(projectPhrases.map((p) => p.text.toLowerCase()));
  let lexStats = localBuildCorpusLexStats(projectPhrases.map((p) => p.text));
  const corpusMature = lexStats.phraseCount >= 5 || lexStats.totalTokens >= 40;
  const covered = new Set<string>();
  for (const p of projectPhrases) {
    for (const raw of localTokenizeWords(p.text)) {
      const key = localNormalizeWord(raw);
      if (key) covered.add(key);
    }
  }
  const stats = localAssistantSpeechStats();
  const uncoveredWords = stats.words.filter((w) => !covered.has(w.key));
  const uncoveredSeeds: string[] = [];
  {
    let bucket: string[] = [];
    for (const w of uncoveredWords) {
      bucket.push(w.word);
      if (bucket.length >= Math.min(12, Math.max(4, minWords))) {
        const fitted = localFitPhraseToWordRange(
          `Произнесите чётко: ${bucket.join(" ")}.`,
          minWords,
          maxWords,
        );
        if (fitted) uncoveredSeeds.push(fitted);
        bucket = [];
        if (uncoveredSeeds.length >= 24) break;
      }
    }
    if (bucket.length && uncoveredSeeds.length < 24) {
      const fitted = localFitPhraseToWordRange(
        `Произнесите чётко: ${bucket.join(" ")}.`,
        minWords,
        maxWords,
      );
      if (fitted) uncoveredSeeds.push(fitted);
    }
  }
  const usedRanked = corpusMature
    ? localRankByNovelty(stats.phrases, lexStats)
    : [...stats.phrases];
  const coverageSeeds = localCoverageSeeds(lexStats);
  const commonRanked = localRankByNovelty(ASSISTANT_COMMON, lexStats);
  const bankRanked = localRankByNovelty(PHRASE_BANK, lexStats);
  const uncoveredRanked = localRankByNovelty(uncoveredSeeds, lexStats);

  const ordered: string[] = [];
  let variationSeq = 0;
  const pushFresh = (list: string[], mark = "bank", allowRepetitive = false) => {
    for (const raw of list) {
      if (ordered.length >= want) return;
      variationSeq += 1;
      const fitted = localFitPhraseToWordRange(
        raw,
        minWords,
        maxWords,
        `${projectId}|${mark}|${variationSeq}|${raw.slice(0, 48)}`,
      );
      if (!fitted) continue;
      const key = fitted.toLowerCase();
      if (existing.has(key)) continue;
      if (ordered.some((x) => x.toLowerCase() === key)) continue;
      const nov = localScorePhraseNovelty(fitted, lexStats);
      if (!allowRepetitive && nov.tooRepetitive) continue;
      ordered.push(fitted);
      lexStats = localAccumulatePhrase(lexStats, fitted);
    }
  };
  if (corpusMature) {
    pushFresh(coverageSeeds, "coverage");
    pushFresh(bankRanked, "bank");
    pushFresh(uncoveredRanked, "uncovered");
    pushFresh(usedRanked, "chat");
    pushFresh(commonRanked, "common");
  } else {
    pushFresh(usedRanked, "chat", true);
    pushFresh(coverageSeeds, "coverage");
    pushFresh(uncoveredRanked, "uncovered");
    pushFresh(commonRanked, "common", true);
    pushFresh(bankRanked, "bank");
  }
  if (ordered.length < want) {
    for (const raw of [
      ...coverageSeeds,
      ...bankRanked,
      ...usedRanked,
      ...ASSISTANT_COMMON,
      ...PHRASE_BANK,
    ]) {
      if (ordered.length >= want) break;
      variationSeq += 1;
      const seed = corpusMature ? raw : `${raw} ${raw}`;
      const fitted = localFitPhraseToWordRange(
        seed,
        minWords,
        maxWords,
        `${projectId}|extra|${variationSeq}|${raw.slice(0, 48)}`,
      );
      if (!fitted) continue;
      const key = fitted.toLowerCase();
      if (existing.has(key)) continue;
      if (ordered.some((x) => x.toLowerCase() === key)) continue;
      const nov = localScorePhraseNovelty(fitted, lexStats);
      if (corpusMature && nov.tooRepetitive) continue;
      ordered.push(fitted);
      lexStats = localAccumulatePhrase(lexStats, fitted);
    }
  }
  let synth = 0;
  while (ordered.length < want && synth < want + 12) {
    synth += 1;
    variationSeq += 1;
    const starter =
      LOCAL_PASSAGE_STARTERS[(synth - 1) % LOCAL_PASSAGE_STARTERS.length]!;
    const fitted = localFitPhraseToWordRange(
      `${starter} Вариант ${synth}.`,
      minWords,
      maxWords,
      `${projectId}|synth|${variationSeq}|${synth}|${Date.now()}`,
    );
    if (!fitted) break;
    const key = fitted.toLowerCase();
    if (existing.has(key)) continue;
    if (ordered.some((x) => x.toLowerCase() === key)) continue;
    ordered.push(fitted);
    lexStats = localAccumulatePhrase(lexStats, fitted);
  }
  if (ordered.length < want) {
    pushFresh([...coverageSeeds, ...ASSISTANT_COMMON, ...PHRASE_BANK], "fill", true);
  }

  const baseMs = Date.now();
  // Stagger created_at so display numbers 1…N stay stable after collapse/refresh.
  const rows: MiraVoicePhrase[] = ordered.slice(0, want).map((text, i) => ({
    id: crypto.randomUUID(),
    project_id: projectId,
    text,
    recorded: 0,
    created_at: new Date(baseMs + i).toISOString(),
  }));
  store.phrases.push(...rows);
  const pIdx = store.projects.findIndex((p) => p.id === projectId);
  if (pIdx >= 0) {
    store.projects[pIdx] = {
      ...store.projects[pIdx],
      status: "phrases",
      recommendation: rows.length
        ? `Добавлено ${rows.length} текстов (${minWords}–${maxWords} слов; новизна словаря + предлоги). Непокрытые — системный TTS до записи.`
        : `Новых текстов на ${minWords}–${maxWords} слов нет. Добавьте свою фразу.`,
      updated_at: now(),
    };
  }
  write(store);
  return rows;
}

export function localAddPhrase(
  projectId: string,
  text: string,
): MiraVoicePhrase {
  const store = read();
  if (!store.projects.some((p) => p.id === projectId)) {
    throw new Error("Проект не найден");
  }
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Пустая фраза");
  const row: MiraVoicePhrase = {
    id: crypto.randomUUID(),
    project_id: projectId,
    text: trimmed,
    recorded: 0,
    created_at: now(),
  };
  store.phrases.push(row);
  const pIdx = store.projects.findIndex((p) => p.id === projectId);
  if (pIdx >= 0) {
    store.projects[pIdx] = {
      ...store.projects[pIdx],
      status: "phrases",
      recommendation: "Запишите или загрузите аудио для новой фразы.",
      updated_at: now(),
    };
  }
  write(store);
  return row;
}

export function localDeletePhrase(phraseId: string): {
  ok: boolean;
  detail: string;
  deletedId: string | null;
} {
  const store = read();
  const phrase = store.phrases.find((p) => p.id === phraseId);
  if (!phrase) {
    return { ok: false, detail: "Фраза не найдена", deletedId: null };
  }
  const hasAccepted = store.clips.some(
    (c) => c.phrase_id === phraseId && c.accepted,
  );
  if (hasAccepted || phrase.recorded) {
    return {
      ok: false,
      detail: "Обученную / записанную фразу удалить нельзя — только необученные",
      deletedId: null,
    };
  }
  store.clips = store.clips.filter((c) => c.phrase_id !== phraseId);
  store.phrases = store.phrases.filter((p) => p.id !== phraseId);
  const pIdx = store.projects.findIndex((p) => p.id === phrase.project_id);
  if (pIdx >= 0) {
    store.projects[pIdx] = {
      ...store.projects[pIdx],
      recommendation: `Удалена необученная фраза: ${phrase.text.slice(0, 64)}${phrase.text.length > 64 ? "…" : ""}`,
      updated_at: now(),
    };
  }
  write(store);
  return { ok: true, detail: "Фраза удалена", deletedId: phraseId };
}

/** Clear clip audio; keep phrase text in corpus for re-upload (browser-demo). */
export function localResetVoicePhraseAudio(phraseId: string): {
  ok: boolean;
  detail: string;
  phraseId: string | null;
  projectId: string | null;
  deletedClips: number;
  needsRebuild: boolean;
} {
  const store = read();
  const phrase = store.phrases.find((p) => p.id === phraseId);
  if (!phrase) {
    return {
      ok: false,
      detail: "Фраза не найдена",
      phraseId: null,
      projectId: null,
      deletedClips: 0,
      needsRebuild: false,
    };
  }
  const before = store.clips.length;
  store.clips = store.clips.filter((c) => c.phrase_id !== phraseId);
  const deletedClips = before - store.clips.length;
  phrase.recorded = 0;

  const pIdx = store.projects.findIndex((p) => p.id === phrase.project_id);
  const project = pIdx >= 0 ? store.projects[pIdx] : null;
  const linkedLeft = store.clips.filter(
    (c) =>
      c.project_id === phrase.project_id && c.accepted && c.phrase_id,
  ).length;
  const hadModel = Boolean(project?.custom_voice_id);
  const preview =
    phrase.text.length > 48
      ? `${phrase.text.slice(0, 47)}…`
      : phrase.text;
  const needsRebuild = hadModel;
  const detail = needsRebuild
    ? `Аудио сброшено · «${preview}» снова в текстах для загрузки. Запишите новое аудио, затем «Полная пересборка».`
    : `Аудио сброшено · «${preview}» снова в текстах для загрузки.`;
  if (project) {
    store.projects[pIdx] = {
      ...project,
      status:
        linkedLeft >= 3
          ? hadModel
            ? "ready_partial"
            : "ready_to_train"
          : linkedLeft > 0
            ? "collecting"
            : "phrases",
      recommendation: detail,
      updated_at: now(),
    };
  }
  // Drop demo voice units for this phrase so catalog TTS stays consistent.
  if (project?.custom_voice_id) {
    const vIdx = store.customVoices.findIndex(
      (v) => v.id === project.custom_voice_id,
    );
    if (vIdx >= 0) {
      const voice = store.customVoices[vIdx];
      let meta: { units?: Array<{ phraseId?: string }> } = {};
      try {
        meta = voice.meta_json
          ? (JSON.parse(voice.meta_json) as typeof meta)
          : {};
      } catch {
        meta = {};
      }
      if (Array.isArray(meta.units)) {
        meta.units = meta.units.filter((u) => u.phraseId !== phraseId);
        store.customVoices[vIdx] = {
          ...voice,
          meta_json: JSON.stringify(meta),
          updated_at: now(),
        };
      }
    }
  }
  write(store);
  return {
    ok: true,
    detail,
    phraseId: phrase.id,
    projectId: phrase.project_id,
    deletedClips,
    needsRebuild,
  };
}

const MIN_TRAIN_CLIPS = 3;
const TARGET_TRAIN_CLIPS = 5;

export function localImportClipBytes(opts: {
  projectId: string;
  bytes: number[] | Uint8Array;
  fileName: string;
  phraseId?: string | null;
}): {
  clip: MiraVoiceClip;
  processed: {
    project: MiraVoiceProject;
    analysis: unknown[];
    voice: MiraCustomVoice | null;
  };
} {
  const store = read();
  const pIdx = store.projects.findIndex((p) => p.id === opts.projectId);
  if (pIdx < 0) throw new Error("Проект не найден");
  if (opts.phraseId) {
    const phrase = store.phrases.find((p) => p.id === opts.phraseId);
    if (!phrase) throw new Error("Фраза не найдена");
    if (phrase.project_id !== opts.projectId) {
      throw new Error("Фраза принадлежит другому проекту голоса");
    }
  }
  const size = opts.bytes.length;
  if (size > 15_000_000) {
    throw new Error(`Клип слишком большой (${size} B). Лимит 15000000 B.`);
  }
  const accepted = size >= 800;
  const clip: MiraVoiceClip = {
    id: crypto.randomUUID(),
    project_id: opts.projectId,
    phrase_id: opts.phraseId ?? null,
    file_path: `browser://${opts.fileName}`,
    qa_json: JSON.stringify({
      accepted,
      approxSec: Number((size / 16000).toFixed(2)),
      issues: accepted ? [] : ["too_short_or_empty"],
    }),
    accepted: accepted ? 1 : 0,
    created_at: now(),
  };
  store.clips.unshift(clip);
  if (opts.phraseId) {
    const ph = store.phrases.find((p) => p.id === opts.phraseId);
    if (ph) ph.recorded = 1;
  }

  const project = store.projects[pIdx];
  if (!accepted) {
    store.projects[pIdx] = {
      ...project,
      status: "needs_data",
      recommendation:
        "Клип не прошёл QA. Запишите длиннее и привяжите к номеру фразы.",
      updated_at: now(),
    };
  } else {
    const phraseCount = store.phrases.filter(
      (p) => p.project_id === project.id,
    ).length;
    const linkedAccepted = store.clips.filter(
      (c) => c.project_id === project.id && c.accepted && c.phrase_id,
    ).length;
    const coveragePct =
      phraseCount > 0 ? Math.round((linkedAccepted / phraseCount) * 100) : 0;
    const ready =
      phraseCount >= 1 && linkedAccepted >= MIN_TRAIN_CLIPS;
    store.projects[pIdx] = {
      ...project,
      status: ready ? "ready_to_train" : "collecting",
      recommendation: ready
        ? `Корпус готов к обучению: ${linkedAccepted} клипов привязано, покрытие ${coveragePct}%. Нажмите «Обучить модель».`
        : `Нужно ≥${MIN_TRAIN_CLIPS} клипов с привязкой к фразам (сейчас linked=${linkedAccepted}).`,
      updated_at: now(),
    };
  }
  write(store);
  return {
    clip,
    processed: {
      project: store.projects[pIdx],
      analysis: [],
      voice: null,
    },
  };
}

const LOCAL_CURRICULUM = [
  {
    concept: "spectrogram / mel target",
    neural: "Целевой mel",
    mira: "Browser-demo: метрики без полного FFT pack",
    status: "proxy",
    title: "Картина звука",
    meaning: "Как Mira «видит» запись по частотам",
    miraPlain: "В браузер-демо — упрощённые метрики без полного FFT-пака",
    group: "record_train",
  },
  {
    concept: "epochs / L1 loss",
    neural: "Эпохи + mel loss",
    mira: "Симулированные эпохи loss в browser-demo",
    status: "proxy",
    title: "Несколько проходов",
    meaning: "Повторные просмотры записей для улучшения",
    miraPlain: "В браузер-демо эпохи и оценка похожести симулируются",
    group: "record_train",
  },
  {
    concept: "full neural net + CUDA",
    neural: "Tacotron на GPU",
    mira: "Отложено",
    status: "deferred",
    title: "Полная нейросеть на GPU",
    meaning: "Обучение «настоящей» модели речи как в лаборатории",
    miraPlain: "В десктопе пока нет — отложено",
    group: "later",
  },
] as const;

export async function localTrainVoiceModel(
  projectId: string,
  onProgress?: (ev: {
    projectId: string;
    step: string;
    pct: number;
    label: string;
    epoch?: number;
    epochs?: number;
    loss?: number;
    melL1?: number;
  }) => void,
): Promise<{
  project: MiraVoiceProject;
  analysis: unknown[];
  voice: MiraCustomVoice | null;
  report: {
    ok: boolean;
    stage: string;
    phraseCount: number;
    acceptedClips: number;
    linkedAccepted: number;
    coveragePct: number;
    detail: string;
    steps?: Array<{ step: string; label: string; pct: number }>;
    wordUnitCount?: number;
    fragmentUnitCount?: number;
    lexiconSize?: number;
    audioLexiconSize?: number;
    provisionalLexiconSize?: number;
    epochs?: number;
    trainSteps?: number;
    initialLoss?: number;
    finalLoss?: number;
    melTargets?: number;
    curriculum?: Array<{
      concept: string;
      neural: string;
      mira: string;
      status: string;
      title?: string;
      meaning?: string;
      miraPlain?: string;
      group?: string;
    }>;
  };
}> {
  const store = read();
  const pIdx = store.projects.findIndex((p) => p.id === projectId);
  if (pIdx < 0) throw new Error("Проект не найден");
  const project = store.projects[pIdx];
  const phrases = store.phrases.filter((p) => p.project_id === projectId);
  const clips = store.clips.filter((c) => c.project_id === projectId);
  const acceptedClips = clips.filter((c) => c.accepted);
  const linkedAccepted = acceptedClips.filter((c) => c.phrase_id).length;
  const coveragePct =
    phrases.length > 0
      ? Math.round((linkedAccepted / phrases.length) * 100)
      : 0;

  const steps: Array<{ step: string; label: string; pct: number }> = [];
  const emit = (
    step: string,
    pct: number,
    label: string,
    extra?: {
      epoch?: number;
      epochs?: number;
      loss?: number;
      melL1?: number;
    },
  ) => {
    steps.push({ step, label, pct });
    onProgress?.({ projectId, step, pct, label, ...extra });
  };
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  emit(
    "validate",
    5,
    "Пары текст↔аудио (browser-demo): проверка клипов…",
  );
  store.projects[pIdx] = {
    ...project,
    status: "training",
    recommendation: "Сборка unit-selection pack…",
    updated_at: now(),
  };
  write(store);
  await pause(180 + linkedAccepted * 40);

  if (phrases.length < 1) {
    const detail =
      "Обучение невозможно: нет фраз. Сгенерируйте или добавьте фразы 1…N.";
    emit("error", 100, detail);
    store.projects[pIdx] = {
      ...store.projects[pIdx],
      status: "needs_data",
      recommendation: detail,
      updated_at: now(),
    };
    write(store);
    return {
      project: store.projects[pIdx],
      analysis: [],
      voice: null,
      report: {
        ok: false,
        stage: "needs_data",
        phraseCount: 0,
        acceptedClips: acceptedClips.length,
        linkedAccepted,
        coveragePct: 0,
        detail,
        steps,
      },
    };
  }

  if (acceptedClips.length === 0) {
    const detail =
      "Обучение невозможно: нет принятых клипов. Запишите аудио к фразам 1…N.";
    emit("error", 100, detail);
    store.projects[pIdx] = {
      ...store.projects[pIdx],
      status: "needs_data",
      recommendation: detail,
      updated_at: now(),
    };
    write(store);
    return {
      project: store.projects[pIdx],
      analysis: [],
      voice: null,
      report: {
        ok: false,
        stage: "needs_data",
        phraseCount: phrases.length,
        acceptedClips: 0,
        linkedAccepted: 0,
        coveragePct: 0,
        detail,
        steps,
      },
    };
  }

  if (linkedAccepted < MIN_TRAIN_CLIPS) {
    const detail = `Для обучения нужно минимум ${MIN_TRAIN_CLIPS} клипов, привязанных к фразам (сейчас linked=${linkedAccepted}).`;
    emit("error", 100, detail);
    store.projects[pIdx] = {
      ...store.projects[pIdx],
      status: "ready_to_train",
      recommendation: detail,
      updated_at: now(),
    };
    write(store);
    return {
      project: store.projects[pIdx],
      analysis: [],
      voice: null,
      report: {
        ok: false,
        stage: "ready_to_train",
        phraseCount: phrases.length,
        acceptedClips: acceptedClips.length,
        linkedAccepted,
        coveragePct,
        detail,
        steps,
      },
    };
  }

  const allWords = new Set<string>();
  const audioWords = new Set<string>();
  for (const ph of phrases) {
    for (const w of ph.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean)) {
      allWords.add(w);
    }
  }
  for (const clip of acceptedClips) {
    if (!clip.phrase_id) continue;
    const ph = phrases.find((p) => p.id === clip.phrase_id);
    if (!ph) continue;
    for (const w of ph.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean)) {
      audioWords.add(w);
    }
  }
  const lexiconSize = allWords.size;
  const audioLexiconSize = audioWords.size;
  const provisionalLexiconSize = Math.max(0, lexiconSize - audioLexiconSize);
  const wordUnitCount = audioLexiconSize;

  emit(
    "features",
    22,
    `Признаки (demo): RMS/тишина · ${linkedAccepted} клипов…`,
  );
  await pause(120 + linkedAccepted * 25);
  emit(
    "segment",
    38,
    `Выравнивание ${linkedAccepted} клипов · ${phrases.length} текстов · ~${lexiconSize} слов…`,
  );
  await pause(
    280 + linkedAccepted * 70 + Math.min(6000, lexiconSize * 10),
  );
  emit(
    "lexicon",
    52,
    `Лексикон ${lexiconSize} (аудио ${audioLexiconSize}, пока TTS ${provisionalLexiconSize})…`,
  );
  await pause(180 + Math.min(4000, lexiconSize * 8));

  const demoEpochs = 3;
  let demoLoss = 0.55 + linkedAccepted * 0.01;
  const initialDemoLoss = demoLoss;
  for (let ep = 1; ep <= demoEpochs; ep++) {
    demoLoss = Math.max(0.12, demoLoss * 0.82);
    emit(
      "epochs",
      55 + Math.round((ep / demoEpochs) * 22),
      `Эпоха ${ep}/${demoEpochs} · loss ${demoLoss.toFixed(4)} (browser-demo)`,
      {
        epoch: ep,
        epochs: demoEpochs,
        loss: Number(demoLoss.toFixed(4)),
        melL1: Number((demoLoss * 0.85).toFixed(4)),
      },
    );
    await pause(120 + linkedAccepted * 30);
  }

  emit("pack", 82, `Сборка model-pack · лексикон ${lexiconSize}…`);
  await pause(180 + Math.min(2000, lexiconSize * 3));
  emit("publish", 92, "Публикация в каталог…");
  await pause(140);

  const stamp = now();
  const voiceId =
    project.custom_voice_id ?? `mira-studio-${project.id.slice(0, 8)}`;
  const quality =
    acceptedClips.length >= TARGET_TRAIN_CLIPS && coveragePct >= 80
      ? "high"
      : acceptedClips.length >= TARGET_TRAIN_CLIPS
        ? "medium"
        : "draft";
  const preview = acceptedClips[0]?.file_path ?? null;
  let voice = store.customVoices.find((v) => v.id === voiceId) ?? null;
  const meta = JSON.stringify({
    engine: "mira-voice-pack-v1",
    method: "unit-selection-mel-refine-v1",
    neuralTts: false,
    trainedAt: stamp,
    quality,
    browserDemo: true,
    wordUnitCount,
    lexiconSize,
    audioLexiconSize,
    provisionalLexiconSize,
    unitCount: linkedAccepted + wordUnitCount,
    epochs: demoEpochs,
    initialLoss: Number(initialDemoLoss.toFixed(4)),
    finalLoss: Number(demoLoss.toFixed(4)),
    curriculum: LOCAL_CURRICULUM,
  });
  if (voice) {
    voice = {
      ...voice,
      name: project.name,
      lang: project.lang,
      preview_path: preview,
      meta_json: meta,
      updated_at: stamp,
    };
    store.customVoices = store.customVoices.map((v) =>
      v.id === voiceId ? voice! : v,
    );
  } else {
    voice = {
      id: voiceId,
      project_id: project.id,
      name: project.name,
      lang: project.lang,
      preview_path: preview,
      meta_json: meta,
      created_at: stamp,
      updated_at: stamp,
    };
    store.customVoices.unshift(voice);
  }

  const needMore =
    acceptedClips.length < TARGET_TRAIN_CLIPS || coveragePct < 80;
  const detail = needMore
    ? `Unit-selection+mel «${project.name}» (${quality}, browser-demo, лексикон ${lexiconSize}, loss ${demoLoss.toFixed(4)}). Запишите длинные тексты и клипы (покрытие ${coveragePct}%).`
    : `Unit-selection+mel «${project.name}» (${quality}, browser-demo, лексикон ${lexiconSize}, loss ${demoLoss.toFixed(4)}) в каталоге.`;

  store.projects[pIdx] = {
    ...project,
    status: needMore ? "ready_partial" : "ready",
    custom_voice_id: voiceId,
    llm_profile: JSON.stringify({
      style: "calm-assistant",
      voiceId,
      trainedQuality: quality,
      engine: "mira-voice-pack-v1",
    }),
    recommendation: detail,
    updated_at: stamp,
  };
  write(store);
  emit("done", 100, detail);
  return {
    project: store.projects[pIdx],
    analysis: [],
    voice,
    report: {
      ok: true,
      stage: store.projects[pIdx].status,
      phraseCount: phrases.length,
      acceptedClips: acceptedClips.length,
      linkedAccepted,
      coveragePct,
      detail,
      steps,
      wordUnitCount,
      fragmentUnitCount: 0,
      lexiconSize,
      audioLexiconSize,
      provisionalLexiconSize,
      epochs: demoEpochs,
      trainSteps: demoEpochs * Math.max(1, linkedAccepted),
      initialLoss: Number(initialDemoLoss.toFixed(4)),
      finalLoss: Number(demoLoss.toFixed(4)),
      melTargets: linkedAccepted,
      curriculum: [...LOCAL_CURRICULUM],
    },
  };
}

export function listLocalCustomVoices(): MiraCustomVoice[] {
  return read().customVoices;
}

export function getLocalCustomVoiceCorpus(voiceId: string): {
  voice: MiraCustomVoice;
  units: Array<{ phraseId: string; text: string; filePath: string }>;
} {
  const store = read();
  const voice = store.customVoices.find((v) => v.id === voiceId);
  if (!voice) throw new Error("Голос не найден");
  const phrases = new Map(
    store.phrases
      .filter((p) => p.project_id === voice.project_id)
      .map((p) => [p.id, p]),
  );
  const clips = store.clips
    .filter(
      (c) =>
        c.project_id === voice.project_id &&
        c.accepted === 1 &&
        Boolean(c.phrase_id),
    )
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const seen = new Set<string>();
  const units: Array<{ phraseId: string; text: string; filePath: string }> =
    [];
  for (const clip of clips) {
    const phraseId = clip.phrase_id!;
    if (seen.has(phraseId)) continue;
    const phrase = phrases.get(phraseId);
    if (!phrase) continue;
    seen.add(phraseId);
    units.push({
      phraseId,
      text: phrase.text,
      filePath: clip.file_path,
    });
  }
  return { voice, units };
}

export function getHiddenSystemVoiceIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hideSystemVoice(id: string) {
  const ids = new Set(getHiddenSystemVoiceIds());
  ids.add(id);
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
}

export function unhideSystemVoice(id: string) {
  const ids = getHiddenSystemVoiceIds().filter((x) => x !== id);
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
}
