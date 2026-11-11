/** LLM provider adapters — P1. */
export type LlmProviderId = "anthropic" | "openai" | "gemini";

export function listProviders(): LlmProviderId[] {
  return ["anthropic", "openai", "gemini"];
}
