import { app } from "electron";
import path from "node:path";

/** True when running from an installed / packaged Electron build. */
export function isPackagedApp(): boolean {
  try {
    return app.isPackaged;
  } catch {
    return false;
  }
}

/**
 * Writable root for Mira runtime data.
 * Packaged: %APPDATA%/Mira (or OS equivalent)
 * Dev: process.cwd()
 */
export function writableRoot(): string {
  if (isPackagedApp()) {
    return app.getPath("userData");
  }
  return path.resolve(process.cwd());
}

/** Repo / app content root (read-only in packaged asar). */
export function appContentRoot(): string {
  return path.resolve(__dirname, "..");
}

/** Seed materials — packaged as extraResources/seed, else repo seed/. */
export function seedRoot(...parts: string[]): string {
  if (isPackagedApp()) {
    return path.join(process.resourcesPath, "seed", ...parts);
  }
  return path.join(appContentRoot(), "seed", ...parts);
}

export function dataRoot(...parts: string[]): string {
  return path.join(writableRoot(), "data", ...parts);
}

export function miraRoot(...parts: string[]): string {
  return path.join(writableRoot(), "mira", ...parts);
}

export function envFilePath(): string {
  return path.join(writableRoot(), ".env");
}
