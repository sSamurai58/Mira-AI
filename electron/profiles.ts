import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config";

export type MiraProfile = {
  id: string;
  name: string;
  voiceId: string | null;
  llmProvider: string | null;
  llmModel: string | null;
  locale: "ru" | "en";
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type ProfilesFile = {
  activeId: string;
  profiles: MiraProfile[];
};

function profilesPath(): string {
  const dir = path.resolve(process.cwd(), "data", "profiles");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "profiles.json");
}

function defaultProfiles(): ProfilesFile {
  const now = new Date().toISOString();
  const cfg = loadConfig();
  const id = cfg.activeProfileId || "local";
  return {
    activeId: id,
    profiles: [
      {
        id,
        name: "Локальный",
        voiceId: null,
        llmProvider: null,
        llmModel: null,
        locale: "ru",
        notes: "Профиль по умолчанию. API-ключи только через .env / OS keychain — не в git.",
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function readFile(): ProfilesFile {
  const file = profilesPath();
  if (!fs.existsSync(file)) {
    const seed = defaultProfiles();
    fs.writeFileSync(file, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ProfilesFile;
    if (!parsed.profiles?.length) return defaultProfiles();
    return parsed;
  } catch {
    return defaultProfiles();
  }
}

function writeFile(data: ProfilesFile): void {
  fs.writeFileSync(profilesPath(), JSON.stringify(data, null, 2), "utf8");
}

export function listProfiles(): MiraProfile[] {
  return readFile().profiles;
}

export function getActiveProfile(): MiraProfile {
  const data = readFile();
  return (
    data.profiles.find((p) => p.id === data.activeId) ?? data.profiles[0]
  );
}

export function setActiveProfile(id: string): MiraProfile {
  const data = readFile();
  const found = data.profiles.find((p) => p.id === id);
  if (!found) throw new Error(`Профиль не найден: ${id}`);
  data.activeId = id;
  writeFile(data);
  process.env.MIRA_PROFILE_ID = id;
  return found;
}

export function upsertProfile(input: {
  id?: string;
  name: string;
  voiceId?: string | null;
  llmProvider?: string | null;
  llmModel?: string | null;
  locale?: "ru" | "en";
  notes?: string;
}): MiraProfile {
  const data = readFile();
  const now = new Date().toISOString();
  const id = input.id?.trim() || crypto.randomUUID();
  const existing = data.profiles.find((p) => p.id === id);
  const row: MiraProfile = {
    id,
    name: input.name.trim() || "Профиль",
    voiceId: input.voiceId ?? existing?.voiceId ?? null,
    llmProvider: input.llmProvider ?? existing?.llmProvider ?? null,
    llmModel: input.llmModel ?? existing?.llmModel ?? null,
    locale: input.locale ?? existing?.locale ?? "ru",
    notes: input.notes ?? existing?.notes ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (existing) {
    Object.assign(existing, row);
  } else {
    data.profiles.push(row);
  }
  writeFile(data);
  return row;
}

export function deleteProfile(id: string): { ok: boolean; detail: string } {
  const data = readFile();
  if (data.profiles.length <= 1) {
    return { ok: false, detail: "Нельзя удалить последний профиль" };
  }
  if (data.activeId === id) {
    return { ok: false, detail: "Сначала переключитесь на другой профиль" };
  }
  const next = data.profiles.filter((p) => p.id !== id);
  if (next.length === data.profiles.length) {
    return { ok: false, detail: "Профиль не найден" };
  }
  data.profiles = next;
  writeFile(data);
  return { ok: true, detail: `Удалён ${id}` };
}

export function getProfilesSnapshot() {
  const data = readFile();
  return {
    activeId: data.activeId,
    profiles: data.profiles,
    path: profilesPath(),
    secretsNote:
      "Ключи API не хранятся в профиле — только id провайдера/модели. Секреты: .env",
  };
}
