import type { AppConfig } from "../config";
import type { ChatMessage, LlmAdapter, StreamHandlers } from "./types";

/** Claude via Anthropic Messages API (streaming SSE). */
export function createAnthropicAdapter(cfg: AppConfig): LlmAdapter {
  const model = cfg.llmModel || "claude-sonnet-4-20250514";
  const apiKey = cfg.anthropicApiKey;
  const baseUrl = (cfg.anthropicBaseUrl || "https://api.anthropic.com").replace(
    /\/$/,
    "",
  );

  return {
    id: "claude",
    model,
    async testConnection() {
      if (!apiKey) return { ok: false, detail: "ANTHROPIC_API_KEY пуст" };
      try {
        const res = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 16,
            messages: [{ role: "user", content: "ping" }],
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
        }
        return { ok: true, detail: `Claude OK · ${model}` };
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
        handlers.onError(new Error("ANTHROPIC_API_KEY не задан"));
        return;
      }
      const system = messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const converted = messages
        .filter((m) => m.role !== "system")
        .map((m) => {
          if (!m.images?.length) {
            return {
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            };
          }
          const content: Array<
            | { type: "text"; text: string }
            | {
                type: "image";
                source: {
                  type: "base64";
                  media_type: string;
                  data: string;
                };
              }
          > = [{ type: "text", text: m.content }];
          for (const img of m.images) {
            content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: img.mimeType,
                data: img.dataBase64,
              },
            });
          }
          return {
            role: m.role === "assistant" ? "assistant" : "user",
            content,
          };
        });

      try {
        const res = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            stream: true,
            system: system || undefined,
            messages: converted,
          }),
          signal,
        });
        if (!res.ok || !res.body) {
          const text = await res.text();
          throw new Error(`Claude HTTP ${res.status}: ${text.slice(0, 400)}`);
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
            if (!data || data === "[DONE]") continue;
            try {
              const json = JSON.parse(data) as {
                type?: string;
                delta?: { type?: string; text?: string };
              };
              if (
                json.type === "content_block_delta" &&
                json.delta?.type === "text_delta" &&
                json.delta.text
              ) {
                full += json.delta.text;
                handlers.onToken(json.delta.text);
              }
            } catch {
              // ignore
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
