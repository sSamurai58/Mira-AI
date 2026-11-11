import { createLlmAdapter, type ChatMessage } from "./llm";
import { loadConfig, validateLlmConfig } from "./config";
import {
  addUtterance,
  createSession,
  getSession,
  listUtterances,
  searchMemory,
  touchSession,
  type MemoryHit,
  type SessionRow,
  type UtteranceRow,
} from "./store";

const SYSTEM_PROMPT =
  "Ты Mira — локальный голосовой ИИ-помощник. Отвечай по делу на языке пользователя. Если даны фрагменты памяти, опирайся на них, когда уместно.";

export type ChatStreamEvent =
  | { type: "user"; utterance: UtteranceRow }
  | { type: "assistant_start"; sessionId: string }
  | { type: "token"; text: string }
  | { type: "assistant_done"; utterance: UtteranceRow; memoryUsed: MemoryHit[] }
  | { type: "error"; message: string };

function extractSearchQuery(userText: string): string | null {
  const patterns = [
    /о ч[её]м (?:мы )?(?:говорили|говорили|поговорили)[^\n]{0,80}/i,
    /что (?:было|говорили)[^\n]{0,80}/i,
    /помни[^\n]{0,60}/i,
    /раньше[^\n]{0,60}/i,
    /в прошл[^\n]{0,60}/i,
  ];
  for (const re of patterns) {
    if (re.test(userText)) {
      // Use meaningful words from the question as LIKE terms
      const words = userText
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .slice(0, 4);
      return words.join(" ") || userText.slice(0, 48);
    }
  }
  // Always try a light search on longer questions
  if (userText.length >= 24) {
    const words = userText
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5)
      .slice(0, 3);
    if (words.length) return words.join(" ");
  }
  return null;
}

function buildMemoryBlock(hits: MemoryHit[]): string | null {
  if (!hits.length) return null;
  const lines = hits.map(
    (h, i) =>
      `${i + 1}. [${h.session_title} · ${h.created_at}] (${h.role}): ${h.content.slice(0, 400)}`,
  );
  return `[Память из прошлых разговоров]\n${lines.join("\n")}`;
}

function titleFromFirstMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 48 ? clean : `${clean.slice(0, 45)}…`;
}

export async function sendChatMessage(
  input: {
    sessionId?: string | null;
    text: string;
  },
  emit: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<SessionRow> {
  const text = input.text.trim();
  if (!text) {
    emit({ type: "error", message: "Пустое сообщение" });
    throw new Error("Пустое сообщение");
  }

  const cfg = loadConfig();
  const validation = validateLlmConfig(cfg);
  if (!validation.ok) {
    emit({ type: "error", message: validation.reason ?? "LLM config error" });
    throw new Error(validation.reason);
  }

  let session =
    (input.sessionId ? getSession(input.sessionId) : null) ?? null;
  const isNew = !session;
  if (!session) {
    session = createSession(titleFromFirstMessage(text));
  }

  const userUtterance = addUtterance(session.id, "user", text);
  emit({ type: "user", utterance: userUtterance });

  if (isNew || session.title === "Первый диалог" || session.title === "Новый диалог") {
    touchSession(session.id, titleFromFirstMessage(text));
    session = getSession(session.id) ?? session;
  }

  const history = listUtterances(session.id);
  const searchQ = extractSearchQuery(text);
  const memoryHits = searchQ
    ? searchMemory(searchQ, { excludeSessionId: session.id, limit: 5 })
    : [];
  const memoryBlock = buildMemoryBlock(memoryHits);

  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  if (memoryBlock) {
    messages.push({ role: "system", content: memoryBlock });
  }
  for (const u of history) {
    if (u.role === "system") continue;
    messages.push({
      role: u.role === "assistant" ? "assistant" : "user",
      content: u.content,
    });
  }

  const adapter = createLlmAdapter(cfg);
  emit({ type: "assistant_start", sessionId: session.id });

  let full = "";
  await new Promise<void>((resolve, reject) => {
    void adapter.streamChat(
      messages,
      {
        onToken: (token) => {
          full += token;
          emit({ type: "token", text: token });
        },
        onDone: (doneText) => {
          full = doneText || full;
          resolve();
        },
        onError: (err) => reject(err),
      },
      signal,
    );
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: "error", message });
    throw err;
  });

  const assistantUtterance = addUtterance(
    session.id,
    "assistant",
    full.trim() || "(пустой ответ модели)",
  );
  emit({
    type: "assistant_done",
    utterance: assistantUtterance,
    memoryUsed: memoryHits,
  });

  return getSession(session.id) ?? session;
}

export function runMemorySearch(query: string, limit = 20): MemoryHit[] {
  return searchMemory(query, { limit });
}
