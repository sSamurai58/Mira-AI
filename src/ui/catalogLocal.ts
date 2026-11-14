/** Browser-demo catalog when Electron IPC is unavailable. */

import {
  collectSkillFolders,
  joinSkillFolder,
  sanitizeParentFolder,
  sanitizeSkillSegment,
} from "./skillPaths";

const SKILLS_KEY = "mira.local.skills";
const FOLDERS_KEY = "mira.local.skill-folders";
const PROTOCOLS_KEY = "mira.local.protocols";

type Draft = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  tags?: string[];
  enabled: boolean;
  body: string;
  parentFolder?: string;
  asFolder?: boolean;
};

function read(key: string): MiraCatalogItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MiraCatalogItem[];
    return parsed.map((item) => ({
      ...item,
      tags: item.tags ?? [],
      triggers: item.triggers ?? [],
    }));
  } catch {
    return [];
  }
}

function write(key: string, items: MiraCatalogItem[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

function upsert(key: string, draft: Draft): MiraCatalogItem {
  const id = draft.id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!id) throw new Error("id пустой");
  const items = read(key).filter((x) => x.id !== id);
  const parent = sanitizeParentFolder(draft.parentFolder);
  const asFolder = draft.asFolder !== false && key === SKILLS_KEY;
  const folder = asFolder ? (parent ? `${parent}/${id}` : id) : "";
  const rel = asFolder
    ? `local/${key}/${folder}/SKILL.md`
    : `local/${key}/${id}.md`;
  const row: MiraCatalogItem = {
    id,
    name: draft.name.trim() || id,
    description: draft.description.trim(),
    triggers: draft.triggers.map((t) => t.trim().toLowerCase()).filter(Boolean),
    tags: (draft.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    enabled: draft.enabled,
    body: draft.body,
    filePath: `local://${rel}`,
    relativePath: rel,
    updatedAt: new Date().toISOString(),
    layout: asFolder ? "folder" : "file",
    folder,
  };
  items.unshift(row);
  write(key, items);
  return row;
}

export function deleteLocalSkill(id: string): {
  ok: boolean;
  detail: string;
  deletedId: string | null;
} {
  const items = read(SKILLS_KEY);
  const found = items.find((i) => i.id === id);
  if (!found) {
    return { ok: false, detail: `Skill «${id}» не найден`, deletedId: null };
  }
  write(
    SKILLS_KEY,
    items.filter((i) => i.id !== id),
  );
  return {
    ok: true,
    detail: `Удалён skill «${found.name}»`,
    deletedId: found.id,
  };
}

export function deleteLocalProtocol(id: string): {
  ok: boolean;
  detail: string;
  deletedId: string | null;
} {
  const items = read(PROTOCOLS_KEY);
  const found = items.find((i) => i.id === id);
  if (!found) {
    return { ok: false, detail: `Протокол «${id}» не найден`, deletedId: null };
  }
  write(
    PROTOCOLS_KEY,
    items.filter((i) => i.id !== id),
  );
  return {
    ok: true,
    detail: `Удалён протокол «${found.name}»`,
    deletedId: found.id,
  };
}

export function listLocalSkills(): MiraCatalogItem[] {
  return read(SKILLS_KEY);
}

export function listLocalSkillFolders(): string[] {
  const fromItems = collectSkillFolders(read(SKILLS_KEY));
  let extra: string[] = [];
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (raw) {
      extra = (JSON.parse(raw) as string[])
        .map((f) => sanitizeParentFolder(f))
        .filter(Boolean);
    }
  } catch {
    extra = [];
  }
  return [...new Set([...fromItems, ...extra])].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
}

export function createLocalSkillFolder(folderPath: string): {
  ok: boolean;
  detail: string;
  folder: string | null;
} {
  const cleaned = sanitizeParentFolder(folderPath);
  if (!cleaned) {
    return { ok: false, detail: "Укажите id папки", folder: null };
  }
  const next = [...listLocalSkillFolders(), cleaned];
  localStorage.setItem(
    FOLDERS_KEY,
    JSON.stringify([...new Set(next)].sort((a, b) => a.localeCompare(b, "en"))),
  );
  return { ok: true, detail: `Папка skills/${cleaned}`, folder: cleaned };
}

export function joinLocalSkillFolder(
  parent: string | undefined,
  name: string,
): string {
  return joinSkillFolder(parent, name);
}

export { sanitizeSkillSegment };

export function listLocalProtocols(): MiraCatalogItem[] {
  return read(PROTOCOLS_KEY);
}

export function saveLocalSkill(draft: Draft): MiraCatalogItem {
  return upsert(SKILLS_KEY, draft);
}

export function saveLocalProtocol(draft: Draft): MiraCatalogItem {
  return upsert(PROTOCOLS_KEY, draft);
}

export function setLocalSkillEnabled(
  id: string,
  enabled: boolean,
): MiraCatalogItem | null {
  const items = read(SKILLS_KEY);
  const found = items.find((i) => i.id === id);
  if (!found) return null;
  found.enabled = enabled;
  write(SKILLS_KEY, items);
  return found;
}

export function setLocalProtocolEnabled(
  id: string,
  enabled: boolean,
): MiraCatalogItem | null {
  const items = read(PROTOCOLS_KEY);
  const found = items.find((i) => i.id === id);
  if (!found) return null;
  found.enabled = enabled;
  write(PROTOCOLS_KEY, items);
  return found;
}
