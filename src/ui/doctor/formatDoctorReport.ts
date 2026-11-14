import { getVoiceEngineStatus } from "../voice/engineStatus";

export type DoctorFindingView = {
  id: string;
  area: string;
  ok: boolean;
  title: string;
  detail: string;
  fix?: string;
};

export type DoctorReportView = {
  ok: boolean;
  phase: string;
  generatedAt: string;
  findings: DoctorFindingView[];
  summary: string;
  voiceDetail: string;
};

/** Merge main-process doctor report with renderer voice/mic checks. */
export function mergeDoctorReport(
  main: {
    ok: boolean;
    phase: string;
    generatedAt: string;
    findings: DoctorFindingView[];
    summary: string;
  } | null,
): DoctorReportView {
  const voice = getVoiceEngineStatus();
  const micOk = voice.asr === "ready";
  const ttsOk = voice.tts === "ready";
  const voiceFindings: DoctorFindingView[] = [
    {
      id: "asr-renderer",
      area: "mic",
      ok: micOk,
      title: "ASR (Web Speech)",
      detail: voice.detail,
      fix: micOk
        ? undefined
        : "Откройте Mira в Electron/Chromium и разрешите микрофон при PTT.",
    },
    {
      id: "tts-renderer",
      area: "voice",
      ok: ttsOk,
      title: "TTS (Web Speech)",
      detail: ttsOk ? "speechSynthesis доступен" : "speechSynthesis недоступен",
      fix: ttsOk
        ? undefined
        : "Нужен Chromium/Electron с системными голосами.",
    },
  ];

  const findings = [...(main?.findings ?? []), ...voiceFindings];
  // Drop duplicate mic-guidance from main when we have renderer check
  const filtered = findings.filter((f) => f.id !== "mic-guidance");
  const blocking = filtered.filter((f) => !f.ok);
  const ok = blocking.length === 0 && (main?.ok ?? true);
  return {
    ok,
    phase: main?.phase ?? "F13",
    generatedAt: main?.generatedAt ?? new Date().toISOString(),
    findings: filtered,
    summary: ok
      ? `Doctor OK · ${filtered.length} checks`
      : `Проблемы: ${blocking.map((f) => f.id).join(", ")}`,
    voiceDetail: voice.detail,
  };
}

function plainArea(area: string): string {
  switch (area) {
    case "mic":
      return "Микрофон";
    case "api":
      return "Интернет-модели";
    case "voice":
      return "Голос";
    case "screen":
      return "Экран";
    case "db":
      return "Память/база";
    case "blender":
      return "Blender";
    case "tools":
      return "Инструменты";
    case "catalog":
      return "Каталоги";
    case "logs":
      return "Логи";
    default:
      return area;
  }
}

export function formatDoctorView(report: DoctorReportView): string {
  const broken = report.findings.filter((f) => !f.ok);
  const warn = report.findings.filter(
    (f) => f.ok && (f.fix || f.detail.toLowerCase().includes("не задан")),
  );
  const lines: string[] = [];

  if (broken.length === 0) {
    lines.push("ИТОГ: всё основное в порядке.");
  } else {
    lines.push(
      `ИТОГ: сломано ${broken.length} — ${broken.map((f) => plainArea(f.area)).join(", ")}.`,
    );
    lines.push("");
    lines.push("Что починить:");
    for (const f of broken) {
      lines.push(`• ${plainArea(f.area)} — ${f.title}`);
      lines.push(`  ${f.fix || f.detail}`);
    }
  }

  if (warn.length > 0 && broken.length === 0) {
    lines.push("");
    lines.push("Можно улучшить (не критично):");
    for (const f of warn.slice(0, 6)) {
      lines.push(`• ${f.title}: ${f.fix || f.detail}`);
    }
  }

  lines.push("");
  lines.push(`Подробности (${report.findings.length} проверок):`);
  for (const f of report.findings) {
    lines.push(`${f.ok ? "✓" : "✗"} ${plainArea(f.area)} · ${f.title}`);
    lines.push(`  ${f.detail}`);
    if (f.fix) lines.push(`  → ${f.fix}`);
  }
  return lines.join("\n");
}
