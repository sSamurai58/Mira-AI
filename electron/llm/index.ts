import { loadConfig, type AppConfig } from "../config";
import { createAnthropicAdapter } from "./anthropic";
import { createGeminiAdapter } from "./gemini";
import { createGrokAdapter } from "./grok";
import { createMockAdapter } from "./mock";
import { createOfflineAdapter } from "./offline";
import { createOpenAiCompatibleAdapter } from "./openaiCompatible";
import type { LlmAdapter } from "./types";

export type { ChatMessage, LlmAdapter } from "./types";

export function createLlmAdapter(cfg: AppConfig = loadConfig()): LlmAdapter {
  switch (cfg.llmProvider) {
    case "mock":
      return createMockAdapter(cfg.llmModel);
    case "claude":
      return createAnthropicAdapter(cfg);
    case "gemini":
      return createGeminiAdapter(cfg);
    case "grok":
      return createGrokAdapter(cfg);
    case "offline":
      return createOfflineAdapter(cfg.llmModel);
    case "openai":
    default:
      return createOpenAiCompatibleAdapter(cfg);
  }
}
