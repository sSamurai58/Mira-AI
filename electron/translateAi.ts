import { loadConfig, validateLlmConfig } from "./config";
import { createLlmAdapter, type ChatMessage } from "./llm";

function langName(code: string): string {
  const map: Record<string, string> = {
    auto: "автоопределённый",
    ru: "русский",
    en: "английский",
    uz: "узбекский",
    tr: "турецкий",
    de: "немецкий",
    fr: "французский",
    es: "испанский",
    it: "итальянский",
    pt: "португальский",
    zh: "китайский",
    ja: "японский",
    ko: "корейский",
    ar: "арабский",
    uk: "украинский",
    pl: "польский",
    kk: "казахский",
    hi: "хинди",
  };
  return map[code] ?? code;
}

export async function translateWithLlm(opts: {
  text: string;
  source: string;
  target: string;
}): Promise<{ ok: boolean; text: string; provider?: string; error?: string }> {
  const text = (opts.text || "").trim();
  if (!text) return { ok: true, text: "", provider: "none" };

  const cfg = loadConfig(true);
  const validation = validateLlmConfig(cfg);
  if (!validation.ok) {
    return {
      ok: false,
      text: "",
      error: validation.reason ?? "LLM не настроен",
    };
  }
  if (cfg.llmProvider === "mock" || cfg.llmProvider === "offline") {
    return {
      ok: false,
      text: "",
      error:
        "Для режима «Через ИИ» нужен облачный LLM (Настройки → API и модели).",
    };
  }

  const adapter = createLlmAdapter(cfg);
  const src =
    opts.source === "auto" ? "автоопределённого языка" : langName(opts.source);
  const dst = langName(opts.target);
  const system = [
    "Ты переводчик. Переведи текст пользователя точно и естественно.",
    `Исходный язык: ${src}. Целевой язык: ${dst}.`,
    "Верни только перевод — без кавычек, пояснений, преамбул и markdown.",
    "Сохраняй абзацы и смысл; имена собственные не искажай без нужды.",
  ].join(" ");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: text },
  ];

  return new Promise((resolve) => {
    let settled = false;
    void adapter
      .streamChat(messages, {
        onToken: () => undefined,
        onDone: (full) => {
          if (settled) return;
          settled = true;
          resolve({
            ok: true,
            text: (full || "").trim(),
            provider: `${adapter.id}/${adapter.model}`,
          });
        },
        onError: (err) => {
          if (settled) return;
          settled = true;
          resolve({
            ok: false,
            text: "",
            error: err.message || "LLM error",
            provider: `${adapter.id}/${adapter.model}`,
          });
        },
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        resolve({
          ok: false,
          text: "",
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });
}
