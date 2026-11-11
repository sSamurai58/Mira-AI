import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export type LlmProviderId = "openai" | "mock";

export type AppConfig = {
  databasePath: string;
  llmProvider: LlmProviderId;
  llmModel: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string;
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
  if (v === "openai" || v === "openai-compatible") return "openai";
  // Default: mock if no key, else openai
  if (!process.env.OPENAI_API_KEY?.trim()) return "mock";
  return "openai";
}

export function loadConfig(force = false): AppConfig {
  if (cached && !force) return cached;
  loadEnvFile();

  const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || null;
  const provider = asProvider(process.env.LLM_PROVIDER);

  cached = {
    databasePath:
      process.env.DATABASE_PATH?.trim() ||
      path.resolve(process.cwd(), "data", "mira.db"),
    llmProvider: provider,
    llmModel:
      process.env.LLM_MODEL?.trim() ||
      (provider === "mock" ? "mock-mira" : "gpt-4o-mini"),
    openaiApiKey,
    openaiBaseUrl: (
      process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
  };

  // Keep process.env.DATABASE_PATH aligned for store.ts
  process.env.DATABASE_PATH = cached.databasePath;
  return cached;
}

export function getPublicConfig(): {
  llmProvider: LlmProviderId;
  llmModel: string;
  hasOpenAiKey: boolean;
  openaiBaseUrl: string;
  databasePath: string;
} {
  const cfg = loadConfig();
  return {
    llmProvider: cfg.llmProvider,
    llmModel: cfg.llmModel,
    hasOpenAiKey: Boolean(cfg.openaiApiKey),
    openaiBaseUrl: cfg.openaiBaseUrl,
    databasePath: cfg.databasePath,
  };
}

export function validateLlmConfig(cfg = loadConfig()): {
  ok: boolean;
  reason?: string;
} {
  if (cfg.llmProvider === "mock") {
    return { ok: true };
  }
  if (cfg.llmProvider === "openai" && !cfg.openaiApiKey) {
    return {
      ok: false,
      reason:
        "Нет OPENAI_API_KEY в .env. Добавьте ключ или поставьте LLM_PROVIDER=mock.",
    };
  }
  return { ok: true };
}
