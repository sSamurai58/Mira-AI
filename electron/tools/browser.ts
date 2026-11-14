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
  return /(история браузера|где я (уже )?был|сайты? на которых я|browser history|посещал|открой историю|найди в истории|какой сайт я открывал)/i.test(
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

export async function openBrowserUrl(
  url: string,
  opts?: { skipConfirm?: boolean },
): Promise<BrowserOpenResult> {
  const policy = getBrowserPolicy();
  if (!policy.enabled) {
    throw new Error("Браузер-инструмент выключен (BROWSER_ENABLED=false).");
  }

  if (policy.requireConfirmOpen && !opts?.skipConfirm) {
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

function systemHistoryEnabled(): boolean {
  return (
    (process.env.BROWSER_SYSTEM_HISTORY ?? "true").trim().toLowerCase() !==
    "false"
  );
}

function chromiumHistoryCandidates(): Array<{ path: string; source: string }> {
  const home = os.homedir();
  return [
    {
      path: path.join(home, ".config", "google-chrome", "Default", "History"),
      source: "chrome",
    },
    {
      path: path.join(home, ".config", "chromium", "Default", "History"),
      source: "chromium",
    },
    {
      path: path.join(home, ".config", "microsoft-edge", "Default", "History"),
      source: "edge",
    },
    {
      path: path.join(home, ".config", "BraveSoftware", "Brave-Browser", "Default", "History"),
      source: "brave",
    },
    {
      path: path.join(
        home,
        "AppData",
        "Local",
        "Google",
        "Chrome",
        "User Data",
        "Default",
        "History",
      ),
      source: "chrome",
    },
    {
      path: path.join(
        home,
        "AppData",
        "Local",
        "Microsoft",
        "Edge",
        "User Data",
        "Default",
        "History",
      ),
      source: "edge",
    },
    {
      path: path.join(
        home,
        "AppData",
        "Local",
        "BraveSoftware",
        "Brave-Browser",
        "User Data",
        "Default",
        "History",
      ),
      source: "brave",
    },
    {
      path: path.join(
        home,
        "Library",
        "Application Support",
        "Google",
        "Chrome",
        "Default",
        "History",
      ),
      source: "chrome",
    },
    {
      path: path.join(
        home,
        "Library",
        "Application Support",
        "Microsoft Edge",
        "Default",
        "History",
      ),
      source: "edge",
    },
  ];
}

function readOneChromiumHistory(
  histPath: string,
  source: string,
  limit: number,
): BrowserVisitRow[] {
  const tmp = path.join(
    os.tmpdir(),
    `mira-${source}-history-${process.pid}-${Math.random().toString(36).slice(2)}.db`,
  );
  fs.copyFileSync(histPath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT url as url, title as title, last_visit_time
         FROM urls
         ORDER BY last_visit_time DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
      url: string;
      title: string;
      last_visit_time: number;
    }>;
    return rows.map((r, i) => ({
      id: `${source}-${i}`,
      url: r.url,
      title: r.title || r.url,
      source,
      visited_at: new Date(
        Math.max(0, r.last_visit_time / 1000 - 11_644_473_600_000),
      ).toISOString(),
    }));
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/** Read Chromium-family History DBs (Chrome/Edge/Brave) if present. */
export function readChromiumHistory(limit = 20): BrowserVisitRow[] {
  if (!systemHistoryEnabled()) return [];
  const out: BrowserVisitRow[] = [];
  const seen = new Set<string>();
  for (const cand of chromiumHistoryCandidates()) {
    if (!fs.existsSync(cand.path)) continue;
    try {
      const rows = readOneChromiumHistory(cand.path, cand.source, limit);
      for (const row of rows) {
        const key = row.url.replace(/\/$/, "").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
        if (out.length >= limit) return out;
      }
    } catch {
      /* try next */
    }
  }
  return out;
}

function firefoxPlacesCandidates(): string[] {
  const home = os.homedir();
  const roots = [
    path.join(home, ".mozilla", "firefox"),
    path.join(home, "AppData", "Roaming", "Mozilla", "Firefox", "Profiles"),
    path.join(home, "Library", "Application Support", "Firefox", "Profiles"),
  ];
  const out: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const places = path.join(root, ent.name, "places.sqlite");
        if (fs.existsSync(places)) out.push(places);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Read Firefox places.sqlite (copy-then-query). */
export function readFirefoxHistory(limit = 20): BrowserVisitRow[] {
  if (!systemHistoryEnabled()) return [];
  for (const places of firefoxPlacesCandidates()) {
    try {
      const tmp = path.join(
        os.tmpdir(),
        `mira-firefox-history-${process.pid}-${Math.random().toString(36).slice(2)}.db`,
      );
      fs.copyFileSync(places, tmp);
      const db = new DatabaseSync(tmp, { readOnly: true });
      try {
        const rows = db
          .prepare(
            `SELECT url as url, title as title, last_visit_date
             FROM moz_places
             WHERE url LIKE 'http%'
             ORDER BY last_visit_date DESC
             LIMIT ?`,
          )
          .all(limit) as Array<{
          url: string;
          title: string | null;
          last_visit_date: number | null;
        }>;
        return rows.map((r, i) => ({
          id: `firefox-${i}`,
          url: r.url,
          title: r.title || r.url,
          source: "firefox",
          // Firefox stores µs since Unix epoch.
          visited_at: new Date(
            Math.max(0, (r.last_visit_date ?? 0) / 1000),
          ).toISOString(),
        }));
      } finally {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* try next profile */
    }
  }
  return [];
}

function matchesHistoryQuery(row: BrowserVisitRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${row.url} ${row.title}`.toLowerCase();
  const tokens = q.split(/[\s,/|]+/).filter((t) => t.length >= 2);
  if (!tokens.length) return hay.includes(q);
  return tokens.some((t) => hay.includes(t));
}

/** Merge Mira visit log + Chrome/Edge/Brave/Firefox history (dedupe by URL). */
export function searchHistory(query: string, limit = 20): BrowserVisitRow[] {
  const q = query.trim();
  const miraHits = searchBrowserVisits(q, limit);
  const system = [
    ...readChromiumHistory(Math.max(50, limit * 2)),
    ...readFirefoxHistory(Math.max(50, limit * 2)),
  ].filter((v) => matchesHistoryQuery(v, q));
  // Prefer newer by visited_at when merging.
  system.sort((a, b) => (a.visited_at < b.visited_at ? 1 : -1));
  const seen = new Set<string>();
  const merged: BrowserVisitRow[] = [];
  for (const row of [...miraHits, ...system]) {
    const key = row.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
    if (merged.length >= limit) break;
  }
  return merged;
}

/** «открой то что вчера / последний сайт» */
export function looksLikeBrowserReopenIntent(text: string): boolean {
  return /(открой (то|сайт) (что|который) (я )?(вчера|недавно|последн)|открой последн[а-яё]* (сайт|вкладк|url)|reopen last|открой снова)/i.test(
    text,
  );
}

export async function reopenLastFromHistory(): Promise<BrowserOpenResult> {
  const hits = searchHistory("", 5);
  const first = hits[0];
  if (!first?.url) {
    return {
      ok: false,
      url: "",
      detail: "В истории нет сайтов, чтобы открыть снова",
    };
  }
  return openBrowserUrl(first.url);
}

/** Keep domain/site words; drop filler phrases from history intents. */
export function extractHistoryQuery(text: string): string {
  return text
    .replace(
      /история браузера|browser history|открой историю|найди в истории|где я (уже )?был|сайты? на которых я (уже )?был|какой сайт я открывал|посещал|покажи историю/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
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
    return "[Браузер: history]\nИстория пуста. Mira visits + Chrome/Edge/Brave/Firefox History не найдены или выключены (BROWSER_SYSTEM_HISTORY).";
  }
  const lines = rows.map(
    (r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.visited_at} · ${r.source}`,
  );
  return `[Браузер: history]\n${lines.join("\n")}`;
}
