import { loadConfig, type AppConfig } from "../config";
import { createMockAdapter } from "./mock";
import { createOpenAiCompatibleAdapter } from "./openaiCompatible";
import type { LlmAdapter } from "./types";

export type { ChatMessage, LlmAdapter } from "./types";

export function createLlmAdapter(cfg: AppConfig = loadConfig()): LlmAdapter {
  if (cfg.llmProvider === "mock") {
    return createMockAdapter(cfg.llmModel);
  }
  return createOpenAiCompatibleAdapter(cfg);
}
