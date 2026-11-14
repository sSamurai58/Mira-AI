/** Normalize catalog folder paths for skills (no SKILL.md segments). */

const JUNK_SEGMENTS = new Set([
  "skill-md",
  "skill.md",
  "skills",
  "data",
]);

export function sanitizeSkillSegment(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Drop skill.md / skills / empty junk from a parent folder path. */
export function sanitizeParentFolder(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .split(/[/\\]+/)
    .map((p) => sanitizeSkillSegment(p))
    .filter((p) => Boolean(p) && !JUNK_SEGMENTS.has(p))
    .join("/");
}

export function skillSavePath(parentFolder: string, id: string): string {
  const parent = sanitizeParentFolder(parentFolder);
  const leaf = sanitizeSkillSegment(id) || "id";
  return parent
    ? `skills/${parent}/${leaf}/SKILL.md`
    : `skills/${leaf}/SKILL.md`;
}

/** Unique folder paths from catalog items (leaf folders + ancestors). */
export function collectSkillFolders(items: MiraCatalogItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const folder = sanitizeParentFolder(item.folder);
    if (!folder) continue;
    const parts = folder.split("/");
    for (let i = 1; i <= parts.length; i++) {
      set.add(parts.slice(0, i).join("/"));
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "en"));
}

export function joinSkillFolder(
  parent: string | undefined,
  name: string,
): string {
  const base = sanitizeParentFolder(parent);
  const leaf = sanitizeSkillSegment(name);
  if (!leaf) return base;
  return base ? `${base}/${leaf}` : leaf;
}
