/**
 * Always-on-top update toast window — visible above other apps, not only Mira.
 * Anchored to a corner of the Mira main window when it is visible.
 *
 * Windows note: fully transparent + alwaysOnTop("screen-saver") often eats
 * mouse input (clicks pass through). Keep floating level + opaque panel.
 */
import path from "node:path";
import type { BrowserWindow, Rectangle } from "electron";
import {
  categoryAllowed,
  loadNotifyPrefs,
  type NotifyPosition,
} from "./notifyPrefs";
import type { UpdateStatus } from "./updater";

let updateHudWindow: BrowserWindow | null = null;
/** Deduplicate concurrent ensureWindow() during download progress floods. */
let ensureWindowInflight: Promise<BrowserWindow | null> | null = null;
/** Session dismiss for a channel+version so sync does not immediately re-show. */
let dismissedKey: string | null = null;

const WIDTH = 380;
/** Tall enough for error copy + actions; card fills the window. */
const HEIGHT = 220;
const MARGIN = 16;

function dismissKeyFor(status: UpdateStatus): string {
  if (status.channel === "error") {
    return `error:${status.availableVersion || status.detail.slice(0, 40)}`;
  }
  return `${status.channel}:${status.availableVersion || ""}`;
}

function isActionable(channel: string): boolean {
  return (
    channel === "available" ||
    channel === "downloaded" ||
    channel === "error" ||
    channel === "downloading"
  );
}

export function isUpdateHudOpen(): boolean {
  return Boolean(updateHudWindow && !updateHudWindow.isDestroyed());
}

export function closeUpdateHud(): void {
  if (updateHudWindow && !updateHudWindow.isDestroyed()) {
    updateHudWindow.close();
  }
  updateHudWindow = null;
}

export function hideUpdateHud(): void {
  // Prefer destroy over hide: a hidden transparent always-on-top window can
  // still sit in the z-order and steal / block clicks on Windows.
  closeUpdateHud();
}

export function dismissUpdateHud(key?: string | null): void {
  if (key) dismissedKey = key;
  closeUpdateHud();
}

/** Prefer Mira's visible bounds so the toast sits in Mira's corner — not mid-window. */
function anchorRect(): Rectangle {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { screen } = require("electron") as typeof import("electron");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getMainBrowserWindow } = require("./windowRoles") as typeof import("./windowRoles");
  const main = getMainBrowserWindow();
  if (main && !main.isDestroyed()) {
    const bounds = main.getBounds();
    if (main.isVisible() && !main.isMinimized()) {
      return bounds;
    }
    return screen.getDisplayMatching(bounds).workArea;
  }
  return screen.getPrimaryDisplay().workArea;
}

function cornerOrigin(
  area: Rectangle,
  position: NotifyPosition,
): { x: number; y: number } {
  let x = area.x + area.width - WIDTH - MARGIN;
  let y = area.y + area.height - HEIGHT - MARGIN;
  if (position === "bl") {
    x = area.x + MARGIN;
    y = area.y + area.height - HEIGHT - MARGIN;
  } else if (position === "tr") {
    x = area.x + area.width - WIDTH - MARGIN;
    y = area.y + MARGIN;
  } else if (position === "tl") {
    x = area.x + MARGIN;
    y = area.y + MARGIN;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

function placeWindow(win: BrowserWindow, position: NotifyPosition): void {
  const { x, y } = cornerOrigin(anchorRect(), position);
  win.setBounds({ x, y, width: WIDTH, height: HEIGHT });
}

function closeOrphanUpdateWindows(keep?: BrowserWindow | null): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BrowserWindow } = require("electron") as typeof import("electron");
    for (const w of BrowserWindow.getAllWindows()) {
      if (keep && w === keep) continue;
      if (w.isDestroyed()) continue;
      if (w.getTitle() !== "Mira Update") continue;
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* non-electron */
  }
}

function applyClickableAlwaysOnTop(win: BrowserWindow): void {
  try {
    // "floating" matches Mira HUD and still stays above apps; "screen-saver"
    // on Windows often produces a layer that does not receive mouse clicks.
    win.setAlwaysOnTop(true, "floating");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    try {
      win.setAlwaysOnTop(true);
    } catch {
      /* platforms differ */
    }
  }
  try {
    win.setIgnoreMouseEvents(false);
  } catch {
    /* ignore */
  }
  try {
    win.setFocusable(true);
  } catch {
    /* ignore */
  }
}

async function ensureWindow(opts?: {
  isDev?: boolean;
}): Promise<BrowserWindow | null> {
  if (typeof process.versions.electron !== "string") return null;

  if (updateHudWindow && !updateHudWindow.isDestroyed()) {
    applyClickableAlwaysOnTop(updateHudWindow);
    return updateHudWindow;
  }
  if (ensureWindowInflight) return ensureWindowInflight;

  ensureWindowInflight = (async () => {
    // Re-check after awaiting the lock — another caller may have finished.
    if (updateHudWindow && !updateHudWindow.isDestroyed()) {
      applyClickableAlwaysOnTop(updateHudWindow);
      return updateHudWindow;
    }

    const { BrowserWindow } = await import("electron");
    // Kill any leftover HUD from a prior race (download % floods syncUpdateHud).
    closeOrphanUpdateWindows(null);

    const prefs = loadNotifyPrefs();
    const { x, y } = cornerOrigin(anchorRect(), prefs.position);

    // Opaque frameless panel — transparent windows on Windows frequently
    // ignore mouse hits even on painted pixels when always-on-top.
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      x,
      y,
      frame: false,
      transparent: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      focusable: true,
      show: false,
      backgroundColor: "#14101c",
      title: "Mira Update",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    applyClickableAlwaysOnTop(win);

    placeWindow(win, prefs.position);
    updateHudWindow = win;

    const isDev = opts?.isDev ?? process.env.MIRA_DEV === "1";
    if (isDev) {
      void win.loadURL(
        `${process.env.MIRA_DEV_URL ?? "http://127.0.0.1:5173"}#/update-hud`,
      );
    } else {
      void win.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
        hash: "/update-hud",
      });
    }

    win.on("closed", () => {
      if (updateHudWindow === win) updateHudWindow = null;
    });

    // If the page ever paints empty (dismissed), do not leave a click-blocker.
    win.webContents.on("did-finish-load", () => {
      applyClickableAlwaysOnTop(win);
    });

    return win;
  })();

  try {
    return await ensureWindowInflight;
  } finally {
    ensureWindowInflight = null;
  }
}

/** Show / hide / reposition the update toast for the latest updater status. */
export async function syncUpdateHud(
  status: UpdateStatus,
  opts?: { isDev?: boolean },
): Promise<void> {
  const prefs = loadNotifyPrefs();
  if (!prefs.hudEnabled || !isActionable(status.channel)) {
    hideUpdateHud();
    return;
  }
  const cat = status.channel === "error" ? "errors" : "updates";
  if (!categoryAllowed(prefs, cat)) {
    hideUpdateHud();
    return;
  }

  const key = dismissKeyFor(status);
  // Clear dismiss when download progresses or finishes.
  if (
    status.channel === "downloading" ||
    status.channel === "downloaded"
  ) {
    dismissedKey = null;
  } else if (dismissedKey === key) {
    hideUpdateHud();
    return;
  }

  const win = await ensureWindow(opts);
  if (!win || win.isDestroyed()) return;

  placeWindow(win, prefs.position);
  applyClickableAlwaysOnTop(win);
  if (!win.isVisible()) {
    // Don't steal focus from the active app — but keep mouse events.
    win.showInactive();
    applyClickableAlwaysOnTop(win);
  }
}

export function repositionUpdateHud(): void {
  if (!updateHudWindow || updateHudWindow.isDestroyed()) return;
  placeWindow(updateHudWindow, loadNotifyPrefs().position);
  applyClickableAlwaysOnTop(updateHudWindow);
}
