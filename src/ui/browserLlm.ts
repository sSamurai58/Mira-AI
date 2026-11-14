import {
  resolveBrowserLlmConfig,
  type BrowserLlmConfig,
} from "./settingsEnvClient";
import {
  buildReplyDiversityBlock,
  CHAT_DIVERSITY_SYSTEM_RULES,
} from "./chat/diversity";

export type BrowserChatHandlers = {
  onToken: (chunk: string) => void;
  onDone: (full: string) => void;
  onError: (err: Error) => void;
};

const SYSTEM_PROMPT_BASE = [
  "Ты Mira — локальный голосовой ИИ-ассистент.",
  "Отвечай по-русски, если пользователь пишет по-русски.",
  "Пиши выразительно: несколько коротких абзацев, не одна длинная строка.",
  "Используй Markdown: **жирный**, *курсив*, __подчёркнутый__, списки через «- ».",
  "Если данных для ответа ещё нет — лучше коротко скажи, что уточняешь, а не выдумывай отказ.",
  CHAT_DIVERSITY_SYSTEM_RULES,
].join(" ");

function systemPromptForHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const diversity = buildReplyDiversityBlock(history);
  return diversity
    ? `${SYSTEM_PROMPT_BASE}\n\n${diversity}`
    : SYSTEM_PROMPT_BASE;
}

function openAiCompatibleMessages(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userText: string,
) {
  const diversity = buildReplyDiversityBlock(history);
  return [
    { role: "system", content: SYSTEM_PROMPT_BASE },
    ...(diversity ? [{ role: "system" as const, content: diversity }] : []),
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];
}

async function streamOpenAiCompatible(
  cfg: BrowserLlmConfig,
  messages: Array<{ role: string; content: string }>,
  handlers: BrowserChatHandlers,
  signal?: AbortSignal,
) {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
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
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const piece = json.choices?.[0]?.delta?.content ?? "";
        if (!piece) continue;
        full += piece;
        handlers.onToken(piece);
      } catch {
        /* ignore partial JSON */
      }
    }
  }

  handlers.onDone(full);
}

async function streamAnthropic(
  cfg: BrowserLlmConfig,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userText: string,
  handlers: BrowserChatHandlers,
  signal?: AbortSignal,
  systemOverride?: string,
) {
  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1024,
      stream: true,
      system: systemOverride ?? systemPromptForHistory(history),
      messages: [
        ...history.slice(-12).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user", content: userText },
      ],
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
      if (!data) continue;
      try {
        const json = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (json.type === "content_block_delta" && json.delta?.text) {
          full += json.delta.text;
          handlers.onToken(json.delta.text);
        }
      } catch {
        /* ignore */
      }
    }
  }
  handlers.onDone(full);
}

async function streamGemini(
  cfg: BrowserLlmConfig,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userText: string,
  handlers: BrowserChatHandlers,
  signal?: AbortSignal,
  systemOverride?: string,
) {
  const url = `${cfg.baseUrl}/v1beta/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey)}`;
  const contents = [
    ...history.slice(-12).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userText }] },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: systemOverride ?? systemPromptForHistory(history),
          },
        ],
      },
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
        const piece = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (!piece) continue;
        full += piece;
        handlers.onToken(piece);
      } catch {
        /* ignore */
      }
    }
  }
  handlers.onDone(full);
}

export function getBrowserLlmLabel(): string {
  return resolveBrowserLlmConfig().label;
}

export async function streamBrowserChat(opts: {
  userText: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  handlers: BrowserChatHandlers;
  signal?: AbortSignal;
}): Promise<BrowserLlmConfig> {
  const cfg = resolveBrowserLlmConfig();
  if (cfg.provider === "mock") {
    throw new Error(
      "Нет API-ключа. Настройки → API и модели: выберите grok/openai и сохраните ключ.",
    );
  }

  try {
    if (cfg.provider === "claude") {
      await streamAnthropic(
        cfg,
        opts.history,
        opts.userText,
        opts.handlers,
        opts.signal,
      );
    } else if (cfg.provider === "gemini") {
      await streamGemini(
        cfg,
        opts.history,
        opts.userText,
        opts.handlers,
        opts.signal,
      );
    } else {
      await streamOpenAiCompatible(
        cfg,
        openAiCompatibleMessages(opts.history, opts.userText),
        opts.handlers,
        opts.signal,
      );
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    opts.handlers.onError(error);
    throw error;
  }

  return cfg;
}

/**
 * One-shot LLM completion with a custom system prompt (e.g. Переводчик · Через ИИ).
 * Does not use Mira chat personality / diversity rules.
 */
export async function streamBrowserPrompt(opts: {
  systemPrompt: string;
  userText: string;
  handlers: BrowserChatHandlers;
  signal?: AbortSignal;
}): Promise<BrowserLlmConfig> {
  const cfg = resolveBrowserLlmConfig();
  if (cfg.provider === "mock") {
    throw new Error(
      "Нет API-ключа. Настройки → API и модели: выберите grok/openai и сохраните ключ.",
    );
  }

  try {
    if (cfg.provider === "claude") {
      await streamAnthropic(
        cfg,
        [],
        opts.userText,
        opts.handlers,
        opts.signal,
        opts.systemPrompt,
      );
    } else if (cfg.provider === "gemini") {
      await streamGemini(
        cfg,
        [],
        opts.userText,
        opts.handlers,
        opts.signal,
        opts.systemPrompt,
      );
    } else {
      await streamOpenAiCompatible(
        cfg,
        [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userText },
        ],
        opts.handlers,
        opts.signal,
      );
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    opts.handlers.onError(error);
    throw error;
  }

  return cfg;
}
