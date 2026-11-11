/** LLM provider ids mirrored for UI labels. Runtime adapters live in Electron. */
export type LlmProviderId = "openai" | "mock";

export function listProviders(): LlmProviderId[] {
  return ["openai", "mock"];
}
