/**
 * Browser-demo fallback for Мастерская → Пути (localStorage).
 * Electron uses SQLite via window.mira.*AppPath*.
 */

export type AppPathKind = "program" | "folder" | "file";

export type AppPathItem = {
  id: string;
  kind: AppPathKind;
  name: string;
  path: string;
  tags: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
  /** OS-extracted icon (data URL) when available from Electron */
  iconDataUrl?: string | null;
};

const STORAGE_KEY = "mira.appPaths.v1";

const DEFAULTS: Array<Omit<AppPathItem, "created_at" | "updated_at" | "enabled" | "path"> & { path?: string }> = [
  { id: "telegram", kind: "program", name: "Telegram", tags: ["открой telegram", "телеграм"] },
  { id: "discord", kind: "program", name: "Discord", tags: ["открой discord", "дискорд"] },
  { id: "steam", kind: "program", name: "Steam", tags: ["открой steam", "стим"] },
  { id: "vscode", kind: "program", name: "VS Code", tags: ["открой vs code", "визуал студио"] },
  { id: "chrome", kind: "program", name: "Chrome", tags: ["открой chrome", "хром"] },
  { id: "edge", kind: "program", name: "Edge", tags: ["открой edge", "эдж"] },
  { id: "firefox", kind: "program", name: "Firefox", tags: ["открой firefox", "файрфокс"] },
  { id: "spotify", kind: "program", name: "Spotify", tags: ["открой spotify", "спотифай"] },
  { id: "slack", kind: "program", name: "Slack", tags: ["открой slack", "слак"] },
  { id: "whatsapp", kind: "program", name: "WhatsApp", tags: ["открой whatsapp", "ватсап"] },
  { id: "obsidian", kind: "program", name: "Obsidian", tags: ["открой obsidian", "обсидиан"] },
  { id: "notion", kind: "program", name: "Notion", tags: ["открой notion", "ноушн"] },
  { id: "zoom", kind: "program", name: "Zoom", tags: ["открой zoom", "зум"] },
  { id: "vlc", kind: "program", name: "VLC", tags: ["открой vlc", "vlc"] },
  { id: "notepad", kind: "program", name: "Блокнот", tags: ["открой блокнот", "notepad"] },
  { id: "explorer", kind: "program", name: "Проводник", tags: ["открой проводник", "explorer"] },
  { id: "word", kind: "program", name: "Word", tags: ["открой word", "ворд"] },
  { id: "excel", kind: "program", name: "Excel", tags: ["открой excel", "эксель"] },
  { id: "photoshop", kind: "program", name: "Photoshop", tags: ["открой photoshop", "фотошоп"] },
  { id: "calculator", kind: "program", name: "Калькулятор", tags: ["открой калькулятор", "калькулятор"] },
];

function nowIso(): string {
  return new Date().toISOString();
}

function readAll(): AppPathItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppPathItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: AppPathItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function listLocalAppPaths(): AppPathItem[] {
  let items = readAll();
  if (items.length === 0) {
    const ts = nowIso();
    items = DEFAULTS.map((d) => ({
      id: d.id,
      kind: d.kind,
      name: d.name,
      path: d.path ?? "",
      tags: d.tags,
      enabled: true,
      created_at: ts,
      updated_at: ts,
    }));
    writeAll(items);
  }
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function upsertLocalAppPath(input: {
  id?: string;
  kind: AppPathKind;
  name: string;
  path?: string;
  tags?: string[];
  enabled?: boolean;
}): AppPathItem {
  const items = listLocalAppPaths();
  const ts = nowIso();
  const id = (input.id?.trim() || crypto.randomUUID()).slice(0, 80);
  const idx = items.findIndex((i) => i.id === id);
  const next: AppPathItem = {
    id,
    kind: input.kind,
    name: input.name.trim() || "Путь",
    path: (input.path ?? "").trim(),
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    enabled: input.enabled !== false,
    created_at: idx >= 0 ? items[idx].created_at : ts,
    updated_at: ts,
  };
  if (idx >= 0) items[idx] = next;
  else items.push(next);
  writeAll(items);
  return next;
}

export function deleteLocalAppPath(id: string): { ok: boolean } {
  writeAll(listLocalAppPaths().filter((i) => i.id !== id));
  return { ok: true };
}

export function setLocalAppPathEnabled(
  id: string,
  enabled: boolean,
): AppPathItem | null {
  const items = listLocalAppPaths();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  items[idx] = { ...items[idx], enabled, updated_at: nowIso() };
  writeAll(items);
  return items[idx];
}

export function autodiscoverLocalAppPaths(): {
  scanned: number;
  updated: number;
  created: number;
  paths: AppPathItem[];
} {
  const before = new Set(listLocalAppPaths().map((p) => p.id));
  let created = 0;
  for (const d of DEFAULTS) {
    if (!before.has(d.id)) {
      upsertLocalAppPath({
        id: d.id,
        kind: d.kind,
        name: d.name,
        path: "",
        tags: d.tags,
        enabled: true,
      });
      created += 1;
    }
  }
  return {
    scanned: DEFAULTS.length,
    updated: 0,
    created,
    paths: listLocalAppPaths(),
  };
}
