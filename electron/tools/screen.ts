import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requestUserConfirm } from "../confirmBridge";

const execFileAsync = promisify(execFile);

export type ScreenCaptureResult = {
  ok: boolean;
  path: string;
  width: number;
  height: number;
  sourceName: string;
  note: string;
};

export type ScreenClickResult = {
  ok: boolean;
  x: number;
  y: number;
  mode: "xdotool" | "dry-run";
  detail: string;
};

export type ScreenTypeResult = {
  ok: boolean;
  text: string;
  mode: "xdotool" | "dry-run";
  detail: string;
};

function isElectronRuntime(): boolean {
  return typeof process.versions.electron === "string";
}

function screenshotsDir(): string {
  const { dataRoot } = require("../appPaths") as typeof import("../appPaths");
  const dir = dataRoot("screenshots");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Minimal valid 1×1 PNG (black pixel) for headless/smoke fallback. */
function minimalPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

export function getScreenPolicy(): {
  enabled: boolean;
  controlEnabled: boolean;
  osPriority: string;
} {
  return {
    enabled: (process.env.SCREEN_ENABLED ?? "true").trim().toLowerCase() !== "false",
    controlEnabled:
      (process.env.SCREEN_CONTROL_ENABLED ?? "true").trim().toLowerCase() !==
      "false",
    osPriority: (process.env.OS_PRIORITY ?? "linux,windows,macos").trim(),
  };
}

export function looksLikeScreenSeeIntent(text: string): boolean {
  return /(что (у меня )?на экране|посмотри экран|видимость экрана|screen|screenshot|снимок экрана|что открыто)/i.test(
    text,
  );
}

export function looksLikeScreenControlIntent(text: string): boolean {
  return /(кликни|нажми|click|введи текст|type\s+|напечатай)/i.test(text);
}

export function parseClickCoords(text: string): { x: number; y: number } | null {
  const m = text.match(
    /(?:кликни|нажми|click)\s*(?:на\s*)?(\d{1,5})\s*[, ]\s*(\d{1,5})/i,
  );
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

export function parseTypeText(text: string): string | null {
  const m = text.match(
    /(?:введи текст|напечатай|type)\s*[:«"']?\s*(.+?)["'»]?\s*$/i,
  );
  if (!m?.[1]) return null;
  return m[1].trim();
}

export async function captureScreen(): Promise<ScreenCaptureResult> {
  const policy = getScreenPolicy();
  if (!policy.enabled) {
    throw new Error("Захват экрана выключен (SCREEN_ENABLED=false).");
  }

  let png: Buffer | null = null;
  let sourceName = "unknown";
  let width = 1;
  let height = 1;

  if (isElectronRuntime()) {
    try {
      const { BrowserWindow, desktopCapturer, screen: electronScreen } =
        await import("electron");
      const displays = electronScreen.getPrimaryDisplay();
      width = Math.min(1280, displays.size.width);
      height = Math.min(720, displays.size.height);

      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: { width, height },
        });
        const screenSource =
          sources.find((s) => s.id.startsWith("screen:")) ?? sources[0];
        if (screenSource?.thumbnail && !screenSource.thumbnail.isEmpty()) {
          png = screenSource.thumbnail.toPNG();
          sourceName = screenSource.name;
        }
      } catch {
        // fall through to window capture
      }

      if (!png) {
        const win =
          BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        if (win) {
          const image = await win.webContents.capturePage();
          png = image.toPNG();
          sourceName = win.getTitle() || "Mira window";
          const size = image.getSize();
          width = size.width;
          height = size.height;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sourceName = `fallback (${message.slice(0, 80)})`;
    }
  } else {
    sourceName = "headless-placeholder";
  }

  if (!png) {
    png = minimalPng();
    width = 1;
    height = 1;
    if (sourceName === "unknown") sourceName = "placeholder";
  }

  const file = path.join(
    screenshotsDir(),
    `capture-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
  );
  fs.writeFileSync(file, png);

  return {
    ok: true,
    path: file,
    width,
    height,
    sourceName,
    note: `Снимок «${sourceName}» сохранён (${width}×${height}). OS priority: ${policy.osPriority}.`,
  };
}

export async function clickAt(
  x: number,
  y: number,
): Promise<ScreenClickResult> {
  const policy = getScreenPolicy();
  if (!policy.enabled || !policy.controlEnabled) {
    throw new Error("Контроль экрана выключен.");
  }

  const ok = await requestUserConfirm({
    actionClass: "screen",
    risk: "high",
    title: "Подтверждение контроля экрана",
    body: `Mira хочет выполнить клик по координатам (${x}, ${y}).\nРазрешить?`,
    confirmLabel: "Кликнуть",
  });
  if (!ok) {
    return {
      ok: false,
      x,
      y,
      mode: "dry-run",
      detail: "Отклонено пользователем",
    };
  }

  try {
    await execFileAsync(
      "xdotool",
      ["mousemove", String(x), String(y), "click", "1"],
      { timeout: 5000 },
    );
    return {
      ok: true,
      x,
      y,
      mode: "xdotool",
      detail: "Клик выполнен через xdotool",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: true,
      x,
      y,
      mode: "dry-run",
      detail: `xdotool недоступен (${message.slice(0, 120)}). Действие зафиксировано как dry-run после confirm.`,
    };
  }
}

export async function typeText(text: string): Promise<ScreenTypeResult> {
  const policy = getScreenPolicy();
  if (!policy.enabled || !policy.controlEnabled) {
    throw new Error("Контроль экрана выключен.");
  }

  const ok = await requestUserConfirm({
    actionClass: "screen",
    risk: "high",
    title: "Подтверждение ввода с клавиатуры",
    body: `Mira хочет ввести текст:\n«${text.slice(0, 200)}»\nРазрешить?`,
    confirmLabel: "Ввести",
  });
  if (!ok) {
    return {
      ok: false,
      text,
      mode: "dry-run",
      detail: "Отклонено пользователем",
    };
  }

  try {
    await execFileAsync("xdotool", ["type", "--", text], { timeout: 8000 });
    return {
      ok: true,
      text,
      mode: "xdotool",
      detail: "Текст введён через xdotool",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: true,
      text,
      mode: "dry-run",
      detail: `xdotool недоступен (${message.slice(0, 120)}). Ввод зафиксирован как dry-run после confirm.`,
    };
  }
}

export function formatScreenBlock(
  kind: "capture" | "click" | "type",
  payload: ScreenCaptureResult | ScreenClickResult | ScreenTypeResult,
  visionNote?: string | null,
): string {
  if (kind === "capture") {
    const c = payload as ScreenCaptureResult;
    const vision =
      visionNote?.trim() ||
      "Опиши пользователю, что видно (vision недоступен — опирайся на метаданные).";
    return `[Экран: capture]\nИсточник: ${c.sourceName}\nФайл: ${c.path}\nРазмер: ${c.width}×${c.height}\n${c.note}\n[Vision]\n${vision}`;
  }

  if (kind === "type") {
    const t = payload as ScreenTypeResult;
    return `[Экран: type ${t.mode}]\n«${t.text}» · ${t.detail}`;
  }
  const c = payload as ScreenClickResult;
  return `[Экран: click ${c.mode}]\n(${c.x}, ${c.y}) · ${c.detail}`;
}
