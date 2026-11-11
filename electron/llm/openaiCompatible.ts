import type { AppConfig } from "../config";
import type { ChatMessage, LlmAdapter, StreamHandlers } from "./types";

export function createOpenAiCompatibleAdapter(cfg: AppConfig): LlmAdapter {
  const model = cfg.llmModel;
  const baseUrl = cfg.openaiBaseUrl;
  const apiKey = cfg.openaiApiKey;

  return {
    id: "openai",
    model,
    async testConnection() {
      if (!apiKey) {
        return { ok: false, detail: "OPENAI_API_KEY пуст" };
      }
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          const text = await res.text();
          return {
            ok: false,
            detail: `HTTP ${res.status}: ${text.slice(0, 200)}`,
          };
        }
        return { ok: true, detail: `OK · model default ${model}` };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    },
    async streamChat(
      messages: ChatMessage[],
      handlers: StreamHandlers,
      signal?: AbortSignal,
    ) {
      if (!apiKey) {
        handlers.onError(new Error("OPENAI_API_KEY не задан"));
        return;
      }

      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            stream: true,
            messages,
          }),
          signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text();
          throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 400)}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const token = json.choices?.[0]?.delta?.content ?? "";
              if (token) {
                full += token;
                handlers.onToken(token);
              }
            } catch {
              // ignore partial JSON lines
            }
          }
        }

        handlers.onDone(full);
      } catch (err) {
        handlers.onError(err instanceof Error ? err : new Error(String(err)));
      }
    },
  };
}
