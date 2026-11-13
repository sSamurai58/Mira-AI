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
  extractLearnQuery,
  formatLearnedBlock,
  importLibraryBytes,
  importLibraryText,
  looksLikeLibraryLearnIntent,
  searchLearnedUnits,
} from "./library/learn";
import type { ChatImagePart } from "./llm/types";
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
import { describeScreenshot } from "./llm/vision";

import {
  executeTerminalFromChat,
  extractTerminalCommand,
  formatTerminalBlock,
  getTerminalPolicy,
  looksLikeTerminalIntent,
} from "./tools/terminal";
import {
  extractSearchQueryFromText,
  fetchWeatherSnapshot,
  formatWebBlock,
  getWebPolicy,
  looksLikeWeatherIntent,
  looksLikeWebIntent,
  webFetch,
  webSearch,
} from "./tools/web";
import {
  formatBlenderBlock,
  getBlenderPolicy,
  isBlenderSkill,
  looksLikeBlenderIntent,
  runDemoScene,
} from "./tools/blender";
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
import { appendAppLog } from "./logging";
import { handleCalendarFromChat, looksLikeCalendarIntent } from "./future/calendar";
import { handleCameraFromChat, looksLikeCameraIntent } from "./future/cameras";
import { handleFilesFromChat, looksLikeFilesIntent } from "./future/files";
import { handleIotFromChat, looksLikeIotIntent } from "./future/iot";
import { handleMailFromChat, looksLikeMailIntent } from "./future/mail";
import { handleMediaFromChat, looksLikeMediaIntent } from "./future/media";
import { handleNotesFromChat, looksLikeNotesIntent } from "./future/notes";
import {
  buildReplyDiversityBlock,
  CHAT_DIVERSITY_SYSTEM_RULES,
} from "./chatDiversity";

const BASE_SYSTEM_PROMPT = [
  "Ты Mira — локальный голосовой ИИ-помощник.",
  "Отвечай на языке пользователя, выразительно и по делу.",
  "Формат ответа: Markdown — **жирный**, *курсив*, __подчёркнутый__ где уместно; списки через «- »; обязательно несколько коротких абзацев (не одна длинная строка).",
  "Если в контексте есть интернет/погода/память/инструменты — опирайся только на них и дождись их данных: не пиши заранее, что данных нет, пока блок инструментов пуст или помечен как ошибка.",
  "Если блок погоды или поиска уже содержит цифры — используй их как актуальные и не предлагай «проверьте сайт» без нужды.",
  "Skills подключаются только по необходимости.",
  CHAT_DIVERSITY_SYSTEM_RULES,
].join(" ");

async function buildSystemPrompt(): Promise<string> {
  const parts = [BASE_SYSTEM_PROMPT];
  try {
    const { getActiveProfile } = await import("./profiles");
    const profile = getActiveProfile();
    if (profile?.notes?.trim() || profile?.voiceId) {
      parts.push(
        [
          "[Профиль голоса / стиля]",
          profile.name ? `Имя профиля: ${profile.name}.` : "",
          profile.voiceId ? `Привязанный voiceId: ${profile.voiceId}.` : "",
          profile.notes?.trim()
            ? `Стиль речи / характер: ${profile.notes.trim()}`
            : "",
          "Учитывай профиль в тоне и формулировках ответа.",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  } catch {
    /* profiles optional */
  }
  return parts.join("\n");
}

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
      learned?: string | null;
      blender?: string | null;
      addon?: string | null;
    }
  | { type: "phase"; phase: "tools" | "llm"; detail: string }
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
      learnedUsed: string | null;
      blenderUsed: string | null;
      addonUsed: string | null;
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
  const catalog = loadMarkdownCatalog("skills");
  const enabled = catalog.filter((s) => s.enabled);
  const explicit = matchExplicitSkillCommand(text);
  if (explicit) {
    const found =
      enabled.find((s) => s.id === explicit) ||
      // allow explicit activate of default-off blender skills
      catalog.find((s) => s.id === explicit);
    return found ? [found] : [];
  }

  // Blender: on-demand skills even when enabled=false in catalog
  if (looksLikeBlenderIntent(text)) {
    const blender = catalog.filter(isBlenderSkill).slice(0, 2);
    if (blender.length) return blender;
  }

  // on-demand by triggers only — never all skills
  return matchByTriggers(text, enabled).slice(0, 2);
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

export type ChatAttachmentInput = {
  name: string;
  mimeType: string;
  size: number;
  kind: string;
  text?: string;
  dataBase64?: string;
};

function buildUserContentWithAttachments(
  text: string,
  attachments: ChatAttachmentInput[],
): { storedText: string; promptText: string; images: ChatImagePart[] } {
  const trimmed = text.trim();
  const images: ChatImagePart[] = [];
  if (!attachments.length) {
    return { storedText: trimmed, promptText: trimmed, images };
  }
  const lines: string[] = [];
  if (trimmed) lines.push(trimmed);
  else lines.push("Смотри прикреплённые файлы.");
  lines.push("");
  lines.push(`[Вложения: ${attachments.length}]`);
  for (const a of attachments) {
    lines.push(`--- файл: ${a.name} (${a.kind}, ${a.size} B) ---`);
    if (a.kind === "image" && a.dataBase64) {
      images.push({
        mimeType: a.mimeType || "image/png",
        dataBase64: a.dataBase64,
      });
      lines.push("(изображение передано модели через vision)");
    } else if (a.text?.trim()) {
      lines.push(a.text.trim().slice(0, 40_000));
    } else {
      lines.push(`(содержимое «${a.name}» не извлечено в текст)`);
    }
  }
  const promptText = lines.join("\n");
  const names = attachments.map((a) => a.name).join(", ");
  const storedText = trimmed
    ? `${trimmed}\n\n[вложения: ${names}]`
    : `[вложения: ${names}]`;
  return { storedText, promptText, images };
}

async function maybeImportAttachmentsToLibrary(
  attachments: ChatAttachmentInput[],
): Promise<string[]> {
  const imported: string[] = [];
  for (const a of attachments) {
    try {
      if (a.kind === "text" && a.text?.trim()) {
        const item = importLibraryText({
          title: a.name.replace(/\.[^.]+$/, "") || a.name,
          text: a.text,
          fileName: a.name,
        });
        imported.push(item.title);
        continue;
      }
      if (a.dataBase64) {
        const bytes = Buffer.from(a.dataBase64, "base64");
        const item = await importLibraryBytes({
          bytes,
          fileName: a.name,
          title: a.name.replace(/\.[^.]+$/, "") || a.name,
          extractedText: a.text,
        });
        imported.push(item.title);
      }
    } catch (err) {
      appendAppLog({
        level: "warn",
        category: "library",
        message: err instanceof Error ? err.message : String(err),
        meta: { file: a.name },
      });
    }
  }
  return imported;
}

export async function sendChatMessage(
  input: {
    sessionId?: string | null;
    text: string;
    forceProtocolId?: string | null;
    attachments?: ChatAttachmentInput[];
    addToLibrary?: boolean;
  },
  emit: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<SessionRow> {
  const attachments = input.attachments ?? [];
  const rawText = input.text.trim();
  if (!rawText && !attachments.length) {
    emit({ type: "error", message: "Пустое сообщение" });
    throw new Error("Пустое сообщение");
  }

  const { storedText, promptText, images } = buildUserContentWithAttachments(
    rawText,
    attachments,
  );

  let libraryNote: string | null = null;
  if (input.addToLibrary && attachments.length) {
    const titles = await maybeImportAttachmentsToLibrary(attachments);
    if (titles.length) {
      libraryNote = `Добавлено в материалы обучения: ${titles.join(", ")}. Workshop → Обучение → «Разобрать».`;
    }
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
    session = createSession(titleFromFirstMessage(storedText));
  }

  const userUtterance = addUtterance(session.id, "user", storedText);
  emit({ type: "user", utterance: userUtterance });

  if (
    isNew ||
    session.title === "Первый диалог" ||
    session.title === "Новый диалог"
  ) {
    touchSession(session.id, titleFromFirstMessage(storedText));
    session = getSession(session.id) ?? session;
  }

  const skills = selectSkillsForTurn(promptText);
  let protocol: CatalogItem | null = null;
  const text = promptText;
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
  let learnedUsed: string | null = null;
  let learnedBlock: string | null = null;
  let blenderUsed: string | null = null;
  let blenderBlock: string | null = null;
  let addonUsed: string | null = null;
  let addonBlock: string | null = null;

  // Must tools first, then F* addons, then generic web — avoid calendar
  // stealing «Напиши … в Telegram, что встреча…».
  emit({
    type: "phase",
    phase: "tools",
    detail: "Собираю данные…",
  });
  try {
    if (looksLikeBlenderIntent(text) && getBlenderPolicy().enabled) {
      const job = await runDemoScene();
      blenderUsed = `blender:${job.task}:${job.mode}${job.ok ? "" : "-fail"}`;
      blenderBlock = formatBlenderBlock(job);
    } else if (looksLikeLibraryLearnIntent(text)) {
      const q = extractLearnQuery(text) || text;
      const units = searchLearnedUnits(q, 8);
      learnedUsed = units.length ? `learned:${units.length}` : "learned:none";
      learnedBlock = formatLearnedBlock(units);
    } else if (looksLikeTerminalIntent(text) && getTerminalPolicy().enabled) {
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
    } else if (looksLikeNotesIntent(text)) {
      const res = handleNotesFromChat(text);
      addonUsed = res.used;
      addonBlock = res.block;
    } else if (looksLikeCalendarIntent(text)) {
      const res = handleCalendarFromChat(text);
      addonUsed = res.used;
      addonBlock = res.block;
    } else if (looksLikeFilesIntent(text)) {
      const res = await handleFilesFromChat(text);
      addonUsed = res.used;
      addonBlock = res.block;
    } else if (looksLikeMailIntent(text)) {
      const res = await handleMailFromChat(text);
      addonUsed = res.used;
      addonBlock = res.block;
    } else if (looksLikeMediaIntent(text)) {
      const res = handleMediaFromChat(text);
      addonUsed = res.used;
      addonBlock = res.block;
    } else if (looksLikeCameraIntent(text)) {
      const res = await handleCameraFromChat(text);
      addonUsed = res.used;
      addonBlock = res.block;
    } else if (looksLikeIotIntent(text)) {
      const res = await handleIotFromChat(text);
      addonUsed = res.used;
      addonBlock = res.block;
    } else if (looksLikeScreenSeeIntent(text) && getScreenPolicy().enabled) {
      const shot = await captureScreen();
      let visionNote: string | null = null;
      // Attach PNG to multimodal chat path when the model supports vision.
      try {
        const fs = await import("node:fs");
        if (shot.path && fs.existsSync(shot.path)) {
          const b64 = fs.readFileSync(shot.path).toString("base64");
          if (b64.length > 32) {
            images.push({ mimeType: "image/png", dataBase64: b64 });
            visionNote =
              "(снимок экрана передан модели как изображение — опиши по пикселям)";
            desktopUsed = "screen-capture:multimodal";
          }
        }
      } catch {
        /* keep metadata path */
      }
      // Also run dedicated vision describe for providers / when image attach fails.
      try {
        const vision = await describeScreenshot(shot.path);
        if (vision.mode === "vision" || !visionNote) {
          visionNote = vision.text;
        } else if (vision.text) {
          visionNote = `${visionNote}\n${vision.text}`;
        }
        if (!desktopUsed?.includes("multimodal")) {
          desktopUsed = `screen-capture:${vision.mode}`;
        }
      } catch (err) {
        if (!visionNote) {
          visionNote =
            err instanceof Error ? err.message : "vision unavailable";
        }
        if (!desktopUsed) desktopUsed = "screen-capture";
      }
      desktopBlock = formatScreenBlock("capture", shot, visionNote);
    } else if (
      looksLikeScreenControlIntent(text) &&
      getScreenPolicy().controlEnabled
    ) {
      const typed = parseTypeText(text);
      const coords = parseClickCoords(text);
      if (typed && !coords) {
        const typedResult = await typeText(typed);
        desktopUsed = typedResult.ok
          ? `screen-type:${typedResult.mode}`
          : "screen-type-denied";
        desktopBlock = formatScreenBlock("type", typedResult);
      } else if (coords) {
        const click = await clickAt(coords.x, coords.y);
        desktopUsed = click.ok
          ? `screen-click:${click.mode}`
          : "screen-click-denied";
        desktopBlock = formatScreenBlock("click", click);
      } else {
        desktopUsed = "screen-control-need-coords";
        desktopBlock =
          "[Экран: control]\nНужны явные координаты, например: «кликни 640, 360». Без координат клик не выполняется (защита от случайного клика по окну Mira).";
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
      if (looksLikeWeatherIntent(text) && !urlMatch) {
        emit({
          type: "phase",
          phase: "tools",
          detail: "Уточняю погоду…",
        });
        try {
          webBlock = await fetchWeatherSnapshot(q || text, signal);
          webUsed = "weather";
        } catch (weatherErr) {
          const hits = await webSearch(q || text, signal);
          webUsed = "search";
          webBlock = `${formatWebBlock("search", hits)}\n\n[Погода: прямой источник недоступен — ${
            weatherErr instanceof Error ? weatherErr.message : String(weatherErr)
          }. Если в поиске нет температуры, честно скажи об этом.]`;
        }
      } else if (urlMatch && !looksLikeBrowserOpenIntent(text)) {
        const policy = getWebPolicy();
        if (policy.requireConfirmForFetch) {
          const ok = await requestUserConfirm({
            actionClass: "web-fetch",
            risk: "low",
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
          emit({
            type: "phase",
            phase: "tools",
            detail: "Загружаю страницу…",
          });
          const fetched = await webFetch(urlMatch, signal);
          webUsed = "fetch";
          webBlock = formatWebBlock("fetch", fetched);
        }
      } else {
        emit({
          type: "phase",
          phase: "tools",
          detail: "Ищу в интернете…",
        });
        const hits = await webSearch(q, signal);
        webUsed = "search";
        webBlock = formatWebBlock("search", hits);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendAppLog({
      level: "error",
      category: "orchestrator",
      message,
      meta: {
        webUsed,
        desktopUsed,
        messagingUsed,
        terminalUsed,
        learnedUsed,
        blenderUsed,
      },
    });
    if (
      !webUsed &&
      !desktopUsed &&
      !messagingUsed &&
      !terminalUsed &&
      !learnedUsed &&
      !blenderUsed &&
      !addonUsed
    ) {
      webUsed = "error";
      webBlock = `[Инструменты: ошибка] ${message}`;
    } else if (addonUsed) {
      addonBlock = `${addonBlock ?? ""}\n[Ошибка] ${message}`;
    } else if (blenderUsed) {
      blenderBlock = `${blenderBlock ?? ""}\n[Ошибка] ${message}`;
    } else if (learnedUsed) {
      learnedBlock = `${learnedBlock ?? ""}\n[Ошибка] ${message}`;
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
    learned: learnedUsed,
    blender: blenderUsed,
    addon: addonUsed,
  });

  const history = listUtterances(session.id);
  const searchQ = extractSearchQuery(text);
  const memoryHits = searchQ
    ? searchMemory(searchQ, { excludeSessionId: session.id, limit: 5 })
    : [];
  const memoryBlock = buildMemoryBlock(memoryHits);
  const skillsBlock = buildSkillsBlock(skills);
  const diversityBlock = buildReplyDiversityBlock(history, {
    memorySnippets: memoryHits.map((h) => h.content),
  });

  const messages: ChatMessage[] = [
    { role: "system", content: await buildSystemPrompt() },
  ];
  if (memoryBlock) messages.push({ role: "system", content: memoryBlock });
  if (diversityBlock) {
    messages.push({ role: "system", content: diversityBlock });
  }
  if (skillsBlock) messages.push({ role: "system", content: skillsBlock });
  if (protocol) {
    messages.push({ role: "system", content: buildProtocolBlock(protocol) });
  }
  if (webBlock) messages.push({ role: "system", content: webBlock });
  if (desktopBlock) messages.push({ role: "system", content: desktopBlock });
  if (messagingBlock) messages.push({ role: "system", content: messagingBlock });
  if (terminalBlock) messages.push({ role: "system", content: terminalBlock });
  if (learnedBlock) messages.push({ role: "system", content: learnedBlock });
  if (blenderBlock) messages.push({ role: "system", content: blenderBlock });
  if (addonBlock) messages.push({ role: "system", content: addonBlock });

  for (const u of history) {
    if (u.role === "system") continue;
    const isLastUser =
      u.id === userUtterance.id && u.role === "user" && images.length > 0;
    messages.push({
      role: u.role === "assistant" ? "assistant" : "user",
      // Use full prompt text (with attachment bodies) for the latest user turn.
      content: isLastUser || u.id === userUtterance.id ? promptText : u.content,
      images: isLastUser ? images : undefined,
    });
  }

  if (libraryNote) {
    messages.push({
      role: "system",
      content: `[Библиотека обучения] ${libraryNote}`,
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
  emit({
    type: "phase",
    phase: "llm",
    detail: "Формирую полный ответ…",
  });
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
    learnedUsed,
    blenderUsed,
    addonUsed,
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
