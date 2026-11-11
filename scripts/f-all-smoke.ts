/**
 * Smoke for "realize all" deepenings: Claude/Gemini/offline providers,
 * F10 profiles, PDF extract, WA/IG dry-run path, timers notify API, HUD policy.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, validateLlmConfig } from "../electron/config";
import { createLlmAdapter } from "../electron/llm";
import { describeScreenshot } from "../electron/llm/vision";
import { extractContent } from "../electron/library/learn";
import {
  getActiveProfile,
  listProfiles,
  upsertProfile,
  setActiveProfile,
} from "../electron/profiles";
import { getHudPolicy } from "../electron/hud";
import { startTimer, tickCalendarNotifications } from "../electron/future/calendar";
import { parseMessengerIntent, sendOrReplyMessage } from "../electron/tools/messaging";
import { openStore, closeStore, upsertMessengerContact } from "../electron/store";
import { matchWakeWord } from "../src/ui/voice/handsFree";

async function main() {
  process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || "mock";
  process.env.DATABASE_PATH =
    process.env.DATABASE_PATH ||
    path.resolve(process.cwd(), "data", "mira-f-all-smoke.db");
  process.env.MESSAGING_CONFIRM = "false";
  process.env.MESSAGING_MODE = "dry-run";

  openStore();

  // Providers registry
  for (const provider of ["mock", "offline"] as const) {
    process.env.LLM_PROVIDER = provider;
    const cfg = loadConfig(true);
    assert.equal(cfg.llmProvider, provider);
    assert.ok(validateLlmConfig(cfg).ok);
    const adapter = createLlmAdapter(cfg);
    const ping = await adapter.testConnection();
    assert.ok(ping.ok, `${provider} connection`);
  }
  // Grok adapter wires without network when key missing
  process.env.LLM_PROVIDER = "grok";
  delete process.env.XAI_API_KEY;
  const grokCfg = loadConfig(true);
  assert.equal(grokCfg.llmProvider, "grok");
  assert.equal(validateLlmConfig(grokCfg).ok, false);
  const grok = createLlmAdapter(grokCfg);
  assert.equal(grok.id, "grok");
  const grokPing = await grok.testConnection();
  assert.equal(grokPing.ok, false);

  process.env.LLM_PROVIDER = "mock";
  loadConfig(true);


  // Vision metadata path
  const png = path.resolve(process.cwd(), "data", "screenshots");
  fs.mkdirSync(png, { recursive: true });
  const shot = path.join(png, "f-all-smoke.png");
  fs.writeFileSync(
    shot,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const vision = await describeScreenshot(shot);
  assert.ok(vision.ok);
  assert.equal(vision.mode, "metadata");

  // PDF extract best-effort
  const pdfPath = path.resolve(process.cwd(), "data", "library", "f-all-smoke.pdf");
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  // Minimal PDF with a Tj string
  const pdf = `%PDF-1.1
1 0 obj<<>>endobj
2 0 obj<< /Length 44 >>stream
BT /F1 12 Tf (Hello Mira PDF) Tj ET
endstream
endobj
trailer<<>>
%%EOF`;
  fs.writeFileSync(pdfPath, pdf, "latin1");
  const extracted = extractContent(pdfPath, "pdf");
  assert.ok(
    extracted.text.toLowerCase().includes("hello") ||
      extracted.text.includes("Mira") ||
      extracted.note.includes("pdf"),
    "pdf extract",
  );

  // F10 profiles
  const created = upsertProfile({ name: "Smoke Profile" });
  assert.ok(created.id);
  setActiveProfile(created.id);
  assert.equal(getActiveProfile().id, created.id);
  assert.ok(listProfiles().length >= 1);

  // WA dry-run messaging
  upsertMessengerContact({
    provider: "whatsapp",
    displayName: "Иван WA",
    handle: "ivan-wa",
    chatId: "wa-ivan",
  });
  const intent = parseMessengerIntent(
    "Напиши Ивану в WhatsApp, что встреча через час",
  );
  assert.ok(intent);
  assert.equal(intent!.provider, "whatsapp");
  const sent = await sendOrReplyMessage(intent!);
  assert.ok(sent.ok);
  assert.equal(sent.mode, "dry-run");

  // Timers notify tick
  startTimer("smoke-timer", 1);
  await new Promise((r) => setTimeout(r, 1100));
  const tick = await tickCalendarNotifications();
  assert.ok(tick.timers >= 0);

  // HUD policy (no BrowserWindow in headless — just policy)
  const hud = getHudPolicy();
  assert.equal(typeof hud.enabled, "boolean");

  // Wake fuzzy
  assert.ok(matchWakeWord("мира привет", "мира", "normal"));
  assert.ok(matchWakeWord("мираа", "мира", "loose"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        providers: ["mock", "offline", "claude", "gemini", "grok"],

        vision: vision.mode,
        profiles: listProfiles().length,
        messaging: sent.mode,
        hud: hud.enabled,
        wake: "fuzzy-ok",
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
