/**
 * Capacitor Android in-app updates via GitHub Releases APK assets.
 * Electron keeps electron-updater; this path only runs when window.mira is absent.
 */
import { App } from "@capacitor/app";
import { APP_VERSION } from "../config";
import { normalizeMiraVersion } from "./updateChangelog";
import { isCapacitorAndroid } from "./androidPlatform";

const RELEASES_URL = "https://github.com/sSamurai58/Mira-AI/releases";
const RELEASES_API =
  "https://api.github.com/repos/sSamurai58/Mira-AI/releases?per_page=20";
const APK_NAME_RE = /^Mira-(\d+\.\d+\.\d+)-android\.apk$/i;

export type AndroidUpdateStatus = MiraUpdateStatus & {
  apkUrl?: string | null;
};

type GhAsset = {
  name?: string;
  browser_download_url?: string;
};

type GhRelease = {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GhAsset[];
};

let cached: AndroidUpdateStatus | null = null;
let pendingApkUrl: string | null = null;

function compareSemver(a: string, b: string): number {
  const pa = normalizeMiraVersion(a)
    .split(".")
    .map((x) => Number.parseInt(x, 10) || 0);
  const pb = normalizeMiraVersion(b)
    .split(".")
    .map((x) => Number.parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d > 0) return 1;
    if (d < 0) return -1;
  }
  return 0;
}

async function resolveInstalledVersion(): Promise<string> {
  try {
    const info = await App.getInfo();
    const v = normalizeMiraVersion(info.version);
    if (v) return v;
  } catch {
    /* App plugin unavailable — fall back to build-time version */
  }
  return normalizeMiraVersion(APP_VERSION) || APP_VERSION;
}

function baseStatus(
  currentVersion: string,
  patch: Partial<AndroidUpdateStatus> = {},
): AndroidUpdateStatus {
  const next: AndroidUpdateStatus = {
    channel: "idle",
    currentVersion,
    availableVersion: null,
    progress: null,
    detail: "Готово к проверке обновлений APK с GitHub Releases",
    canCheck: true,
    canDownload: false,
    canInstall: false,
    packaged: true,
    releasesUrl: RELEASES_URL,
    apkUrl: pendingApkUrl,
    ...patch,
  };
  cached = next;
  return next;
}

export function isAndroidUpdaterActive(): boolean {
  return isCapacitorAndroid() && !window.mira?.getUpdateStatus;
}

export async function getAndroidUpdateStatus(): Promise<AndroidUpdateStatus> {
  const currentVersion = await resolveInstalledVersion();
  if (cached && cached.currentVersion === currentVersion) {
    return {
      ...cached,
      currentVersion,
      packaged: true,
      releasesUrl: RELEASES_URL,
      apkUrl: pendingApkUrl ?? cached.apkUrl ?? null,
      canCheck:
        cached.channel !== "checking" && cached.channel !== "downloading",
    };
  }
  return baseStatus(currentVersion);
}

function findAndroidApk(releases: GhRelease[]): {
  version: string;
  url: string;
} | null {
  for (const rel of releases) {
    if (rel.draft || rel.prerelease) continue;
    const assets = rel.assets || [];
    for (const asset of assets) {
      const name = asset.name || "";
      const m = APK_NAME_RE.exec(name);
      const url = asset.browser_download_url;
      if (!m || !url) continue;
      return { version: m[1], url };
    }
    // Fallback: any *-android.apk in this release
    const loose = assets.find((a) =>
      /android\.apk$/i.test(a.name || ""),
    );
    if (loose?.browser_download_url) {
      const fromTag = normalizeMiraVersion(rel.tag_name);
      if (fromTag) {
        return { version: fromTag, url: loose.browser_download_url };
      }
    }
  }
  return null;
}

export async function checkAndroidUpdates(): Promise<AndroidUpdateStatus> {
  const currentVersion = await resolveInstalledVersion();
  baseStatus(currentVersion, {
    channel: "checking",
    detail: "Проверяю GitHub Releases на новый APK…",
    canCheck: false,
    canDownload: false,
    canInstall: false,
  });

  try {
    const res = await fetch(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      return baseStatus(currentVersion, {
        channel: "error",
        detail: `GitHub API ${res.status} — не удалось проверить обновления`,
        canCheck: true,
      });
    }
    const json = (await res.json()) as GhRelease[];
    const found = findAndroidApk(Array.isArray(json) ? json : []);
    if (!found) {
      pendingApkUrl = null;
      return baseStatus(currentVersion, {
        channel: "not-available",
        detail: "В релизах нет Android APK",
        canCheck: true,
      });
    }

    const cmp = compareSemver(found.version, currentVersion);
    if (cmp > 0) {
      pendingApkUrl = found.url;
      return baseStatus(currentVersion, {
        channel: "available",
        availableVersion: found.version,
        detail: `Доступен APK ${found.version}. Скачайте и установите поверх текущей версии.`,
        canCheck: true,
        canDownload: true,
        canInstall: true,
        apkUrl: found.url,
      });
    }

    pendingApkUrl = found.url;
    return baseStatus(currentVersion, {
      channel: "not-available",
      availableVersion: found.version,
      detail: `Установлена актуальная версия (${currentVersion})`,
      canCheck: true,
      canDownload: false,
      canInstall: false,
      apkUrl: found.url,
    });
  } catch (err) {
    return baseStatus(currentVersion, {
      channel: "error",
      detail:
        err instanceof Error
          ? err.message
          : "Сеть недоступна — не удалось проверить обновления",
      canCheck: true,
    });
  }
}

async function openExternalUrl(url: string): Promise<void> {
  // Capacitor WebView: system browser / download manager handles APK URLs.
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadAndroidUpdate(): Promise<AndroidUpdateStatus> {
  const currentVersion = await resolveInstalledVersion();
  const url = pendingApkUrl || cached?.apkUrl;
  const availableVersion = cached?.availableVersion;
  if (!url) {
    return baseStatus(currentVersion, {
      channel: "error",
      detail: "Сначала нажмите «Проверить обновления»",
      canCheck: true,
    });
  }

  baseStatus(currentVersion, {
    channel: "downloading",
    availableVersion: availableVersion ?? null,
    detail: "Открываю загрузку APK…",
    progress: null,
    canCheck: false,
    canDownload: false,
    canInstall: false,
    apkUrl: url,
  });

  try {
    await openExternalUrl(url);
    return baseStatus(currentVersion, {
      channel: "downloaded",
      availableVersion: availableVersion ?? null,
      detail:
        "APK открыт в загрузках. Установите пакет (разрешите установку из этого источника при запросе).",
      canCheck: true,
      canDownload: true,
      canInstall: true,
      apkUrl: url,
    });
  } catch (err) {
    return baseStatus(currentVersion, {
      channel: "error",
      availableVersion: availableVersion ?? null,
      detail:
        err instanceof Error
          ? err.message
          : "Не удалось открыть ссылку на APK",
      canCheck: true,
      canDownload: true,
      canInstall: true,
      apkUrl: url,
    });
  }
}

export async function installAndroidUpdate(): Promise<{
  ok: boolean;
  detail: string;
  status: AndroidUpdateStatus;
}> {
  const st = await downloadAndroidUpdate();
  return {
    ok: st.channel === "downloaded",
    detail: st.detail,
    status: st,
  };
}

export async function openAndroidReleasesPage(): Promise<{ detail: string }> {
  await openExternalUrl(RELEASES_URL);
  return { detail: "Открыл страницу релизов" };
}
