import fs from "node:fs";
import { loadConfig } from "../config";
import type { ChatMessage } from "./types";


function mimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

/**
 * Ask the active LLM to describe a local screenshot (vision when provider supports it).
 * Falls back to a metadata-only mock reply when vision is disabled or provider is mock/offline.
 */
export async function describeScreenshot(
  filePath: string,
  prompt = "Кратко опиши, что видно на экране. Ответь по-русски, 2–4 предложения.",
): Promise<{ ok: boolean; text: string; mode: "vision" | "metadata" }> {
  const cfg = loadConfig();
  if (!fs.existsSync(filePath)) {
    return { ok: false, text: `Файл снимка не найден: ${filePath}`, mode: "metadata" };
  }

  const bytes = fs.readFileSync(filePath);
  const b64 = bytes.toString("base64");
  const mime = mimeFromPath(filePath);

  if (
    !cfg.visionEnabled ||
    cfg.llmProvider === "mock" ||
    cfg.llmProvider === "offline"
  ) {
    return {
      ok: true,
      mode: "metadata",
      text: `[vision metadata] Снимок ${filePath} (${Math.round(bytes.length / 1024)} КБ, ${mime}). VISION_ENABLED=${cfg.visionEnabled}; provider=${cfg.llmProvider}. Подключите openai/claude/gemini для полного vision.`,
    };
  }

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: prompt,
      images: [{ mimeType: mime, dataBase64: b64 }],
    },
  ];

  const { createLlmAdapter } = await import("./index");
  const adapter = createLlmAdapter(cfg);
  let full = "";
  await new Promise<void>((resolve, reject) => {
    void adapter.streamChat(messages, {

      onToken: (t) => {
        full += t;
      },
      onDone: (text) => {
        full = text || full;
        resolve();
      },
      onError: (err) => reject(err),
    });
  }).catch((err) => {
    full = `Vision error: ${err instanceof Error ? err.message : String(err)}`;
  });

  return {
    ok: !full.startsWith("Vision error:"),
    text: full || "(пустой ответ vision)",
    mode: "vision",
  };
}
