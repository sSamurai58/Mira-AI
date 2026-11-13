import fs from "node:fs";
import path from "node:path";
import { dataRoot, seedRoot } from "./appPaths";

export type FrontMatter = Record<string, string | boolean | string[]>;

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

export function loadMarkdownCatalog(
  kind: "skills" | "protocols",
): CatalogItem[] {
  const dir = ensureSeededCatalog(kind);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const items: CatalogItem[] = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const { meta, body } = parseFrontMatter(raw);
    const id =
      String(meta.id ?? file.replace(/\.md$/i, "")).trim() ||
      file.replace(/\.md$/i, "");
    let updatedAt = new Date(0).toISOString();
    try {
      updatedAt = fs.statSync(filePath).mtime.toISOString();
    } catch {
      /* ignore */
    }
    items.push({
      id,
      name: String(meta.name ?? id),
      description: String(meta.description ?? ""),
      triggers: asStringArray(meta.triggers).map((t) => t.toLowerCase()),
      tags: asStringArray(meta.tags).map((t) => t.toLowerCase()),
      enabled: meta.enabled !== false,
      body,
      filePath,
      relativePath: path.join("data", kind, file),
      updatedAt,
    });
  }
  return items;
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
  },
): CatalogItem {
  const dir = ensureSeededCatalog(kind);
  const safeId = item.id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!safeId) throw new Error("id скилла/протокола пустой");
  const file = `${safeId}.md`;
  const filePath = path.join(dir, file);
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
  fs.writeFileSync(filePath, raw, "utf8");
  return loadMarkdownCatalog(kind).find((x) => x.id === safeId)!;
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
  });
}

/** Delete a catalog markdown file by id. */
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
    if (fs.existsSync(found.filePath)) {
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
