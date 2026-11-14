/**
 * Always-on-top update toast window — visible above other apps, not only Mira.
 */
import path from "node:path";
import type { BrowserWindow } from "electron";
import {
  categoryAllowed,
  loadNotifyPrefs,
  type NotifyPosition,
} from "./notifyPrefs";
import type { UpdateStatus } from "./updater";

let updateHudWindow: BrowserWindow | null = null;
/** Session dismiss for a channel+version so sync does not immediately re-show. */
let dismissedKey: string | null = null;

const WIDTH = 380;
const HEIGHT = 210;
const MARGIN = 24;

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
  if (updateHudWindow && !updateHudWindow.isDestroyed()) {
    updateHudWindow.hide();
  }
}

export function dismissUpdateHud(key?: string | null): void {
  if (key) dismissedKey = key;
  hideUpdateHud();
}

function placeWindow(win: BrowserWindow, position: NotifyPosition): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { screen } = require("electron") as typeof import("electron");
  const display = screen.getPrimaryDisplay();
  const { x: ax, y: ay, width: aw, height: ah } = display.workArea;
  let x = ax + aw - WIDTH - MARGIN;
  let y = ay + ah - HEIGHT - MARGIN;
  if (position === "bl") {
    x = ax + MARGIN;
    y = ay + ah - HEIGHT - MARGIN;
  } else if (position === "tr") {
    x = ax + aw - WIDTH - MARGIN;
    y = ay + MARGIN;
  } else if (position === "tl") {
    x = ax + MARGIN;
    y = ay + MARGIN;
  }
  win.setBounds({ x, y, width: WIDTH, height: HEIGHT });
}

async function ensureWindow(opts?: {
  isDev?: boolean;
}): Promise<BrowserWindow | null> {
  if (typeof process.versions.electron !== "string") return null;

  if (updateHudWindow && !updateHudWindow.isDestroyed()) {
    return updateHudWindow;
  }

  const { BrowserWindow } = await import("electron");
  const prefs = loadNotifyPrefs();

  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    show: false,
    backgroundColor: "#00000000",
    title: "Mira Update",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  try {
    // Highest practical level so the toast stays above other apps.
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    try {
      win.setAlwaysOnTop(true, "floating");
    } catch {
      /* platforms differ */
    }
  }

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
    updateHudWindow = null;
  });

  return win;
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
  if (!win.isVisible()) {
    // Don't steal focus from the active app.
    win.showInactive();
  }
}

export function repositionUpdateHud(): void {
  if (!updateHudWindow || updateHudWindow.isDestroyed()) return;
  placeWindow(updateHudWindow, loadNotifyPrefs().position);
}
