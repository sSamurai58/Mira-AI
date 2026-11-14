import {
  Tray,
  Menu,
  app,
  BrowserWindow,
  nativeImage,
} from "electron";
import path from "node:path";
import { loadNotifyPrefs } from "./notifyPrefs";

let tray: Tray | null = null;
let quittingToTray = false;
let allowQuit = false;

export function isQuittingToTray(): boolean {
  return quittingToTray;
}

export function setAllowQuit(next: boolean): void {
  allowQuit = next;
}

export function isAllowQuit(): boolean {
  return allowQuit;
}

function trayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(process.resourcesPath || "", "build", "icon.png"),
    path.join(app.getAppPath(), "build", "icon.png"),
    path.join(__dirname, "..", "build", "icon.png"),
    path.join(__dirname, "..", "public", "brand", "favicon-64.png"),
  ];
  for (const p of candidates) {
    try {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        return img.resize({ width: 16, height: 16 });
      }
    } catch {
      /* next */
    }
  }
  return nativeImage.createEmpty();
}

function mainWindow(): BrowserWindow | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getMainBrowserWindow } = require("./windowRoles") as typeof import("./windowRoles");
  return getMainBrowserWindow();
}

function showMain(): void {
  quittingToTray = false;
  let win = mainWindow();
  if (!win) {
    // Caller (main) should recreate; emit via activate-like path.
    app.emit("activate");
    win = mainWindow();
  }
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export function destroyTray(): void {
  try {
    tray?.destroy();
  } catch {
    /* ignore */
  }
  tray = null;
}

export function syncTrayFromPrefs(): void {
  const prefs = loadNotifyPrefs();
  if (!prefs.trayEnabled && !prefs.closeToTray) {
    destroyTray();
    return;
  }
  ensureTray();
}

export function ensureTray(): Tray | null {
  if (tray && !tray.isDestroyed()) return tray;
  try {
    const icon = trayIcon();
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip("Mira");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "Открыть Mira",
          click: () => showMain(),
        },
        { type: "separator" },
        {
          label: "Выход",
          click: () => {
            allowQuit = true;
            quittingToTray = false;
            destroyTray();
            app.quit();
          },
        },
      ]),
    );
    tray.on("double-click", () => showMain());
    tray.on("click", () => showMain());
    return tray;
  } catch {
    tray = null;
    return null;
  }
}

/** Intercept close: hide to tray when prefs say so. Returns true if closed normally. */
export function handleWindowClose(win: BrowserWindow): boolean {
  const prefs = loadNotifyPrefs();
  if (allowQuit || !prefs.closeToTray) {
    quittingToTray = false;
    return true;
  }
  quittingToTray = true;
  ensureTray();
  win.hide();
  return false;
}

export function applyLoginItem(prefsStartWithOs: boolean): void {
  try {
    if (process.platform === "linux") return;
    app.setLoginItemSettings({
      openAtLogin: prefsStartWithOs,
      openAsHidden: prefsStartWithOs,
    });
  } catch {
    /* unsupported */
  }
}
