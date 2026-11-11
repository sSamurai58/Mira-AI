import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  defaultDatabasePath,
  ensureMiraDatabaseLayout,
} from "./paths";

export type LlmProviderId =
  | "openai"
  | "claude"
  | "gemini"
  | "grok"
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
  xaiApiKey: string | null;
  xaiBaseUrl: string;
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
  if (v === "grok" || v === "xai") return "grok";
  if (v === "offline" || v === "local") return "offline";
  if (v === "openai" || v === "openai-compatible") return "openai";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "claude";
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (process.env.XAI_API_KEY?.trim()) return "grok";
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
          : provider === "grok"
            ? "grok-2-latest"
            : provider === "offline"
              ? "mira-offline-stub"
              : "gpt-4o-mini";

  const requestedModel = process.env.LLM_MODEL?.trim() || "";
  const llmModel = (() => {
    if (!requestedModel) return defaultModel;
    const lower = requestedModel.toLowerCase();
    // Don't send OpenAI model ids to xAI / Claude / Gemini (404)
    if (provider === "grok" && !lower.startsWith("grok") && !lower.startsWith("xai")) {
      return defaultModel;
    }
    if (provider === "claude" && !lower.startsWith("claude")) return defaultModel;
    if (
      provider === "gemini" &&
      !lower.startsWith("gemini") &&
      !lower.startsWith("models/")
    ) {
      return defaultModel;
    }
    return requestedModel;
  })();

  const databasePath = ensureMiraDatabaseLayout(
    process.env.DATABASE_PATH?.trim()
      ? path.isAbsolute(process.env.DATABASE_PATH.trim())
        ? process.env.DATABASE_PATH.trim()
        : path.resolve(process.cwd(), process.env.DATABASE_PATH.trim())
      : defaultDatabasePath(),
  );

  cached = {
    databasePath,
    llmProvider: provider,
    llmModel,
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
    xaiApiKey: process.env.XAI_API_KEY?.trim() || null,
    xaiBaseUrl: (
      process.env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1"
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
    hasXaiKey: Boolean(cfg.xaiApiKey),
    openaiBaseUrl: cfg.openaiBaseUrl,
    xaiBaseUrl: cfg.xaiBaseUrl,
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
        "Нет OPENAI_API_KEY. Добавьте ключ или LLM_PROVIDER=mock|offline|claude|gemini|grok.",
    };
  }
  if (cfg.llmProvider === "claude" && !cfg.anthropicApiKey) {
    return { ok: false, reason: "Нет ANTHROPIC_API_KEY для Claude." };
  }
  if (cfg.llmProvider === "gemini" && !cfg.geminiApiKey) {
    return { ok: false, reason: "Нет GEMINI_API_KEY для Gemini." };
  }
  if (cfg.llmProvider === "grok" && !cfg.xaiApiKey) {
    return { ok: false, reason: "Нет XAI_API_KEY для Grok." };
  }
  return { ok: true };
}
