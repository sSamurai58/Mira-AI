import type { ChatMessage, LlmAdapter, StreamHandlers } from "./types";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("Aborted"));
      },
      { once: true },
    );
  });
}

export function createMockAdapter(model = "mock-mira"): LlmAdapter {
  return {
    id: "mock",
    model,
    async testConnection() {
      return {
        ok: true,
        detail: "Mock provider ready (без сетевого вызова).",
      };
    },
    async streamChat(
      messages: ChatMessage[],
      handlers: StreamHandlers,
      signal?: AbortSignal,
    ) {
      try {
        const lastUser = [...messages]
          .reverse()
          .find((m) => m.role === "user")?.content;
        const memoryHint = messages.find((m) =>
          m.content.startsWith("[Память из прошлых разговоров]"),
        );
        const webHint = messages.find((m) =>
          m.content.startsWith("[Интернет:"),
        );
        const skillHint = messages.find((m) =>
          m.content.startsWith("[Active skills"),
        );
        const reply = [
          "Это ответ mock-модели (без API-ключа).",
          lastUser ? `Вы сказали: «${lastUser.slice(0, 240)}»` : "",
          memoryHint
            ? "В контекст подтянуты фрагменты из памяти."
            : "Дополнительных фрагментов памяти не найдено.",
          webHint
            ? `Учтены интернет-данные: ${webHint.content.slice(0, 280)}…`
            : "Интернет-инструменты для этого хода не вызывались.",
          skillHint ? "Активны skills on-demand." : "Skills в контексте нет.",
          "Для живой модели: LLM_PROVIDER=openai|claude|gemini|grok и соответствующий API-ключ в .env.",
        ]

          .filter(Boolean)
          .join("\n");

        let full = "";
        for (const word of reply.split(/(\s+)/)) {
          if (signal?.aborted) throw new Error("Aborted");
          full += word;
          handlers.onToken(word);
          await sleep(12, signal);
        }
        handlers.onDone(full);
      } catch (err) {
        handlers.onError(err instanceof Error ? err : new Error(String(err)));
      }
    },
  };
}
