import { createLlmAdapter, type ChatMessage } from "./llm";
import { loadConfig, validateLlmConfig } from "./config";
import {
  loadMarkdownCatalog,
  matchByTriggers,
  matchExplicitProtocolCommand,
  matchExplicitSkillCommand,
  type CatalogItem,
} from "./markdownCatalog";
import { requestUserConfirm } from "./confirmBridge";
import {
  extractOpenUrl,
  formatBrowserBlock,
  getBrowserPolicy,
  looksLikeBrowserHistoryIntent,
  looksLikeBrowserOpenIntent,
  openBrowserUrl,
  searchHistory,
} from "./tools/browser";
import {
  formatMessagingBlock,
  getMessagingPolicy,
  looksLikeMessagingIntent,
  parseMessengerIntent,
  sendOrReplyMessage,
} from "./tools/messaging";
import {
  captureScreen,
  clickAt,
  formatScreenBlock,
  getScreenPolicy,
  looksLikeScreenControlIntent,
  looksLikeScreenSeeIntent,
  parseClickCoords,
  parseTypeText,
  typeText,
} from "./tools/screen";
import {
  executeTerminalFromChat,
  extractTerminalCommand,
  formatTerminalBlock,
  getTerminalPolicy,
  looksLikeTerminalIntent,
} from "./tools/terminal";
import {
  extractSearchQueryFromText,
  formatWebBlock,
  getWebPolicy,
  looksLikeWebIntent,
  webFetch,
  webSearch,
} from "./tools/web";
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
  "Ты Mira — локальный голосовой ИИ-помощник. Отвечай по делу на языке пользователя. Если даны фрагменты памяти, интернет-данные, снимок экрана, история браузера, мессенджер или вывод терминала — опирайся на них. Skills подключаются только по необходимости.";

export type ChatStreamEvent =
  | { type: "user"; utterance: UtteranceRow }
  | {
      type: "context";
      skills: Array<{ id: string; name: string }>;
      protocol: { id: string; name: string } | null;
      web?: string | null;
      desktop?: string | null;
      messaging?: string | null;
      terminal?: string | null;
    }
  | { type: "assistant_start"; sessionId: string }
  | { type: "token"; text: string }
  | {
      type: "assistant_done";
      utterance: UtteranceRow;
      memoryUsed: MemoryHit[];
      skillsUsed: Array<{ id: string; name: string }>;
      protocolUsed: { id: string; name: string } | null;
      webUsed: string | null;
      desktopUsed: string | null;
      messagingUsed: string | null;
      terminalUsed: string | null;
    }
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
      const words = userText
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .slice(0, 4);
      return words.join(" ") || userText.slice(0, 48);
    }
  }
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

export function selectSkillsForTurn(text: string): CatalogItem[] {
  const all = loadMarkdownCatalog("skills").filter((s) => s.enabled);
  const explicit = matchExplicitSkillCommand(text);
  if (explicit) {
    const found = all.find((s) => s.id === explicit);
    return found ? [found] : [];
  }
  // on-demand by triggers only — never all skills
  return matchByTriggers(text, all).slice(0, 2);
}

export function selectProtocolForTurn(text: string): CatalogItem | null {
  const all = loadMarkdownCatalog("protocols").filter((p) => p.enabled);
  const explicit = matchExplicitProtocolCommand(text);
  if (explicit) {
    // /morning maps to morning-check if present
    return (
      all.find((p) => p.id === explicit) ||
      all.find((p) => p.id.includes(explicit)) ||
      all.find((p) => p.triggers.some((t) => t.includes(explicit))) ||
      null
    );
  }
  const matched = matchByTriggers(text, all);
  return matched[0] ?? null;
}

function buildSkillsBlock(skills: CatalogItem[]): string | null {
  if (!skills.length) return null;
  const parts = skills.map(
    (s) =>
      `### Skill: ${s.name} (${s.id})\n${s.description}\n\n${s.body}`,
  );
  return `[Active skills — only these are in context]\n${parts.join("\n\n")}`;
}

function buildProtocolBlock(protocol: CatalogItem): string {
  return `[Active protocol: ${protocol.name} (${protocol.id})]\nВыполни этот протокол сейчас.\n\n${protocol.body}`;
}

export async function sendChatMessage(
  input: {
    sessionId?: string | null;
    text: string;
    forceProtocolId?: string | null;
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

  if (
    isNew ||
    session.title === "Первый диалог" ||
    session.title === "Новый диалог"
  ) {
    touchSession(session.id, titleFromFirstMessage(text));
    session = getSession(session.id) ?? session;
  }

  const skills = selectSkillsForTurn(text);
  let protocol: CatalogItem | null = null;
  if (input.forceProtocolId) {
    protocol =
      loadMarkdownCatalog("protocols").find(
        (p) => p.id === input.forceProtocolId && p.enabled,
      ) ?? null;
  } else {
    protocol = selectProtocolForTurn(text);
  }

  let webUsed: string | null = null;
  let webBlock: string | null = null;
  let desktopUsed: string | null = null;
  let desktopBlock: string | null = null;
  let messagingUsed: string | null = null;
  let messagingBlock: string | null = null;
  let terminalUsed: string | null = null;
  let terminalBlock: string | null = null;

  // Prefer explicit tool intents over generic web when both match.
  try {
    if (looksLikeTerminalIntent(text) && getTerminalPolicy().enabled) {
      const cmd = extractTerminalCommand(text);
      if (cmd) {
        const ran = await executeTerminalFromChat(cmd);
        terminalUsed = `terminal:${ran.mode}${ran.dangerous ? ":dangerous" : ""}`;
        terminalBlock = formatTerminalBlock(ran);
      } else {
        terminalUsed = "parse-fail";
        terminalBlock =
          "[Терминал] Не удалось извлечь команду. Пример: «Выполни в терминале: ls -la».";
      }
    } else if (looksLikeMessagingIntent(text) && getMessagingPolicy().enabled) {
      const intent = parseMessengerIntent(text);
      if (intent) {
        const sent = await sendOrReplyMessage(intent);
        messagingUsed = `${sent.provider}-${sent.action}:${sent.mode}${sent.ok ? "" : "-fail"}`;
        messagingBlock = formatMessagingBlock(sent);
      } else {
        messagingUsed = "parse-fail";
        messagingBlock =
          "[Мессенджер] Не удалось разобрать получателя/текст. Пример: «Напиши Ивану в Telegram, что встречу переносим».";
      }
    } else if (looksLikeScreenSeeIntent(text) && getScreenPolicy().enabled) {
      const shot = await captureScreen();
      desktopUsed = "screen-capture";
      desktopBlock = formatScreenBlock("capture", shot);
    } else if (
      looksLikeScreenControlIntent(text) &&
      getScreenPolicy().controlEnabled
    ) {
      const typed = parseTypeText(text);
      if (typed && !parseClickCoords(text)) {
        const typedResult = await typeText(typed);
        desktopUsed = typedResult.ok
          ? `screen-type:${typedResult.mode}`
          : "screen-type-denied";
        desktopBlock = formatScreenBlock("type", typedResult);
      } else {
        const coords = parseClickCoords(text) ?? { x: 100, y: 100 };
        const click = await clickAt(coords.x, coords.y);
        desktopUsed = click.ok
          ? `screen-click:${click.mode}`
          : "screen-click-denied";
        desktopBlock = formatScreenBlock("click", click);
      }
    } else if (looksLikeBrowserOpenIntent(text) && getBrowserPolicy().enabled) {
      const url = extractOpenUrl(text);
      if (url) {
        const opened = await openBrowserUrl(url);
        desktopUsed = opened.ok ? "browser-open" : "browser-open-denied";
        desktopBlock = formatBrowserBlock("open", opened);
      }
    } else if (looksLikeBrowserHistoryIntent(text)) {
      const q = text
        .replace(/история браузера|где я (уже )?был|сайты?|browser history/gi, " ")
        .trim();
      const hits = searchHistory(q || "", 15);
      desktopUsed = "browser-history";
      desktopBlock = formatBrowserBlock("history", hits);
    } else if (looksLikeWebIntent(text) && getWebPolicy().enabled) {
      const q = extractSearchQueryFromText(text);
      const urlMatch = text.match(/https?:\/\/\S+/i)?.[0];
      if (urlMatch && !looksLikeBrowserOpenIntent(text)) {
        const policy = getWebPolicy();
        if (policy.requireConfirmForFetch) {
          const ok = await requestUserConfirm({
            title: "Подтверждение web.fetch",
            body: `Mira хочет загрузить страницу:\n${urlMatch}\n\nРазрешить исходящий запрос?`,
            confirmLabel: "Загрузить",
          });
          if (!ok) {
            webUsed = "fetch-denied";
            webBlock =
              "[Интернет: web.fetch отклонён пользователем — ответь без содержимого URL]";
          }
        }
        if (webUsed !== "fetch-denied") {
          const fetched = await webFetch(urlMatch, signal);
          webUsed = "fetch";
          webBlock = formatWebBlock("fetch", fetched);
        }
      } else {
        const hits = await webSearch(q, signal);
        webUsed = "search";
        webBlock = formatWebBlock("search", hits);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!webUsed && !desktopUsed && !messagingUsed && !terminalUsed) {
      webUsed = "error";
      webBlock = `[Инструменты: ошибка] ${message}`;
    } else if (terminalUsed) {
      terminalBlock = `${terminalBlock ?? ""}\n[Ошибка] ${message}`;
    } else if (messagingUsed) {
      messagingBlock = `${messagingBlock ?? ""}\n[Ошибка] ${message}`;
    } else if (desktopUsed) {
      desktopBlock = `${desktopBlock ?? ""}\n[Ошибка] ${message}`;
    } else {
      webBlock = `[Интернет: ошибка] ${message}`;
    }
  }

  emit({
    type: "context",
    skills: skills.map((s) => ({ id: s.id, name: s.name })),
    protocol: protocol ? { id: protocol.id, name: protocol.name } : null,
    web: webUsed,
    desktop: desktopUsed,
    messaging: messagingUsed,
    terminal: terminalUsed,
  });

  const history = listUtterances(session.id);
  const searchQ = extractSearchQuery(text);
  const memoryHits = searchQ
    ? searchMemory(searchQ, { excludeSessionId: session.id, limit: 5 })
    : [];
  const memoryBlock = buildMemoryBlock(memoryHits);
  const skillsBlock = buildSkillsBlock(skills);

  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  if (memoryBlock) messages.push({ role: "system", content: memoryBlock });
  if (skillsBlock) messages.push({ role: "system", content: skillsBlock });
  if (protocol) {
    messages.push({ role: "system", content: buildProtocolBlock(protocol) });
  }
  if (webBlock) messages.push({ role: "system", content: webBlock });
  if (desktopBlock) messages.push({ role: "system", content: desktopBlock });
  if (messagingBlock) messages.push({ role: "system", content: messagingBlock });
  if (terminalBlock) messages.push({ role: "system", content: terminalBlock });

  for (const u of history) {
    if (u.role === "system") continue;
    messages.push({
      role: u.role === "assistant" ? "assistant" : "user",
      content: u.content,
    });
  }

  // Safety assertion for P3.6: never attach full catalog
  const allSkillsCount = loadMarkdownCatalog("skills").length;
  if (skills.length > 0 && skills.length >= allSkillsCount && allSkillsCount > 2) {
    emit({
      type: "error",
      message: "Internal: refused to load all skills into context",
    });
    throw new Error("Refused to load all skills");
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
    skillsUsed: skills.map((s) => ({ id: s.id, name: s.name })),
    protocolUsed: protocol ? { id: protocol.id, name: protocol.name } : null,
    webUsed,
    desktopUsed,
    messagingUsed,
    terminalUsed,
  });

  return getSession(session.id) ?? session;
}

export function runMemorySearch(query: string, limit = 20): MemoryHit[] {
  return searchMemory(query, { limit });
}

export function inspectSkillSelection(text: string): {
  selected: string[];
  catalogSize: number;
} {
  const selected = selectSkillsForTurn(text).map((s) => s.id);
  return {
    selected,
    catalogSize: loadMarkdownCatalog("skills").length,
  };
}
