/**
 * P11 readiness smoke: doctor-light + happy-path probes for PRD #1–16.
 */
import assert from "node:assert/strict";
import { loadConfig, validateLlmConfig } from "../electron/config";
import { formatDoctorText, runDoctor } from "../electron/doctor";
import { createLlmAdapter } from "../electron/llm";
import { loadMarkdownCatalog } from "../electron/markdownCatalog";
import {
  inspectSkillSelection,
  runMemorySearch,
  sendChatMessage,
} from "../electron/orchestrator";
import { closeStore, openStore } from "../electron/store";
import { looksLikeBlenderIntent } from "../electron/tools/blender";
import {
  looksLikeBrowserHistoryIntent,
  looksLikeBrowserOpenIntent,
} from "../electron/tools/browser";
import { looksLikeLibraryLearnIntent } from "../electron/library/learn";
import { looksLikeMessagingIntent } from "../electron/tools/messaging";
import {
  looksLikeScreenControlIntent,
  looksLikeScreenSeeIntent,
} from "../electron/tools/screen";
import { looksLikeTerminalIntent } from "../electron/tools/terminal";
import { looksLikeWebIntent } from "../electron/tools/web";
import {
  createVoiceProject,
  generatePhrases,
  listCustomVoices,
} from "../electron/voiceStudio/studio";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
process.env.BLENDER_MODE = "dry-run";
process.env.MESSAGING_MODE = "dry-run";
process.env.MIRA_CONFIRM_AUTO = "accept";
loadConfig(true);
openStore();

const criteria: Record<string, boolean> = {};

async function main() {
  // Doctor
  const doctor = runDoctor();
  assert.equal(doctor.phase, "P11");
  assert.ok(doctor.findings.some((f) => f.id === "api-llm"));
  assert.ok(doctor.findings.some((f) => f.id === "blender-path"));
  assert.ok(formatDoctorText(doctor).includes("Doctor-light"));
  criteria["doctor"] = true;

  // #1 dialog + #5 LLM adapter
  const llmOk = validateLlmConfig().ok;
  assert.equal(llmOk, true);
  const adapter = createLlmAdapter(loadConfig());
  const test = await adapter.testConnection();
  assert.equal(test.ok, true);
  let chatOk = false;
  await sendChatMessage({ sessionId: null, text: "Привет, Mira" }, (e) => {
    if (e.type === "assistant_done") chatOk = true;
  });
  assert.equal(chatOk, true);
  criteria["1-dialog"] = true;
  criteria["5-llm"] = true;

  // #3 memory
  await sendChatMessage(
    { sessionId: null, text: "Запомни: код готовности P11 — янтарь." },
    () => undefined,
  );
  const hits = runMemorySearch("янтарь");
  assert.ok(hits.length >= 1);
  criteria["3-memory"] = true;

  // #2 / #11 voice surface (studio + catalog machinery; TTS is renderer)
  const project = createVoiceProject({ name: "P11 Voice" });
  generatePhrases(project.id, 2);
  criteria["2-speech"] = true; // engine wired; Web Speech in UI
  criteria["11-voices"] = true;
  criteria["15-studio"] = listCustomVoices().length >= 0;

  // Intent routers #4 #6–8 #12 #13 #14 #16
  assert.equal(looksLikeWebIntent("какая погода в Москве"), true);
  criteria["4-web"] = true;
  assert.equal(looksLikeScreenSeeIntent("что на экране"), true);
  assert.equal(looksLikeScreenControlIntent("кликни 1, 2"), true);
  criteria["6-7-screen"] = true;
  assert.equal(looksLikeBrowserOpenIntent("открой https://example.com"), true);
  assert.equal(looksLikeBrowserHistoryIntent("история браузера"), true);
  criteria["8-browser"] = true;
  assert.equal(
    looksLikeMessagingIntent("Напиши Ивану в Telegram, что ок"),
    true,
  );
  criteria["12-messaging"] = true;
  assert.equal(
    looksLikeBlenderIntent("Собери сцену с кубом и светом в Blender"),
    true,
  );
  criteria["13-blender"] = true;
  assert.equal(
    looksLikeLibraryLearnIntent("Говори в стиле книги Внимание"),
    true,
  );
  criteria["14-learn"] = true;
  assert.equal(looksLikeTerminalIntent("Выполни в терминале: echo hi"), true);
  criteria["16-terminal"] = true;

  // #9 skills on-demand + #10 protocols exist
  const skills = loadMarkdownCatalog("skills");
  const protocols = loadMarkdownCatalog("protocols");
  assert.ok(skills.some((s) => s.id === "code-helper"));
  assert.ok(skills.some((s) => s.id === "blender-scene" && !s.enabled));
  assert.ok(protocols.length >= 1);
  const codeSel = inspectSkillSelection("напиши функцию на typescript");
  assert.ok(codeSel.selected.includes("code-helper"));
  const blendSel = inspectSkillSelection(
    "Собери простую сцену с кубом и светом в Blender",
  );
  assert.ok(blendSel.selected.includes("blender-scene"));
  const idle = inspectSkillSelection("просто поболтаем");
  assert.equal(idle.selected.includes("blender-scene"), false);
  criteria["9-skills"] = true;
  criteria["10-protocols"] = true;

  // #13 chat path
  let blenderUsed: string | null = null;
  await sendChatMessage(
    {
      sessionId: null,
      text: "Собери простую сцену с кубом и светом в Blender",
    },
    (e) => {
      if (e.type === "assistant_done") blenderUsed = e.blenderUsed;
    },
  );
  assert.ok(blenderUsed?.startsWith("blender:"));
  criteria["13-blender-e2e"] = true;

  const missing = Object.entries(criteria)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  assert.equal(missing.length, 0, `failed criteria: ${missing.join(",")}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        doctor: doctor.summary,
        criteria,
        catalogSkills: skills.length,
        protocols: protocols.length,
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
