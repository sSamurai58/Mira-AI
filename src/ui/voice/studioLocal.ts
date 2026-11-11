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

export function localStudioSnapshot(projectId?: string) {
  const store = read();
  const project = projectId
    ? store.projects.find((p) => p.id === projectId) ?? null
    : store.projects[0] ?? null;
  return {
    projects: store.projects,
    project,
    phrases: project
      ? store.phrases.filter((p) => p.project_id === project.id)
      : [],
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

export function localDeleteProject(id: string): { ok: boolean; detail: string } {
  const store = read();
  const cur = store.projects.find((p) => p.id === id);
  if (!cur) return { ok: false, detail: "Проект не найден" };
  store.projects = store.projects.filter((p) => p.id !== id);
  store.phrases = store.phrases.filter((p) => p.project_id !== id);
  store.clips = store.clips.filter((c) => c.project_id !== id);
  store.customVoices = store.customVoices.filter((v) => v.project_id !== id);
  write(store);
  return { ok: true, detail: `Проект ${cur.name} удалён` };
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

export function localDeleteCustomVoice(
  id: string,
): { ok: boolean; detail: string } {
  const store = read();
  const cur = store.customVoices.find((v) => v.id === id);
  if (!cur) return { ok: false, detail: "Голос не найден" };
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
  return { ok: true, detail: `Удалён ${id}` };
}

const PHRASE_BANK = [
  "Привет, я Mira — твой голосовой помощник.",
  "Сегодня хороший день, чтобы закончить важную задачу.",
  "Повтори за мной: мягко верни внимание к дыханию.",
  "Спасибо, сообщение отправлено.",
  "Короткий ответ: да, сделаю это сейчас.",
  "Техническая фраза: JSON, API, SQLite, Electron.",
  "Вопрос: что у меня сейчас на экране?",
  "Финал сессии: до связи, я на связи, когда понадоблюсь.",
];

export function localGeneratePhrases(
  projectId: string,
  count = 5,
): MiraVoicePhrase[] {
  const store = read();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Проект не найден");
  const existing = new Set(
    store.phrases
      .filter((p) => p.project_id === projectId)
      .map((p) => p.text.toLowerCase()),
  );
  const fresh = PHRASE_BANK.filter((t) => !existing.has(t.toLowerCase()));
  const pick = fresh.slice(0, Math.max(1, Math.min(count, fresh.length)));
  const rows: MiraVoicePhrase[] = pick.map((text) => ({
    id: crypto.randomUUID(),
    project_id: projectId,
    text,
    recorded: 0,
    created_at: now(),
  }));
  store.phrases.push(...rows);
  const pIdx = store.projects.findIndex((p) => p.id === projectId);
  if (pIdx >= 0) {
    store.projects[pIdx] = {
      ...store.projects[pIdx],
      status: "phrases",
      recommendation: rows.length
        ? `Запишите/загрузите аудио для ${rows.length} новых фраз.`
        : "Банк фраз исчерпан. Добавьте свою фразу.",
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
  const size = opts.bytes.length;
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

  let voice: MiraCustomVoice | null = null;
  const project = store.projects[pIdx];
  if (accepted) {
    const voiceId =
      project.custom_voice_id ?? `mira-studio-${project.id.slice(0, 8)}`;
    const stamp = now();
    const existing = store.customVoices.find((v) => v.id === voiceId);
    if (existing) {
      existing.name = project.name;
      existing.lang = project.lang;
      existing.preview_path = clip.file_path;
      existing.updated_at = stamp;
      voice = existing;
    } else {
      voice = {
        id: voiceId,
        project_id: project.id,
        name: project.name,
        lang: project.lang,
        preview_path: clip.file_path,
        meta_json: JSON.stringify({ engine: "browser-demo" }),
        created_at: stamp,
        updated_at: stamp,
      };
      store.customVoices.unshift(voice);
    }
    const acceptedCount = store.clips.filter(
      (c) => c.project_id === project.id && c.accepted,
    ).length;
    store.projects[pIdx] = {
      ...project,
      status: acceptedCount < 5 ? "ready_partial" : "ready",
      custom_voice_id: voiceId,
      recommendation:
        acceptedCount < 5
          ? `Голос в каталоге (browser-demo). Добавьте ещё ${5 - acceptedCount} записей.`
          : "Голос готов (browser-demo).",
      updated_at: stamp,
    };
  } else {
    store.projects[pIdx] = {
      ...project,
      status: "needs_data",
      recommendation: "Клип слишком короткий. Запишите длиннее.",
      updated_at: now(),
    };
  }
  write(store);
  return {
    clip,
    processed: {
      project: store.projects[pIdx],
      analysis: [],
      voice,
    },
  };
}

export function listLocalCustomVoices(): MiraCustomVoice[] {
  return read().customVoices;
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
