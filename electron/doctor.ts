import { validateLlmConfig, loadConfig, getPublicConfig } from "./config";
import { getBlenderPolicy } from "./tools/blender";
import { getBrowserPolicy } from "./tools/browser";
import { getMessagingPolicy } from "./tools/messaging";
import { getScreenPolicy } from "./tools/screen";
import { getTerminalPolicy } from "./tools/terminal";
import { getWebPolicy } from "./tools/web";
import { getStoreHealth } from "./store";
import { loadMarkdownCatalog } from "./markdownCatalog";
import { listCustomVoices, listVoiceProjects } from "./voiceStudio/studio";

export type DoctorFinding = {
  id: string;
  area: "mic" | "api" | "blender" | "db" | "tools" | "catalog" | "voice";
  ok: boolean;
  title: string;
  detail: string;
  fix?: string;
};

export type DoctorReport = {
  ok: boolean;
  phase: "P11";
  generatedAt: string;
  findings: DoctorFinding[];
  summary: string;
};

export function runDoctor(): DoctorReport {
  loadConfig(true);
  const findings: DoctorFinding[] = [];

  // API / LLM
  const llm = validateLlmConfig();
  const pub = getPublicConfig();
  findings.push({
    id: "api-llm",
    area: "api",
    ok: llm.ok,
    title: "LLM / API",
    detail: llm.ok
      ? `provider=${pub.llmProvider} model=${pub.llmModel}`
      : llm.reason ?? "LLM config invalid",
    fix: llm.ok
      ? undefined
      : "Проверьте OPENAI_API_KEY / LLM_PROVIDER в .env (Настройки → API и модели).",
  });

  // DB
  const health = getStoreHealth();
  findings.push({
    id: "db-sqlite",
    area: "db",
    ok: health.ok,
    title: "SQLite",
    detail: `sessions=${health.sessions} utterances=${health.utterances} library=${health.libraryItems}`,
    fix: health.ok
      ? undefined
      : "Проверьте DATABASE_PATH и права на папку data/.",
  });

  // Blender
  const blender = getBlenderPolicy();
  findings.push({
    id: "blender-path",
    area: "blender",
    ok: blender.enabled,
    title: "Blender",
    detail: blender.found
      ? `found=${blender.binaryPath} mode=${blender.mode}`
      : `бинарник не найден · mode=${blender.mode} (dry-run OK для демо)`,
    fix: blender.found
      ? undefined
      : "Установите Blender и задайте BLENDER_PATH, либо оставьте dry-run.",
  });

  // Tools snapshot
  const web = getWebPolicy();
  const screen = getScreenPolicy();
  const browser = getBrowserPolicy();
  const messaging = getMessagingPolicy();
  const terminal = getTerminalPolicy();
  findings.push({
    id: "tools-web",
    area: "tools",
    ok: web.enabled,
    title: "Интернет (#4)",
    detail: `enabled=${web.enabled}`,
    fix: web.enabled ? undefined : "WEB_ENABLED=true в .env",
  });
  findings.push({
    id: "tools-screen",
    area: "tools",
    ok: screen.enabled,
    title: "Экран (#6–7)",
    detail: `capture=${screen.enabled} control=${screen.controlEnabled}`,
  });
  findings.push({
    id: "tools-browser",
    area: "tools",
    ok: browser.enabled,
    title: "Браузер (#8)",
    detail: `enabled=${browser.enabled}`,
  });
  findings.push({
    id: "tools-messaging",
    area: "tools",
    ok: messaging.enabled,
    title: "Мессенджеры (#12)",
    detail: `primary=${messaging.primary} mode=${messaging.mode} tgConfigured=${messaging.telegramConfigured}`,
    fix: messaging.telegramConfigured
      ? undefined
      : "Для live TG задайте TELEGRAM_BOT_TOKEN (иначе dry-run).",
  });
  findings.push({
    id: "tools-terminal",
    area: "tools",
    ok: terminal.enabled,
    title: "Терминал (#16)",
    detail: `enabled=${terminal.enabled}`,
  });

  // Catalog / voice studio
  const skills = loadMarkdownCatalog("skills");
  const protocols = loadMarkdownCatalog("protocols");
  const blenderSkill = skills.find((s) => s.id === "blender-scene");
  findings.push({
    id: "catalog",
    area: "catalog",
    ok: skills.length > 0 && protocols.length > 0,
    title: "Skills / Protocols",
    detail: `skills=${skills.length} protocols=${protocols.length} blender-scene=${blenderSkill ? (blenderSkill.enabled ? "on" : "on-demand/off") : "missing"}`,
    fix: blenderSkill
      ? undefined
      : "Перезапустите app — seed скопирует blender-scene.md",
  });

  const voiceProjects = listVoiceProjects().length;
  const customVoices = listCustomVoices().length;
  findings.push({
    id: "voice-studio",
    area: "voice",
    ok: true,
    title: "Студия голоса (#15)",
    detail: `projects=${voiceProjects} customVoices=${customVoices}`,
  });

  // Mic note — actual mic is renderer-only; surface guidance
  findings.push({
    id: "mic-guidance",
    area: "mic",
    ok: true,
    title: "Микрофон / ASR",
    detail:
      "Проверка в UI (Doctor из renderer): Web Speech ASR + permission при первом PTT.",
    fix: "Если mic недоступен: системные настройки Electron/ОС → разрешить микрофон для Mira.",
  });

  const blocking = findings.filter((f) => !f.ok);
  const ok = blocking.length === 0;
  const summary = ok
    ? `Doctor OK · ${findings.length} checks`
    : `Проблемы: ${blocking.map((f) => f.id).join(", ")}`;

  return {
    ok,
    phase: "P11",
    generatedAt: new Date().toISOString(),
    findings,
    summary,
  };
}

export function formatDoctorText(report: DoctorReport): string {
  const lines = [
    `Doctor-light (${report.phase}) · ${report.summary}`,
    `at ${report.generatedAt}`,
    "",
  ];
  for (const f of report.findings) {
    lines.push(`${f.ok ? "✓" : "✗"} [${f.area}] ${f.title}`);
    lines.push(`  ${f.detail}`);
    if (f.fix) lines.push(`  → ${f.fix}`);
  }
  return lines.join("\n");
}
