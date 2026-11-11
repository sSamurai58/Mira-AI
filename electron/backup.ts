import fs from "node:fs";
import path from "node:path";
import { requestUserConfirm } from "./confirmBridge";
import {
  closeStore,
  ensureBootstrapSession,
  getDatabasePath,
  getStoreHealth,
  openStore,
} from "./store";
import { appendAppLog } from "./logging";

export const BACKUP_FORMAT = "mira-backup-v1";

export type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  includeSecrets: boolean;
  parts: string[];
  dbFile: string;
  note: string;
};

export type ForgetScope =
  | "memory"
  | "learned"
  | "library"
  | "voice-studio"
  | "all";

function dataRoot(...parts: string[]): string {
  return path.resolve(process.cwd(), "data", ...parts);
}

function backupsRoot(...parts: string[]): string {
  const dir = dataRoot("backups", ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function assertUnderData(absPath: string): void {
  const root = dataRoot();
  const resolved = path.resolve(absPath);
  if (!(resolved === root || resolved.startsWith(root + path.sep))) {
    throw new Error("Backup/import только внутри data/");
  }
}

function copyFileSafe(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src: string, dest: string): number {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(from, to);
    } else if (entry.isFile()) {
      copyFileSafe(from, to);
      count += 1;
    }
  }
  return count;
}

function rmDirContents(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      n += rmDirContents(p);
      fs.rmSync(p, { recursive: true, force: true });
    } else {
      fs.unlinkSync(p);
      n += 1;
    }
  }
  return n;
}

function listBackupPackages(): string[] {
  const root = backupsRoot();
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(root, d.name))
    .filter((p) => fs.existsSync(path.join(p, "manifest.json")))
    .sort()
    .reverse();
}

export function getBackupStatus() {
  const health = getStoreHealth();
  return {
    databasePath: "<local-sqlite>",
    libraryDir: "mira/library",
    voiceStudioDir: "data/voice-studio",
    backupsDir: "data/backups",
    packages: listBackupPackages().map((p) => path.basename(p)),
    health: {
      sessions: health.sessions,
      utterances: health.utterances,
      libraryItems: health.libraryItems,
      learnedUnits: health.learnedUnits,
    },
  };
}

export async function exportBackup(opts?: {
  includeSecrets?: boolean;
}): Promise<{
  ok: boolean;
  packagePath: string;
  manifest: BackupManifest;
  detail: string;
}> {
  const includeSecrets = Boolean(opts?.includeSecrets);
  if (includeSecrets) {
    const ok = await requestUserConfirm({
      actionClass: "backup",
      risk: "high",
      title: "Экспорт с секретами",
      body: "В пакет попадёт копия .env (API-ключи). Продолжить?",
      confirmLabel: "Включить секреты",
    });
    if (!ok) {
      throw new Error("Экспорт с секретами отклонён");
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const packagePath = backupsRoot(`mira-backup-${stamp}`);
  const parts: string[] = [];

  // Snapshot DB safely: checkpoint WAL into main file, then copy.
  try {
    const live = openStore();
    live.exec(`PRAGMA wal_checkpoint(TRUNCATE);`);
  } catch {
    // continue with best-effort copy
  }
  closeStore();
  try {
    const dbPath = getDatabasePath();
    if (fs.existsSync(dbPath)) {
      copyFileSafe(dbPath, path.join(packagePath, "mira.db"));
      parts.push("mira.db");
    }
    const libCount = copyDirRecursive(
      dataRoot("library"),
      path.join(packagePath, "library"),
    );
    if (libCount || fs.existsSync(dataRoot("library"))) {
      parts.push("library");
    }
    const voiceCount = copyDirRecursive(
      dataRoot("voice-studio"),
      path.join(packagePath, "voice-studio"),
    );
    if (voiceCount || fs.existsSync(dataRoot("voice-studio"))) {
      parts.push("voice-studio");
    }
    copyDirRecursive(dataRoot("skills"), path.join(packagePath, "skills"));
    parts.push("skills");
    copyDirRecursive(
      dataRoot("protocols"),
      path.join(packagePath, "protocols"),
    );
    parts.push("protocols");

    if (includeSecrets) {
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        copyFileSafe(envPath, path.join(packagePath, "secrets.env"));
        parts.push("secrets.env");
      }
    }

    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      includeSecrets,
      parts,
      dbFile: "mira.db",
      note: "Секреты не включены, если includeSecrets=false (по умолчанию).",
    };
    fs.writeFileSync(
      path.join(packagePath, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    const detail = `Экспорт: ${path.basename(packagePath)} · parts=${parts.join(",")}`;
    appendAppLog({
      category: "backup",
      message: detail,
      meta: { packagePath, parts, includeSecrets },
    });
    return {
      ok: true,
      packagePath,
      manifest,
      detail,
    };
  } finally {
    openStore();
    ensureBootstrapSession();
  }
}

export async function importBackup(packagePath: string): Promise<{
  ok: boolean;
  detail: string;
  packagePath: string;
}> {
  const abs = path.resolve(packagePath);
  assertUnderData(abs);
  const manifestPath = path.join(abs, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Нет manifest.json — это не пакет Mira backup");
  }
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as BackupManifest;
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error(`Неизвестный format: ${manifest.format}`);
  }

  const ok = await requestUserConfirm({
    actionClass: "backup",
    risk: "high",
    title: "Импорт backup",
    body: `Заменить локальные данные пакетом «${path.basename(abs)}»?\nЧасти: ${manifest.parts.join(", ")}\nТекущая БД/библиотека будут перезаписаны. Рекомендуется сначала сделать export.`,
    confirmLabel: "Импортировать",
  });
  if (!ok) {
    return { ok: false, detail: "Импорт отклонён", packagePath: abs };
  }

  closeStore();
  try {
    const dbSrc = path.join(abs, manifest.dbFile || "mira.db");
    if (fs.existsSync(dbSrc)) {
      const dbDest = getDatabasePath();
      // remove wal/shm so restored main file is authoritative
      for (const side of [`${dbDest}-wal`, `${dbDest}-shm`]) {
        if (fs.existsSync(side)) fs.unlinkSync(side);
      }
      copyFileSafe(dbSrc, dbDest);
    }
    if (manifest.parts.includes("library")) {
      rmDirContents(dataRoot("library"));
      copyDirRecursive(path.join(abs, "library"), dataRoot("library"));
    }
    if (manifest.parts.includes("voice-studio")) {
      rmDirContents(dataRoot("voice-studio"));
      copyDirRecursive(
        path.join(abs, "voice-studio"),
        dataRoot("voice-studio"),
      );
    }
    if (manifest.parts.includes("skills")) {
      rmDirContents(dataRoot("skills"));
      copyDirRecursive(path.join(abs, "skills"), dataRoot("skills"));
    }
    if (manifest.parts.includes("protocols")) {
      rmDirContents(dataRoot("protocols"));
      copyDirRecursive(path.join(abs, "protocols"), dataRoot("protocols"));
    }
    // secrets.env never auto-applied — user must copy manually
  } finally {
    openStore();
    ensureBootstrapSession();
  }

  const detail = `Импорт OK · ${path.basename(abs)}${manifest.includeSecrets ? " (secrets.env не применён автоматически)" : ""}`;
  appendAppLog({
    category: "backup",
    message: detail,
    meta: { packagePath: abs, parts: manifest.parts },
  });
  return {
    ok: true,
    packagePath: abs,
    detail,
  };
}

export async function forgetData(scope: ForgetScope): Promise<{
  ok: boolean;
  scope: ForgetScope;
  detail: string;
  deleted: Record<string, number>;
}> {
  const labels: Record<ForgetScope, string> = {
    memory: "память разговоров (сессии и utterances)",
    learned: "выученное (#14 learned_units / plans)",
    library: "библиотеку материалов и файлы mira/library",
    "voice-studio": "корпуса студии голоса",
    all: "ВСЕ локальные данные Mira (память + библиотека + выученное + студия)",
  };

  const ok = await requestUserConfirm({
    actionClass: "forget",
    risk: "high",
    title: "Забыть данные",
    body: `Необратимо очистить: ${labels[scope]}.\nСделайте backup (export), если данные ещё нужны.\nПродолжить без восстановления?`,
    confirmLabel: "Забыть",
  });
  if (!ok) {
    return {
      ok: false,
      scope,
      detail: "Очистка отклонена",
      deleted: {},
    };
  }

  const deleted: Record<string, number> = {};
  const store = openStore();

  const wipeMemory = () => {
    deleted.utterances = (
      store.prepare(`SELECT COUNT(*) AS c FROM utterances`).get() as {
        c: number;
      }
    ).c;
    deleted.sessions = (
      store.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }
    ).c;
    store.exec(`DELETE FROM utterances; DELETE FROM sessions;`);
  };
  const wipeLearned = () => {
    deleted.learned_units = (
      store.prepare(`SELECT COUNT(*) AS c FROM learned_units`).get() as {
        c: number;
      }
    ).c;
    deleted.learn_plans = (
      store.prepare(`SELECT COUNT(*) AS c FROM learn_plans`).get() as {
        c: number;
      }
    ).c;
    store.exec(`DELETE FROM learned_units; DELETE FROM learn_plans;`);
  };
  const wipeLibraryDb = () => {
    deleted.library_items = (
      store.prepare(`SELECT COUNT(*) AS c FROM library_items`).get() as {
        c: number;
      }
    ).c;
    store.exec(`DELETE FROM library_items;`);
  };
  const wipeVoiceDb = () => {
    deleted.voice_clips = (
      store.prepare(`SELECT COUNT(*) AS c FROM voice_clips`).get() as {
        c: number;
      }
    ).c;
    deleted.voice_phrases = (
      store.prepare(`SELECT COUNT(*) AS c FROM voice_phrases`).get() as {
        c: number;
      }
    ).c;
    deleted.custom_voices = (
      store.prepare(`SELECT COUNT(*) AS c FROM custom_voices`).get() as {
        c: number;
      }
    ).c;
    deleted.voice_projects = (
      store.prepare(`SELECT COUNT(*) AS c FROM voice_projects`).get() as {
        c: number;
      }
    ).c;
    store.exec(`
      DELETE FROM voice_clips;
      DELETE FROM voice_phrases;
      DELETE FROM custom_voices;
      DELETE FROM voice_projects;
    `);
  };

  if (scope === "memory" || scope === "all") wipeMemory();
  if (scope === "learned" || scope === "all") wipeLearned();
  if (scope === "library" || scope === "all") {
    wipeLibraryDb();
    deleted.library_files = rmDirContents(dataRoot("library"));
  }
  if (scope === "voice-studio" || scope === "all") {
    wipeVoiceDb();
    deleted.voice_files = rmDirContents(dataRoot("voice-studio"));
  }

  ensureBootstrapSession();

  const detail = `Очищено: ${scope}`;
  appendAppLog({
    level: "warn",
    category: "forget",
    message: detail,
    meta: { scope, deleted },
  });
  return {
    ok: true,
    scope,
    detail,
    deleted,
  };
}
