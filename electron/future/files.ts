import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requestUserConfirm } from "../confirmBridge";

export function looksLikeFilesIntent(text: string): boolean {
  return /(найди файл|открой файл|открой папк|файл на диск|file manager|покажи путь|удали файл|скопируй путь|найди на диск)/i.test(
    text,
  );
}

function extraRoots(): string[] {
  const raw = (process.env.FILES_EXTRA_ROOTS ?? "").trim();
  const home = os.homedir();
  const defaults = [
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    path.join(home, "Desktop"),
  ].filter((p) => fs.existsSync(p));
  const fromEnv = raw
    ? raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    : [];
  return [...defaults, ...fromEnv];
}

function roots(): string[] {
  const base = [
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "seed"),
    path.resolve(process.cwd()),
    ...extraRoots(),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of base) {
    const abs = path.resolve(r);
    if (seen.has(abs)) continue;
    if (!fs.existsSync(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

function assertAllowed(abs: string): void {
  const resolved = path.resolve(abs);
  const ok = roots().some(
    (r) => resolved === r || resolved.startsWith(r + path.sep),
  );
  if (!ok) {
    throw new Error(
      "Файлы только внутри workspace/data/seed или Documents/Downloads/Desktop (FILES_EXTRA_ROOTS)",
    );
  }
}

export function searchFiles(query: string, limit = 30): string[] {
  const q = query.trim().toLowerCase();
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (out.length >= limit || depth > 6) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!q || e.name.toLowerCase().includes(q)) {
          // Prefer matching folder names too when query present.
          if (q && e.name.toLowerCase().includes(q)) {
            out.push(full + path.sep);
            if (out.length >= limit) return;
          }
        }
        walk(full, depth + 1);
      } else if (!q || e.name.toLowerCase().includes(q)) {
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
  const abs = path.resolve(filePath.replace(/[/\\]+$/, ""));
  assertAllowed(abs);
  if (!fs.existsSync(abs)) return { ok: false, detail: "Не найдено" };
  try {
    const { shell } = await import("electron");
    if (fs.statSync(abs).isDirectory()) {
      const err = await shell.openPath(abs);
      return { ok: !err, detail: err || `Папка открыта: ${abs}` };
    }
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
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    fs.rmSync(abs, { recursive: true, force: true });
  } else {
    fs.unlinkSync(abs);
  }
  return { ok: true, detail: `Удалено: ${abs}` };
}

export async function handleFilesFromChat(text: string): Promise<{
  used: string;
  block: string;
}> {
  const delMatch = text.match(/удали файл[:\s]+(.+)/i);
  if (delMatch) {
    const res = await deleteFilePath(delMatch[1].trim());
    return {
      used: `files:delete:${res.ok ? "ok" : "deny"}`,
      block: `[Файлы] ${res.detail}`,
    };
  }

  const openMatch = text.match(
    /открой (?:файл|папк[уа])[:\s]+(.+)/i,
  );
  if (openMatch) {
    const res = await openFilePath(openMatch[1].trim());
    return {
      used: `files:open:${res.ok ? "ok" : "fail"}`,
      block: `[Файлы] ${res.detail}`,
    };
  }

  if (/скопируй путь|покажи путь/i.test(text)) {
    const q = text
      .replace(/скопируй путь|покажи путь|к файлу|файла?/gi, " ")
      .trim();
    const hits = searchFiles(q || "", 5);
    return {
      used: `files:path:${hits.length}`,
      block: `[Файлы: пути]\n${hits.map((h) => `• ${h}`).join("\n") || "(ничего)"}`,
    };
  }

  const q = text
    .replace(
      /найди файл|найди на диск|открой папк\w*|файл на диск|file manager|покажи путь/gi,
      " ",
    )
    .trim();
  const hits = searchFiles(q || "", 12);
  return {
    used: `files:search:${hits.length}`,
    block: `[Файлы · корни: ${roots().length}]\n${hits.map((h) => `• ${h}`).join("\n") || "(ничего)"}`,
  };
}
