import type { AppConfig } from "../config";
import type { ChatMessage, LlmAdapter, StreamHandlers } from "./types";

/** Gemini via Google Generative Language API (streamGenerateContent). */
export function createGeminiAdapter(cfg: AppConfig): LlmAdapter {
  const model = cfg.llmModel || "gemini-2.0-flash";
  const apiKey = cfg.geminiApiKey;
  const baseUrl = (
    cfg.geminiBaseUrl || "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/$/, "");

  return {
    id: "gemini",
    model,
    async testConnection() {
      if (!apiKey) return { ok: false, detail: "GEMINI_API_KEY пуст" };
      try {
        const res = await fetch(
          `${baseUrl}/models/${encodeURIComponent(model)}?key=${apiKey}`,
        );
        if (!res.ok) {
          const text = await res.text();
          return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
        }
        return { ok: true, detail: `Gemini OK · ${model}` };
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
        handlers.onError(new Error("GEMINI_API_KEY не задан"));
        return;
      }
      const system = messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => {
          const parts: Array<
            | { text: string }
            | { inlineData: { mimeType: string; data: string } }
          > = [{ text: m.content }];
          for (const img of m.images ?? []) {
            parts.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.dataBase64,
              },
            });
          }
          return {
            role: m.role === "assistant" ? "model" : "user",
            parts,
          };
        });

      try {
        const url = `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: system
              ? { parts: [{ text: system }] }
              : undefined,
            contents,
          }),
          signal,
        });
        if (!res.ok || !res.body) {
          const text = await res.text();
          throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 400)}`);
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
            if (!data) continue;
            try {
              const json = JSON.parse(data) as {
                candidates?: Array<{
                  content?: { parts?: Array<{ text?: string }> };
                }>;
              };
              const token =
                json.candidates?.[0]?.content?.parts
                  ?.map((p) => p.text ?? "")
                  .join("") ?? "";
              if (token) {
                full += token;
                handlers.onToken(token);
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
