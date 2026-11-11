import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export type LlmProviderId =
  | "openai"
  | "claude"
  | "gemini"
  | "offline"
  | "mock";

export type AppConfig = {
  databasePath: string;
  llmProvider: LlmProviderId;
  llmModel: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string;
  anthropicApiKey: string | null;
  anthropicBaseUrl: string;
  geminiApiKey: string | null;
  geminiBaseUrl: string;
  visionEnabled: boolean;
  offlineModelPath: string | null;
  activeProfileId: string;
};

let cached: AppConfig | null = null;

function loadEnvFile(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(appRoot(), ".env"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: false });
      return;
    }
  }
  dotenv.config({ override: false });
}

function appRoot(): string {
  return path.resolve(__dirname, "..");
}

function asProvider(raw: string | undefined): LlmProviderId {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "mock") return "mock";
  if (v === "claude" || v === "anthropic") return "claude";
  if (v === "gemini" || v === "google") return "gemini";
  if (v === "offline" || v === "local") return "offline";
  if (v === "openai" || v === "openai-compatible") return "openai";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "claude";
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (!process.env.OPENAI_API_KEY?.trim()) return "mock";
  return "openai";
}

export function loadConfig(force = false): AppConfig {
  if (cached && !force) return cached;
  loadEnvFile();

  const provider = asProvider(process.env.LLM_PROVIDER);
  const defaultModel =
    provider === "mock"
      ? "mock-mira"
      : provider === "claude"
        ? "claude-sonnet-4-20250514"
        : provider === "gemini"
          ? "gemini-2.0-flash"
          : provider === "offline"
            ? "mira-offline-stub"
            : "gpt-4o-mini";

  cached = {
    databasePath:
      process.env.DATABASE_PATH?.trim() ||
      path.resolve(process.cwd(), "data", "mira.db"),
    llmProvider: provider,
    llmModel: process.env.LLM_MODEL?.trim() || defaultModel,
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
    openaiBaseUrl: (
      process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
    anthropicBaseUrl: (
      process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com"
    ).replace(/\/$/, ""),
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
    geminiBaseUrl: (
      process.env.GEMINI_BASE_URL?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta"
    ).replace(/\/$/, ""),
    visionEnabled:
      (process.env.VISION_ENABLED ?? "true").trim().toLowerCase() !== "false",
    offlineModelPath: process.env.OFFLINE_MODEL_PATH?.trim() || null,
    activeProfileId:
      process.env.MIRA_PROFILE_ID?.trim() ||
      process.env.MIRA_OWNER_ID?.trim() ||
      "local",
  };

  process.env.DATABASE_PATH = cached.databasePath;
  return cached;
}

export function getPublicConfig() {
  const cfg = loadConfig();
  return {
    llmProvider: cfg.llmProvider,
    llmModel: cfg.llmModel,
    hasOpenAiKey: Boolean(cfg.openaiApiKey),
    hasAnthropicKey: Boolean(cfg.anthropicApiKey),
    hasGeminiKey: Boolean(cfg.geminiApiKey),
    openaiBaseUrl: cfg.openaiBaseUrl,
    databasePath: cfg.databasePath,
    visionEnabled: cfg.visionEnabled,
    activeProfileId: cfg.activeProfileId,
    webEnabled:
      (process.env.WEB_ENABLED ?? "true").trim().toLowerCase() !== "false",
    webAllowlist: (process.env.WEB_ALLOWLIST ?? "*").trim(),
    webFetchConfirm:
      (process.env.WEB_FETCH_CONFIRM ?? "true").trim().toLowerCase() !== "false",
  };
}

export function validateLlmConfig(cfg = loadConfig()): {
  ok: boolean;
  reason?: string;
} {
  if (cfg.llmProvider === "mock" || cfg.llmProvider === "offline") {
    return { ok: true };
  }
  if (cfg.llmProvider === "openai" && !cfg.openaiApiKey) {
    return {
      ok: false,
      reason:
        "Нет OPENAI_API_KEY. Добавьте ключ или LLM_PROVIDER=mock|offline|claude|gemini.",
    };
  }
  if (cfg.llmProvider === "claude" && !cfg.anthropicApiKey) {
    return { ok: false, reason: "Нет ANTHROPIC_API_KEY для Claude." };
  }
  if (cfg.llmProvider === "gemini" && !cfg.geminiApiKey) {
    return { ok: false, reason: "Нет GEMINI_API_KEY для Gemini." };
  }
  return { ok: true };
}
