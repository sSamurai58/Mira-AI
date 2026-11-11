import fs from "node:fs";
import path from "node:path";
import {
  dataRoot,
  miraRoot,
  writableRoot,
} from "./appPaths";

/** Mira-owned local data root. */
export function miraDataRoot(): string {
  return miraRoot();
}

/** Mira library (materials + nested database folder). */
export function miraLibraryDir(): string {
  return path.join(miraDataRoot(), "library");
}

/** Dedicated folder for the SQLite database and WAL/SHM sidecars. */
export function miraDatabaseDir(): string {
  return path.join(miraLibraryDir(), "database");
}

export function defaultDatabasePath(): string {
  return path.join(miraDatabaseDir(), "mira.db");
}

/** Previous defaults — used once for migration. */
export function legacyDatabasePaths(): string[] {
  const cwd = path.resolve(process.cwd());
  return [
    path.join(cwd, "mira", "library", "database", "mira.db"),
    path.join(cwd, "mira", "database", "mira.db"),
    path.join(cwd, "data", "mira.db"),
    // Old packaged attempts under install dir
    path.join(writableRoot(), "mira", "database", "mira.db"),
  ];
}

export function legacyLibraryDir(): string {
  return dataRoot("library");
}

export function resolveDatabasePathFromEnv(): string {
  const fromEnv = process.env.DATABASE_PATH?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(writableRoot(), fromEnv);
  }
  return defaultDatabasePath();
}

function moveDbSidecars(srcDb: string, destDb: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const src = `${srcDb}${suffix}`;
    const dest = `${destDb}${suffix}`;
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.renameSync(src, dest);
    }
  }
}

/** Move loose files from data/library → mira/library (once). */
export function ensureMiraLibraryLayout(): string {
  const dest = miraLibraryDir();
  fs.mkdirSync(dest, { recursive: true });
  fs.mkdirSync(miraDatabaseDir(), { recursive: true });

  const legacy = legacyLibraryDir();
  if (!fs.existsSync(legacy)) return dest;

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(legacy, { withFileTypes: true });
  } catch {
    return dest;
  }
  for (const e of entries) {
    if (e.name === "." || e.name === "..") continue;
    const src = path.join(legacy, e.name);
    const target = path.join(dest, e.name);
    if (fs.existsSync(target)) continue;
    try {
      fs.renameSync(src, target);
    } catch {
      // ignore locked / cross-device edge cases
    }
  }
  return dest;
}

/**
 * Ensure mira/library/database exists. Migrate DB from older locations
 * when the new file is missing.
 */
export function ensureMiraDatabaseLayout(
  dbPath = resolveDatabasePathFromEnv(),
): string {
  ensureMiraLibraryLayout();
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const usingDefault =
    path.resolve(dbPath) === path.resolve(defaultDatabasePath());
  if (!usingDefault || fs.existsSync(dbPath)) return dbPath;

  for (const legacy of legacyDatabasePaths()) {
    if (fs.existsSync(legacy)) {
      moveDbSidecars(legacy, dbPath);
      break;
    }
  }
  return dbPath;
}
