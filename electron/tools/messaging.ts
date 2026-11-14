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
        status: "partial", // wa.me compose or WHATSAPP_BRIDGE_URL
      },
      {
        provider: "instagram",
        status: "partial", // profile open or INSTAGRAM_BRIDGE_URL
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
    const last = listMessengerMessages(20).find(
      (m) => m.provider === provider && m.direction === "out",
    );
    const lastContact = last
      ? listMessengerContacts(provider).find((c) => c.id === last.contact_id)
      : null;
    return {
      provider,
      action,
      recipientQuery:
        lastContact?.display_name ||
        lastContact?.handle ||
        process.env.TELEGRAM_DEFAULT_CHAT_ID?.trim() ||
        "последний",
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

/** Digits-only phone for wa.me (country code + number, no +). */
function whatsappPhoneDigits(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/**
 * Meta WhatsApp Cloud API (Graph). Needs WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID.
 * `to` must be digits with country code (no +).
 */
async function sendWhatsAppCloudApi(
  toDigits: string,
  body: string,
): Promise<{ ok: boolean; externalId: string | null; detail: string }> {
  const token = (process.env.WHATSAPP_CLOUD_TOKEN ?? "").trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      externalId: null,
      detail: "Cloud API: задайте WHATSAPP_CLOUD_TOKEN и WHATSAPP_PHONE_NUMBER_ID",
    };
  }
  if (!toDigits || toDigits.length < 8) {
    return {
      ok: false,
      externalId: null,
      detail: "Cloud API: нужен телефон получателя (цифры с кодом страны)",
    };
  }
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toDigits,
        type: "text",
        text: { body, preview_url: false },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        externalId: null,
        detail: `Cloud API HTTP ${res.status}: ${json.error?.message || "fail"}`.slice(
          0,
          220,
        ),
      };
    }
    const mid = json.messages?.[0]?.id ?? null;
    return {
      ok: true,
      externalId: mid,
      detail: `Отправлено через WhatsApp Cloud API${mid ? ` · ${mid}` : ""}`,
    };
  } catch (err) {
    return {
      ok: false,
      externalId: null,
      detail: `Cloud API error: ${err instanceof Error ? err.message : String(err)}`.slice(
        0,
        220,
      ),
    };
  }
}

/**
 * Open WhatsApp (desktop/web) with a prefilled message — no Meta Cloud API key.
 * Uses chat_id / handle as phone, or WHATSAPP_DEFAULT_PHONE.
 */
async function openWhatsAppCompose(
  contact: MessengerContactRow,
  body: string,
): Promise<{ ok: boolean; externalId: string | null; detail: string }> {
  const phone = whatsappPhoneDigits(
    contact.chat_id ||
      contact.handle ||
      process.env.WHATSAPP_DEFAULT_PHONE ||
      "",
  );
  if (!phone || phone.length < 8) {
    return {
      ok: false,
      externalId: null,
      detail:
        "Для WhatsApp нужен телефон (цифры с кодом страны) в контакте или WHATSAPP_DEFAULT_PHONE.",
    };
  }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
  try {
    if (typeof process.versions.electron === "string") {
      const { shell } = await import("electron");
      await shell.openExternal(url);
      return {
        ok: true,
        externalId: phone,
        detail: `Открыл WhatsApp с текстом для +${phone}. Нажмите «Отправить» в приложении.`,
      };
    }
  } catch (err) {
    return {
      ok: false,
      externalId: null,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    ok: false,
    externalId: null,
    detail: `WhatsApp compose: ${url}`,
  };
}

async function openInstagramProfile(
  contact: MessengerContactRow,
): Promise<{ ok: boolean; externalId: string | null; detail: string }> {
  const handle = (contact.handle || contact.chat_id || "")
    .replace(/^@/, "")
    .trim();
  if (!handle) {
    return {
      ok: false,
      externalId: null,
      detail: "Для Instagram нужен @username в контакте.",
    };
  }
  const url = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  try {
    if (typeof process.versions.electron === "string") {
      const { shell } = await import("electron");
      await shell.openExternal(url);
      return {
        ok: true,
        externalId: handle,
        detail: `Открыл профиль @${handle}. Вставьте текст вручную в Direct (API Instagram закрыт).`,
      };
    }
  } catch (err) {
    return {
      ok: false,
      externalId: null,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  return { ok: false, externalId: null, detail: url };
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

  if (
    (provider === "whatsapp" || provider === "instagram") &&
    policy.mode === "live"
  ) {
    // WhatsApp Cloud API first when token + phone-number-id are set.
    if (provider === "whatsapp") {
      const phone = whatsappPhoneDigits(
        contact.chat_id ||
          contact.handle ||
          process.env.WHATSAPP_DEFAULT_PHONE ||
          "",
      );
      const cloudToken = (process.env.WHATSAPP_CLOUD_TOKEN ?? "").trim();
      const cloudPhoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
      if (cloudToken && cloudPhoneId) {
        const live = await sendWhatsAppCloudApi(phone, intent.body);
        const message = addMessengerMessage({
          provider: "whatsapp",
          contactId: contact.id,
          chatId: contact.chat_id,
          direction: "out",
          body: intent.body,
          status: live.ok ? "sent" : "error",
          externalId: live.externalId,
        });
        return {
          ok: live.ok,
          provider: "whatsapp",
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
    }

    const bridge =
      provider === "whatsapp"
        ? process.env.WHATSAPP_BRIDGE_URL?.trim()
        : process.env.INSTAGRAM_BRIDGE_URL?.trim();
    if (bridge) {
      const base = bridge.replace(/\/$/, "");
      try {
        // Optional health — if /health fails we still try /send.
        try {
          await fetch(base + "/health", {
            method: "GET",
            signal: AbortSignal.timeout(2500),
          });
        } catch {
          /* optional */
        }
        const phone =
          provider === "whatsapp"
            ? whatsappPhoneDigits(
                contact.chat_id ||
                  contact.handle ||
                  process.env.WHATSAPP_DEFAULT_PHONE ||
                  "",
              )
            : undefined;
        const res = await fetch(base + "/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider,
            chatId: contact.chat_id,
            phone: phone || undefined,
            handle: contact.handle,
            body: intent.body,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const detail = res.ok
          ? `Отправлено через ${provider} bridge${phone ? ` · +${phone}` : ""}`
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
          externalId: phone || null,
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

    // No bridge: open native compose (WhatsApp) or profile (Instagram).
    const assist =
      provider === "whatsapp"
        ? await openWhatsAppCompose(contact, intent.body)
        : await openInstagramProfile(contact);
    const message = addMessengerMessage({
      provider,
      contactId: contact.id,
      chatId: contact.chat_id,
      direction: "out",
      body: intent.body,
      status: assist.ok ? "sent" : "error",
      externalId: assist.externalId,
    });
    return {
      ok: assist.ok,
      provider,
      action: intent.action,
      contact,
      chatId: contact.chat_id,
      body: intent.body,
      mode: "live",
      externalId: assist.externalId,
      detail: assist.detail,
      message,
    };
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
  const dryHint =
    provider === "telegram"
      ? "Dry-run (telegram): сообщение записано локально. Для live задайте TELEGRAM_BOT_TOKEN (+ chat id)."
      : provider === "whatsapp"
        ? "Dry-run (whatsapp): сообщение записано локально. Для live: MESSAGING_MODE=live + Cloud API / bridge / wa.me."
        : "Dry-run (instagram): сообщение записано локально. Для live задайте MESSAGING_MODE=live (+ INSTAGRAM_BRIDGE_URL).";
  return {
    ok: true,
    provider,
    action: intent.action,
    contact,
    chatId: contact.chat_id,
    body: intent.body,
    mode: "dry-run",
    externalId: null,
    detail: dryHint,
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
