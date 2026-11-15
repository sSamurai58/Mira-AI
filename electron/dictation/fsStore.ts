/**
 * On-disk dictation sessions: data/dictation/<sessionId>/{meta.txt,source.txt,cleaned.txt,vN.txt,journal.jsonl}
 */
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../appPaths";

export type DiskDictationMeta = {
  session_id: string;
  created_at: string;
  status: string;
  source: string;
  current_version: number;
  locked_source: boolean;
  read_position: string;
  note_id?: string | null;
};

export type DiskDictationSession = {
  meta: DiskDictationMeta;
  sourceDictation: string;
  cleanedText: string;
  versions: Array<{ number: number; operation: string; body: string; createdAt: string }>;
  segments: Array<{ index: number; text: string; at: string }>;
};

function root(...parts: string[]): string {
  const dir = dataRoot("dictation", ...parts);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  return dir;
}

export function dictationRoot(): string {
  const dir = dataRoot("dictation");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionDir(sessionId: string): string {
  const safe = sessionId.replace(/[^\w.-]+/g, "_");
  const dir = path.join(dictationRoot(), safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeMeta(dir: string, meta: DiskDictationMeta): void {
  const lines = [
    `session_id: ${meta.session_id}`,
    `created_at: ${meta.created_at}`,
    `status: ${meta.status}`,
    `source: ${meta.source}`,
    `current_version: ${meta.current_version}`,
    `locked_source: ${meta.locked_source}`,
    `read_position: ${meta.read_position}`,
    `note_id: ${meta.note_id ?? ""}`,
  ];
  fs.writeFileSync(path.join(dir, "meta.txt"), `${lines.join("\n")}\n`, "utf8");
}

export function saveDictationToDisk(session: DiskDictationSession): {
  ok: boolean;
  dir: string;
  detail: string;
} {
  const dir = sessionDir(session.meta.session_id);
  writeMeta(dir, session.meta);
  fs.writeFileSync(path.join(dir, "source.txt"), session.sourceDictation ?? "", "utf8");
  fs.writeFileSync(path.join(dir, "cleaned.txt"), session.cleanedText ?? "", "utf8");
  for (const v of session.versions) {
    fs.writeFileSync(
      path.join(dir, `v${v.number}.txt`),
      `# operation: ${v.operation}\n# created: ${v.createdAt}\n\n${v.body}\n`,
      "utf8",
    );
  }
  fs.writeFileSync(
    path.join(dir, "segments.json"),
    JSON.stringify(session.segments ?? [], null, 2),
    "utf8",
  );
  return {
    ok: true,
    dir,
    detail: `Диктовка на диске: ${path.basename(dir)}`,
  };
}

export function loadDictationFromDisk(sessionId: string): DiskDictationSession | null {
  const dir = path.join(dictationRoot(), sessionId.replace(/[^\w.-]+/g, "_"));
  if (!fs.existsSync(path.join(dir, "meta.txt"))) return null;
  const metaRaw = fs.readFileSync(path.join(dir, "meta.txt"), "utf8");
  const get = (key: string) => {
    const m = metaRaw.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    return m?.[1]?.trim() ?? "";
  };
  const versions: DiskDictationSession["versions"] = [];
  for (const name of fs.readdirSync(dir)) {
    const vm = name.match(/^v(\d+)\.txt$/);
    if (!vm) continue;
    const bodyRaw = fs.readFileSync(path.join(dir, name), "utf8");
    const op = bodyRaw.match(/^# operation:\s*(.*)$/m)?.[1] ?? "unknown";
    const created = bodyRaw.match(/^# created:\s*(.*)$/m)?.[1] ?? "";
    const body = bodyRaw.replace(/^#.*$/gm, "").trim();
    versions.push({
      number: Number(vm[1]),
      operation: op,
      body,
      createdAt: created,
    });
  }
  versions.sort((a, b) => a.number - b.number);
  let segments: DiskDictationSession["segments"] = [];
  try {
    segments = JSON.parse(
      fs.readFileSync(path.join(dir, "segments.json"), "utf8"),
    ) as DiskDictationSession["segments"];
  } catch {
    segments = [];
  }
  return {
    meta: {
      session_id: get("session_id") || sessionId,
      created_at: get("created_at"),
      status: get("status") || "draft",
      source: get("source") || "dictation",
      current_version: Number(get("current_version") || 0),
      locked_source: get("locked_source") === "true",
      read_position: get("read_position") || "paragraph-0",
      note_id: get("note_id") || null,
    },
    sourceDictation: fs.existsSync(path.join(dir, "source.txt"))
      ? fs.readFileSync(path.join(dir, "source.txt"), "utf8")
      : "",
    cleanedText: fs.existsSync(path.join(dir, "cleaned.txt"))
      ? fs.readFileSync(path.join(dir, "cleaned.txt"), "utf8")
      : "",
    versions,
    segments,
  };
}

export function listDictationSessionsOnDisk(): string[] {
  const rootDir = dictationRoot();
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
}

export function exportDictationBackupPackage(): {
  ok: boolean;
  packagePath: string;
  detail: string;
  count: number;
} {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const packagePath = dataRoot("backups", `mira-dictation-${stamp}`);
  fs.mkdirSync(packagePath, { recursive: true });
  const src = dictationRoot();
  let count = 0;
  if (fs.existsSync(src)) {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const from = path.join(src, entry.name);
      const to = path.join(packagePath, entry.name);
      fs.cpSync(from, to, { recursive: true });
      count += 1;
    }
  }
  fs.writeFileSync(
    path.join(packagePath, "manifest.json"),
    JSON.stringify(
      {
        format: "mira-dictation-backup-v1",
        createdAt: new Date().toISOString(),
        sessions: count,
      },
      null,
      2,
    ),
    "utf8",
  );
  return {
    ok: true,
    packagePath,
    count,
    detail: `Бэкап диктовки: ${count} сессий → ${path.basename(packagePath)}`,
  };
}

export function restoreDictationBackupPackage(packagePath: string): {
  ok: boolean;
  detail: string;
  restored: number;
} {
  const resolved = path.resolve(packagePath);
  const data = dataRoot();
  if (!(resolved === data || resolved.startsWith(data + path.sep))) {
    throw new Error("Restore диктовки только из data/");
  }
  if (!fs.existsSync(path.join(resolved, "manifest.json"))) {
    throw new Error("Нет manifest.json в пакете диктовки");
  }
  const dest = dictationRoot();
  let restored = 0;
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    fs.cpSync(path.join(resolved, entry.name), path.join(dest, entry.name), {
      recursive: true,
    });
    restored += 1;
  }
  return {
    ok: true,
    restored,
    detail: `Восстановлено сессий диктовки: ${restored}`,
  };
}

/** Verify backup by restoring into a sibling test folder (not overwriting live). */
export function verifyDictationBackup(packagePath: string): {
  ok: boolean;
  detail: string;
  sampleSource: string;
} {
  const resolved = path.resolve(packagePath);
  const testDir = dataRoot("backups", "_dictation-verify");
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });
  let sampleSource = "";
  let n = 0;
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const from = path.join(resolved, entry.name);
    const to = path.join(testDir, entry.name);
    fs.cpSync(from, to, { recursive: true });
    n += 1;
    const srcFile = path.join(to, "source.txt");
    if (!sampleSource && fs.existsSync(srcFile)) {
      sampleSource = fs.readFileSync(srcFile, "utf8").slice(0, 200);
    }
  }
  return {
    ok: n > 0 || fs.existsSync(path.join(resolved, "manifest.json")),
    detail: `Проверка бэкапа: ${n} сессий в _dictation-verify`,
    sampleSource,
  };
}
