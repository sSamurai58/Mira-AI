import { loadConfig } from "../config";
import dns from "node:dns/promises";
import net from "node:net";

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
  allowlist: string[]; // hostnames; ["*"] only for search helpers — fetch still blocks private IPs
  requireConfirmForFetch: boolean;
};

export function getWebPolicy(): WebPolicy {
  const cfg = loadConfig();
  const enabled =
    (process.env.WEB_ENABLED ?? "true").trim().toLowerCase() !== "false";
  // Fetch allowlist defaults to duckduckgo + example; "*" remains possible but SSRF guard still applies.
  const raw = (
    process.env.WEB_ALLOWLIST ??
    "duckduckgo.com,api.duckduckgo.com,wttr.in,api.open-meteo.com,geocoding-api.open-meteo.com"
  ).trim();
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

function isPrivateIp(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "0.0.0.0") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) {
    return true;
  }
  const parts = normalized.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n))) {
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

export async function assertSafeFetchUrl(targetUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error(`Некорректный URL: ${targetUrl}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Разрешены только http/https");
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error(`Хост ${host} запрещён (SSRF guard)`);
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error(`IP ${host} запрещён (SSRF guard)`);
    }
  } else {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    for (const rec of records) {
      if (isPrivateIp(rec.address)) {
        throw new Error(
          `Хост ${host} резолвится в приватный адрес ${rec.address} (SSRF guard)`,
        );
      }
    }
  }
  return parsed;
}

export function looksLikeWebIntent(text: string): boolean {
  return (
    /https?:\/\//i.test(text) ||
    /(интернет|в сети|найди|поиск|погода|новост|что сейчас|актуальн|latest|search|fetch)/i.test(
      text,
    )
  );
}

export function looksLikeWeatherIntent(text: string): boolean {
  return /(погод|температур|осадк|ветер|влажност|°|градус|weather|forecast)/i.test(
    text,
  );
}

/** Current weather via wttr.in (no API key). */
export async function fetchWeatherSnapshot(
  placeQuery: string,
  signal?: AbortSignal,
): Promise<string> {
  const place =
    placeQuery
      .replace(
        /^(какая|какой|какое|что|покажи|скажи|проверь|узнай)\s+/i,
        "",
      )
      .replace(
        /\b(сейчас|в данный момент|на улице|погода|температура|weather|forecast|сейчас)\b/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim() || "Moscow";

  const url = `https://wttr.in/${encodeURIComponent(place)}?format=j1&lang=ru`;
  await assertSafeFetchUrl(url);
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "MiraAssistant/0.0.4 (+local)",
    },
  });
  if (!res.ok) {
    throw new Error(`wttr.in HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    current_condition?: Array<{
      temp_C?: string;
      FeelsLikeC?: string;
      weatherDesc?: Array<{ value?: string }>;
      windspeedKmph?: string;
      winddir16Point?: string;
      humidity?: string;
      pressure?: string;
      lang_ru?: Array<{ value?: string }>;
    }>;
    nearest_area?: Array<{
      areaName?: Array<{ value?: string }>;
      country?: Array<{ value?: string }>;
    }>;
  };
  const cur = data.current_condition?.[0];
  if (!cur) {
    return `[Погода] Нет данных wttr.in для «${place}».`;
  }
  const area =
    data.nearest_area?.[0]?.areaName?.[0]?.value ||
    place;
  const country = data.nearest_area?.[0]?.country?.[0]?.value || "";
  const desc =
    cur.lang_ru?.[0]?.value ||
    cur.weatherDesc?.[0]?.value ||
    "—";
  const windMs = cur.windspeedKmph
    ? (Number(cur.windspeedKmph) / 3.6).toFixed(1)
    : "—";
  const pressureMm = cur.pressure
    ? Math.round(Number(cur.pressure) * 0.750062).toString()
    : "—";
  return [
    `[Погода: wttr.in · ${area}${country ? `, ${country}` : ""}]`,
    `Сейчас: ${cur.temp_C ?? "—"}°C (ощущается ${cur.FeelsLikeC ?? "—"}°C)`,
    `Условия: ${desc}`,
    `Ветер: ${windMs} м/с${cur.winddir16Point ? ` (${cur.winddir16Point})` : ""}`,
    `Влажность: ${cur.humidity ?? "—"}%`,
    `Давление: ${pressureMm} мм рт. ст.`,
    "",
    "Используй эти цифры как актуальные. Не говори, что данных нет.",
  ].join("\n");
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
  await assertSafeFetchUrl(url);
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
  const parsed = await assertSafeFetchUrl(targetUrl);
  if (!hostAllowed(parsed.hostname, policy.allowlist)) {
    throw new Error(
      `Хост ${parsed.hostname} не в WEB_ALLOWLIST (${policy.allowlist.join(", ")})`,
    );
  }

  const res = await fetch(parsed.toString(), {
    signal,
    redirect: "error",
    headers: { "User-Agent": "MiraAssistant/0.0.4 (+local)" },
  });
  const contentType = res.headers.get("content-type") || "";
  let text = await res.text();
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
