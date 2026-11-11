import type { AppConfig } from "../config";
import { createOpenAiCompatibleAdapter } from "./openaiCompatible";
import type { LlmAdapter } from "./types";

/** Grok via xAI OpenAI-compatible API (https://api.x.ai/v1). */
export function createGrokAdapter(cfg: AppConfig): LlmAdapter {
  return createOpenAiCompatibleAdapter(cfg, {
    id: "grok",
    model: cfg.llmModel || "grok-4.7",
    apiKey: cfg.xaiApiKey,
    baseUrl: cfg.xaiBaseUrl || "https://api.x.ai/v1",
    missingKeyMessage: "XAI_API_KEY не задан",
  });
}
