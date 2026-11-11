import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import {
  closeStore,
  ensureBootstrapSession,
  getDatabasePath,
  getStoreHealth,
  listSessions,
  openStore,
} from "./store";

const isDev = process.env.MIRA_DEV === "1";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#000814",
    title: "Mira",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    void win.loadURL(process.env.MIRA_DEV_URL ?? "http://127.0.0.1:5173");
  } else {
    void win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  openStore();
  ensureBootstrapSession();

  ipcMain.handle("mira:get-health", () => {
    const health = getStoreHealth();
    return {
      phase: "P0",
      databasePath: getDatabasePath(),
      ...health,
    };
  });

  ipcMain.handle("mira:list-sessions", () => listSessions());

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  closeStore();
  if (process.platform !== "darwin") app.quit();
});
