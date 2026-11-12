/**
 * Smoke: chat reply diversity detects the Habarovsk/plan brochure
 * and builds an anti-repeat system block.
 */
import assert from "node:assert/strict";
import {
  buildReplyDiversityBlock,
  CHAT_DIVERSITY_SYSTEM_RULES,
  extractStickyTopics,
  looksLikeCannedIdeaMenu,
} from "../electron/chatDiversity";
import { loadConfig } from "../electron/config";
import { sendChatMessage } from "../electron/orchestrator";
import {
  addUtterance,
  closeStore,
  createSession,
  listUtterances,
  openStore,
} from "../electron/store";

const CANNED = `Завтра можем и поболтать, и сделать что-то руками. Вот несколько идей:

Мини-проект — игра, бот или короткий скрипт на Python.
План дня — утро, дела, вечер; я помогу разложить по шагам.
Хабаровск — погода и что надеть, если снова спросишь.
Разбор — камера, текст, идея; пришлёшь материал, разберём вместе.
Что ближе: код, планы или просто разговор?`;

async function main() {
  assert.equal(looksLikeCannedIdeaMenu(CANNED), true);
  assert.ok(
    extractStickyTopics(CANNED).length >= 4,
    "expected multiple sticky topics in canned brochure",
  );
  assert.equal(looksLikeCannedIdeaMenu("Ок, сделаю."), false);
  assert.ok(
    CHAT_DIVERSITY_SYSTEM_RULES.includes("меню идей"),
    "system rules must mention menu ban",
  );

  const block = buildReplyDiversityBlock([
    { role: "user", content: "ну что завтра" },
    { role: "assistant", content: CANNED },
  ]);
  assert.ok(block, "diversity block required after canned reply");
  assert.match(block!, /Разнообразие ответов/);
  assert.match(block!, /хабаровск|план дня|мини-проект/i);
  assert.match(block!, /Что ближе/i);

  loadConfig(true);
  process.env.LLM_PROVIDER = "mock";
  loadConfig(true);
  openStore();

  const session = createSession("chat-diversity-smoke");
  addUtterance(session.id, "assistant", CANNED);

  let sawDiversityAck = false;
  await sendChatMessage(
    { sessionId: session.id, text: "и что скажешь" },
    (e) => {
      if (e.type === "token" && /разнообразие/i.test(e.text)) {
        sawDiversityAck = true;
      }
      if (
        e.type === "assistant_done" &&
        /разнообразие/i.test(e.utterance.content)
      ) {
        sawDiversityAck = true;
      }
    },
  );

  const utt = listUtterances(session.id);
  const lastAssistant = [...utt].reverse().find((u) => u.role === "assistant");
  assert.ok(lastAssistant, "expected assistant reply");
  assert.ok(
    sawDiversityAck || /разнообразие/i.test(lastAssistant!.content),
    `mock should acknowledge diversity block, got: ${lastAssistant!.content.slice(0, 200)}`,
  );

  closeStore();
  console.log(
    JSON.stringify(
      {
        ok: true,
        stickyTopics: extractStickyTopics(CANNED),
        diversityBlockPreview: block!.slice(0, 220),
        mockAck: true,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
