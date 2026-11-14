import { BrowserWindow, Notification, nativeImage, app } from "electron";
import path from "node:path";
import {
  categoryAllowed,
  loadNotifyPrefs,
  type NotifyCategory,
} from "./notifyPrefs";
import { isQuittingToTray } from "./tray";

function appIcon(): Electron.NativeImage | undefined {
  const candidates = [
    path.join(process.resourcesPath || "", "build", "icon.png"),
    path.join(app.getAppPath(), "build", "icon.png"),
    path.join(__dirname, "..", "build", "icon.png"),
  ];
  for (const p of candidates) {
    try {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function mainWindow(): BrowserWindow | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getMainBrowserWindow } = require("./windowRoles") as typeof import("./windowRoles");
  return getMainBrowserWindow();
}

/** True when user likely cannot see in-app HUD toast. */
export function windowObscured(): boolean {
  if (isQuittingToTray()) return true;
  const win = mainWindow();
  if (!win) return true;
  try {
    if (!win.isVisible()) return true;
    if (win.isMinimized()) return true;
    if (!win.isFocused()) return true;
  } catch {
    return true;
  }
  return false;
}

export function showOsNotification(opts: {
  title: string;
  body: string;
  category: NotifyCategory;
  /** Force even if window focused (e.g. test button). */
  force?: boolean;
}): { ok: boolean; detail: string } {
  const prefs = loadNotifyPrefs();
  if (!prefs.osEnabled) {
    return { ok: false, detail: "OS-уведомления выключены" };
  }
  if (!categoryAllowed(prefs, opts.category)) {
    return { ok: false, detail: "Категория / DND / тихие часы" };
  }

  const obscured = windowObscured();
  if (!opts.force) {
    if (obscured) {
      if (isQuittingToTray()) {
        if (!prefs.osWhenClosed) {
          return { ok: false, detail: "OS при закрытии в трей выкл." };
        }
      } else if (!prefs.osWhenHidden) {
        return { ok: false, detail: "OS при свёрнутом окне выкл." };
      }
    } else {
      // Window focused — skip OS (HUD covers it) unless force.
      return { ok: false, detail: "Окно на виду — только HUD" };
    }
  }

  if (!Notification.isSupported()) {
    return { ok: false, detail: "Notification API недоступен" };
  }

  try {
    const icon = appIcon();
    const n = new Notification({
      title: opts.title.trim() || "Mira",
      body: opts.body.trim() || opts.title,
      silent: !prefs.soundEnabled,
      ...(icon ? { icon } : {}),
    });
    n.on("click", () => {
      const win = mainWindow();
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    });
    n.show();
    return { ok: true, detail: "Показано" };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
