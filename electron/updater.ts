import { app } from "electron";
import { autoUpdater } from "electron-updater";

export type UpdateChannel =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export type UpdateStatus = {
  channel: UpdateChannel;
  currentVersion: string;
  availableVersion: string | null;
  progress: number | null;
  detail: string;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
  packaged: boolean;
};

type Broadcast = (channel: string, payload: unknown) => void;

let broadcast: Broadcast | null = null;
let wired = false;

let status: UpdateStatus = {
  channel: "idle",
  currentVersion: app.getVersion(),
  availableVersion: null,
  progress: null,
  detail: app.isPackaged
    ? "Готово к проверке обновлений"
    : "Обновления доступны только в установленном приложении (не в dev)",
  canCheck: app.isPackaged,
  canDownload: false,
  canInstall: false,
  packaged: app.isPackaged,
};

function setStatus(patch: Partial<UpdateStatus>): UpdateStatus {
  status = {
    ...status,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    ...patch,
  };
  broadcast?.("mira:update-event", status);
  return status;
}

export function getUpdateStatus(): UpdateStatus {
  return {
    ...status,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    canCheck: app.isPackaged && status.channel !== "checking" && status.channel !== "downloading",
  };
}

export function initUpdater(send: Broadcast): void {
  broadcast = send;
  status.currentVersion = app.getVersion();
  status.packaged = app.isPackaged;
  status.canCheck = app.isPackaged;

  if (!app.isPackaged || wired) return;
  wired = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  // Public GitHub Releases; set GH_TOKEN in env for private repos / higher rate limits
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
    autoUpdater.requestHeaders = {
      Authorization: `token ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`,
    };
  }

  autoUpdater.on("checking-for-update", () => {
    setStatus({
      channel: "checking",
      detail: "Проверка GitHub Releases…",
      canDownload: false,
      canInstall: false,
      progress: null,
    });
  });

  autoUpdater.on("update-available", (info) => {
    setStatus({
      channel: "available",
      availableVersion: info.version,
      detail: `Доступна версия ${info.version}`,
      canDownload: true,
      canInstall: false,
      progress: null,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    setStatus({
      channel: "not-available",
      availableVersion: info.version,
      detail: `Уже последняя версия (${info.version})`,
      canDownload: false,
      canInstall: false,
      progress: null,
    });
  });

  autoUpdater.on("download-progress", (p) => {
    setStatus({
      channel: "downloading",
      progress: Math.round(p.percent),
      detail: `Скачивание… ${Math.round(p.percent)}%`,
      canDownload: false,
      canInstall: false,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setStatus({
      channel: "downloaded",
      availableVersion: info.version,
      progress: 100,
      detail: `Версия ${info.version} скачана. Можно перезапустить.`,
      canDownload: false,
      canInstall: true,
    });
  });

  autoUpdater.on("error", (err) => {
    setStatus({
      channel: "error",
      detail: err instanceof Error ? err.message : String(err),
      canDownload: false,
      canInstall: false,
      progress: null,
    });
  });
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return setStatus({
      channel: "idle",
      detail:
        "В режиме разработки обновления отключены. Соберите релиз (`npm run pack`) и установите приложение.",
      canCheck: false,
      canDownload: false,
      canInstall: false,
    });
  }

  try {
    setStatus({
      channel: "checking",
      detail: "Проверка GitHub Releases…",
      progress: null,
      canDownload: false,
      canInstall: false,
    });
    const result = await autoUpdater.checkForUpdates();
    if (!result) {
      return setStatus({
        channel: "error",
        detail: "checkForUpdates вернул пустой результат",
      });
    }
    // Status events above will refine channel; return latest snapshot
    return getUpdateStatus();
  } catch (err) {
    return setStatus({
      channel: "error",
      detail: err instanceof Error ? err.message : String(err),
      canDownload: false,
      canInstall: false,
    });
  }
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return getUpdateStatus();
  }
  const canStart =
    status.channel === "available" ||
    status.channel === "error" ||
    status.channel === "downloaded";
  if (!canStart) {
    return setStatus({
      detail: "Сначала проверьте наличие обновлений",
    });
  }
  try {
    setStatus({
      channel: "downloading",
      progress: 0,
      detail: "Скачивание…",
      canDownload: false,
      canInstall: false,
    });
    await autoUpdater.downloadUpdate();
    return getUpdateStatus();
  } catch (err) {
    return setStatus({
      channel: "error",
      detail: err instanceof Error ? err.message : String(err),
      canDownload: true,
      canInstall: false,
    });
  }
}

export function quitAndInstall(): { ok: boolean; detail: string } {
  if (!app.isPackaged) {
    return { ok: false, detail: "Только в установленном приложении" };
  }
  if (status.channel !== "downloaded") {
    return {
      ok: false,
      detail: "Нет скачанного обновления. Сначала скачайте.",
    };
  }
  // isSilent=false, isForceRunAfter=true
  setTimeout(() => autoUpdater.quitAndInstall(false, true), 250);
  return { ok: true, detail: "Перезапуск для установки…" };
}
