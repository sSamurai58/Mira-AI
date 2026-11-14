import type { BrowserWindow } from "electron";

/** Compact always-on-top surfaces (#/hud, #/update-hud) — not the main shell. */
export function isMiraOverlayWindow(win: BrowserWindow): boolean {
  try {
    const url = win.webContents.getURL();
    return (
      url.includes("#/hud") ||
      url.includes("#hud") ||
      url.includes("#/update-hud") ||
      url.includes("#update-hud")
    );
  } catch {
    return false;
  }
}

export function getMainBrowserWindow(): BrowserWindow | null {
  // Lazy require — callers may run before electron is ready in some tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BrowserWindow } = require("electron") as typeof import("electron");
  return (
    BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && !isMiraOverlayWindow(w),
    ) ?? null
  );
}
