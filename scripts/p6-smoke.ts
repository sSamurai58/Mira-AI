import assert from "node:assert/strict";
import { loadConfig } from "../electron/config";
import { sendChatMessage } from "../electron/orchestrator";
import {
  closeStore,
  findMessengerContact,
  listMessengerMessages,
  openStore,
} from "../electron/store";
import {
  looksLikeMessagingIntent,
  parseMessengerIntent,
  sendOrReplyMessage,
} from "../electron/tools/messaging";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.MESSAGING_ENABLED = "true";
process.env.MESSAGING_MODE = "dry-run";
process.env.MESSAGING_CONFIRM = "true";
process.env.MIRA_CONFIRM_AUTO = "accept";
delete process.env.TELEGRAM_BOT_TOKEN;
loadConfig(true);
openStore();

assert.equal(
  looksLikeMessagingIntent("Напиши Ивану в Telegram, что встречу переносим"),
  true,
);
assert.equal(looksLikeMessagingIntent("привет"), false);

const parsed = parseMessengerIntent(
  "Напиши Ивану в Telegram, что встречу переносим",
);
assert.ok(parsed);
assert.equal(parsed.provider, "telegram");
assert.equal(parsed.action, "send");
assert.equal(parsed.recipientQuery, "Ивану");
assert.match(parsed.body, /встречу переносим/i);

const reply = parseMessengerIntent("Ответь ему в Telegram: согласна");
assert.ok(reply);
assert.equal(reply.action, "reply");
assert.match(reply.body, /согласна/i);

const wa = parseMessengerIntent("Напиши Васе в WhatsApp, что ок");
assert.ok(wa);
assert.equal(wa.provider, "whatsapp");

async function main() {
  const contact = findMessengerContact("telegram", "Ивану");
  assert.ok(contact, "seed contact Иван expected");

  const sent = await sendOrReplyMessage(parsed!);
  assert.equal(sent.ok, true);
  assert.equal(sent.mode, "dry-run");
  assert.equal(sent.provider, "telegram");
  assert.ok(sent.message);

  const deniedEnv = process.env.MIRA_CONFIRM_AUTO;
  process.env.MIRA_CONFIRM_AUTO = "deny";
  const denied = await sendOrReplyMessage({
    provider: "telegram",
    action: "send",
    recipientQuery: "Анна",
    body: "не должно уйти",
  });
  process.env.MIRA_CONFIRM_AUTO = deniedEnv;
  assert.equal(denied.ok, false);
  assert.equal(denied.mode, "denied");

  const stub = await sendOrReplyMessage({
    provider: "whatsapp",
    action: "send",
    recipientQuery: "WA Demo",
    body: "stub",
  });
  assert.equal(stub.mode, "stub");
  assert.equal(stub.ok, false);

  let messagingUsed: string | null = null;
  await sendChatMessage(
    {
      sessionId: null,
      text: "Напиши Ивану в Telegram, что встреча в 15:00",
    },
    (e) => {
      if (e.type === "assistant_done") messagingUsed = e.messagingUsed;
    },
  );
  assert.equal(messagingUsed, "telegram-send:dry-run");

  messagingUsed = null;
  await sendChatMessage(
    {
      sessionId: null,
      text: "Ответь Анне в Telegram: приняла",
    },
    (e) => {
      if (e.type === "assistant_done") messagingUsed = e.messagingUsed;
    },
  );
  assert.equal(messagingUsed, "telegram-reply:dry-run");

  const recent = listMessengerMessages(10);
  assert.ok(recent.some((m) => m.status === "dry-run"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        sendMode: sent.mode,
        chatMessaging: messagingUsed,
        recent: recent.length,
        sampleStatuses: [...new Set(recent.map((m) => m.status))],
      },
      null,
      2,
    ),
  );
  closeStore();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
