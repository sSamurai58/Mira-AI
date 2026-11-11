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
  return /(почт|email|e-mail|письмо|inbox|ответь на письмо)/i.test(text);
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
  store
    .prepare(
      `INSERT INTO mail_messages (id, folder, from_addr, subject, body, status, created_at)
       VALUES (?, 'inbox', ?, ?, ?, 'unread', ?)`,
    )
    .run(
      crypto.randomUUID(),
      "demo@example.com",
      "Демо письмо Mira",
      "Это локальный stub inbox (F4). Live SMTP/IMAP — позже.",
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

export async function draftOrSendMail(input: {
  to: string;
  subject: string;
  body: string;
  send: boolean;
}): Promise<{ ok: boolean; detail: string; id: string }> {
  const policy = getMailPolicy();
  if (input.send) {
    const ok = await requestUserConfirm({
      actionClass: "mail",
      risk: "high",
      title: "Отправить письмо?",
      body: `Кому: ${input.to}\nТема: ${input.subject}\n\n${input.body.slice(0, 400)}\n\nРежим: ${policy.mode}`,
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
    detail = `SMTP queue stub → ${policy.smtpHost} · to=${input.to} (full transport later)`;
  } else if (input.send && policy.mode === "live" && !policy.smtpHost) {
    status = "sent-stub";
    detail = `Live без MAIL_SMTP_HOST — stub sent → ${input.to}`;
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


export async function handleMailFromChat(text: string): Promise<{
  used: string;
  block: string;
}> {
  if (/прочитай|inbox|входящ/i.test(text)) {
    const rows = listMail("inbox", 5);
    return {
      used: `mail:inbox:${rows.length}`,
      block: `[Почта]\n${rows.map((m) => `• ${m.from_addr}: ${m.subject}`).join("\n")}`,
    };
  }
  const to =
    text.match(/(?:кому|to)[:\s]+([^\s,]+)/i)?.[1] ?? "user@example.com";
  const body =
    text.replace(/напиши письмо|отправь письмо|email|почт\w*/gi, " ").trim() ||
    "Черновик из Mira";
  const send = /отправ/i.test(text);
  const res = await draftOrSendMail({
    to,
    subject: "Mira",
    body,
    send,
  });
  return {
    used: `mail:${send ? "send" : "draft"}:${res.ok ? "ok" : "deny"}`,
    block: `[Почта] ${res.detail}`,
  };
}
