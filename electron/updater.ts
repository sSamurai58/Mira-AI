import { app, shell } from "electron";
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
  releasesUrl: string;
};

type Broadcast = (channel: string, payload: unknown) => void;

const RELEASES_URL = "https://github.com/sSamurai58/Mira-AI/releases";

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
  releasesUrl: RELEASES_URL,
};

function setStatus(patch: Partial<UpdateStatus>): UpdateStatus {
  status = {
    ...status,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    releasesUrl: RELEASES_URL,
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
    releasesUrl: RELEASES_URL,
    canCheck:
      app.isPackaged &&
      status.channel !== "checking" &&
      status.channel !== "downloading",
  };
}

/** Map Chromium / electron-updater noise into short Russian hints. */
export function humanizeUpdateError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "");
  const lower = msg.toLowerCase();

  if (
    lower.includes("err_connection") ||
    lower.includes("err_name_not_resolved") ||
    lower.includes("err_timed_out") ||
    lower.includes("err_network") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("socket hang up") ||
    lower.includes("net::")
  ) {
    return (
      "Нет связи с GitHub Releases. Проверьте интернет / VPN / антивирус " +
      `и откройте ${RELEASES_URL}`
    );
  }

  if (
    lower.includes("latest.yml") ||
    lower.includes("cannot find") ||
    lower.includes("404") ||
    lower.includes("http status 404") ||
    lower.includes("no published versions") ||
    lower.includes("unable to find latest version")
  ) {
    return (
      "На GitHub ещё нет Windows-сборки этой версии (или релиз публикуется). " +
      `Подождите пару минут или скачайте вручную: ${RELEASES_URL}`
    );
  }

  if (lower.includes("sha512") || lower.includes("checksum") || lower.includes("blockmap")) {
    return "Файл обновления повреждён или неполный. Скачайте установщик с GitHub Releases вручную.";
  }

  if (lower.includes("code signature") || lower.includes("not signed")) {
    return "Проблема с подписью установщика. Скачайте обновление с GitHub Releases вручную.";
  }

  const short = msg.replace(/\s+/g, " ").trim().slice(0, 220);
  return short
    ? `Не удалось проверить обновления: ${short}`
    : "Не удалось проверить обновления. Откройте GitHub Releases вручную.";
}

let autoCheckTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAutoReason: "renderer-ready" | "focus" | "boot-fallback" | null =
  null;
let checkInFlight: Promise<UpdateStatus> | null = null;
let lastAutoCheckAt = 0;
let rendererReadyScheduled = false;

/** Min gap between automatic (non-manual) checks — avoids spam on focus. */
const AUTO_CHECK_COOLDOWN_MS = 5 * 60_000;
/** Delay after renderer is ready so UpdateHudToast can subscribe first. */
const AFTER_RENDERER_READY_MS = 1200;

const AUTO_REASON_PRIORITY: Record<
  "renderer-ready" | "focus" | "boot-fallback",
  number
> = {
  "boot-fallback": 1,
  focus: 2,
  "renderer-ready": 3,
};

/**
 * Packaged auto-check. Prefer calling after the BrowserWindow has finished
 * loading — a blind boot timer races the renderer IPC listener and drops
 * `mira:update-event` (Electron does not queue sends for late subscribers).
 */
export function scheduleAutoUpdateCheck(
  reason: "renderer-ready" | "focus" | "boot-fallback" = "renderer-ready",
): void {
  if (!app.isPackaged) return;

  // Don't let focus/boot-fallback cancel a pending renderer-ready check.
  if (
    autoCheckTimer &&
    pendingAutoReason &&
    AUTO_REASON_PRIORITY[reason] < AUTO_REASON_PRIORITY[pendingAutoReason]
  ) {
    if (reason === "focus") {
      broadcast?.("mira:update-event", getUpdateStatus());
    }
    return;
  }

  if (autoCheckTimer) clearTimeout(autoCheckTimer);
  pendingAutoReason = reason;

  const delay =
    reason === "renderer-ready"
      ? AFTER_RENDERER_READY_MS
      : reason === "focus"
        ? 400
        : 4_000;

  autoCheckTimer = setTimeout(() => {
    autoCheckTimer = null;
    pendingAutoReason = null;
    const now = Date.now();
    // Focus/boot-fallback: respect cooldown. First renderer-ready always runs.
    if (
      reason !== "renderer-ready" &&
      lastAutoCheckAt > 0 &&
      now - lastAutoCheckAt < AUTO_CHECK_COOLDOWN_MS
    ) {
      // Still push current status so a pending update re-surfaces in the HUD.
      broadcast?.("mira:update-event", getUpdateStatus());
      return;
    }
    // Only one "first paint" renderer-ready check per process.
    if (reason === "renderer-ready" && rendererReadyScheduled) {
      broadcast?.("mira:update-event", getUpdateStatus());
      return;
    }
    if (reason === "renderer-ready") rendererReadyScheduled = true;
    lastAutoCheckAt = now;
    void checkForUpdates().catch(() => undefined);
  }, delay);
}

/** Re-send latest status (e.g. after renderer mounts / window focused). */
export function pushUpdateStatus(): UpdateStatus {
  const snap = getUpdateStatus();
  broadcast?.("mira:update-event", snap);
  return snap;
}

export function initUpdater(send: Broadcast): void {
  broadcast = send;
  status.currentVersion = app.getVersion();
  status.packaged = app.isPackaged;
  status.canCheck = app.isPackaged;

  if (!app.isPackaged || wired) return;
  wired = true;

  autoUpdater.autoDownload = false;
  // After download: install silently on quit (/S). No NSIS wizard.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  // Keep provider path coherent with electron-builder publish.github
  // (latest.yml / latest-linux.yml on GitHub Releases for current versioning).
  try {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "sSamurai58",
      repo: "Mira-AI",
    });
  } catch {
    /* electron-updater reads app-update.yml from packaged resources */
  }
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
      detail: `Версия ${info.version} скачана. Установится тихо при перезапуске — без окна установщика.`,
      canDownload: false,
      canInstall: true,
    });
  });

  autoUpdater.on("error", (err) => {
    setStatus({
      channel: "error",
      detail: humanizeUpdateError(err),
      canDownload: false,
      canInstall: false,
      progress: null,
    });
  });

  // Fallback only: real auto-check is scheduled from BrowserWindow
  // did-finish-load (see scheduleAutoUpdateCheck in main). This covers the
  // rare case where the window never reports load.
  scheduleAutoUpdateCheck("boot-fallback");
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

  if (checkInFlight) return checkInFlight;

  checkInFlight = (async () => {
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
          detail: humanizeUpdateError(
            "empty checkForUpdates — часто нет latest.yml для Windows в релизе",
          ),
        });
      }
      // Status events above will refine channel; return latest snapshot
      return getUpdateStatus();
    } catch (err) {
      return setStatus({
        channel: "error",
        detail: humanizeUpdateError(err),
        canDownload: false,
        canInstall: false,
      });
    } finally {
      checkInFlight = null;
    }
  })();

  return checkInFlight;
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
      detail: humanizeUpdateError(err),
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
  // isSilent=true → NSIS /S (no wizard); isForceRunAfter=true → relaunch Mira
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 250);
  return { ok: true, detail: "Тихая установка и перезапуск…" };
}

export async function openReleasesPage(): Promise<{ ok: boolean; detail: string }> {
  try {
    await shell.openExternal(RELEASES_URL);
    return { ok: true, detail: "Открыл страницу релизов в браузере" };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
