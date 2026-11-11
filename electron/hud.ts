import path from "node:path";
import type { BrowserWindow } from "electron";

let hudWindow: BrowserWindow | null = null;


export function getHudPolicy() {
  return {
    enabled: (process.env.HUD_ENABLED ?? "true").trim().toLowerCase() !== "false",
    alwaysOnTop:
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

export async function createOrFocusHud(opts?: {
  isDev?: boolean;
}): Promise<BrowserWindow | null> {

  const policy = getHudPolicy();
  if (!policy.enabled) return null;

  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.show();
    hudWindow.focus();
    return hudWindow;
  }

  if (typeof process.versions.electron !== "string") {
    return null;
  }

  const { BrowserWindow, screen } = await import("electron");
  const display = screen.getPrimaryDisplay();
  // Compact themed card — tall enough to avoid native scroll chrome.
  const width = 320;
  const height = 118;
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
    hasShadow: true,
    backgroundColor: "#00000000",
    title: "Mira HUD",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Keep the floating chip above normal windows without stealing focus loops.
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
