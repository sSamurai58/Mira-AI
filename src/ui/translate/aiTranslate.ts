import { streamBrowserPrompt } from "../browserLlm";
import { langLabel } from "./languages";

export type AiTranslateResult = {
  text: string;
  provider: string;
};

function buildSystemPrompt(source: string, target: string): string {
  const src =
    source === "auto"
      ? "автоопределённого языка"
      : langLabel(source);
  const dst = langLabel(target);
  return [
    "Ты переводчик. Переведи текст пользователя точно и естественно.",
    `Исходный язык: ${src}. Целевой язык: ${dst}.`,
    "Верни только перевод — без кавычек, пояснений, преамбул и markdown.",
    "Сохраняй абзацы и смысл; имена собственные не искажай без нужды.",
  ].join(" ");
}

/**
 * «Через ИИ»: Electron IPC (configured main LLM) or browser LLM keys.
 */
export async function aiTranslate(opts: {
  text: string;
  source: string;
  target: string;
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<AiTranslateResult> {
  const text = opts.text.trim();
  if (!text) return { text: "", provider: "none" };

  if (window.mira?.translateAi) {
    const res = await window.mira.translateAi({
      text,
      source: opts.source,
      target: opts.target,
    });
    if (!res.ok) {
      throw new Error(res.error || "LLM перевод не удался");
    }
    if (opts.onToken && res.text) opts.onToken(res.text);
    return { text: res.text, provider: res.provider || "electron-llm" };
  }

  let full = "";
  const cfg = await streamBrowserPrompt({
    systemPrompt: buildSystemPrompt(opts.source, opts.target),
    userText: text,
    signal: opts.signal,
    handlers: {
      onToken: (chunk) => {
        full += chunk;
        opts.onToken?.(chunk);
      },
      onDone: (done) => {
        full = done || full;
      },
      onError: () => undefined,
    },
  });
  return { text: full.trim(), provider: cfg.label };
}
