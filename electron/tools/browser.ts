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

export function getBrowserPolicy(): {
  enabled: boolean;
  preferred: string;
  requireConfirmOpen: boolean;
} {
  return {
    enabled:
      (process.env.BROWSER_ENABLED ?? "true").trim().toLowerCase() !== "false",
    preferred: (process.env.BROWSER_PREFERRED ?? "chromium").trim(),
    requireConfirmOpen:
      (process.env.BROWSER_OPEN_CONFIRM ?? "true").trim().toLowerCase() !==
      "false",
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
      title: "Открыть в браузере",
      body: `Mira откроет URL во внешнем браузере:\n${url}`,
      confirmLabel: "Открыть",
    });
    if (!ok) {
      return { ok: false, url, detail: "Отклонено пользователем" };
    }
  }

  if (isElectronRuntime()) {
    const { shell } = await import("electron");
    await shell.openExternal(url);
    addBrowserVisit(url, "mira-open");
    return {
      ok: true,
      url,
      detail: `Открыто через shell.openExternal (preferred=${policy.preferred})`,
    };
  }

  // Headless/smoke: record visit without launching a browser UI.
  addBrowserVisit(url, "mira-open-dry");
  return {
    ok: true,
    url,
    detail: `Зафиксировано без GUI (preferred=${policy.preferred}); shell.openExternal пропущен вне Electron.`,
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
