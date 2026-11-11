import fs from "node:fs";
import path from "node:path";

/** Mira-owned local data root (inside the project directory). */
export function miraDataRoot(): string {
  return path.resolve(process.cwd(), "mira");
}

/** Dedicated folder for the SQLite database and WAL/SHM sidecars. */
export function miraDatabaseDir(): string {
  return path.join(miraDataRoot(), "database");
}

export function defaultDatabasePath(): string {
  return path.join(miraDatabaseDir(), "mira.db");
}

/** Legacy default before mira/database/ — used once for migration. */
export function legacyDatabasePath(): string {
  return path.resolve(process.cwd(), "data", "mira.db");
}

export function resolveDatabasePathFromEnv(): string {
  const fromEnv = process.env.DATABASE_PATH?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv);
  }
  return defaultDatabasePath();
}

/**
 * Ensure mira/database exists. If the new DB is missing but legacy
 * data/mira.db is present, move DB + WAL/SHM into mira/database/.
 */
export function ensureMiraDatabaseLayout(dbPath = resolveDatabasePathFromEnv()): string {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const usingDefault =
    path.resolve(dbPath) === path.resolve(defaultDatabasePath());
  if (!usingDefault || fs.existsSync(dbPath)) return dbPath;

  const legacy = legacyDatabasePath();
  if (!fs.existsSync(legacy)) return dbPath;

  for (const suffix of ["", "-wal", "-shm"]) {
    const src = `${legacy}${suffix}`;
    const dest = `${dbPath}${suffix}`;
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.renameSync(src, dest);
    }
  }
  return dbPath;
}
