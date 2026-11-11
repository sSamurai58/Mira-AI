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
      {
        provider: "whatsapp",
        status: process.env.WHATSAPP_BRIDGE_URL?.trim() ? "partial" : "stub",
      },
      {
        provider: "instagram",
        status: process.env.INSTAGRAM_BRIDGE_URL?.trim() ? "partial" : "stub",
      },
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

  const provider = intent.provider;
  const defaultChatEnv =
    provider === "whatsapp"
      ? process.env.WHATSAPP_DEFAULT_CHAT_ID
      : provider === "instagram"
        ? process.env.INSTAGRAM_DEFAULT_CHAT_ID
        : process.env.TELEGRAM_DEFAULT_CHAT_ID;

  const contact =
    resolveChat(provider, intent.recipientQuery) ??
    (defaultChatEnv
      ? ({
          id: `env-default-${provider}`,
          provider,
          display_name: "default",
          handle: defaultChatEnv,
          chat_id: defaultChatEnv,
          enabled: 1,
          created_at: new Date().toISOString(),
        } satisfies MessengerContactRow)
      : null);

  if (!contact) {
    return {
      ok: false,
      provider,
      action: intent.action,
      contact: null,
      chatId: null,
      body: intent.body,
      mode: "denied",
      externalId: null,
      detail: `Чат не найден (${provider}): «${intent.recipientQuery}». Добавьте контакт или DEFAULT_CHAT_ID.`,
      message: null,
    };
  }

  if (policy.requireConfirm) {
    const ok = await requestUserConfirm({
      actionClass: "messaging",
      risk: "high",
      title:
        intent.action === "reply"
          ? `Подтверждение ответа (${provider})`
          : `Подтверждение сообщения (${provider})`,
      body: `Провайдер: ${provider}\nКому: ${contact.display_name} (${contact.handle})\nChat ID: ${contact.chat_id}\n\nТекст:\n${intent.body}`,
      confirmLabel: intent.action === "reply" ? "Ответить" : "Отправить",
    });
    if (!ok) {
      const message = addMessengerMessage({
        provider,
        contactId: contact.id,
        chatId: contact.chat_id,
        direction: "out",
        body: intent.body,
        status: "denied",
      });
      return {
        ok: false,
        provider,
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

  if (provider === "telegram" && policy.mode === "live") {
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

  if (provider === "whatsapp" || provider === "instagram") {
    const bridge =
      provider === "whatsapp"
        ? process.env.WHATSAPP_BRIDGE_URL?.trim()
        : process.env.INSTAGRAM_BRIDGE_URL?.trim();
    if (bridge && policy.mode === "live") {
      try {
        const res = await fetch(bridge.replace(/\/$/, "") + "/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider,
            chatId: contact.chat_id,
            body: intent.body,
          }),
        });
        const detail = res.ok
          ? `Отправлено через ${provider} bridge`
          : `Bridge HTTP ${res.status}`;
        const message = addMessengerMessage({
          provider,
          contactId: contact.id,
          chatId: contact.chat_id,
          direction: "out",
          body: intent.body,
          status: res.ok ? "sent" : "error",
        });
        return {
          ok: res.ok,
          provider,
          action: intent.action,
          contact,
          chatId: contact.chat_id,
          body: intent.body,
          mode: "live",
          externalId: null,
          detail,
          message,
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        const message = addMessengerMessage({
          provider,
          contactId: contact.id,
          chatId: contact.chat_id,
          direction: "out",
          body: intent.body,
          status: "error",
        });
        return {
          ok: false,
          provider,
          action: intent.action,
          contact,
          chatId: contact.chat_id,
          body: intent.body,
          mode: "live",
          externalId: null,
          detail: `Bridge error: ${detail}`,
          message,
        };
      }
    }
  }

  const message = addMessengerMessage({
    provider,
    contactId: contact.id,
    chatId: contact.chat_id,
    direction: "out",
    body: intent.body,
    status: "dry-run",
    externalId: null,
  });
  const liveHint =
    provider === "telegram"
      ? "Для live задайте TELEGRAM_BOT_TOKEN (+ chat id)."
      : provider === "whatsapp"
        ? "Для live задайте WHATSAPP_BRIDGE_URL (+ WHATSAPP_DEFAULT_CHAT_ID)."
        : "Для live задайте INSTAGRAM_BRIDGE_URL (+ INSTAGRAM_DEFAULT_CHAT_ID).";
  return {
    ok: true,
    provider,
    action: intent.action,
    contact,
    chatId: contact.chat_id,
    body: intent.body,
    mode: "dry-run",
    externalId: null,
    detail: `Dry-run (${provider}): сообщение записано локально после confirm. ${liveHint}`,
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
