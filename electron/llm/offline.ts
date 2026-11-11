import type { ChatMessage, LlmAdapter, StreamHandlers } from "./types";

/**
 * Offline/local adapter stub (F-offline).
 * Uses deterministic local reasoning without network; swap for llama.cpp later.
 */
export function createOfflineAdapter(model = "mira-offline-stub"): LlmAdapter {
  return {
    id: "offline",
    model,
    async testConnection() {
      return {
        ok: true,
        detail: `Offline stub ready · ${model} (без сети; замените на local GGUF later)`,
      };
    },
    async streamChat(
      messages: ChatMessage[],
      handlers: StreamHandlers,
      _signal?: AbortSignal,
    ) {
      const last =
        [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const reply = [
        "[offline] Локальный ответ без облака.",
        last
          ? `Вы сказали: «${last.slice(0, 240)}».`
          : "Нет пользовательского сообщения.",
        "Подключите локальную модель (GGUF / Ollama) через LLM_PROVIDER=offline + OFFLINE_MODEL_PATH.",
      ].join(" ");
      for (const word of reply.split(/(\s+)/)) {
        handlers.onToken(word);
        await new Promise((r) => setTimeout(r, 4));
      }
      handlers.onDone(reply);
    },
  };
}
