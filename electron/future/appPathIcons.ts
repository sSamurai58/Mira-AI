/**
 * Extract OS file/app icons for Workshop → Пути cards.
 * Uses Electron `app.getFileIcon` (Windows .exe/.lnk, macOS .app, folders, files).
 * Caches PNG under userData/path-icons keyed by path + mtime.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../appPaths";

function cacheDir(): string {
  const dir = dataRoot("path-icons");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheKey(targetPath: string, mtimeMs: number): string {
  return crypto
    .createHash("sha1")
    .update(`${targetPath}|${mtimeMs}`)
    .digest("hex");
}

function pngToDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** Resolve .lnk → target on Windows when possible. */
async function resolveShortcutTarget(targetPath: string): Promise<string> {
  if (process.platform !== "win32") return targetPath;
  if (!/\.lnk$/i.test(targetPath)) return targetPath;
  try {
    if (typeof process.versions.electron !== "string") return targetPath;
    const { shell } = await import("electron");
    const info = shell.readShortcutLink(targetPath);
    const dest = (info.target || "").trim();
    if (dest && fs.existsSync(dest)) return dest;
  } catch {
    /* keep .lnk — getFileIcon still often works */
  }
  return targetPath;
}

/**
 * Return a data:image/png URL for the file/app at `targetPath`, or null.
 */
export async function resolveAppPathIconDataUrl(
  targetPath: string,
): Promise<string | null> {
  const raw = (targetPath || "").trim();
  if (!raw) return null;
  if (!fs.existsSync(raw)) return null;

  let resolved = raw;
  try {
    resolved = await resolveShortcutTarget(raw);
  } catch {
    resolved = raw;
  }

  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(resolved).mtimeMs;
  } catch {
    return null;
  }

  const key = cacheKey(resolved, mtimeMs);
  const cacheFile = path.join(cacheDir(), `${key}.png`);
  if (fs.existsSync(cacheFile)) {
    try {
      return pngToDataUrl(fs.readFileSync(cacheFile));
    } catch {
      /* regenerate */
    }
  }

  if (typeof process.versions.electron !== "string") {
    return null;
  }

  try {
    const { app } = await import("electron");
    // Large ≈ 32px on Windows; fine for 40px card tiles (renderer scales).
    const img = await app.getFileIcon(resolved, { size: "large" });
    if (!img || img.isEmpty()) return null;
    const png = img.toPNG();
    if (!png?.length) return null;
    try {
      fs.writeFileSync(cacheFile, png);
    } catch {
      /* cache optional */
    }
    return pngToDataUrl(png);
  } catch {
    return null;
  }
}

/** Attach iconDataUrl to path rows (best-effort, parallel, capped). */
export async function attachIconsToAppPaths<
  T extends { path: string; iconDataUrl?: string | null },
>(rows: T[], concurrency = 6): Promise<Array<T & { iconDataUrl: string | null }>> {
  const out: Array<T & { iconDataUrl: string | null }> = [];
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const idx = i++;
      const row = rows[idx]!;
      const iconDataUrl = await resolveAppPathIconDataUrl(row.path);
      out[idx] = { ...row, iconDataUrl };
    }
  }
  const n = Math.min(concurrency, Math.max(1, rows.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}
