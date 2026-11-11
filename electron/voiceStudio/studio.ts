import fs from "node:fs";
import path from "node:path";
import { openStore } from "../store";

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

const PHRASE_BANK_RU = [
  "Привет, я Mira — твой голосовой помощник.",
  "Сегодня хороший день, чтобы закончить важную задачу.",
  "Повтори за мной: мягко верни внимание к дыханию.",
  "Номер телефона: плюс семь девятьсот двенадцать.",
  "Открой терминал и выполни проверку статуса.",
  "Я могу искать в памяти прошлые разговоры.",
  "Добавь встречу на пятницу в пятнадцать ноль ноль.",
  "Спасибо, сообщение отправлено.",
  "Проверь погоду в Москве на завтра.",
  "Фраза для дикции: шесть шипящих шагов по шоссе.",
  "Короткий ответ: да, сделаю это сейчас.",
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
  "Hello, I am Mira — your voice assistant.",
  "Please repeat after me: bring your attention back gently.",
  "Technical line: JSON, API, SQLite, Electron.",
  "Short confirmation: yes, I will do that now.",
  "Longer line to test pacing, pauses, and natural intonation in speech.",
];

function studioRoot(...parts: string[]): string {
  const dir = path.resolve(process.cwd(), "data", "voice-studio", ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function assertStudioPath(absPath: string): void {
  const root = studioRoot();
  const resolved = path.resolve(absPath);
  if (!(resolved === root || resolved.startsWith(root + path.sep))) {
    // also allow seed samples
    const seed = path.resolve(process.cwd(), "seed", "voice-studio");
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
    recommendation: "Сгенерируйте первую пачку фраз для начитки.",
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
       FROM voice_phrases WHERE project_id = ? ORDER BY created_at ASC`,
    )
    .all(projectId) as VoicePhraseRow[];
}

export function generatePhrases(
  projectId: string,
  count = 5,
): VoicePhraseRow[] {
  const project = getVoiceProject(projectId);
  if (!project) throw new Error("Проект не найден");
  const existing = listPhrases(projectId).map((p) => p.text.toLowerCase());
  const bank = project.lang.toLowerCase().startsWith("en")
    ? PHRASE_BANK_EN
    : PHRASE_BANK_RU;
  const fresh = bank.filter((t) => !existing.includes(t.toLowerCase()));
  if (!fresh.length) {
    touchProject(projectId, {
      recommendation:
        "Банк фраз исчерпан для демо. Добавьте свои записи или расширьте банк.",
    });
    return [];
  }
  const pick = fresh.slice(0, Math.max(1, Math.min(count, fresh.length)));
  const store = openStore();
  const insert = store.prepare(
    `INSERT INTO voice_phrases (id, project_id, text, recorded, created_at)
     VALUES (?, ?, ?, 0, ?)`,
  );
  const now = new Date().toISOString();
  const rows: VoicePhraseRow[] = [];
  for (const text of pick) {
    const row: VoicePhraseRow = {
      id: crypto.randomUUID(),
      project_id: projectId,
      text,
      recorded: 0,
      created_at: now,
    };
    try {
      insert.run(row.id, row.project_id, row.text, row.created_at);
      rows.push(row);
    } catch {
      // unique dedup race
    }
  }
  touchProject(projectId, {
    status: "phrases",
    recommendation: `Запишите/загрузите аудио для ${rows.length} новых фраз.`,
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

function autoProcessProject(projectId: string): {
  project: VoiceProjectRow;
  analysis: ReturnType<typeof analyzeClipFile>[];
  voice: CustomVoiceRow | null;
} {
  const clips = listClips(projectId);
  const store = openStore();
  const analyses = [];
  let acceptedCount = 0;
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
    if (qa.accepted) acceptedCount += 1;
  }

  if (acceptedCount === 0) {
    const project = touchProject(projectId, {
      status: "needs_data",
      recommendation:
        "Нет принятых клипов. Загрузите более длинные/чистые записи (wav/webm).",
    });
    return { project, analysis: analyses, voice: null };
  }

  // 15.6 local TTS pack (stub train): register custom voice + optional LLM profile
  const project = getVoiceProject(projectId)!;
  const voiceId = project.custom_voice_id ?? `mira-studio-${projectId.slice(0, 8)}`;
  const refreshed = listClips(projectId);
  const preview =
    refreshed.find((c) => c.accepted === 1)?.file_path ??
    refreshed[0]?.file_path ??
    null;
  const now = new Date().toISOString();
  const meta = {
    engine: "local-corpus-pack",
    note: "P9: corpus pack + Web Speech fallback for synthesis; neural train later",
    acceptedClips: acceptedCount,
    phraseCount: listPhrases(projectId).length,
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
        now,
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
        now,
        now,
      );
  }

  const llmProfile = JSON.stringify({
    style: "calm-assistant",
    voiceId,
    promptHint: `Отвечай в характере голоса «${project.name}»: спокойно, коротко, по делу.`,
  });

  const needMore = acceptedCount < 5;
  const updated = touchProject(projectId, {
    status: needMore ? "ready_partial" : "ready",
    custom_voice_id: voiceId,
    llm_profile: llmProfile,
    recommendation: needMore
      ? `Голос в каталоге. Для качества добавьте ещё ${5 - acceptedCount} фраз/записей (фонемы/словарь).`
      : "Голос готов. Можно генерировать ещё фразы для роста словаря.",
  });

  const voice = store
    .prepare(
      `SELECT id, project_id, name, lang, preview_path, meta_json, created_at, updated_at
       FROM custom_voices WHERE id = ?`,
    )
    .get(voiceId) as CustomVoiceRow;

  return { project: updated, analysis: analyses, voice };
}

export function importClip(opts: {
  projectId: string;
  sourcePath: string;
  phraseId?: string | null;
  originalName?: string;
}): {
  clip: VoiceClipRow;
  processed: ReturnType<typeof autoProcessProject>;
} {
  const project = getVoiceProject(opts.projectId);
  if (!project) throw new Error("Проект не найден");
  const abs = path.resolve(opts.sourcePath);
  assertStudioPath(abs);
  // If path is outside project clips, copy into project dir — but allowlist is studio/seed only.
  // For paths under seed, copy in; for already in project clips, keep.
  const destDir = studioRoot(opts.projectId, "clips");
  const base =
    opts.originalName?.replace(/[^\w.\-]+/g, "_") ||
    path.basename(abs) ||
    `clip-${Date.now()}.webm`;
  const dest = path.join(destDir, `${Date.now()}-${base}`);
  fs.copyFileSync(abs, dest);

  const clip: VoiceClipRow = {
    id: crypto.randomUUID(),
    project_id: opts.projectId,
    phrase_id: opts.phraseId ?? null,
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

  if (opts.phraseId) {
    openStore()
      .prepare(`UPDATE voice_phrases SET recorded = 1 WHERE id = ?`)
      .run(opts.phraseId);
  }

  touchProject(opts.projectId, { status: "processing" });
  // 15.5–15.6 auto after upload
  const processed = autoProcessProject(opts.projectId);
  return { clip, processed };
}

/** Import raw bytes (from renderer MediaRecorder / file picker read). */
export function importClipBytes(opts: {
  projectId: string;
  bytes: Uint8Array | Buffer;
  fileName: string;
  phraseId?: string | null;
}): ReturnType<typeof importClip> {
  const destDir = studioRoot(opts.projectId, "clips");
  const safe = opts.fileName.replace(/[^\w.\-]+/g, "_") || "clip.webm";
  const dest = path.join(destDir, `${Date.now()}-${safe}`);
  fs.writeFileSync(dest, Buffer.from(opts.bytes));
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
