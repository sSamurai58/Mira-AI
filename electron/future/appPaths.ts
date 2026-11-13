/**
 * Workshop «Пути»: launch programs / folders / files by voice tags.
 * Persisted in SQLite; autodiscovery probes common Windows (and mac/linux) installs.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openStore } from "../store";

export type AppPathKind = "program" | "folder" | "file";

export type AppPathRow = {
  id: string;
  kind: AppPathKind;
  name: string;
  path: string;
  tags: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type AppPathDbRow = {
  id: string;
  kind: string;
  name: string;
  path: string;
  tags_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

type KnownApp = {
  id: string;
  name: string;
  tags: string[];
  /** Relative to Program Files / LocalAppData / etc. */
  winExes?: string[];
  /** Absolute-ish candidates under home / Applications */
  macApps?: string[];
  linuxBins?: string[];
};

const KNOWN_APPS: KnownApp[] = [
  {
    id: "telegram",
    name: "Telegram",
    tags: ["открой telegram", "телеграм", "telegram"],
    winExes: [
      "Telegram Desktop\\Telegram.exe",
      "Telegram\\Telegram.exe",
    ],
    macApps: ["Telegram.app"],
    linuxBins: ["telegram-desktop", "telegram"],
  },
  {
    id: "discord",
    name: "Discord",
    tags: ["открой discord", "дискорд", "discord"],
    winExes: ["Discord\\Update.exe", "Discord\\Discord.exe"],
    macApps: ["Discord.app"],
    linuxBins: ["discord"],
  },
  {
    id: "steam",
    name: "Steam",
    tags: ["открой steam", "стим", "steam"],
    winExes: ["Steam\\steam.exe"],
    macApps: ["Steam.app"],
    linuxBins: ["steam"],
  },
  {
    id: "vscode",
    name: "VS Code",
    tags: ["открой vs code", "визуал студио", "vs code", "vscode"],
    winExes: [
      "Microsoft VS Code\\Code.exe",
      "Microsoft VS Code Insiders\\Code - Insiders.exe",
    ],
    macApps: ["Visual Studio Code.app"],
    linuxBins: ["code", "code-insiders"],
  },
  {
    id: "chrome",
    name: "Chrome",
    tags: ["открой chrome", "хром", "google chrome"],
    winExes: ["Google\\Chrome\\Application\\chrome.exe"],
    macApps: ["Google Chrome.app"],
    linuxBins: ["google-chrome-stable", "google-chrome", "chrome"],
  },
  {
    id: "edge",
    name: "Edge",
    tags: ["открой edge", "эдж", "microsoft edge"],
    winExes: ["Microsoft\\Edge\\Application\\msedge.exe"],
    macApps: ["Microsoft Edge.app"],
    linuxBins: ["microsoft-edge", "microsoft-edge-stable"],
  },
  {
    id: "firefox",
    name: "Firefox",
    tags: ["открой firefox", "файрфокс", "firefox"],
    winExes: ["Mozilla Firefox\\firefox.exe"],
    macApps: ["Firefox.app"],
    linuxBins: ["firefox", "firefox-esr"],
  },
  {
    id: "notepad",
    name: "Блокнот",
    tags: ["открой блокнот", "notepad", "блокнот"],
    winExes: ["Windows NT\\Accessories\\notepad.exe", "notepad.exe"],
    linuxBins: ["gedit", "kate", "mousepad", "xed"],
  },
  {
    id: "explorer",
    name: "Проводник",
    tags: ["открой проводник", "explorer", "файловый менеджер"],
    winExes: ["explorer.exe"],
    macApps: ["Finder.app"],
    linuxBins: ["nautilus", "dolphin", "thunar", "nemo"],
  },
  {
    id: "spotify",
    name: "Spotify",
    tags: ["открой spotify", "спотифай", "spotify"],
    winExes: ["Spotify\\Spotify.exe"],
    macApps: ["Spotify.app"],
    linuxBins: ["spotify"],
  },
  {
    id: "slack",
    name: "Slack",
    tags: ["открой slack", "слак", "slack"],
    winExes: ["slack\\slack.exe"],
    macApps: ["Slack.app"],
    linuxBins: ["slack"],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    tags: ["открой whatsapp", "ватсап", "whatsapp"],
    winExes: ["WhatsApp\\WhatsApp.exe"],
    macApps: ["WhatsApp.app"],
    linuxBins: ["whatsapp-for-linux", "whatsapp"],
  },
  {
    id: "obsidian",
    name: "Obsidian",
    tags: ["открой obsidian", "обсидиан", "obsidian"],
    winExes: ["Obsidian\\Obsidian.exe"],
    macApps: ["Obsidian.app"],
    linuxBins: ["obsidian"],
  },
  {
    id: "notion",
    name: "Notion",
    tags: ["открой notion", "ноушн", "notion"],
    winExes: ["Notion\\Notion.exe"],
    macApps: ["Notion.app"],
    linuxBins: ["notion-app", "notion"],
  },
  {
    id: "zoom",
    name: "Zoom",
    tags: ["открой zoom", "зум", "zoom"],
    winExes: ["Zoom\\bin\\Zoom.exe"],
    macApps: ["zoom.us.app"],
    linuxBins: ["zoom"],
  },
  {
    id: "vlc",
    name: "VLC",
    tags: ["открой vlc", "vlc"],
    winExes: ["VideoLAN\\VLC\\vlc.exe"],
    macApps: ["VLC.app"],
    linuxBins: ["vlc"],
  },
  {
    id: "photoshop",
    name: "Photoshop",
    tags: ["открой photoshop", "фотошоп", "photoshop"],
    winExes: [
      "Adobe\\Adobe Photoshop 2024\\Photoshop.exe",
      "Adobe\\Adobe Photoshop 2025\\Photoshop.exe",
    ],
    macApps: ["Adobe Photoshop 2024.app", "Adobe Photoshop 2025.app"],
  },
  {
    id: "word",
    name: "Word",
    tags: ["открой word", "ворд", "microsoft word"],
    winExes: ["Microsoft Office\\root\\Office16\\WINWORD.EXE"],
    macApps: ["Microsoft Word.app"],
    linuxBins: ["libreoffice", "soffice"],
  },
  {
    id: "excel",
    name: "Excel",
    tags: ["открой excel", "эксель", "microsoft excel"],
    winExes: ["Microsoft Office\\root\\Office16\\EXCEL.EXE"],
    macApps: ["Microsoft Excel.app"],
  },
  {
    id: "calculator",
    name: "Калькулятор",
    tags: ["открой калькулятор", "калькулятор", "calculator"],
    winExes: ["WindowsApps\\Microsoft.WindowsCalculator_*"],
    linuxBins: ["gnome-calculator", "kcalc", "galculator"],
    macApps: ["Calculator.app"],
  },
];

function ensureAppPathsTable(): void {
  const store = openStore();
  store.exec(`
    CREATE TABLE IF NOT EXISTS app_paths (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_app_paths_kind ON app_paths(kind);
  `);
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => String(t ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeKind(kind: string): AppPathKind {
  if (kind === "folder" || kind === "file" || kind === "program") return kind;
  return "program";
}

function rowFromDb(row: AppPathDbRow): AppPathRow {
  return {
    id: row.id,
    kind: normalizeKind(row.kind),
    name: row.name,
    path: row.path ?? "",
    tags: parseTags(row.tags_json),
    enabled: row.enabled !== 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function whichBin(bin: string): string | null {
  try {
    const res = spawnSync("which", [bin], { encoding: "utf8" });
    const out = (res.stdout || "").trim().split("\n")[0]?.trim();
    if (res.status === 0 && out && fs.existsSync(out)) return out;
  } catch {
    /* ignore */
  }
  return null;
}

function resolveWinExe(rel: string): string | null {
  if (rel.includes("*")) {
    // Wildcard WindowsApps — skip fragile resolve
    return null;
  }
  if (rel === "notepad.exe" || rel === "explorer.exe") {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    const candidates =
      rel === "explorer.exe"
        ? [path.join(systemRoot, "explorer.exe")]
        : [
            path.join(systemRoot, "System32", "notepad.exe"),
            path.join(systemRoot, "notepad.exe"),
          ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }
  const roots = [
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
    process.env.LOCALAPPDATA,
  ].filter(Boolean) as string[];
  for (const root of roots) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function resolveMacApp(appName: string): string | null {
  const candidates = [
    path.join("/Applications", appName),
    path.join(os.homedir(), "Applications", appName),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function probeKnownApp(spec: KnownApp): string | null {
  const platform = process.platform;
  if (platform === "win32") {
    for (const rel of spec.winExes ?? []) {
      const found = resolveWinExe(rel);
      if (found) {
        // Discord: Update.exe needs --processStart Discord.exe
        if (/\\Update\.exe$/i.test(found)) {
          const discordExe = path.join(path.dirname(found), "Discord.exe");
          if (fs.existsSync(discordExe)) return discordExe;
        }
        return found;
      }
    }
    return null;
  }
  if (platform === "darwin") {
    for (const app of spec.macApps ?? []) {
      const found = resolveMacApp(app);
      if (found) return found;
    }
    return null;
  }
  for (const bin of spec.linuxBins ?? []) {
    const found = whichBin(bin);
    if (found) return found;
  }
  return null;
}

function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Seed known apps (path may be empty) once; never overwrite user edits. */
export function ensureDefaultAppPaths(): void {
  ensureAppPathsTable();
  const store = openStore();
  const count = (
    store.prepare(`SELECT COUNT(*) AS c FROM app_paths`).get() as { c: number }
  ).c;
  if (count > 0) return;
  const now = new Date().toISOString();
  const insert = store.prepare(
    `INSERT INTO app_paths (id, kind, name, path, tags_json, enabled, created_at, updated_at)
     VALUES (?, 'program', ?, ?, ?, 1, ?, ?)`,
  );
  for (const app of KNOWN_APPS) {
    const found = probeKnownApp(app) ?? "";
    insert.run(
      app.id,
      app.name,
      found,
      JSON.stringify(app.tags),
      now,
      now,
    );
  }
}

export function listAppPaths(): AppPathRow[] {
  ensureDefaultAppPaths();
  const rows = openStore()
    .prepare(
      `SELECT id, kind, name, path, tags_json, enabled, created_at, updated_at
       FROM app_paths ORDER BY name COLLATE NOCASE ASC`,
    )
    .all() as AppPathDbRow[];
  return rows.map(rowFromDb);
}

export function getAppPath(id: string): AppPathRow | null {
  ensureAppPathsTable();
  const row = openStore()
    .prepare(
      `SELECT id, kind, name, path, tags_json, enabled, created_at, updated_at
       FROM app_paths WHERE id = ?`,
    )
    .get(id) as AppPathDbRow | undefined;
  return row ? rowFromDb(row) : null;
}

export function upsertAppPath(input: {
  id?: string;
  kind: AppPathKind;
  name: string;
  path?: string;
  tags?: string[];
  enabled?: boolean;
}): AppPathRow {
  ensureAppPathsTable();
  const now = new Date().toISOString();
  const id = (input.id?.trim() || crypto.randomUUID()).slice(0, 80);
  const kind = normalizeKind(input.kind);
  const name = input.name.trim() || "Путь";
  const filePath = (input.path ?? "").trim();
  const tags = (input.tags ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  const enabled = input.enabled !== false ? 1 : 0;
  const store = openStore();
  const existing = store
    .prepare(`SELECT id FROM app_paths WHERE id = ?`)
    .get(id) as { id: string } | undefined;
  if (existing) {
    store
      .prepare(
        `UPDATE app_paths SET kind = ?, name = ?, path = ?, tags_json = ?, enabled = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(kind, name, filePath, JSON.stringify(tags), enabled, now, id);
  } else {
    store
      .prepare(
        `INSERT INTO app_paths (id, kind, name, path, tags_json, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, kind, name, filePath, JSON.stringify(tags), enabled, now, now);
  }
  return getAppPath(id)!;
}

export function deleteAppPath(id: string): { ok: boolean } {
  ensureAppPathsTable();
  openStore().prepare(`DELETE FROM app_paths WHERE id = ?`).run(id);
  return { ok: true };
}

export function setAppPathEnabled(
  id: string,
  enabled: boolean,
): AppPathRow | null {
  ensureAppPathsTable();
  const now = new Date().toISOString();
  openStore()
    .prepare(`UPDATE app_paths SET enabled = ?, updated_at = ? WHERE id = ?`)
    .run(enabled ? 1 : 0, now, id);
  return getAppPath(id);
}

/**
 * Probe common installs; fill empty paths and add missing known apps.
 * Does not overwrite a non-empty user path.
 */
export function autodiscoverAppPaths(): {
  scanned: number;
  updated: number;
  created: number;
  paths: AppPathRow[];
} {
  ensureDefaultAppPaths();
  const store = openStore();
  let updated = 0;
  let created = 0;
  const now = new Date().toISOString();

  for (const app of KNOWN_APPS) {
    const found = probeKnownApp(app);
    const existing = store
      .prepare(
        `SELECT id, path, tags_json FROM app_paths WHERE id = ?`,
      )
      .get(app.id) as
      | { id: string; path: string; tags_json: string }
      | undefined;

    if (!existing) {
      store
        .prepare(
          `INSERT INTO app_paths (id, kind, name, path, tags_json, enabled, created_at, updated_at)
           VALUES (?, 'program', ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          app.id,
          app.name,
          found ?? "",
          JSON.stringify(app.tags),
          now,
          now,
        );
      created += 1;
      continue;
    }

    if (found && !(existing.path || "").trim()) {
      store
        .prepare(
          `UPDATE app_paths SET path = ?, updated_at = ? WHERE id = ?`,
        )
        .run(found, now, app.id);
      updated += 1;
    }
  }

  return {
    scanned: KNOWN_APPS.length,
    updated,
    created,
    paths: listAppPaths(),
  };
}

function isElectronRuntime(): boolean {
  return typeof process.versions.electron === "string";
}

export async function openAppPathById(id: string): Promise<{
  ok: boolean;
  detail: string;
  path?: AppPathRow;
}> {
  const row = getAppPath(id);
  if (!row) return { ok: false, detail: "Путь не найден" };
  return openAppPathRow(row);
}

/** Open an arbitrary path (program / folder / file) without an app_paths row. */
export async function openPathTarget(target: string): Promise<{
  ok: boolean;
  detail: string;
}> {
  const trimmed = target.trim();
  if (!trimmed) {
    return { ok: false, detail: "Путь не задан" };
  }
  let kind: AppPathKind = "file";
  try {
    if (fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory()) {
      kind = "folder";
    } else if (
      /\.(exe|bat|cmd|lnk|app)$/i.test(trimmed) ||
      (!path.extname(trimmed) && process.platform !== "win32")
    ) {
      kind = "program";
    }
  } catch {
    /* keep file */
  }
  const synthetic: AppPathRow = {
    id: "adhoc",
    kind,
    name: path.basename(trimmed) || trimmed,
    path: trimmed,
    tags: [],
    enabled: true,
    created_at: "",
    updated_at: "",
  };
  const res = await openAppPathRow(synthetic);
  return { ok: res.ok, detail: res.detail };
}

export async function openAppPathRow(row: AppPathRow): Promise<{
  ok: boolean;
  detail: string;
  path?: AppPathRow;
}> {
  const target = (row.path || "").trim();
  if (!target) {
    return {
      ok: false,
      detail: `Путь для «${row.name}» не задан — укажите exe/папку/файл в Мастерская → Пути.`,
      path: row,
    };
  }
  if (!fs.existsSync(target)) {
    return {
      ok: false,
      detail: `Не найдено: ${target}`,
      path: row,
    };
  }

  if (!isElectronRuntime()) {
    return {
      ok: true,
      detail: `Зафиксировано без GUI: ${target}`,
      path: row,
    };
  }

  try {
    if (row.kind === "program" && process.platform === "darwin" && target.endsWith(".app")) {
      spawn("open", ["-a", target], { detached: true, stdio: "ignore" }).unref();
      return { ok: true, detail: `Открыто: ${row.name}`, path: row };
    }
    if (row.kind === "program" && process.platform !== "darwin") {
      // Prefer shell.openPath for .exe / binaries — handles associations
      try {
        const { shell } = await import("electron");
        const err = await shell.openPath(target);
        if (!err) {
          return { ok: true, detail: `Открыто: ${row.name}`, path: row };
        }
      } catch {
        /* fall through to spawn */
      }
      spawn(target, [], { detached: true, stdio: "ignore", shell: false }).unref();
      return { ok: true, detail: `Запущено: ${row.name}`, path: row };
    }
    const { shell } = await import("electron");
    const err = await shell.openPath(target);
    return {
      ok: !err,
      detail: err || `Открыто: ${row.name}`,
      path: row,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      path: row,
    };
  }
}

/** Longest matching enabled tag against user text (tag ⊆ utterance). */
export function matchAppPathByTag(text: string): AppPathRow | null {
  const norm = normalizePhrase(text);
  if (!norm) return null;
  const paths = listAppPaths().filter((p) => p.enabled);
  let best: { row: AppPathRow; len: number } | null = null;
  for (const row of paths) {
    for (const tag of row.tags) {
      const t = normalizePhrase(tag);
      if (!t || t.length < 2) continue;
      // Prefer full tag inside the utterance (voice phrase), not reverse substring.
      if (norm === t || norm.includes(t)) {
        const len = t.length;
        if (!best || len > best.len) best = { row, len };
      }
    }
  }
  return best?.row ?? null;
}

export function looksLikeAppPathIntent(text: string): boolean {
  return matchAppPathByTag(text) !== null;
}

export async function handleAppPathsFromChat(text: string): Promise<{
  used: string;
  block: string;
}> {
  const row = matchAppPathByTag(text);
  if (!row) {
    return {
      used: "paths:none",
      block: "[Пути] Совпадение по фразе не найдено. Настройте теги в Мастерская → Пути.",
    };
  }
  const res = await openAppPathRow(row);
  return {
    used: `paths:open:${row.id}:${res.ok ? "ok" : "fail"}`,
    block: `[Пути] ${res.detail}`,
  };
}

export async function pickAppPathDialog(kind: AppPathKind): Promise<{
  canceled: boolean;
  path: string | null;
}> {
  if (!isElectronRuntime()) {
    return { canceled: true, path: null };
  }
  const { dialog, BrowserWindow } = await import("electron");
  const win = BrowserWindow.getFocusedWindow();
  const folderOpts = {
    properties: ["openDirectory" as const],
    title: "Выберите папку",
  };
  if (kind === "folder") {
    const res = win
      ? await dialog.showOpenDialog(win, folderOpts)
      : await dialog.showOpenDialog(folderOpts);
    return {
      canceled: res.canceled,
      path: res.canceled ? null : res.filePaths[0] ?? null,
    };
  }
  const filters =
    kind === "program"
      ? process.platform === "win32"
        ? [{ name: "Программы", extensions: ["exe", "bat", "cmd", "lnk"] }]
        : process.platform === "darwin"
          ? [{ name: "Приложения", extensions: ["app"] }]
          : [{ name: "Все файлы", extensions: ["*"] }]
      : [{ name: "Все файлы", extensions: ["*"] }];
  const fileOpts = {
    properties: ["openFile" as const],
    filters,
    title: kind === "program" ? "Выберите программу" : "Выберите файл",
  };
  const res = win
    ? await dialog.showOpenDialog(win, fileOpts)
    : await dialog.showOpenDialog(fileOpts);
  return {
    canceled: res.canceled,
    path: res.canceled ? null : res.filePaths[0] ?? null,
  };
}
