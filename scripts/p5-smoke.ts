import assert from "node:assert/strict";
import fs from "node:fs";
import { loadConfig } from "../electron/config";
import { sendChatMessage } from "../electron/orchestrator";
import {
  closeStore,
  openStore,
  searchBrowserVisits,
} from "../electron/store";
import {
  extractOpenUrl,
  looksLikeBrowserHistoryIntent,
  looksLikeBrowserOpenIntent,
  looksLikeBrowserReopenIntent,
  openBrowserUrl,
  searchHistory,
} from "../electron/tools/browser";
import {
  captureScreen,
  looksLikeScreenControlIntent,
  looksLikeScreenSeeIntent,
  parseChatHotkey,
  parseClickByLabel,
  parseClickCoords,
  parseScrollIntent,
  parseTypeText,
  parseVisionClickCoords,
} from "../electron/tools/screen";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.SCREEN_ENABLED = "true";
process.env.SCREEN_CONTROL_ENABLED = "true";
process.env.BROWSER_ENABLED = "true";
process.env.BROWSER_OPEN_CONFIRM = "true";
process.env.MIRA_CONFIRM_AUTO = "accept";
loadConfig(true);
openStore();

assert.equal(looksLikeScreenSeeIntent("что у меня на экране?"), true);
assert.equal(looksLikeScreenSeeIntent("привет"), false);
assert.equal(looksLikeScreenControlIntent("кликни 120, 240"), true);
assert.deepEqual(parseClickCoords("кликни 120, 240"), { x: 120, y: 240 });
assert.equal(parseTypeText("введи текст: hello Mira"), "hello Mira");
assert.equal(parseChatHotkey("нажми ctrl+s"), "ctrl+s");
assert.equal(parseScrollIntent("прокрути вниз")?.direction, "down");
assert.equal(parseClickByLabel("кликни по Сохранить"), "Сохранить");
assert.deepEqual(
  parseVisionClickCoords('{"x":100,"y":200,"found":true}', 1280, 720),
  { x: 100, y: 200 },
);
assert.equal(looksLikeBrowserOpenIntent("открой сайт example.com"), true);
assert.equal(extractOpenUrl("открой https://example.com/path"), "https://example.com/path");
assert.equal(looksLikeBrowserHistoryIntent("где я уже был в браузере"), true);
assert.equal(looksLikeBrowserReopenIntent("открой последний сайт"), true);

async function main() {
  const shot = await captureScreen();
  assert.equal(shot.ok, true);
  assert.ok(fs.existsSync(shot.path));

  let desktopUsed: string | null = null;
  let screenDesktopUsed: string | null = null;
  await sendChatMessage(
    { sessionId: null, text: "Что у меня на экране?" },
    (e) => {
      if (e.type === "assistant_done") desktopUsed = e.desktopUsed;
    },
  );
  screenDesktopUsed = desktopUsed;
  assert.ok(
    desktopUsed === "screen-capture" ||
      (typeof desktopUsed === "string" &&
        desktopUsed.startsWith("screen-capture:")),
    `unexpected screen desktopUsed=${desktopUsed}`,
  );

  desktopUsed = null;

  await sendChatMessage(
    { sessionId: null, text: "Кликни 10, 20" },
    (e) => {
      if (e.type === "assistant_done") desktopUsed = e.desktopUsed;
    },
  );
  assert.ok(
    desktopUsed === "screen-click:dry-run" ||
      desktopUsed === "screen-click:xdotool" ||
      desktopUsed === "screen-click:win32",
    `unexpected click desktopUsed=${desktopUsed}`,
  );

  desktopUsed = null;
  await sendChatMessage(
    { sessionId: null, text: "Прокрути вниз" },
    (e) => {
      if (e.type === "assistant_done") desktopUsed = e.desktopUsed;
    },
  );
  assert.ok(
    typeof desktopUsed === "string" && desktopUsed.startsWith("screen-scroll:"),
    `unexpected scroll desktopUsed=${desktopUsed}`,
  );

  desktopUsed = null;
  await sendChatMessage(
    { sessionId: null, text: "Нажми ctrl+s" },
    (e) => {
      if (e.type === "assistant_done") desktopUsed = e.desktopUsed;
    },
  );
  assert.ok(
    typeof desktopUsed === "string" && desktopUsed.startsWith("screen-keys:"),
    `unexpected keys desktopUsed=${desktopUsed}`,
  );

  desktopUsed = null;
  await sendChatMessage(
    { sessionId: null, text: "Открой сайт https://example.com" },
    (e) => {
      if (e.type === "assistant_done") desktopUsed = e.desktopUsed;
    },
  );
  assert.equal(desktopUsed, "browser-open");

  const opened = await openBrowserUrl("https://example.org");
  assert.equal(opened.ok, true);

  const visits = searchBrowserVisits("example", 10);
  assert.ok(visits.length >= 1);

  desktopUsed = null;
  await sendChatMessage(
    { sessionId: null, text: "Где я уже был? история браузера" },
    (e) => {
      if (e.type === "assistant_done") desktopUsed = e.desktopUsed;
    },
  );
  assert.equal(desktopUsed, "browser-history");

  const hist = searchHistory("example", 5);
  assert.ok(hist.length >= 1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        capturePath: shot.path,
        captureSource: shot.sourceName,
        chatScreen: screenDesktopUsed,
        chatClick: desktopUsed === "browser-history" ? "ok" : desktopUsed,
        visits: visits.length,
        historyHits: hist.length,
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
