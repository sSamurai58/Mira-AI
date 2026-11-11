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
  BROWSER_PREFERRED: "chromium",
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

function readLocal(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Record<string, string>;
    return { ...DEFAULTS, ...parsed };
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
