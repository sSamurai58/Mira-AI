import fs from "node:fs";
import path from "node:path";
import { envFilePath } from "./appPaths";
import { loadConfig } from "./config";

/** Serialize .env writes so concurrent Save/Delete cannot clobber each other. */
let envWriteChain: Promise<unknown> = Promise.resolve();

function enqueueEnvWrite<T>(fn: () => T): Promise<T> {
  const next = envWriteChain.then(() => fn(), () => fn());
  envWriteChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/** Keys editable from Settings UI (written into project `.env`). */
export const SETTINGS_ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_MODEL_ID",
  "ELEVENLABS_STABILITY",
  "ELEVENLABS_SIMILARITY",
  "ELEVENLABS_STYLE",
  "ELEVENLABS_SPEAKER_BOOST",
  "VISION_ENABLED",
  "WEB_ENABLED",
  "WEB_ALLOWLIST",
  "WEB_FETCH_CONFIRM",
  "SCREEN_ENABLED",
  "SCREEN_CONTROL_ENABLED",
  "BROWSER_ENABLED",
  "BROWSER_PREFERRED",
  "BROWSER_OPEN_CONFIRM",
  "MESSAGING_ENABLED",
  "MESSAGING_MODE",
  "MESSAGING_CONFIRM",
  "MESSAGING_PRIMARY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_DEFAULT_CHAT_ID",
  "WHATSAPP_BRIDGE_URL",
  "INSTAGRAM_BRIDGE_URL",
  "OS_PRIORITY",
  "BLENDER_ENABLED",
  "BLENDER_PATH",
  "BLENDER_MODE",
  "BLENDER_CONFIRM",
] as const;

export type SettingsEnvKey = (typeof SETTINGS_ENV_KEYS)[number];

const SECRET_KEYS = new Set<string>([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "TELEGRAM_BOT_TOKEN",
]);

function envPath(): string {
  return envFilePath();
}

function parseEnvFile(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function getSettingsEnv(): {
  values: Record<string, string>;
  secretsSet: Record<string, boolean>;
  envFile: string;
  exists: boolean;
} {
  const file = envPath();
  const fromFile = fs.existsSync(file)
    ? parseEnvFile(fs.readFileSync(file, "utf8"))
    : new Map<string, string>();

  const values: Record<string, string> = {};
  const secretsSet: Record<string, boolean> = {};

  for (const key of SETTINGS_ENV_KEYS) {
    const raw =
      fromFile.get(key) ??
      (process.env[key] !== undefined ? String(process.env[key]) : "");
    const isSecret = SECRET_KEYS.has(key);
    secretsSet[key] = isSecret && Boolean(raw);
    values[key] = isSecret ? (raw ? maskSecret(raw) : "") : raw;
  }

  return { values, secretsSet, envFile: file, exists: fs.existsSync(file) };
}

export function setSettingsEnv(
  patch: Record<string, string | undefined>,
): Promise<{
  ok: boolean;
  detail: string;
  values: Record<string, string>;
  secretsSet: Record<string, boolean>;
}> {
  return enqueueEnvWrite(() => {
    const file = envPath();
    const allowed = new Set<string>(SETTINGS_ENV_KEYS);
    const diskRaw = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const current = diskRaw
      ? parseEnvFile(diskRaw)
      : new Map<string, string>();
    const originalExtras = diskRaw
      ? parseEnvFile(diskRaw)
      : new Map<string, string>();

    let changed = 0;
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) continue;
      if (value === undefined) continue;
      // Keep existing secret if UI sent masked placeholder
      if (SECRET_KEYS.has(key)) {
        const trimmed = value.trim();
        if (!trimmed) {
          current.delete(key);
          delete process.env[key];
          changed += 1;
          continue;
        }
        if (trimmed.startsWith("••••")) {
          continue;
        }
        current.set(key, trimmed);
        process.env[key] = trimmed;
        changed += 1;
        continue;
      }
      const next = String(value).trim();
      if (!next) {
        current.delete(key);
        delete process.env[key];
      } else {
        current.set(key, next);
        process.env[key] = next;
      }
      changed += 1;
    }

    const lines = [
      "# Mira local config — managed by Settings UI. Do not commit.",
      "",
    ];
    for (const key of SETTINGS_ENV_KEYS) {
      if (!current.has(key)) continue;
      const v = current.get(key) ?? "";
      const needsQuote = /[\s#]/.test(v);
      lines.push(`${key}=${needsQuote ? JSON.stringify(v) : v}`);
    }
    // Preserve unrelated keys from the same disk snapshot used for current.
    const extras: string[] = [];
    for (const [key, value] of originalExtras) {
      if (allowed.has(key)) continue;
      extras.push(
        `${key}=${/[\s#]/.test(value) ? JSON.stringify(value) : value}`,
      );
    }
    if (extras.length) {
      lines.push("", "# Other keys", ...extras);
    }

    fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
    loadConfig(true);
    const snap = getSettingsEnv();
    return {
      ok: true,
      detail: `Сохранено в .env · изменено полей: ${changed}`,
      values: snap.values,
      secretsSet: snap.secretsSet,
    };
  });
}
