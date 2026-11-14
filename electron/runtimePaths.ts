import fs from "node:fs";
import path from "node:path";
import { app, shell } from "electron";
import {
  dataRoot,
  envFilePath,
  isPackagedApp,
  miraRoot,
  seedRoot,
  writableRoot,
} from "./appPaths";

export type RuntimePathsSnapshot = {
  packaged: boolean;
  installDir: string | null;
  resourcesDir: string | null;
  userData: string;
  dataDir: string;
  libraryDir: string;
  skillsDir: string;
  protocolsDir: string;
  seedDir: string;
  envFile: string;
  noteRu: string;
};

/** Ensure writable folders exist so Explorer doesn't look "empty". */
export function ensureRuntimeLayout(): void {
  const dirs = [
    dataRoot(),
    dataRoot("skills"),
    dataRoot("protocols"),
    dataRoot("library"),
    dataRoot("screenshots"),
    dataRoot("backups"),
    dataRoot("logs"),
    miraRoot("library"),
    miraRoot("library", "database"),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const guide = path.join(writableRoot(), "ГДЕ-ЧТО.txt");
  if (!fs.existsSync(guide)) {
    fs.writeFileSync(
      guide,
      [
        "Mira — карта папок данных",
        "",
        `Корень данных: ${writableRoot()}`,
        `Библиотека материалов: ${miraRoot("library")}`,
        `Скиллы: ${dataRoot("skills")}`,
        `Протоколы: ${dataRoot("protocols")}`,
        `Скриншоты: ${dataRoot("screenshots")}`,
        `Бэкапы: ${dataRoot("backups")}`,
        `Логи: ${dataRoot("logs")}`,
        `Ключи (.env): ${envFilePath()}`,
        "",
        "Папка с Mira.exe — только движок Chromium/Electron.",
        "Ваши материалы и скиллы живут ЗДЕСЬ, не рядом с exe.",
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

export function getRuntimePaths(): RuntimePathsSnapshot {
  ensureRuntimeLayout();
  const packaged = isPackagedApp();
  const exe = app.getPath("exe");
  const installDir = packaged ? path.dirname(exe) : null;
  const resourcesDir = packaged ? process.resourcesPath : null;
  return {
    packaged,
    installDir,
    resourcesDir,
    userData: writableRoot(),
    dataDir: dataRoot(),
    libraryDir: miraRoot("library"),
    skillsDir: dataRoot("skills"),
    protocolsDir: dataRoot("protocols"),
    seedDir: seedRoot(),
    envFile: envFilePath(),
    noteRu: packaged
      ? "Папка с Mira.exe = движок (dll/pak). Библиотека и скиллы — в userData (%APPDATA%\\Mira)."
      : "Dev-режим: данные в корне репозитория (data/, mira/).",
  };
}

export async function openRuntimePath(
  which:
    | "userData"
    | "data"
    | "library"
    | "skills"
    | "seed"
    | "install"
    | "env",
): Promise<{ ok: boolean; detail: string; path: string }> {
  const snap = getRuntimePaths();
  const map: Record<string, string | null> = {
    userData: snap.userData,
    data: snap.dataDir,
    library: snap.libraryDir,
    skills: snap.skillsDir,
    seed: snap.seedDir,
    install: snap.installDir,
    env: path.dirname(snap.envFile),
  };
  const target = map[which];
  if (!target) {
    return {
      ok: false,
      path: "",
      detail: "Путь недоступен (например install только в установленном приложении)",
    };
  }
  fs.mkdirSync(
    which === "env" ? path.dirname(snap.envFile) : target,
    { recursive: true },
  );
  try {
    const err = await shell.openPath(target);
    if (err) {
      return { ok: false, path: target, detail: err };
    }
    return { ok: true, path: target, detail: `Открыто: ${target}` };
  } catch (e) {
    return {
      ok: false,
      path: target,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
