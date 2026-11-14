import { requestUserConfirm } from "../confirmBridge";
import { openStore } from "../store";

export type MailRow = {
  id: string;
  folder: string;
  from_addr: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
};

export function looksLikeMailIntent(text: string): boolean {
  return /(почт|email|e-mail|письмо|inbox|ответь на письмо|входящ)/i.test(text);
}

export function getMailPolicy() {
  return {
    enabled: (process.env.MAIL_ENABLED ?? "true").trim().toLowerCase() !== "false",
    mode:
      (process.env.MAIL_MODE ?? "dry-run").trim().toLowerCase() === "live"
        ? "live"
        : "dry-run",
    account: (process.env.MAIL_ACCOUNT ?? "").trim() || null,
    smtpHost: (process.env.MAIL_SMTP_HOST ?? "").trim() || null,
    imapHost: (process.env.MAIL_IMAP_HOST ?? "").trim() || null,
  };
}

export function seedDemoInbox(): void {
  const store = openStore();
  const count = (
    store.prepare(`SELECT COUNT(*) AS c FROM mail_messages`).get() as {
      c: number;
    }
  ).c;
  if (count > 0) return;
  const now = new Date().toISOString();
  const insert = store.prepare(
    `INSERT INTO mail_messages (id, folder, from_addr, subject, body, status, created_at)
     VALUES (?, 'inbox', ?, ?, ?, 'unread', ?)`,
  );
  insert.run(
    crypto.randomUUID(),
    "demo@example.com",
    "Демо письмо Mira",
    "Это локальный stub inbox (F4). Live SMTP/IMAP — позже; пока черновики и поиск локально.",
    now,
  );
  insert.run(
    crypto.randomUUID(),
    "boss@example.com",
    "Встреча в пятницу",
    "Подтверди встречу в 15:00 и пришли повестку.",
    now,
  );
}

export function listMail(folder = "inbox", limit = 20): MailRow[] {
  seedDemoInbox();
  return openStore()
    .prepare(
      `SELECT id, folder, from_addr, subject, body, status, created_at
       FROM mail_messages WHERE folder = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(folder, limit) as MailRow[];
}

export function searchMail(query: string, limit = 20): MailRow[] {
  seedDemoInbox();
  const q = query.trim().toLowerCase();
  if (!q) return listMail("inbox", limit);
  const rows = openStore()
    .prepare(
      `SELECT id, folder, from_addr, subject, body, status, created_at
       FROM mail_messages
       ORDER BY created_at DESC
       LIMIT 200`,
    )
    .all() as MailRow[];
  const tokens = q.split(/[\s,/|]+/).filter((t) => t.length >= 2);
  return rows
    .filter((r) => {
      const hay = `${r.from_addr} ${r.subject} ${r.body} ${r.folder}`.toLowerCase();
      if (!tokens.length) return hay.includes(q);
      return tokens.some((t) => hay.includes(t));
    })
    .slice(0, limit);
}

export async function draftOrSendMail(input: {
  to: string;
  subject: string;
  body: string;
  send: boolean;
  replyToId?: string;
}): Promise<{ ok: boolean; detail: string; id: string }> {
  const policy = getMailPolicy();
  if (!policy.enabled) {
    return { ok: false, detail: "Почта выключена (MAIL_ENABLED=false)", id: "" };
  }
  if (input.send) {
    const ok = await requestUserConfirm({
      actionClass: "mail",
      risk: "high",
      title: "Отправить письмо?",
      body: `Кому: ${input.to}\nТема: ${input.subject}\n\n${input.body.slice(0, 400)}\n\nРежим: ${policy.mode}${
        policy.account ? `\nАккаунт: ${policy.account}` : ""
      }`,
      confirmLabel: "Отправить",
    });
    if (!ok) return { ok: false, detail: "Отправка отклонена", id: "" };
  }
  const id = crypto.randomUUID();
  let status: string =
    input.send && policy.mode === "live" ? "sent-stub" : input.send ? "dry-run" : "draft";
  let detail = `Письмо ${status} → ${input.to}`;

  if (input.send && policy.mode === "live" && policy.smtpHost) {
    // Live SMTP without extra deps: record intent + host; full nodemailer later.
    status = "sent-queued";
    detail = `SMTP queue → ${policy.smtpHost} · to=${input.to}${
      policy.account ? ` · from=${policy.account}` : ""
    } (transport later)`;
  } else if (input.send && policy.mode === "live" && !policy.smtpHost) {
    status = "sent-stub";
    detail = `Live без MAIL_SMTP_HOST — stub sent → ${input.to}`;
  }

  if (input.replyToId) {
    detail += ` · reply-to=${input.replyToId.slice(0, 8)}`;
  }

  openStore()
    .prepare(
      `INSERT INTO mail_messages (id, folder, from_addr, subject, body, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.send ? "sent" : "drafts",
      input.to,
      input.subject,
      input.body,
      status,
      new Date().toISOString(),
    );
  return {
    ok: true,
    id,
    detail,
  };
}

function extractMailTo(text: string): string | null {
  return (
    text.match(/(?:кому|to)[:\s]+([^\s,]+@[^\s,]+)/i)?.[1] ??
    text.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)?.[1] ??
    null
  );
}

function extractMailSubject(text: string): string | null {
  const m = text.match(/(?:тема|subject)\s*[:«"']?\s*(.+?)(?:[»"']|\s+(?:текст|body|тело)\b|$)/i);
  const s = m?.[1]?.trim();
  return s || null;
}

function extractMailBody(text: string): string {
  let body = text
    .replace(/напиши письмо|отправь письмо|ответь на письмо|email|e-mail|почт\w*/gi, " ")
    .replace(/(?:кому|to)[:\s]+[^\s,]+/gi, " ")
    .replace(/(?:тема|subject)\s*[:«"']?.+?(?:[»"']|\s+(?:текст|body|тело)\b)/gi, " ")
    .replace(/(?:текст|body|тело)\s*[:«"']?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return body || "Черновик из Mira";
}

function extractSearchQuery(text: string): string {
  return text
    .replace(
      /найди в почте|поиск по почте|search mail|письма? про|письма? от|inbox|входящ\w*|прочитай|почт\w*/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export async function handleMailFromChat(text: string): Promise<{
  used: string;
  block: string;
}> {
  const policy = getMailPolicy();
  if (!policy.enabled) {
    return {
      used: "mail:disabled",
      block: "[Почта] Выключена (MAIL_ENABLED=false).",
    };
  }

  if (/найди в почте|поиск по почте|search mail|письма? (про|от)/i.test(text)) {
    const q = extractSearchQuery(text);
    const rows = searchMail(q || "", 8);
    return {
      used: `mail:search:${rows.length}`,
      block: `[Почта: поиск «${q || "*"}»]\n${
        rows.length
          ? rows
              .map(
                (m) =>
                  `• [${m.folder}] ${m.from_addr}: ${m.subject} (${m.status})`,
              )
              .join("\n")
          : "Ничего не найдено."
      }`,
    };
  }

  if (/прочитай|inbox|входящ|покажи письма/i.test(text)) {
    const rows = listMail("inbox", 8);
    return {
      used: `mail:inbox:${rows.length}`,
      block: `[Почта: входящие${policy.account ? ` · ${policy.account}` : ""}]\n${rows
        .map((m) => `• ${m.from_addr}: ${m.subject}`)
        .join("\n")}`,
    };
  }

  if (/ответь на письмо|reply/i.test(text)) {
    const inbox = listMail("inbox", 1);
    const last = inbox[0];
    if (!last) {
      return {
        used: "mail:reply:empty",
        block: "[Почта] Нет входящих, чтобы ответить.",
      };
    }
    const body =
      extractMailBody(text).replace(/^Черновик из Mira$/, "") ||
      `Ответ на: ${last.subject}`;
    const res = await draftOrSendMail({
      to: last.from_addr,
      subject: last.subject.startsWith("Re:")
        ? last.subject
        : `Re: ${last.subject}`,
      body,
      send: /отправ/i.test(text),
      replyToId: last.id,
    });
    return {
      used: `mail:reply:${res.ok ? "ok" : "deny"}`,
      block: `[Почта] ${res.detail}`,
    };
  }

  const to = extractMailTo(text) ?? "user@example.com";
  const subject = extractMailSubject(text) ?? "Mira";
  const body = extractMailBody(text);
  const send = /отправ/i.test(text);
  const res = await draftOrSendMail({
    to,
    subject,
    body,
    send,
  });
  return {
    used: `mail:${send ? "send" : "draft"}:${res.ok ? "ok" : "deny"}`,
    block: `[Почта] ${res.detail}`,
  };
}
