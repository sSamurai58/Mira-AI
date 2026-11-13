/**
 * Free HTTP translate for «Быстрый» mode.
 * Primary: Google Translate unofficial (gtx) — works in Electron/browser when egress allows.
 * Fallback: MyMemory — honest error if both fail.
 */

export type QuickTranslateResult = {
  text: string;
  detectedSource?: string;
  provider: "google-gtx" | "mymemory";
};

export type QuickTranslateError = {
  ok: false;
  message: string;
};

const CHUNK = 1400;

function splitChunks(text: string): string[] {
  if (text.length <= CHUNK) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > CHUNK) {
    let cut = rest.lastIndexOf("\n", CHUNK);
    if (cut < CHUNK * 0.4) cut = rest.lastIndexOf(" ", CHUNK);
    if (cut < CHUNK * 0.4) cut = CHUNK;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest) parts.push(rest);
  return parts;
}

async function translateGtxChunk(
  text: string,
  source: string,
  target: string,
  signal?: AbortSignal,
): Promise<{ text: string; detected?: string }> {
  const sl = source === "auto" ? "auto" : source;
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    `?client=gtx&sl=${encodeURIComponent(sl)}` +
    `&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Google gtx HTTP ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  // Shape: [[["translated","src",…],…], null, "detected", …]
  if (!Array.isArray(json) || !Array.isArray(json[0])) {
    throw new Error("Google gtx: unexpected response");
  }
  const pieces: string[] = [];
  for (const row of json[0]) {
    if (Array.isArray(row) && typeof row[0] === "string") pieces.push(row[0]);
  }
  const out = pieces.join("");
  if (!out) throw new Error("Google gtx: empty translation");
  const detected = typeof json[2] === "string" ? json[2] : undefined;
  return { text: out, detected };
}

async function translateMyMemoryChunk(
  text: string,
  source: string,
  target: string,
  signal?: AbortSignal,
): Promise<{ text: string; detected?: string }> {
  const pair =
    source === "auto"
      ? `Autodetect|${target}`
      : `${source}|${target}`;
  const url =
    "https://api.mymemory.translated.net/get" +
    `?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`MyMemory HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    responseStatus?: number;
    responseData?: {
      translatedText?: string;
      detectedLanguage?: string;
    };
    responseDetails?: string;
  };
  if (json.responseStatus !== 200 || !json.responseData?.translatedText) {
    throw new Error(
      json.responseDetails ||
        `MyMemory: status ${json.responseStatus ?? "unknown"}`,
    );
  }
  return {
    text: json.responseData.translatedText,
    detected: json.responseData.detectedLanguage,
  };
}

async function runChunked(
  text: string,
  source: string,
  target: string,
  fn: (
    chunk: string,
    source: string,
    target: string,
    signal?: AbortSignal,
  ) => Promise<{ text: string; detected?: string }>,
  signal?: AbortSignal,
): Promise<{ text: string; detected?: string }> {
  const chunks = splitChunks(text);
  const outs: string[] = [];
  let detected: string | undefined;
  for (const chunk of chunks) {
    const r = await fn(chunk, source, target, signal);
    outs.push(r.text);
    if (!detected && r.detected) detected = r.detected;
  }
  return { text: outs.join(""), detected };
}

export async function quickTranslate(opts: {
  text: string;
  source: string;
  target: string;
  signal?: AbortSignal;
}): Promise<QuickTranslateResult> {
  const text = opts.text.trim();
  if (!text) {
    return { text: "", provider: "google-gtx" };
  }
  if (opts.source !== "auto" && opts.source === opts.target) {
    return { text, provider: "google-gtx", detectedSource: opts.source };
  }

  const errors: string[] = [];

  try {
    const r = await runChunked(
      text,
      opts.source,
      opts.target,
      translateGtxChunk,
      opts.signal,
    );
    return {
      text: r.text,
      detectedSource: r.detected,
      provider: "google-gtx",
    };
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    errors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    const r = await runChunked(
      text,
      opts.source,
      opts.target,
      translateMyMemoryChunk,
      opts.signal,
    );
    return {
      text: r.text,
      detectedSource: r.detected,
      provider: "mymemory",
    };
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    errors.push(err instanceof Error ? err.message : String(err));
  }

  throw new Error(
    `Быстрый перевод недоступен (сеть/API). ${errors.join(" · ")}`,
  );
}
