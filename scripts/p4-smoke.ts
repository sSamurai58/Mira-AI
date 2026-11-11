import assert from "node:assert/strict";
import { loadConfig } from "../electron/config";
import {
  extractSearchQueryFromText,
  looksLikeWebIntent,
  webSearch,
} from "../electron/tools/web";
import { sendChatMessage } from "../electron/orchestrator";
import { closeStore, openStore } from "../electron/store";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.WEB_ENABLED = "true";
loadConfig(true);
openStore();

assert.equal(looksLikeWebIntent("найди в интернете новости про AI"), true);
assert.equal(looksLikeWebIntent("привет"), false);
assert.ok(extractSearchQueryFromText("найди погода Москва").includes("погода"));

async function main() {
  const hits = await webSearch("DuckDuckGo");
  assert.ok(hits.length >= 1);

  let webUsed: string | null = null;
  await sendChatMessage(
    { sessionId: null, text: "Найди в интернете кратко: что такое DuckDuckGo" },
    (e) => {
      if (e.type === "assistant_done") webUsed = e.webUsed;
    },
  );
  assert.equal(webUsed, "search");

  console.log(
    JSON.stringify(
      {
        ok: true,
        searchHits: hits.length,
        sample: hits[0]?.title ?? null,
        chatWebUsed: webUsed,
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
