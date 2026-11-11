/**
 * Smoke for F* pack: F1–F8 + F10 + F12 (F9/F11/F13 have dedicated smokes).
 */
import assert from "node:assert/strict";
import { loadConfig } from "../electron/config";
import {
  getConfirmPolicy,
  setConfirmPolicyEnv,
  shouldRequestConfirm,
} from "../electron/confirmPolicy";
import { handleCalendarFromChat } from "../electron/future/calendar";
import { handleCameraFromChat } from "../electron/future/cameras";
import { handleFilesFromChat } from "../electron/future/files";
import { handleIotFromChat } from "../electron/future/iot";
import { handleMailFromChat } from "../electron/future/mail";
import { handleMediaFromChat } from "../electron/future/media";
import { handleNotesFromChat, listNotes } from "../electron/future/notes";
import { getActiveProfile, listProfiles } from "../electron/profiles";
import { sendChatMessage } from "../electron/orchestrator";
import { closeStore, openStore } from "../electron/store";


loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.MIRA_CONFIRM_AUTO = "accept";
loadConfig(true);
openStore();

async function main() {
  // F12
  setConfirmPolicyEnv({ mode: "smart" });
  assert.equal(getConfirmPolicy().mode, "smart");
  assert.equal(shouldRequestConfirm("browser", "low"), false);
  assert.equal(shouldRequestConfirm("messaging", "high"), true);
  setConfirmPolicyEnv({ mode: "always" });
  assert.equal(shouldRequestConfirm("browser", "low"), true);

  // F6 notes
  const n = handleNotesFromChat("Заметка: купить молоко");
  assert.ok(n.used.startsWith("notes:"));
  assert.ok(listNotes().length >= 1);

  // F3 calendar/timer
  const t = handleCalendarFromChat("Поставь таймер на 2 минуты");
  assert.ok(t.used.startsWith("timer:"));
  const ev = handleCalendarFromChat("Добавь встречу в календарь демо");
  assert.ok(ev.used.startsWith("calendar:"));

  // F5 files
  const files = await handleFilesFromChat("Найди файл smoke");
  assert.ok(files.used.startsWith("files:search:"));

  // F4 mail
  const mail = await handleMailFromChat("Прочитай входящие письма");
  assert.ok(mail.used.startsWith("mail:inbox:"));

  // F7 media
  const media = handleMediaFromChat("Включи музыку");
  assert.ok(media.used.startsWith("media:"));

  // F1 cameras
  const cam = await handleCameraFromChat("Сделай снимок с камеры");
  assert.ok(cam.used.startsWith("camera:"));

  // F2 IoT
  const iot = await handleIotFromChat("Включи свет");
  assert.ok(iot.used.startsWith("iot:"));

  // F10 profiles
  assert.ok(listProfiles().length >= 1);
  assert.ok(getActiveProfile().id);

  // Dialog addon path + F8 is UI-only (lang prefs)
  let addonUsed: string | null = null;
  await sendChatMessage(
    { sessionId: null, text: "Заметка: F-rest smoke ok" },
    (e) => {
      if (e.type === "assistant_done") addonUsed = e.addonUsed;
    },
  );
  assert.ok(addonUsed?.startsWith("notes:"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        f12: getConfirmPolicy().mode,
        notes: listNotes().length,
        addonUsed,
        profiles: listProfiles().length,
        covered: [
          "F1",
          "F2",
          "F3",
          "F4",
          "F5",
          "F6",
          "F7",
          "F8(ui)",
          "F10",
          "F12",
        ],
        skipped: [],
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
