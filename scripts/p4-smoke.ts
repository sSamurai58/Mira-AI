import assert from "node:assert/strict";
import { loadConfig } from "../electron/config";
import {
  extractSearchQueryFromText,
  looksLikeWebIntent,
  webSearch,
  type WebSearchHit,
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

function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${err.cause ?? ""}` : String(err);
  return /timeout|fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR|network/i.test(
    msg,
  );
}

async function webSearchRetry(
  query: string,
  attempts = 3,
): Promise<WebSearchHit[]> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await webSearch(query);
    } catch (err) {
      last = err;
      if (!isTransientNetworkError(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

async function main() {
  let hits: WebSearchHit[];
  try {
    hits = await webSearchRetry("DuckDuckGo");
  } catch (err) {
    // CI runners sometimes cannot reach api.duckduckgo.com (egress/timeout).
    // Intent routing is still asserted above; don't fail the whole pipeline.
    if (process.env.CI === "true" && isTransientNetworkError(err)) {
      console.warn("[p4-smoke] skip live DDG search (network):", err);
      console.log(
        JSON.stringify(
          { ok: true, skippedLiveSearch: true, reason: "network" },
          null,
          2,
        ),
      );
      closeStore();
      return;
    }
    throw err;
  }
  assert.ok(hits.length >= 1);

  let webUsed: string | null = null;
  try {
    await sendChatMessage(
      {
        sessionId: null,
        text: "Найди в интернете кратко: что такое DuckDuckGo",
      },
      (e) => {
        if (e.type === "assistant_done") webUsed = e.webUsed;
      },
    );
  } catch (err) {
    if (process.env.CI === "true" && isTransientNetworkError(err)) {
      console.warn("[p4-smoke] skip chat web path (network):", err);
      console.log(
        JSON.stringify(
          {
            ok: true,
            searchHits: hits.length,
            sample: hits[0]?.title ?? null,
            skippedChatWeb: true,
            reason: "network",
          },
          null,
          2,
        ),
      );
      closeStore();
      return;
    }
    throw err;
  }
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
