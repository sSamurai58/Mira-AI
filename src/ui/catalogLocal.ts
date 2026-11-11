/** Browser-demo catalog when Electron IPC is unavailable. */

const SKILLS_KEY = "mira.local.skills";
const PROTOCOLS_KEY = "mira.local.protocols";

type Draft = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  tags?: string[];
  enabled: boolean;
  body: string;
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
  const row: MiraCatalogItem = {
    id,
    name: draft.name.trim() || id,
    description: draft.description.trim(),
    triggers: draft.triggers.map((t) => t.trim().toLowerCase()).filter(Boolean),
    tags: (draft.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    enabled: draft.enabled,
    body: draft.body,
    filePath: `local://${key}/${id}.md`,
    relativePath: `local/${key}/${id}.md`,
  };
  items.unshift(row);
  write(key, items);
  return row;
}

export function listLocalSkills(): MiraCatalogItem[] {
  return read(SKILLS_KEY);
}

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
