/**
 * Headless P1 smoke: mock LLM chat + memory search without Electron UI.
 */
import { loadConfig } from "../electron/config";
import { sendChatMessage, runMemorySearch } from "../electron/orchestrator";
import {
  closeStore,
  ensureBootstrapSession,
  listUtterances,
  openStore,
} from "../electron/store";

async function main() {
  loadConfig(true);
  process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || "mock";
  loadConfig(true);

  openStore();
  const boot = ensureBootstrapSession();

  const events: string[] = [];
  const session = await sendChatMessage(
    {
      sessionId: boot.id,
      text: "Запомни: любимый цвет — янтарный deep-sea.",
    },
    (e) => events.push(e.type),
  );

  const session2 = await sendChatMessage(
    {
      sessionId: null,
      text: "О чём мы говорили про любимый цвет?",
    },
    (e) => events.push(e.type),
  );

  const hits = runMemorySearch("янтарный");
  const utt = listUtterances(session.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        events,
        sessionId: session.id,
        followUpSessionId: session2.id,
        utterancesInFirst: utt.length,
        memoryHits: hits.length,
        sampleHit: hits[0]?.content?.slice(0, 80) ?? null,
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
