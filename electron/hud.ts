import path from "node:path";
import type { BrowserWindow } from "electron";
import { estimateHudHeight, loadHudPrefs } from "./hudPrefs";

let hudWindow: BrowserWindow | null = null;

export function getHudPolicy() {
  const prefs = loadHudPrefs();
  return {
    enabled: (process.env.HUD_ENABLED ?? "true").trim().toLowerCase() !== "false",
    alwaysOnTop:
      prefs.alwaysOnTop &&
      (process.env.HUD_ALWAYS_ON_TOP ?? "true").trim().toLowerCase() !== "false",
  };
}

export function isHudOpen(): boolean {
  return Boolean(hudWindow && !hudWindow.isDestroyed());
}

export function closeHud(): void {
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.close();
  }
  hudWindow = null;
}

export function resizeHudWindow(height?: number): void {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  const h = Math.round(height ?? estimateHudHeight());
  const [w] = hudWindow.getSize();
  try {
    hudWindow.setSize(w, Math.min(560, Math.max(118, h)), true);
  } catch {
    /* platforms differ */
  }
}

export function applyHudAlwaysOnTop(): void {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  const policy = getHudPolicy();
  try {
    hudWindow.setAlwaysOnTop(policy.alwaysOnTop, "floating");
  } catch {
    /* ignore */
  }
}

export async function createOrFocusHud(opts?: {
  isDev?: boolean;
}): Promise<BrowserWindow | null> {
  const policy = getHudPolicy();
  if (!policy.enabled) return null;

  if (hudWindow && !hudWindow.isDestroyed()) {
    resizeHudWindow();
    applyHudAlwaysOnTop();
    hudWindow.show();
    hudWindow.focus();
    return hudWindow;
  }

  if (typeof process.versions.electron !== "string") {
    return null;
  }

  const { BrowserWindow, screen } = await import("electron");
  const display = screen.getPrimaryDisplay();
  const width = 340;
  const height = estimateHudHeight();
  const x = display.workArea.x + display.workArea.width - width - 24;
  const y = display.workArea.y + 24;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: policy.alwaysOnTop,
    hasShadow: false,
    backgroundColor: "#00000000",
    title: "Mira HUD",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  try {
    win.setAlwaysOnTop(policy.alwaysOnTop, "floating");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    /* platforms differ */
  }

  hudWindow = win;

  const isDev = opts?.isDev ?? process.env.MIRA_DEV === "1";
  if (isDev) {
    void win.loadURL(
      `${process.env.MIRA_DEV_URL ?? "http://127.0.0.1:5173"}#/hud`,
    );
  } else {
    void win.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      hash: "/hud",
    });
  }

  win.on("closed", () => {
    hudWindow = null;
  });

  return win;
}

export async function toggleHud(opts?: { isDev?: boolean }): Promise<{
  open: boolean;
}> {
  if (isHudOpen()) {
    closeHud();
    return { open: false };
  }
  await createOrFocusHud(opts);
  return { open: isHudOpen() };
}

/** Open HUD if prefs say so (e.g. after starting a timer). */
export async function maybeAutoOpenHud(opts?: {
  isDev?: boolean;
}): Promise<void> {
  const prefs = loadHudPrefs();
  if (!prefs.autoOpenOnTimer) return;
  if (isHudOpen()) {
    resizeHudWindow();
    return;
  }
  await createOrFocusHud(opts);
}
