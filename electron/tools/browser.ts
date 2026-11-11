import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { requestUserConfirm } from "../confirmBridge";
import {
  addBrowserVisit,
  searchBrowserVisits,
  type BrowserVisitRow,
} from "../store";

function isElectronRuntime(): boolean {
  return typeof process.versions.electron === "string";
}

export type BrowserOpenResult = {
  ok: boolean;
  url: string;
  detail: string;
};

export type InstalledBrowser = {
  id: string;
  name: string;
  path: string | null;
  installed: boolean;
};

type BrowserProbe = {
  id: string;
  name: string;
  linuxBins?: string[];
  macApps?: string[];
  winExes?: string[];
};

const BROWSER_PROBES: BrowserProbe[] = [
  {
    id: "chrome",
    name: "Google Chrome",
    linuxBins: ["google-chrome-stable", "google-chrome", "chrome"],
    macApps: ["Google Chrome.app"],
    winExes: [
      "Google\\Chrome\\Application\\chrome.exe",
      "Google\\Chrome Beta\\Application\\chrome.exe",
    ],
  },
  {
    id: "chromium",
    name: "Chromium",
    linuxBins: ["chromium-browser", "chromium", "chromium-freeworld"],
    macApps: ["Chromium.app"],
    winExes: ["Chromium\\Application\\chrome.exe"],
  },
  {
    id: "firefox",
    name: "Firefox",
    linuxBins: ["firefox", "firefox-esr"],
    macApps: ["Firefox.app"],
    winExes: ["Mozilla Firefox\\firefox.exe"],
  },
  {
    id: "brave",
    name: "Brave",
    linuxBins: ["brave-browser", "brave"],
    macApps: ["Brave Browser.app"],
    winExes: ["BraveSoftware\\Brave-Browser\\Application\\brave.exe"],
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    linuxBins: ["microsoft-edge", "microsoft-edge-stable", "edge"],
    macApps: ["Microsoft Edge.app"],
    winExes: ["Microsoft\\Edge\\Application\\msedge.exe"],
  },
  {
    id: "opera",
    name: "Opera",
    linuxBins: ["opera"],
    macApps: ["Opera.app"],
    winExes: ["Opera\\opera.exe"],
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    linuxBins: ["vivaldi", "vivaldi-stable"],
    macApps: ["Vivaldi.app"],
    winExes: ["Vivaldi\\Application\\vivaldi.exe"],
  },
  {
    id: "safari",
    name: "Safari",
    macApps: ["Safari.app"],
  },
];

function whichBin(bin: string): string | null {
  try {
    const res = spawnSync("which", [bin], { encoding: "utf8" });
    const out = (res.stdout || "").trim().split("\n")[0]?.trim();
    if (res.status === 0 && out && fs.existsSync(out)) return out;
  } catch {
    /* ignore */
  }
  return null;
}

function resolveWinExe(rel: string): string | null {
  const roots = [
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
    process.env.LOCALAPPDATA,
  ].filter(Boolean) as string[];
  for (const root of roots) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function resolveMacApp(appName: string): string | null {
  const candidates = [
    path.join("/Applications", appName),
    path.join(os.homedir(), "Applications", appName),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function probeBrowser(spec: BrowserProbe): InstalledBrowser | null {
  const platform = process.platform;
  if (platform === "linux" || platform === "freebsd" || platform === "openbsd") {
    for (const bin of spec.linuxBins ?? []) {
      const found = whichBin(bin);
      if (found) {
        return { id: spec.id, name: spec.name, path: found, installed: true };
      }
    }
    return null;
  }
  if (platform === "darwin") {
    for (const app of spec.macApps ?? []) {
      const found = resolveMacApp(app);
      if (found) {
        return { id: spec.id, name: spec.name, path: found, installed: true };
      }
    }
    return null;
  }
  if (platform === "win32") {
    for (const rel of spec.winExes ?? []) {
      const found = resolveWinExe(rel);
      if (found) {
        return { id: spec.id, name: spec.name, path: found, installed: true };
      }
    }
    return null;
  }
  return null;
}

/** Detect browsers available on this machine (+ always «system»). */
export function listInstalledBrowsers(): InstalledBrowser[] {
  const found: InstalledBrowser[] = [
    {
      id: "system",
      name: "Системный по умолчанию",
      path: null,
      installed: true,
    },
  ];
  const seen = new Set<string>(["system"]);
  for (const spec of BROWSER_PROBES) {
    const hit = probeBrowser(spec);
    if (!hit || seen.has(hit.id)) continue;
    seen.add(hit.id);
    found.push(hit);
  }
  return found;
}

function resolvePreferredLaunch(
  preferred: string,
): { id: string; name: string; path: string | null } | null {
  const id = preferred.trim().toLowerCase() || "system";
  if (id === "system") {
    return { id: "system", name: "Системный по умолчанию", path: null };
  }
  const installed = listInstalledBrowsers().find((b) => b.id === id);
  if (installed?.installed) return installed;
  // Prefer matching probe even if path rediscovery needed
  const probe = BROWSER_PROBES.find((p) => p.id === id);
  if (!probe) return null;
  const hit = probeBrowser(probe);
  return hit;
}

async function launchWithPreferred(
  url: string,
  preferred: string,
): Promise<{ ok: boolean; detail: string }> {
  const target = resolvePreferredLaunch(preferred);
  if (!target || target.id === "system" || !target.path) {
    if (isElectronRuntime()) {
      const { shell } = await import("electron");
      await shell.openExternal(url);
      return {
        ok: true,
        detail: `Открыто системным браузером (shell.openExternal)`,
      };
    }
    return {
      ok: true,
      detail: `Зафиксировано без GUI (system); shell.openExternal пропущен вне Electron.`,
    };
  }

  if (!isElectronRuntime()) {
    return {
      ok: true,
      detail: `Зафиксировано без GUI (preferred=${target.id}); запуск ${target.path} пропущен вне Electron.`,
    };
  }

  try {
    if (process.platform === "darwin" && target.path.endsWith(".app")) {
      spawn("open", ["-a", target.path, url], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else if (process.platform === "win32") {
      spawn(target.path, [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn(target.path, [url], { detached: true, stdio: "ignore" }).unref();
    }
    return {
      ok: true,
      detail: `Открыто в ${target.name} (${target.path})`,
    };
  } catch (err) {
    // Fallback to system handler
    const { shell } = await import("electron");
    await shell.openExternal(url);
    return {
      ok: true,
      detail: `Не удалось запустить ${target.name}, открыто системным браузером: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

export function getBrowserPolicy(): {
  enabled: boolean;
  preferred: string;
  requireConfirmOpen: boolean;
  installed: InstalledBrowser[];
} {
  const preferred = (process.env.BROWSER_PREFERRED ?? "system").trim();
  const installed = listInstalledBrowsers();
  const preferredOk =
    preferred === "system" || installed.some((b) => b.id === preferred);
  return {
    enabled:
      (process.env.BROWSER_ENABLED ?? "true").trim().toLowerCase() !== "false",
    preferred: preferredOk ? preferred : "system",
    requireConfirmOpen:
      (process.env.BROWSER_OPEN_CONFIRM ?? "true").trim().toLowerCase() !==
      "false",
    installed,
  };
}

export function looksLikeBrowserOpenIntent(text: string): boolean {
  return (
    /(открой|open)\s+(сайт|url|страницу|https?:\/\/)/i.test(text) ||
    /(открой)\s+https?:\/\//i.test(text)
  );
}

export function looksLikeBrowserHistoryIntent(text: string): boolean {
  return /(история браузера|где я (уже )?был|сайты? на которых я|browser history|посещал)/i.test(
    text,
  );
}

export function extractOpenUrl(text: string): string | null {
  const direct = text.match(/https?:\/\/[^\s]+/i)?.[0];
  if (direct) return direct.replace(/[),.]+$/, "");
  const site = text.match(
    /(?:открой|open)\s+(?:сайт|страницу|url)?\s*([a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?)/i,
  );
  if (site?.[1]) {
    const host = site[1].replace(/[),.]+$/, "");
    return host.startsWith("http") ? host : `https://${host}`;
  }
  return null;
}

export async function openBrowserUrl(url: string): Promise<BrowserOpenResult> {
  const policy = getBrowserPolicy();
  if (!policy.enabled) {
    throw new Error("Браузер-инструмент выключен (BROWSER_ENABLED=false).");
  }

  if (policy.requireConfirmOpen) {
    const ok = await requestUserConfirm({
      actionClass: "browser",
      risk: "low",
      title: "Открыть в браузере",
      body: `Mira откроет URL во внешнем браузере:\n${url}`,
      confirmLabel: "Открыть",
    });
    if (!ok) {
      return { ok: false, url, detail: "Отклонено пользователем" };
    }
  }

  const launched = await launchWithPreferred(url, policy.preferred);
  addBrowserVisit(
    url,
    isElectronRuntime() ? "mira-open" : "mira-open-dry",
  );
  return {
    ok: launched.ok,
    url,
    detail: launched.detail,
  };
}

/** Read Chromium/Chrome History if present (read-only copy). */
export function readChromiumHistory(limit = 20): BrowserVisitRow[] {
  const candidates = [
    path.join(os.homedir(), ".config", "google-chrome", "Default", "History"),
    path.join(os.homedir(), ".config", "chromium", "Default", "History"),
    path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "Default",
      "History",
    ),
  ];

  // Prefer Mira's own visit log for reliability in P5
  const local = searchBrowserVisits("", limit);
  if (local.length) return local;

  const systemHistory =
    (process.env.BROWSER_SYSTEM_HISTORY ?? "false").trim().toLowerCase() ===
    "true";
  if (!systemHistory) return [];

  for (const histPath of candidates) {
    if (!fs.existsSync(histPath)) continue;
    try {
      // History DB is often locked; copy then query via node:sqlite
      const tmp = path.join(
        os.tmpdir(),
        `mira-chrome-history-${process.pid}.db`,
      );
      fs.copyFileSync(histPath, tmp);
      // Lazy import to avoid circular issues
      const db = new DatabaseSync(tmp, { readOnly: true });
      const rows = db
        .prepare(
          `SELECT url as url, title as title, last_visit_time
           FROM urls
           ORDER BY last_visit_time DESC
           LIMIT ?`,
        )
        .all(limit) as Array<{ url: string; title: string; last_visit_time: number }>;
      db.close();
      fs.unlinkSync(tmp);
      return rows.map((r, i) => ({
        id: `chrome-${i}`,
        url: r.url,
        title: r.title || r.url,
        source: "chromium",
        visited_at: new Date(Date.now() - i * 1000).toISOString(),
      }));
    } catch {
      // try next
    }
  }
  return [];
}

export function searchHistory(query: string, limit = 20): BrowserVisitRow[] {
  const q = query.trim();
  const miraHits = searchBrowserVisits(q, limit);
  if (miraHits.length) return miraHits;
  const chrome = readChromiumHistory(50);
  if (!q) return chrome.slice(0, limit);
  const lower = q.toLowerCase();
  return chrome
    .filter(
      (v) =>
        v.url.toLowerCase().includes(lower) ||
        v.title.toLowerCase().includes(lower),
    )
    .slice(0, limit);
}

export function formatBrowserBlock(
  kind: "open" | "history",
  payload: BrowserOpenResult | BrowserVisitRow[],
): string {
  if (kind === "open") {
    const o = payload as BrowserOpenResult;
    return `[Браузер: open]\n${o.ok ? "OK" : "FAIL"} ${o.url}\n${o.detail}`;
  }
  const rows = payload as BrowserVisitRow[];
  if (!rows.length) {
    return "[Браузер: history]\nИстория пуста. Пока пишутся только URL, открытые через Mira; Chromium History не найден или недоступен.";
  }
  const lines = rows.map(
    (r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.visited_at} · ${r.source}`,
  );
  return `[Браузер: history]\n${lines.join("\n")}`;
}
