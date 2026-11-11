const LS_KEY = "mira_env_settings";

export const SETTINGS_SECRET_KEYS = new Set([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
]);

const DEFAULTS: Record<string, string> = {
  LLM_PROVIDER: "mock",
  LLM_MODEL: "gpt-4o-mini",
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  ANTHROPIC_API_KEY: "",
  GEMINI_API_KEY: "",
  XAI_API_KEY: "",
  VISION_ENABLED: "false",
  WEB_ENABLED: "true",
  WEB_ALLOWLIST: "duckduckgo.com,api.duckduckgo.com",
  WEB_FETCH_CONFIRM: "true",
  SCREEN_ENABLED: "true",
  SCREEN_CONTROL_ENABLED: "false",
  BROWSER_ENABLED: "true",
  BROWSER_PREFERRED: "system",
  BROWSER_OPEN_CONFIRM: "true",
  MESSAGING_ENABLED: "true",
  MESSAGING_MODE: "dry-run",
  MESSAGING_CONFIRM: "true",
  MESSAGING_PRIMARY: "telegram",
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_DEFAULT_CHAT_ID: "",
  WHATSAPP_BRIDGE_URL: "",
  INSTAGRAM_BRIDGE_URL: "",
  OS_PRIORITY: "linux,windows,macos",
  BLENDER_ENABLED: "false",
  BLENDER_PATH: "",
  BLENDER_MODE: "dry-run",
  BLENDER_CONFIRM: "true",
};

export type SettingsEnvSnapshot = {
  values: Record<string, string>;
  secretsSet: Record<string, boolean>;
  source: "electron" | "browser";
  envFile?: string;
};

function migrateLocalModels(values: Record<string, string>): Record<string, string> {
  let provider = (values.LLM_PROVIDER || "mock").trim().toLowerCase();
  if (provider === "xai") provider = "grok";
  const next = { ...values };
  const usingGrok =
    provider === "grok" ||
    ((provider === "mock" || provider === "offline" || !provider) &&
      Boolean((next.XAI_API_KEY || "").trim()) &&
      !(next.OPENAI_API_KEY || "").trim());
  if (usingGrok) {
    const fixed = modelForProvider("grok", next.LLM_MODEL);
    if (fixed !== (next.LLM_MODEL || "").trim()) {
      next.LLM_MODEL = fixed;
      if (provider === "mock" || provider === "offline" || !provider) {
        next.LLM_PROVIDER = "grok";
      }
    }
  }
  return next;
}

function readLocal(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Record<string, string>;
    const merged = migrateLocalModels({ ...DEFAULTS, ...parsed });
    // Persist remap so Settings field and chat stay in sync
    if (merged.LLM_MODEL !== (parsed.LLM_MODEL || DEFAULTS.LLM_MODEL)) {
      writeLocal(merged);
    }
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

function writeLocal(values: Record<string, string>) {
  localStorage.setItem(LS_KEY, JSON.stringify(values));
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function secretsFrom(values: Record<string, string>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of SETTINGS_SECRET_KEYS) {
    const v = values[key] ?? "";
    out[key] = Boolean(v) && !v.startsWith("••••");
  }
  return out;
}

function displayValues(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...values };
  for (const key of SETTINGS_SECRET_KEYS) {
    const raw = values[key] ?? "";
    out[key] = raw && !raw.startsWith("••••") ? maskSecret(raw) : raw;
  }
  return out;
}

export async function loadSettingsEnv(): Promise<SettingsEnvSnapshot> {
  if (window.mira?.getSettingsEnv) {
    try {
      const snap = await window.mira.getSettingsEnv();
      return {
        values: { ...DEFAULTS, ...snap.values },
        secretsSet: snap.secretsSet,
        source: "electron",
        envFile: snap.envFile,
      };
    } catch {
      /* fall through to browser demo */
    }
  }
  const stored = readLocal();
  return {
    values: displayValues(stored),
    secretsSet: secretsFrom(stored),
    source: "browser",
  };
}

export async function saveSettingsEnv(
  patch: Record<string, string>,
): Promise<{ ok: boolean; detail: string; snap: SettingsEnvSnapshot }> {
  if (window.mira?.setSettingsEnv) {
    try {
      const res = await window.mira.setSettingsEnv(patch);
      return {
        ok: res.ok,
        detail: res.detail,
        snap: {
          values: { ...DEFAULTS, ...res.values },
          secretsSet: res.secretsSet,
          source: "electron",
        },
      };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        snap: await loadSettingsEnv(),
      };
    }
  }

  const current = readLocal();
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULTS) && !(key in current)) {
      // still allow known defaults keys only
    }
    if (SETTINGS_SECRET_KEYS.has(key)) {
      const trimmed = value.trim();
      if (!trimmed) {
        current[key] = "";
        continue;
      }
      if (trimmed.startsWith("••••")) continue;
      current[key] = trimmed;
      continue;
    }
    current[key] = value;
  }
  writeLocal(current);
  return {
    ok: true,
    detail: "Сохранено в браузере (demo). В Electron пишется в `.env`.",
    snap: {
      values: displayValues(current),
      secretsSet: secretsFrom(current),
      source: "browser",
    },
  };
}

export function isTruthyEnv(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function boolToEnv(on: boolean): string {
  return on ? "true" : "false";
}

/** Unmasked browser-local settings (for demo LLM calls). */
export function getRawBrowserSettings(): Record<string, string> {
  return readLocal();
}

export type BrowserLlmConfig = {
  provider: "openai" | "grok" | "claude" | "gemini" | "mock";
  model: string;
  apiKey: string;
  /** Same-origin proxy path or absolute OpenAI-compatible base */
  baseUrl: string;
  label: string;
};

const DEFAULT_MODELS: Record<string, string> = {
  // xAI retired grok-2*; current public chat default is grok-4.7
  grok: "grok-4.7",
  openai: "gpt-4o-mini",
  claude: "claude-3-5-sonnet-latest",
  gemini: "gemini-2.0-flash",
};

/** Retired / redirected xAI ids that 404 on current API. */
const RETIRED_GROK_MODELS = new Set([
  "grok-2",
  "grok-2-latest",
  "grok-2-1212",
  "grok-2-vision",
  "grok-2-vision-1212",
  "grok-beta",
  "grok-vision-beta",
]);

/** Pick a model that belongs to the provider (avoid gpt-* on xAI, etc.). */
export function modelForProvider(
  provider: string,
  requested: string | undefined,
): string {
  const p = provider.trim().toLowerCase();
  const fallback = DEFAULT_MODELS[p] || "gpt-4o-mini";
  const model = (requested || "").trim();
  if (!model) return fallback;

  const lower = model.toLowerCase();
  if (p === "grok") {
    if (RETIRED_GROK_MODELS.has(lower)) return fallback;
    // grok-3* may still redirect on some accounts; prefer current default if exact retired alias
    if (lower.startsWith("grok") || lower.startsWith("xai")) return model;
    return fallback;
  }
  if (p === "openai") {
    if (
      lower.startsWith("gpt") ||
      lower.startsWith("o1") ||
      lower.startsWith("o3") ||
      lower.startsWith("o4") ||
      lower.includes("chatgpt")
    ) {
      return model;
    }
    // Custom OpenAI-compatible proxies may use any id — keep if not clearly foreign
    if (
      lower.startsWith("grok") ||
      lower.startsWith("claude") ||
      lower.startsWith("gemini")
    ) {
      return fallback;
    }
    return model;
  }
  if (p === "claude") {
    if (lower.startsWith("claude")) return model;
    return fallback;
  }
  if (p === "gemini") {
    if (lower.startsWith("gemini") || lower.startsWith("models/")) return model;
    return fallback;
  }
  return model || fallback;
}

/**
 * Resolve which live model the browser demo can call.
 * Uses Vite `/mira-llm/*` proxies to avoid CORS.
 */
export function resolveBrowserLlmConfig(
  values: Record<string, string> = readLocal(),
): BrowserLlmConfig {
  let provider = (values.LLM_PROVIDER || "mock").trim().toLowerCase();
  if (provider === "xai") provider = "grok";

  const openaiKey = (values.OPENAI_API_KEY || "").trim();
  const xaiKey = (values.XAI_API_KEY || "").trim();
  const anthropicKey = (values.ANTHROPIC_API_KEY || "").trim();
  const geminiKey = (values.GEMINI_API_KEY || "").trim();

  // Auto-pick when provider left on mock but a key exists
  if (provider === "mock" || provider === "offline" || !provider) {
    if (xaiKey) provider = "grok";
    else if (openaiKey) provider = "openai";
    else if (anthropicKey) provider = "claude";
    else if (geminiKey) provider = "gemini";
  }

  const requested = (values.LLM_MODEL || "").trim();

  if (provider === "grok" && xaiKey) {
    const model = modelForProvider("grok", requested);
    return {
      provider: "grok",
      model,
      apiKey: xaiKey,
      baseUrl: "/mira-llm/xai",
      label: `grok/${model}`,
    };
  }
  if (provider === "openai" && openaiKey) {
    const custom = (values.OPENAI_BASE_URL || "").trim();
    const useProxy = !custom || custom.includes("api.openai.com");
    const model = modelForProvider("openai", requested);
    return {
      provider: "openai",
      model,
      apiKey: openaiKey,
      baseUrl: useProxy ? "/mira-llm/openai" : custom.replace(/\/$/, ""),
      label: `openai/${model}`,
    };
  }
  if (provider === "claude" && anthropicKey) {
    const model = modelForProvider("claude", requested);
    return {
      provider: "claude",
      model,
      apiKey: anthropicKey,
      baseUrl: "/mira-llm/anthropic",
      label: `claude/${model}`,
    };
  }
  if (provider === "gemini" && geminiKey) {
    const model = modelForProvider("gemini", requested);
    return {
      provider: "gemini",
      model,
      apiKey: geminiKey,
      baseUrl: "/mira-llm/gemini",
      label: `gemini/${model}`,
    };
  }

  return {
    provider: "mock",
    model: "mock",
    apiKey: "",
    baseUrl: "",
    label: "browser-only",
  };
}
