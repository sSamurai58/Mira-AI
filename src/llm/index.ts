/** LLM provider ids mirrored for UI labels. Runtime adapters live in Electron. */
export type LlmProviderId =
  | "openai"
  | "claude"
  | "gemini"
  | "grok"
  | "offline"
  | "mock";

export function listProviders(): LlmProviderId[] {
  return ["openai", "claude", "gemini", "grok", "offline", "mock"];
}
