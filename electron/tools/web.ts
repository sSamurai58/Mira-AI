import { loadConfig } from "../config";

export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type WebFetchResult = {
  url: string;
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
};

export type WebPolicy = {
  enabled: boolean;
  allowlist: string[]; // hostnames; empty or ["*"] = allow all (still confirm fetch if required)
  requireConfirmForFetch: boolean;
};

export function getWebPolicy(): WebPolicy {
  const cfg = loadConfig();
  const enabled =
    (process.env.WEB_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const raw = (process.env.WEB_ALLOWLIST ?? "*").trim();
  const allowlist = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const requireConfirmForFetch =
    (process.env.WEB_FETCH_CONFIRM ?? "true").trim().toLowerCase() !== "false";
  void cfg;
  return { enabled, allowlist, requireConfirmForFetch };
}

function hostAllowed(hostname: string, allowlist: string[]): boolean {
  if (!allowlist.length || allowlist.includes("*")) return true;
  const host = hostname.toLowerCase();
  return allowlist.some(
    (rule) => host === rule || host.endsWith(`.${rule}`),
  );
}

export function looksLikeWebIntent(text: string): boolean {
  return (
    /https?:\/\//i.test(text) ||
    /(интернет|в сети|найди|поиск|погода|новост|что сейчас|актуальн|latest|search|fetch)/i.test(
      text,
    )
  );
}

export function extractSearchQueryFromText(text: string): string {
  const url = text.match(/https?:\/\/\S+/i)?.[0];
  if (url) return url;
  return text
    .replace(
      /^(найди|поищи|поиск|что|какая|какой|расскажи|проверь)\s+/i,
      "",
    )
    .trim()
    .slice(0, 200);
}

/** DuckDuckGo Instant Answer API — no key required. */
export async function webSearch(
  query: string,
  signal?: AbortSignal,
): Promise<WebSearchHit[]> {
  const policy = getWebPolicy();
  if (!policy.enabled) {
    throw new Error("Интернет-инструменты выключены (WEB_ENABLED=false).");
  }
  const q = query.trim();
  if (!q) return [];

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`web.search HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: unknown }>;
    Results?: Array<{ Text?: string; FirstURL?: string }>;
  };

  const hits: WebSearchHit[] = [];
  if (data.AbstractText) {
    hits.push({
      title: data.Heading || "DuckDuckGo",
      url: data.AbstractURL || "",
      snippet: data.AbstractText.slice(0, 500),
    });
  }
  for (const r of data.Results ?? []) {
    if (r.Text) {
      hits.push({
        title: r.Text.slice(0, 80),
        url: r.FirstURL || "",
        snippet: r.Text.slice(0, 240),
      });
    }
  }
  for (const t of data.RelatedTopics ?? []) {
    if (t.Text && t.FirstURL) {
      hits.push({
        title: t.Text.slice(0, 80),
        url: t.FirstURL,
        snippet: t.Text.slice(0, 240),
      });
    }
    if (hits.length >= 5) break;
  }

  if (!hits.length) {
    hits.push({
      title: "Нет краткого ответа DDG",
      url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
      snippet: "Откройте ссылку или уточните запрос. (P4 web.search)",
    });
  }
  return hits.slice(0, 5);
}

export async function webFetch(
  targetUrl: string,
  signal?: AbortSignal,
): Promise<WebFetchResult> {
  const policy = getWebPolicy();
  if (!policy.enabled) {
    throw new Error("Интернет-инструменты выключены (WEB_ENABLED=false).");
  }
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error(`Некорректный URL: ${targetUrl}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Разрешены только http/https");
  }
  if (!hostAllowed(parsed.hostname, policy.allowlist)) {
    throw new Error(
      `Хост ${parsed.hostname} не в WEB_ALLOWLIST (${policy.allowlist.join(", ")})`,
    );
  }

  const res = await fetch(parsed.toString(), {
    signal,
    redirect: "follow",
    headers: { "User-Agent": "MiraAssistant/0.0.1 (+local)" },
  });
  const contentType = res.headers.get("content-type") || "";
  let text = await res.text();
  // strip tags lightly for HTML
  if (contentType.includes("html")) {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return {
    url: parsed.toString(),
    ok: res.ok,
    status: res.status,
    contentType,
    text: text.slice(0, 4000),
  };
}

export function formatWebBlock(
  kind: "search" | "fetch",
  payload: WebSearchHit[] | WebFetchResult,
): string {
  if (kind === "search") {
    const hits = payload as WebSearchHit[];
    const lines = hits.map(
      (h, i) =>
        `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`,
    );
    return `[Интернет: web.search]\n${lines.join("\n")}`;
  }
  const f = payload as WebFetchResult;
  return `[Интернет: web.fetch ${f.status} ${f.url}]\n${f.text}`;
}
