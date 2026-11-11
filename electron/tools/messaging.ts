import { requestUserConfirm } from "../confirmBridge";
import {
  addMessengerMessage,
  findMessengerContact,
  listMessengerContacts,
  listMessengerMessages,
  type MessengerContactRow,
  type MessengerMessageRow,
} from "../store";

export type MessengerProvider = "telegram" | "whatsapp" | "instagram";

export type MessagingPolicy = {
  enabled: boolean;
  primary: MessengerProvider;
  telegramConfigured: boolean;
  requireConfirm: boolean;
  mode: "live" | "dry-run";
  stubs: Array<{ provider: MessengerProvider; status: "stub" | "partial" }>;
};

export type ParsedMessengerIntent = {
  provider: MessengerProvider;
  action: "send" | "reply";
  recipientQuery: string;
  body: string;
};

export type MessengerSendResult = {
  ok: boolean;
  provider: MessengerProvider;
  action: "send" | "reply";
  contact: MessengerContactRow | null;
  chatId: string | null;
  body: string;
  mode: "live" | "dry-run" | "denied" | "stub";
  externalId: string | null;
  detail: string;
  message: MessengerMessageRow | null;
};

export function getMessagingPolicy(): MessagingPolicy {
  const enabled =
    (process.env.MESSAGING_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const primaryRaw = (process.env.MESSAGING_PRIMARY ?? "telegram")
    .trim()
    .toLowerCase();
  const primary: MessengerProvider =
    primaryRaw === "whatsapp" || primaryRaw === "instagram"
      ? primaryRaw
      : "telegram";
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const forceDry =
    (process.env.MESSAGING_MODE ?? "").trim().toLowerCase() === "dry-run";
  const requireConfirm =
    (process.env.MESSAGING_CONFIRM ?? "true").trim().toLowerCase() !== "false";
  return {
    enabled,
    primary,
    telegramConfigured: Boolean(token),
    requireConfirm,
    mode: !forceDry && token ? "live" : "dry-run",
    stubs: [
      { provider: "telegram", status: "partial" },
      { provider: "whatsapp", status: "stub" },
      { provider: "instagram", status: "stub" },
    ],
  };
}

export function looksLikeMessagingIntent(text: string): boolean {
  return /(напиши|отправь|ответь|reply|send|message).{0,40}(telegram|телеграм|whatsapp|ватсап|вацап|instagram|инстаграм)|в\s+(telegram|телеграм[еа]?)/i.test(
    text,
  );
}

function detectProvider(text: string): MessengerProvider {
  if (/whatsapp|ватсап|вацап/i.test(text)) return "whatsapp";
  if (/instagram|инстаграм/i.test(text)) return "instagram";
  return "telegram";
}

export function parseMessengerIntent(
  text: string,
): ParsedMessengerIntent | null {
  if (!looksLikeMessagingIntent(text)) return null;
  const provider = detectProvider(text);
  const action: "send" | "reply" = /ответь|reply/i.test(text)
    ? "reply"
    : "send";

  // «Ответь ему в Telegram: текст» / «Ответь Ивану в Telegram что ...»
  const replyNamed = text.match(
    /ответь\s+([^\s,]+)\s+в\s+(?:telegram|телеграм[еа]?|whatsapp|ватсап|вацап|instagram|инстаграм)\s*[,:]?\s*(?:что\s+)?(.+)$/i,
  );
  if (action === "reply" && replyNamed) {
    return {
      provider,
      action,
      recipientQuery: replyNamed[1].trim(),
      body: replyNamed[2].trim(),
    };
  }
  const replyPronoun = text.match(
    /ответь(?:\s+(?:ему|ей|им))?\s+в\s+(?:telegram|телеграм[еа]?|whatsapp|ватсап|вацап|instagram|инстаграм)\s*[,:]?\s*(?:что\s+)?(.+)$/i,
  );
  if (action === "reply" && replyPronoun) {
    return {
      provider,
      action,
      recipientQuery: "Иван",
      body: replyPronoun[1].trim(),
    };
  }

  // «Напиши Ивану в Telegram, что встречу переносим»
  const sendNameFirst = text.match(
    /(?:напиши|отправь|send|message)\s+([^\s,]+)\s+в\s+(?:telegram|телеграм[еа]?|whatsapp|ватсап|вацап|instagram|инстаграм)\s*[,:]?\s*(?:что\s+)?(.+)$/i,
  );
  if (sendNameFirst) {
    return {
      provider,
      action,
      recipientQuery: sendNameFirst[1].replace(/[.,!]+$/, ""),
      body: sendNameFirst[2].trim(),
    };
  }

  // «Напиши в Telegram Ивану: текст» / «Отправь в Telegram @ivan: hi»
  const sendProviderFirst = text.match(
    /(?:напиши|отправь|send)\s+в\s+(?:telegram|телеграм[еа]?|whatsapp|ватсап|instagram|инстаграм)\s+([^\s,:]+)\s*[,:]?\s*(?:что\s+)?(.+)$/i,
  );
  if (sendProviderFirst) {
    return {
      provider,
      action,
      recipientQuery: sendProviderFirst[1].replace(/[.,!]+$/, ""),
      body: sendProviderFirst[2].trim(),
    };
  }

  // Fallback: chat id from env + body after colon
  const bodyOnly = text.match(/[:,]\s*(?:что\s+)?(.+)$/i);
  if (bodyOnly?.[1]) {
    return {
      provider,
      action,
      recipientQuery: process.env.TELEGRAM_DEFAULT_CHAT_ID?.trim() || "Иван",
      body: bodyOnly[1].trim(),
    };
  }
  return null;
}

export function resolveChat(
  provider: MessengerProvider,
  query: string,
): MessengerContactRow | null {
  return findMessengerContact(provider, query);
}

async function sendTelegramLive(
  chatId: string,
  body: string,
): Promise<{ ok: boolean; externalId: string | null; detail: string }> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) {
    return { ok: false, externalId: null, detail: "TELEGRAM_BOT_TOKEN не задан" };
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: body,
      disable_web_page_preview: true,
    }),
  });
  const json = (await res.json()) as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  };
  if (!res.ok || !json.ok) {
    return {
      ok: false,
      externalId: null,
      detail: json.description || `HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    externalId: String(json.result?.message_id ?? ""),
    detail: "Отправлено через Telegram Bot API",
  };
}

export async function sendOrReplyMessage(
  intent: ParsedMessengerIntent,
): Promise<MessengerSendResult> {
  const policy = getMessagingPolicy();
  if (!policy.enabled) {
    throw new Error("Мессенджеры выключены (MESSAGING_ENABLED=false).");
  }

  if (intent.provider !== "telegram") {
    return {
      ok: false,
      provider: intent.provider,
      action: intent.action,
      contact: null,
      chatId: null,
      body: intent.body,
      mode: "stub",
      externalId: null,
      detail: `${intent.provider} — stub в P6; реализован только Telegram.`,
      message: null,
    };
  }

  const contact =
    resolveChat("telegram", intent.recipientQuery) ??
    (process.env.TELEGRAM_DEFAULT_CHAT_ID
      ? ({
          id: "env-default",
          provider: "telegram",
          display_name: "default",
          handle: process.env.TELEGRAM_DEFAULT_CHAT_ID,
          chat_id: process.env.TELEGRAM_DEFAULT_CHAT_ID,
          enabled: 1,
          created_at: new Date().toISOString(),
        } satisfies MessengerContactRow)
      : null);

  if (!contact) {
    return {
      ok: false,
      provider: "telegram",
      action: intent.action,
      contact: null,
      chatId: null,
      body: intent.body,
      mode: "denied",
      externalId: null,
      detail: `Чат не найден: «${intent.recipientQuery}». Добавьте контакт в Интеграциях или TELEGRAM_DEFAULT_CHAT_ID.`,
      message: null,
    };
  }

  if (policy.requireConfirm) {
    const ok = await requestUserConfirm({
      title:
        intent.action === "reply"
          ? "Подтверждение ответа в Telegram"
          : "Подтверждение сообщения в Telegram",
      body: `Провайдер: Telegram\nКому: ${contact.display_name} (${contact.handle})\nChat ID: ${contact.chat_id}\n\nТекст:\n${intent.body}`,
      confirmLabel: intent.action === "reply" ? "Ответить" : "Отправить",
    });
    if (!ok) {
      const message = addMessengerMessage({
        provider: "telegram",
        contactId: contact.id,
        chatId: contact.chat_id,
        direction: "out",
        body: intent.body,
        status: "denied",
      });
      return {
        ok: false,
        provider: "telegram",
        action: intent.action,
        contact,
        chatId: contact.chat_id,
        body: intent.body,
        mode: "denied",
        externalId: null,
        detail: "Отклонено пользователем",
        message,
      };
    }
  }

  if (policy.mode === "live") {
    const live = await sendTelegramLive(contact.chat_id, intent.body);
    const message = addMessengerMessage({
      provider: "telegram",
      contactId: contact.id,
      chatId: contact.chat_id,
      direction: "out",
      body: intent.body,
      status: live.ok ? "sent" : "error",
      externalId: live.externalId,
    });
    return {
      ok: live.ok,
      provider: "telegram",
      action: intent.action,
      contact,
      chatId: contact.chat_id,
      body: intent.body,
      mode: "live",
      externalId: live.externalId,
      detail: live.detail,
      message,
    };
  }

  const message = addMessengerMessage({
    provider: "telegram",
    contactId: contact.id,
    chatId: contact.chat_id,
    direction: "out",
    body: intent.body,
    status: "dry-run",
    externalId: null,
  });
  return {
    ok: true,
    provider: "telegram",
    action: intent.action,
    contact,
    chatId: contact.chat_id,
    body: intent.body,
    mode: "dry-run",
    externalId: null,
    detail:
      "Dry-run: сообщение записано локально после confirm. Для live задайте TELEGRAM_BOT_TOKEN (+ chat id).",
    message,
  };
}

export function formatMessagingBlock(result: MessengerSendResult): string {
  const who = result.contact
    ? `${result.contact.display_name} (${result.contact.handle})`
    : result.chatId ?? "—";
  return `[Мессенджер: ${result.provider} ${result.action} · ${result.mode}]\nКому: ${who}\nСтатус: ${result.ok ? "OK" : "FAIL"}\n${result.detail}\nТекст: ${result.body}`;
}

export function getMessagingStatusSnapshot(): {
  policy: MessagingPolicy;
  contacts: MessengerContactRow[];
  recent: MessengerMessageRow[];
} {
  return {
    policy: getMessagingPolicy(),
    contacts: listMessengerContacts(),
    recent: listMessengerMessages(10),
  };
}
