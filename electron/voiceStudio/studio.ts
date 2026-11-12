import fs from "node:fs";
import path from "node:path";
import { openStore } from "../store";
import { getOwnerId } from "../owner";
import {
  VOICE_PACK_ENGINE,
  buildVoiceModelPack,
  readVoiceModelPack,
  type LinkedTrainClip,
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
const MAX_PHRASE_CHARS = 220;

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

/** Recent assistant chat lines → phrase candidates (frequency + recency). */
export function collectAssistantUsedPhrases(opts?: {
  limitUtterances?: number;
  limitPhrases?: number;
}): string[] {
  const limitU = opts?.limitUtterances ?? 80;
  const limitP = opts?.limitPhrases ?? 40;
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

    const freq = new Map<string, { text: string; score: number }>();
    rows.forEach((row, idx) => {
      const recency = Math.max(1, limitU - idx);
      for (const part of splitPhraseCandidates(row.content)) {
        const key = part.toLowerCase();
        const prev = freq.get(key);
        const bump = recency + (part.length <= 80 ? 8 : 0);
        if (prev) prev.score += bump;
        else freq.set(key, { text: part, score: bump });
      }
    });

    return [...freq.values()]
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
      .slice(0, limitP)
      .map((x) => x.text);
  } catch {
    return [];
  }
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
  count = 5,
): VoicePhraseRow[] {
  const project = getVoiceProject(projectId);
  if (!project) throw new Error("Проект не найден");
  const want = Math.max(1, Math.min(count, 20));
  const existing = new Set(
    listPhrases(projectId).map((p) => p.text.toLowerCase()),
  );
  const { common, variety } = phrasePoolForLang(project.lang);

  // Priority: (1) phrases Mira already speaks in chat, (2) common short
  // replies that prevent mid-utterance Web Speech fallback, (3) variety bank.
  const used = collectAssistantUsedPhrases({
    limitUtterances: 100,
    limitPhrases: 50,
  });
  const ordered: string[] = [];
  const pushFresh = (list: string[]) => {
    for (const t of list) {
      if (ordered.length >= want) return;
      const key = t.toLowerCase();
      if (existing.has(key)) continue;
      if (ordered.some((x) => x.toLowerCase() === key)) continue;
      ordered.push(t);
    }
  };
  pushFresh(used);
  pushFresh(common);
  pushFresh(variety);
  const pick = ordered.slice(0, want);

  if (!pick.length) {
    touchProject(projectId, {
      recommendation:
        "Новых фраз нет: чат и банк уже покрыты. Добавьте свою фразу ниже.",
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
  const usedKeys = new Set(used.map((t) => t.toLowerCase()));
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
      if (usedKeys.has(text.toLowerCase())) fromChat += 1;
    } catch {
      // unique dedup race
    }
  }
  touchProject(projectId, {
    status: "phrases",
    recommendation: rows.length
      ? `Добавлено ${rows.length} фраз` +
        (fromChat
          ? ` · из диалогов ассистента: ${fromChat}`
          : " · частые ответы Mira / банк") +
        ". Запишите аудио — иначе TTS уйдёт в системный голос."
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
};

/** Train / rebuild local voice model from phrase↔audio corpus. */
export function trainVoiceModel(projectId: string): {
  project: VoiceProjectRow;
  analysis: ReturnType<typeof analyzeClipFile>[];
  voice: CustomVoiceRow | null;
  report: VoiceTrainReport;
} {
  const cur = getVoiceProject(projectId);
  if (!cur) throw new Error("Проект не найден");

  touchProject(projectId, {
    status: "training",
    recommendation: "Обучение: QA клипов → сборка корпуса → регистрация модели…",
  });

  const qa = qaProjectClips(projectId);
  const coveragePct =
    qa.phraseCount > 0
      ? Math.round((qa.linkedAccepted / qa.phraseCount) * 100)
      : 0;

  if (qa.phraseCount < 1) {
    const project = touchProject(projectId, {
      status: "needs_data",
      recommendation:
        "Обучение невозможно: нет фраз. Сгенерируйте или добавьте фразы 1…N, затем привяжите аудио.",
    });
    return {
      project,
      analysis: qa.analyses,
      voice: null,
      report: {
        ok: false,
        stage: "needs_data",
        phraseCount: 0,
        acceptedClips: qa.acceptedCount,
        linkedAccepted: qa.linkedAccepted,
        coveragePct: 0,
        detail: project.recommendation ?? "Нет фраз",
      },
    };
  }

  if (qa.acceptedCount === 0) {
    const project = touchProject(projectId, {
      status: "needs_data",
      recommendation:
        "Обучение невозможно: нет принятых клипов. Запишите или загрузите wav/webm к пронумерованным фразам.",
    });
    return {
      project,
      analysis: qa.analyses,
      voice: null,
      report: {
        ok: false,
        stage: "needs_data",
        phraseCount: qa.phraseCount,
        acceptedClips: 0,
        linkedAccepted: 0,
        coveragePct: 0,
        detail: project.recommendation ?? "Нет данных",
      },
    };
  }

  if (qa.linkedAccepted < MIN_TRAIN_CLIPS) {
    const project = touchProject(projectId, {
      status: "ready_to_train",
      recommendation: `Для обучения нужно минимум ${MIN_TRAIN_CLIPS} принятых клипов, привязанных к фразам (сейчас linked=${qa.linkedAccepted}, accepted=${qa.acceptedCount}).`,
    });
    return {
      project,
      analysis: qa.analyses,
      voice: null,
      report: {
        ok: false,
        stage: "ready_to_train",
        phraseCount: qa.phraseCount,
        acceptedClips: qa.acceptedCount,
        linkedAccepted: qa.linkedAccepted,
        coveragePct,
        detail: project.recommendation ?? "Мало привязанных клипов",
      },
    };
  }

  // Real local model pack: segment linked clips into phrase/word/fragment units
  // + lexicon for compositional TTS (uncovered tokens → Web Speech fallback).
  const project = getVoiceProject(projectId)!;
  const store = openStore();
  const voiceId =
    project.custom_voice_id ?? `mira-studio-${projectId.slice(0, 8)}`;
  const refreshed = listClips(projectId);
  const preview =
    refreshed.find((c) => c.accepted === 1)?.file_path ??
    refreshed[0]?.file_path ??
    null;
  const stamp = new Date().toISOString();
  const quality =
    qa.acceptedCount >= TARGET_TRAIN_CLIPS && coveragePct >= 80
      ? "high"
      : qa.acceptedCount >= TARGET_TRAIN_CLIPS
        ? "medium"
        : "draft";

  const phraseById = new Map(
    listPhrases(projectId).map((p) => [p.id, p] as const),
  );
  const linkedClips: LinkedTrainClip[] = [];
  for (const clip of refreshed) {
    if (clip.accepted !== 1 || !clip.phrase_id) continue;
    const phrase = phraseById.get(clip.phrase_id);
    if (!phrase) continue;
    linkedClips.push({
      clipId: clip.id,
      phraseId: phrase.id,
      phraseText: phrase.text,
      filePath: clip.file_path,
    });
  }

  touchProject(projectId, {
    status: "training",
    recommendation: `Сегментация корпуса: ${linkedClips.length} клипов → слова/фрагменты…`,
  });

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
      touchProject(projectId, {
        status: "training",
        recommendation: `Обучение ${pct}% · ${label}`,
      });
    },
  });

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
    synthesis:
      `${VOICE_PACK_ENGINE}: unit-selection TTS — склейка слов/фрагментов из обученных клипов; непокрытые токены — запасной Web Speech.`,
    curriculum: [
      "1. Фразы (речь ассистента / банк / свои)",
      "2. Аудио 1…N к фразам",
      "3. QA клипов",
      "4. Сборка model-pack (фразы + lexicon)",
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

  return {
    project: updated,
    analysis: qa.analyses,
    voice,
    report: {
      ok: true,
      stage: updated.status,
      phraseCount: qa.phraseCount,
      acceptedClips: qa.acceptedCount,
      linkedAccepted: qa.linkedAccepted,
      coveragePct,
      detail,
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
