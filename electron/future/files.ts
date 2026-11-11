import fs from "node:fs";
import path from "node:path";
import { requestUserConfirm } from "../confirmBridge";

export function looksLikeFilesIntent(text: string): boolean {
  return /(найди файл|открой файл|открой папк|файл на диск|file manager|покажи путь)/i.test(
    text,
  );
}

function roots(): string[] {
  return [
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "seed"),
    path.resolve(process.cwd()),
  ];
}

function assertAllowed(abs: string): void {
  const resolved = path.resolve(abs);
  const ok = roots().some(
    (r) => resolved === r || resolved.startsWith(r + path.sep),
  );
  if (!ok) throw new Error("Файлы только внутри workspace/data/seed");
}

export function searchFiles(query: string, limit = 30): string[] {
  const q = query.trim().toLowerCase();
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (out.length >= limit || depth > 5) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (!q || e.name.toLowerCase().includes(q)) {
        out.push(full);
        if (out.length >= limit) return;
      }
    }
  }
  for (const r of roots()) walk(r, 0);
  return out;
}

export async function openFilePath(filePath: string): Promise<{
  ok: boolean;
  detail: string;
}> {
  const abs = path.resolve(filePath);
  assertAllowed(abs);
  if (!fs.existsSync(abs)) return { ok: false, detail: "Не найдено" };
  try {
    const { shell } = await import("electron");
    const err = await shell.openPath(abs);
    return { ok: !err, detail: err || `Открыто: ${abs}` };
  } catch {
    return { ok: true, detail: `Path OK (headless): ${abs}` };
  }
}

export async function deleteFilePath(filePath: string): Promise<{
  ok: boolean;
  detail: string;
}> {
  const abs = path.resolve(filePath);
  assertAllowed(abs);
  const ok = await requestUserConfirm({
    actionClass: "files",
    risk: "high",
    title: "Удалить файл?",
    body: `Необратимо удалить:\n${abs}`,
    confirmLabel: "Удалить",
  });
  if (!ok) return { ok: false, detail: "Удаление отклонено" };
  fs.unlinkSync(abs);
  return { ok: true, detail: `Удалено: ${abs}` };
}

export async function handleFilesFromChat(text: string): Promise<{
  used: string;
  block: string;
}> {
  const openMatch = text.match(/открой файл[:\s]+(.+)/i);
  if (openMatch) {
    const res = await openFilePath(openMatch[1].trim());
    return {
      used: `files:open:${res.ok ? "ok" : "fail"}`,
      block: `[Файлы] ${res.detail}`,
    };
  }
  const q = text
    .replace(/найди файл|открой папк\w*|файл на диск|file manager|покажи путь/gi, " ")
    .trim();
  const hits = searchFiles(q || "", 12);
  return {
    used: `files:search:${hits.length}`,
    block: `[Файлы]\n${hits.map((h) => `• ${h}`).join("\n") || "(ничего)"}`,
  };
}
