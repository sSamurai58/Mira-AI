import fs from "node:fs";
import path from "node:path";
import { dataRoot, seedRoot } from "./appPaths";

export type FrontMatter = Record<string, string | boolean | string[]>;

export type CatalogLayout = "file" | "folder";

export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  tags: string[];
  enabled: boolean;
  body: string;
  filePath: string;
  relativePath: string;
  /** File mtime ISO — for sorting in Workshop UI */
  updatedAt: string;
  /** How the skill is stored on disk (skills only). */
  layout: CatalogLayout;
  /** Parent folder under data/skills, e.g. "figma" or "" for root. */
  folder: string;
};

export function resolveDataDir(...parts: string[]): string {
  return dataRoot(...parts);
}

export function resolveSeedDir(...parts: string[]): string {
  return seedRoot(...parts);
}

export function parseFrontMatter(raw: string): {
  meta: FrontMatter;
  body: string;
} {
  if (!raw.startsWith("---")) {
    return { meta: {}, body: raw.trim() };
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: raw.trim() };
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const meta: FrontMatter = {};
  for (const line of fm.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (value === "true" || value === "false") {
      meta[key] = value === "true";
      continue;
    }
    if (value.includes(",") && !value.startsWith("[")) {
      meta[key] = value.split(",").map((s) => s.trim()).filter(Boolean);
      continue;
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body };
}

function asStringArray(value: FrontMatter[string] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function metaStr(meta: FrontMatter, ...keys: string[]): string {
  for (const k of keys) {
    const v = meta[k];
    if (v == null) continue;
    const s = Array.isArray(v) ? v.join(", ") : String(v);
    if (s.trim()) return s.trim();
  }
  return "";
}

function safeSkillId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ensureSeededCatalog(
  kind: "skills" | "protocols",
): string {
  const dest = resolveDataDir(kind);
  fs.mkdirSync(dest, { recursive: true });
  const seed = resolveSeedDir(kind);
  if (!fs.existsSync(seed)) return dest;
  for (const name of fs.readdirSync(seed)) {
    if (!name.endsWith(".md")) continue;
    const target = path.join(dest, name);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(path.join(seed, name), target);
    }
  }
  return dest;
}

/**
 * Skills: top-level `*.md` (legacy) + recursive folder/SKILL.md trees.
 * Protocols: top-level `*.md` only.
 */
function collectCatalogFiles(kind: "skills" | "protocols", root: string): string[] {
  if (kind === "protocols") {
    return fs
      .readdirSync(root)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .map((f) => path.join(root, f))
      .sort();
  }

  const out: string[] = [];
  function walk(dir: string, depth: number) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      const lower = ent.name.toLowerCase();
      if (lower === "skill.md") {
        out.push(full);
      } else if (depth === 0 && lower.endsWith(".md")) {
        out.push(full);
      }
    }
  }
  walk(root, 0);
  return out.sort();
}

function itemFromFile(
  kind: "skills" | "protocols",
  root: string,
  filePath: string,
): CatalogItem | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const { meta, body } = parseFrontMatter(raw);
  const baseName = path.basename(filePath);
  const isSkillMd = baseName.toLowerCase() === "skill.md";
  const layout: CatalogLayout = isSkillMd ? "folder" : "file";
  const parentDir = path.dirname(filePath);
  const folderRel =
    layout === "folder"
      ? path.relative(root, parentDir).split(path.sep).join("/")
      : "";
  const idFromFolder =
    layout === "folder" ? path.basename(parentDir) : baseName.replace(/\.md$/i, "");
  const id =
    safeSkillId(
      metaStr(meta, "id") || idFromFolder,
    ) || idFromFolder;
  if (!id) return null;

  let updatedAt = new Date(0).toISOString();
  try {
    updatedAt = fs.statSync(filePath).mtime.toISOString();
  } catch {
    /* ignore */
  }

  const relFromData = path.relative(dataRoot(), filePath).split(path.sep).join("/");

  return {
    id,
    name: metaStr(meta, "name", "название") || id,
    description: metaStr(meta, "description", "описание"),
    triggers: asStringArray(
      meta.triggers ?? meta["триггеры"] ?? meta.triggers,
    ).map((t) => t.toLowerCase()),
    tags: asStringArray(meta.tags ?? meta["теги"]).map((t) => t.toLowerCase()),
    enabled: meta.enabled !== false,
    body,
    filePath,
    relativePath: relFromData.startsWith("data/")
      ? relFromData
      : path.join("data", kind, path.relative(root, filePath)).split(path.sep).join("/"),
    updatedAt,
    layout,
    folder: folderRel === "." ? "" : folderRel,
  };
}

export function loadMarkdownCatalog(
  kind: "skills" | "protocols",
): CatalogItem[] {
  const dir = ensureSeededCatalog(kind);
  const files = collectCatalogFiles(kind, dir);
  const byId = new Map<string, CatalogItem>();
  for (const filePath of files) {
    const item = itemFromFile(kind, dir, filePath);
    if (!item) continue;
    const prev = byId.get(item.id);
    // Prefer folder/SKILL.md over legacy flat file when both exist.
    if (!prev || (item.layout === "folder" && prev.layout === "file")) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function writeCatalogItem(
  kind: "skills" | "protocols",
  item: {
    id: string;
    name: string;
    description: string;
    triggers: string[];
    tags?: string[];
    enabled: boolean;
    body: string;
    /** Optional catalog folder under data/skills, e.g. "figma". */
    parentFolder?: string;
    /** Force folder/SKILL.md for new skills (default true for skills). */
    asFolder?: boolean;
  },
): CatalogItem {
  const dir = ensureSeededCatalog(kind);
  const safeId = safeSkillId(item.id);
  if (!safeId) throw new Error("id скилла/протокола пустой");

  const existing = loadMarkdownCatalog(kind).find((x) => x.id === safeId);
  let filePath: string;
  if (existing) {
    filePath = existing.filePath;
  } else if (kind === "skills" && item.asFolder !== false) {
    const parent = (item.parentFolder || "")
      .split(/[/\\]+/)
      .map((p) => safeSkillId(p))
      .filter(Boolean);
    const folder = path.join(dir, ...parent, safeId);
    fs.mkdirSync(folder, { recursive: true });
    filePath = path.join(folder, "SKILL.md");
  } else {
    filePath = path.join(dir, `${safeId}.md`);
  }

  const triggers = item.triggers.join(", ");
  const tags = (item.tags ?? []).map((t) => t.trim()).filter(Boolean);
  const tagsLine = tags.length ? `\ntags: ${tags.join(", ")}` : "";
  const raw = `---
id: ${safeId}
name: ${item.name}
description: ${item.description}
triggers: ${triggers}${tagsLine}
enabled: ${item.enabled ? "true" : "false"}
---

${item.body.trim()}
`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, raw, "utf8");
  const loaded = loadMarkdownCatalog(kind).find((x) => x.id === safeId);
  if (!loaded) throw new Error(`Не удалось перечитать ${safeId}`);
  return loaded;
}

export function setCatalogEnabled(
  kind: "skills" | "protocols",
  id: string,
  enabled: boolean,
): CatalogItem | null {
  const items = loadMarkdownCatalog(kind);
  const found = items.find((i) => i.id === id);
  if (!found) return null;
  return writeCatalogItem(kind, {
    id: found.id,
    name: found.name,
    description: found.description,
    triggers: found.triggers,
    tags: found.tags,
    enabled,
    body: found.body,
    // Keep layout: writeCatalogItem uses existing path when id matches.
  });
}

/** Delete a catalog markdown file (or skill folder) by id. */
export function deleteCatalogItem(
  kind: "skills" | "protocols",
  id: string,
): { ok: boolean; detail: string; deletedId: string | null } {
  const items = loadMarkdownCatalog(kind);
  const found = items.find((i) => i.id === id);
  if (!found) {
    return { ok: false, detail: `${kind} «${id}» не найден`, deletedId: null };
  }
  try {
    if (found.layout === "folder") {
      const skillDir = path.dirname(found.filePath);
      // Only remove the skill directory itself (may be nested under a catalog).
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
      }
    } else if (fs.existsSync(found.filePath)) {
      fs.unlinkSync(found.filePath);
    }
    return {
      ok: true,
      detail: `Удалён ${kind === "skills" ? "skill" : "протокол"} «${found.name}» (${found.id})`,
      deletedId: found.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      detail: `Не удалось удалить файл: ${message.slice(0, 120)}`,
      deletedId: null,
    };
  }
}

function writeAsSkillMd(sourceFile: string, destFolderRel: string): string {
  const root = ensureSeededCatalog("skills");
  const destDir = path.join(
    root,
    ...destFolderRel.split(/[/\\]+/).filter(Boolean),
  );
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, "SKILL.md");
  fs.copyFileSync(sourceFile, dest);
  return dest;
}

/**
 * Import a single .md file or a folder tree of SKILL.md into data/skills.
 */
export function importSkillPath(
  sourcePath: string,
  opts?: { catalogName?: string },
): {
  ok: boolean;
  detail: string;
  imported: CatalogItem[];
} {
  const src = path.resolve(sourcePath.trim());
  if (!src || !fs.existsSync(src)) {
    return { ok: false, detail: "Путь не найден", imported: [] };
  }
  const catalog = (opts?.catalogName || "")
    .split(/[/\\]+/)
    .map((p) => safeSkillId(p))
    .filter(Boolean)
    .join("/");
  const importedPaths: string[] = [];

  const st = fs.statSync(src);
  if (st.isFile()) {
    if (!src.toLowerCase().endsWith(".md")) {
      return { ok: false, detail: "Нужен файл .md / SKILL.md", imported: [] };
    }
    const base = path.basename(src);
    const id =
      base.toLowerCase() === "skill.md"
        ? safeSkillId(path.basename(path.dirname(src))) || "imported-skill"
        : safeSkillId(base.replace(/\.md$/i, "")) || "imported-skill";
    const destRel = catalog ? `${catalog}/${id}` : id;
    importedPaths.push(writeAsSkillMd(src, destRel));
  } else if (st.isDirectory()) {
    const skillFiles: string[] = [];
    const looseTopMd: string[] = [];
    function walk(dir: string) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
          continue;
        }
        if (!ent.isFile()) continue;
        const lower = ent.name.toLowerCase();
        if (lower === "skill.md") skillFiles.push(full);
        else if (lower.endsWith(".md") && dir === src) looseTopMd.push(full);
      }
    }
    walk(src);
    if (!skillFiles.length && !looseTopMd.length) {
      return {
        ok: false,
        detail: "В папке нет SKILL.md (и нет .md в корне)",
        imported: [],
      };
    }
    // Preserve tree: blender-3d/SKILL.md + blender-3d/animation/SKILL.md
    // → data/skills/blender-3d/... (or under opts.catalogName).
    const catalogRoot =
      catalog || safeSkillId(path.basename(src)) || "imported";
    for (const file of skillFiles) {
      const relDir = path.relative(src, path.dirname(file));
      const parts = [catalogRoot];
      if (relDir && relDir !== ".") {
        parts.push(...relDir.split(path.sep).filter(Boolean));
      }
      // Root SKILL.md → catalogRoot/SKILL.md (no extra leaf folder).
      importedPaths.push(writeAsSkillMd(file, parts.join("/")));
    }
    for (const file of looseTopMd) {
      const id = safeSkillId(path.basename(file).replace(/\.md$/i, ""));
      importedPaths.push(writeAsSkillMd(file, `${catalogRoot}/${id}`));
    }
  } else {
    return { ok: false, detail: "Не файл и не папка", imported: [] };
  }

  const all = loadMarkdownCatalog("skills");
  const imported = all.filter((item) =>
    importedPaths.some(
      (p) => path.resolve(p) === path.resolve(item.filePath),
    ),
  );
  return {
    ok: imported.length > 0,
    detail:
      imported.length > 0
        ? `Импортировано: ${imported.map((i) => i.id).join(", ")}`
        : "Импорт не дал новых скиллов (проверьте SKILL.md)",
    imported,
  };
}

export function matchByTriggers(
  text: string,
  items: CatalogItem[],
): CatalogItem[] {
  const lower = text.toLowerCase();
  return items.filter((item) => {
    if (!item.enabled) return false;
    return item.triggers.some((t) => t && lower.includes(t));
  });
}

export function matchExplicitSkillCommand(text: string): string | null {
  const m =
    text.match(/(?:включи|активируй|use)\s+skill\s+([a-z0-9_-]+)/i) ||
    text.match(/skill\s*:\s*([a-z0-9_-]+)/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export function matchExplicitProtocolCommand(text: string): string | null {
  const m =
    text.match(/(?:запусти|выполни|run)\s+протокол\s+([a-z0-9_-]+)/i) ||
    text.match(/протокол\s*:\s*([a-z0-9_-]+)/i) ||
    text.match(/\/([a-z0-9_-]+)/i);
  return m?.[1]?.toLowerCase() ?? null;
}
