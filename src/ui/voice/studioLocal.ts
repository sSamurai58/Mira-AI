/** Browser-demo store for Voice Studio when Electron IPC is unavailable. */

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

function localAssistantUsedPhrases(): string[] {
  // Browser-demo has no SQLite utterances; optional mirror if host exported them.
  try {
    const raw = localStorage.getItem("mira.assistantPhraseSeed");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length >= 4 && s.length <= 220);
  } catch {
    return [];
  }
}

export function localGeneratePhrases(
  projectId: string,
  count = 5,
): MiraVoicePhrase[] {
  const store = read();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Проект не найден");
  const want = Math.max(1, Math.min(count, 20));
  const existing = new Set(
    store.phrases
      .filter((p) => p.project_id === projectId)
      .map((p) => p.text.toLowerCase()),
  );
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
  pushFresh(localAssistantUsedPhrases());
  pushFresh(ASSISTANT_COMMON);
  pushFresh(PHRASE_BANK);

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
        ? `Добавлено ${rows.length} фраз (сначала частые ответы Mira). Запишите аудио.`
        : "Новых фраз нет. Добавьте свою фразу.",
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

export function localTrainVoiceModel(projectId: string): {
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
  };
} {
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

  store.projects[pIdx] = {
    ...project,
    status: "training",
    recommendation: "Обучение модели…",
    updated_at: now(),
  };
  write(store);

  if (phrases.length < 1) {
    const detail =
      "Обучение невозможно: нет фраз. Сгенерируйте или добавьте фразы 1…N.";
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
      },
    };
  }

  if (acceptedClips.length === 0) {
    const detail =
      "Обучение невозможно: нет принятых клипов. Запишите аудио к фразам 1…N.";
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
      },
    };
  }

  if (linkedAccepted < MIN_TRAIN_CLIPS) {
    const detail = `Для обучения нужно минимум ${MIN_TRAIN_CLIPS} клипов, привязанных к фразам (сейчас linked=${linkedAccepted}).`;
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
      },
    };
  }

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
  if (voice) {
    voice = {
      ...voice,
      name: project.name,
      lang: project.lang,
      preview_path: preview,
      meta_json: JSON.stringify({
        engine: "mira-local-corpus-v1",
        trainedAt: stamp,
        quality,
        browserDemo: true,
      }),
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
      meta_json: JSON.stringify({
        engine: "mira-local-corpus-v1",
        trainedAt: stamp,
        quality,
        browserDemo: true,
      }),
      created_at: stamp,
      updated_at: stamp,
    };
    store.customVoices.unshift(voice);
  }

  const needMore =
    acceptedClips.length < TARGET_TRAIN_CLIPS || coveragePct < 80;
  const detail = needMore
    ? `Модель «${project.name}» обучена (${quality}, browser-demo). Для качества добавьте ещё клипы (покрытие ${coveragePct}%).`
    : `Модель «${project.name}» обучена (${quality}, browser-demo) и в каталоге.`;

  store.projects[pIdx] = {
    ...project,
    status: needMore ? "ready_partial" : "ready",
    custom_voice_id: voiceId,
    llm_profile: JSON.stringify({
      style: "calm-assistant",
      voiceId,
      trainedQuality: quality,
    }),
    recommendation: detail,
    updated_at: stamp,
  };
  write(store);
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
