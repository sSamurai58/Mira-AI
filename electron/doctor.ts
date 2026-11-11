import fs from "node:fs";
import path from "node:path";
import { validateLlmConfig, loadConfig, getPublicConfig } from "./config";
import { getBlenderPolicy } from "./tools/blender";
import { getBrowserPolicy } from "./tools/browser";
import { getMessagingPolicy } from "./tools/messaging";
import { getScreenPolicy } from "./tools/screen";
import { getTerminalPolicy } from "./tools/terminal";
import { getWebPolicy } from "./tools/web";
import { getDatabasePath, getStoreHealth } from "./store";
import { loadMarkdownCatalog } from "./markdownCatalog";
import { listCustomVoices, listVoiceProjects } from "./voiceStudio/studio";
import { appendAppLog, getLoggingStatus, listAppLogs } from "./logging";

export type DoctorFinding = {
  id: string;
  area:
    | "mic"
    | "api"
    | "blender"
    | "db"
    | "tools"
    | "catalog"
    | "voice"
    | "screen"
    | "logs";
  ok: boolean;
  severity: "info" | "warn" | "error";
  title: string;
  detail: string;
  fix?: string;
};

export type DoctorReport = {
  ok: boolean;
  phase: "F13";
  generatedAt: string;
  findings: DoctorFinding[];
  summary: string;
  recentErrors: Array<{ created_at: string; category: string; message: string }>;
};

function finding(
  partial: Omit<DoctorFinding, "severity"> & { severity?: DoctorFinding["severity"] },
): DoctorFinding {
  return {
    severity: partial.severity ?? (partial.ok ? "info" : "error"),
    ...partial,
  };
}

export function runDoctor(): DoctorReport {
  loadConfig(true);
  const findings: DoctorFinding[] = [];

  const llm = validateLlmConfig();
  const pub = getPublicConfig();
  findings.push(
    finding({
      id: "api-llm",
      area: "api",
      ok: llm.ok,
      title: "LLM / API",
      detail: llm.ok
        ? `provider=${pub.llmProvider} model=${pub.llmModel}`
        : llm.reason ?? "LLM config invalid",
      fix: llm.ok
        ? undefined
        : "Проверьте ключи / LLM_PROVIDER=openai|claude|gemini|offline|mock в .env (Настройки → API и модели).",

    }),
  );

  const health = getStoreHealth();
  const dbPath = getDatabasePath();
  const dbExists = fs.existsSync(dbPath);
  findings.push(
    finding({
      id: "db-sqlite",
      area: "db",
      ok: health.ok && dbExists,
      title: "SQLite",
      detail: `ok=${health.ok} exists=${dbExists} sessions=${health.sessions} utterances=${health.utterances} library=${health.libraryItems}`,
      fix:
        health.ok && dbExists
          ? undefined
          : "Проверьте DATABASE_PATH и права на папку data/.",
    }),
  );

  const blender = getBlenderPolicy();
  findings.push(
    finding({
      id: "blender-path",
      area: "blender",
      ok: true,
      severity: blender.found ? "info" : "warn",
      title: "Blender",
      detail: blender.found
        ? `found=${blender.binaryPath} mode=${blender.mode}`
        : `бинарник не найден · mode=${blender.mode} (dry-run OK)`,
      fix: blender.found
        ? undefined
        : "Установите Blender и задайте BLENDER_PATH для live; иначе демо идёт в dry-run.",
    }),
  );

  const web = getWebPolicy();
  const screen = getScreenPolicy();
  const browser = getBrowserPolicy();
  const messaging = getMessagingPolicy();
  const terminal = getTerminalPolicy();

  findings.push(
    finding({
      id: "tools-web",
      area: "tools",
      ok: web.enabled,
      title: "Интернет (#4)",
      detail: `enabled=${web.enabled}`,
      fix: web.enabled ? undefined : "WEB_ENABLED=true в .env",
    }),
  );
  findings.push(
    finding({
      id: "tools-screen",
      area: "screen",
      ok: screen.enabled,
      title: "Экран (#6–7)",
      detail: `capture=${screen.enabled} control=${screen.controlEnabled} os=${screen.osPriority}`,
      fix: screen.enabled
        ? undefined
        : "SCREEN_ENABLED=true. Если capture пустой — проверьте права экрана ОС / xdotool для control.",
    }),
  );
  findings.push(
    finding({
      id: "tools-browser",
      area: "tools",
      ok: browser.enabled,
      title: "Браузер (#8)",
      detail: `enabled=${browser.enabled}`,
    }),
  );
  findings.push(
    finding({
      id: "tools-messaging",
      area: "tools",
      ok: messaging.enabled,
      severity: messaging.telegramConfigured ? "info" : "warn",
      title: "Мессенджеры (#12)",
      detail: `primary=${messaging.primary} mode=${messaging.mode} tgConfigured=${messaging.telegramConfigured}`,
      fix: messaging.telegramConfigured
        ? undefined
        : "Для live TG задайте TELEGRAM_BOT_TOKEN (иначе dry-run).",
    }),
  );
  findings.push(
    finding({
      id: "tools-terminal",
      area: "tools",
      ok: terminal.enabled,
      title: "Терминал (#16)",
      detail: `enabled=${terminal.enabled}`,
    }),
  );

  const skills = loadMarkdownCatalog("skills");
  const protocols = loadMarkdownCatalog("protocols");
  const blenderSkill = skills.find((s) => s.id === "blender-scene");
  findings.push(
    finding({
      id: "catalog",
      area: "catalog",
      ok: skills.length > 0 && protocols.length > 0,
      title: "Skills / Protocols",
      detail: `skills=${skills.length} protocols=${protocols.length} blender-scene=${blenderSkill ? (blenderSkill.enabled ? "on" : "on-demand/off") : "missing"}`,
      fix: blenderSkill
        ? undefined
        : "Перезапустите app — seed скопирует blender-scene.md",
    }),
  );

  findings.push(
    finding({
      id: "voice-studio",
      area: "voice",
      ok: true,
      title: "Студия голоса (#15)",
      detail: `projects=${listVoiceProjects().length} customVoices=${listCustomVoices().length}`,
    }),
  );

  findings.push(
    finding({
      id: "mic-guidance",
      area: "mic",
      ok: true,
      severity: "info",
      title: "Микрофон / ASR",
      detail:
        "Renderer: Web Speech ASR. Permission запрашивается при первом PTT.",
      fix: "Если mic недоступен: настройки ОС/Electron → разрешить микрофон для Mira; проверьте, что не headless.",
    }),
  );

  const logStatus = getLoggingStatus();
  const recentErrors = listAppLogs({ level: "error", limit: 8 }).map((r) => ({
    created_at: r.created_at,
    category: r.category,
    message: r.message,
  }));
  findings.push(
    finding({
      id: "session-logs",
      area: "logs",
      ok: true,
      severity: recentErrors.length ? "warn" : "info",
      title: "Логи сессии",
      detail: `dbRows=${logStatus.dbCount} files=${logStatus.files.length} latest=${logStatus.latestFile ?? "—"} recentErrors=${recentErrors.length}`,
      fix: recentErrors.length
        ? "Откройте просмотр логов в Настройки → Данные; разберите последние error."
        : undefined,
    }),
  );

  // writable data dirs
  for (const rel of ["data", "data/logs", "data/backups"]) {
    const abs = path.resolve(process.cwd(), rel);
    let writable = true;
    try {
      fs.mkdirSync(abs, { recursive: true });
      fs.accessSync(abs, fs.constants.W_OK);
    } catch {
      writable = false;
    }
    findings.push(
      finding({
        id: `fs-${rel.replace(/\W+/g, "-")}`,
        area: "db",
        ok: writable,
        title: `Запись ${rel}`,
        detail: writable ? "writable" : "нет прав на запись",
        fix: writable ? undefined : `Проверьте права на ${abs}`,
      }),
    );
  }

  const blocking = findings.filter((f) => !f.ok);
  const ok = blocking.length === 0;
  const summary = ok
    ? `Doctor OK · ${findings.length} checks`
    : `Проблемы: ${blocking.map((f) => f.id).join(", ")}`;

  const report: DoctorReport = {
    ok,
    phase: "F13",
    generatedAt: new Date().toISOString(),
    findings,
    summary,
    recentErrors,
  };

  appendAppLog({
    level: ok ? "info" : "warn",
    category: "doctor",
    message: summary,
    meta: { blocking: blocking.map((f) => f.id), errors: recentErrors.length },
  });

  return report;
}

export function formatDoctorText(report: DoctorReport): string {
  const lines = [
    `Doctor (${report.phase}) · ${report.summary}`,
    `at ${report.generatedAt}`,
    "",
  ];
  for (const f of report.findings) {
    const mark = f.ok ? (f.severity === "warn" ? "!" : "✓") : "✗";
    lines.push(`${mark} [${f.area}] ${f.title}`);
    lines.push(`  ${f.detail}`);
    if (f.fix) lines.push(`  → ${f.fix}`);
  }
  if (report.recentErrors.length) {
    lines.push("", "Последние ошибки:");
    for (const e of report.recentErrors.slice(0, 5)) {
      lines.push(`  · ${e.created_at} [${e.category}] ${e.message}`);
    }
  }
  return lines.join("\n");
}
