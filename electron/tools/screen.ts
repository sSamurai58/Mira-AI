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

export type ScreenClickMode = "xdotool" | "win32" | "dry-run";

export type ScreenClickResult = {
  ok: boolean;
  x: number;
  y: number;
  mode: ScreenClickMode;
  detail: string;
};

export type ScreenTypeResult = {
  ok: boolean;
  text: string;
  mode: ScreenClickMode;
  detail: string;
};

export type ScreenKeysResult = {
  ok: boolean;
  keys: string;
  mode: ScreenClickMode;
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

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return defaultValue;
  return raw.trim().toLowerCase() !== "false";
}

export function getScreenPolicy(): {
  enabled: boolean;
  controlEnabled: boolean;
  osPriority: string;
} {
  return {
    // Capture on by default; control is fail-closed (matches Settings UI).
    enabled: envFlag("SCREEN_ENABLED", true),
    controlEnabled: envFlag("SCREEN_CONTROL_ENABLED", false),
    osPriority: (process.env.OS_PRIORITY ?? "linux,windows,macos").trim(),
  };
}

export function looksLikeScreenSeeIntent(text: string): boolean {
  return /(что (у меня )?на экране|посмотри экран|видимость экрана|screen|screenshot|снимок экрана|что открыто|найди на экране|где на экране|покажи на экране|find on screen)/i.test(
    text,
  );
}

/** «Найди на экране кнопку Сохранить» → query for vision focus. */
export function parseFindOnScreenQuery(text: string): string | null {
  const m = text.match(
    /(?:найди|где|покажи|find)\s+(?:на\s+экране|on\s+screen)\s*[:«"']?\s*(.+?)\s*$/i,
  );
  const q = m?.[1]?.trim().replace(/[«»"']/g, "");
  return q || null;
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

/**
 * Temporarily hide Mira windows so a desktop click/type cannot hit Mira
 * itself (which previously blanked the UI when the confirm modal / chrome
 * received the synthetic click).
 *
 * Prefer hide/show over minimize/restore: frameless themed TitleBar windows
 * on Windows GPU drivers often come back from restore() as a solid blank
 * frame (Integrations / confirm triggers looked "broken after click").
 */
async function withMiraWindowsAside<T>(fn: () => Promise<T>): Promise<T> {
  if (!isElectronRuntime()) return fn();

  const { BrowserWindow } = await import("electron");
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  const snapshot = windows.map((w) => ({
    win: w,
    wasMinimized: w.isMinimized(),
    wasVisible: w.isVisible(),
    wasFocused: w.isFocused(),
  }));

  for (const { win, wasMinimized } of snapshot) {
    try {
      if (wasMinimized) continue;
      if (win.isVisible()) win.hide();
    } catch {
      /* ignore */
    }
  }

  // Brief pause so the compositor drops Mira before synthetic input.
  await new Promise((r) => setTimeout(r, 160));

  try {
    return await fn();
  } finally {
    for (const { win, wasMinimized, wasVisible, wasFocused } of snapshot) {
      if (win.isDestroyed()) continue;
      try {
        if (!wasMinimized && wasVisible) {
          win.show();
          // Nudge frameless GPU layers so atmosphere/chrome repaint after hide.
          try {
            win.webContents.invalidate();
          } catch {
            /* older Electron */
          }
          if (wasFocused) win.focus();
        }
      } catch {
        /* ignore */
      }
    }
  }
}

async function clickViaXdotool(x: number, y: number): Promise<void> {
  await execFileAsync(
    "xdotool",
    ["mousemove", String(x), String(y), "click", "1"],
    { timeout: 5000 },
  );
}

async function typeViaXdotool(text: string): Promise<void> {
  await execFileAsync("xdotool", ["type", "--", text], { timeout: 8000 });
}

/**
 * Win32 mouse click via SendInput (more stable than mouse_event on modern Windows).
 * Falls back to mouse_event if SendInput path fails.
 */
async function clickViaWin32(x: number, y: number): Promise<void> {
  const xi = Math.round(x);
  const yi = Math.round(y);
  const script = [
    "Add-Type -TypeDefinition @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class MiraInput {",
    "  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public MOUSEINPUT mi; }",
    "  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {",
    "    public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;",
    "  }",
    "  [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);",
    "  [DllImport(\"user32.dll\")] public static extern uint SendInput(uint n, INPUT[] p, int cb);",
    "  [DllImport(\"user32.dll\")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);",
    "  public const uint INPUT_MOUSE = 0;",
    "  public const uint LEFTDOWN = 0x0002;",
    "  public const uint LEFTUP = 0x0004;",
    "  public static void Click() {",
    "    INPUT[] a = new INPUT[2];",
    "    a[0].type = INPUT_MOUSE; a[0].mi.dwFlags = LEFTDOWN;",
    "    a[1].type = INPUT_MOUSE; a[1].mi.dwFlags = LEFTUP;",
    "    if (SendInput(2, a, Marshal.SizeOf(typeof(INPUT))) == 0) {",
    "      mouse_event(LEFTDOWN, 0, 0, 0, UIntPtr.Zero);",
    "      mouse_event(LEFTUP, 0, 0, 0, UIntPtr.Zero);",
    "    }",
    "  }",
    "}",
    "'@",
    `[MiraInput]::SetCursorPos(${xi}, ${yi}) | Out-Null`,
    "Start-Sleep -Milliseconds 50",
    "[MiraInput]::Click()",
  ].join("\n");

  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { timeout: 8000, windowsHide: true },
  );
}

/**
 * Win32 text entry via SendInput key events (Unicode) — more stable than SendKeys
 * for non-US layouts / elevated targets. Falls back to SendKeys on failure.
 */
async function typeViaWin32(text: string): Promise<void> {
  const safe = text.replace(/'/g, "''").slice(0, 400);
  const script = [
    "Add-Type -TypeDefinition @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class MiraKeys {",
    "  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public KEYBDINPUT ki; }",
    "  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {",
    "    public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;",
    "  }",
    "  [DllImport(\"user32.dll\")] public static extern uint SendInput(uint n, INPUT[] p, int cb);",
    "  public const uint INPUT_KEYBOARD = 1;",
    "  public const uint KEYUP = 0x0002;",
    "  public const uint UNICODE = 0x0004;",
    "  public static void TypeUnicode(string s) {",
    "    foreach (char ch in s) {",
    "      INPUT[] a = new INPUT[2];",
    "      a[0].type = INPUT_KEYBOARD; a[0].ki.wScan = ch; a[0].ki.dwFlags = UNICODE;",
    "      a[1].type = INPUT_KEYBOARD; a[1].ki.wScan = ch; a[1].ki.dwFlags = UNICODE | KEYUP;",
    "      SendInput(2, a, Marshal.SizeOf(typeof(INPUT)));",
    "    }",
    "  }",
    "}",
    "'@",
    "try {",
    `  [MiraKeys]::TypeUnicode('${safe}')`,
    "} catch {",
    "  Add-Type -AssemblyName System.Windows.Forms",
    `  [System.Windows.Forms.SendKeys]::SendWait('${safe
      .replace(/\{/g, "{{}")
      .replace(/\}/g, "{}}")
      .replace(/\+/g, "{+}")
      .replace(/\^/g, "{^}")
      .replace(/%/g, "{%}")
      .replace(/~/g, "{~}")}')`,
    "}",
  ].join("\n");

  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { timeout: 12000, windowsHide: true },
  );
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

/**
 * Click at screen coordinates.
 * Trusted custom-command path: pass `{ skipConfirm: true }` (no per-click dialog).
 */
export async function clickAt(
  x: number,
  y: number,
  opts?: { dryRun?: boolean; skipConfirm?: boolean },
): Promise<ScreenClickResult> {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x > 100_000 ||
    y > 100_000
  ) {
    return {
      ok: false,
      x,
      y,
      mode: "dry-run",
      detail: "Некорректные координаты клика",
    };
  }

  if (opts?.dryRun) {
    return {
      ok: true,
      x,
      y,
      mode: "dry-run",
      detail: `Проверка: клик (${Math.round(x)}, ${Math.round(y)})`,
    };
  }

  const policy = getScreenPolicy();
  if (!policy.enabled || !policy.controlEnabled) {
    if (opts?.skipConfirm) {
      return {
        ok: true,
        x,
        y,
        mode: "dry-run",
        detail: `Контроль экрана выключен — зафиксирован клик (${Math.round(x)}, ${Math.round(y)})`,
      };
    }
    throw new Error("Контроль экрана выключен.");
  }

  if (!opts?.skipConfirm) {
    const ok = await requestUserConfirm({
      actionClass: "screen",
      risk: "high",
      title: "Подтверждение контроля экрана",
      body: `Mira хочет выполнить клик по координатам (${Math.round(x)}, ${Math.round(y)}).\nОкно Mira будет временно скрыто на момент клика.\nРазрешить?`,
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
  }

  if (!isElectronRuntime()) {
    return {
      ok: true,
      x,
      y,
      mode: "dry-run",
      detail: `Зафиксировано без GUI: клик (${Math.round(x)}, ${Math.round(y)})`,
    };
  }

  try {
    return await withMiraWindowsAside(async () => {
      if (process.platform === "win32") {
        await clickViaWin32(x, y);
        return {
          ok: true,
          x,
          y,
          mode: "win32" as const,
          detail: "Клик выполнен через Win32",
        };
      }
      await clickViaXdotool(x, y);
      return {
        ok: true,
        x,
        y,
        mode: "xdotool" as const,
        detail: "Клик выполнен через xdotool",
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: true,
      x,
      y,
      mode: "dry-run",
      detail: `Системный клик недоступен (${message.slice(0, 120)}). Действие зафиксировано как dry-run.`,
    };
  }
}

/**
 * Type text into the focused OS control.
 * Trusted custom-command path: pass `{ skipConfirm: true }`.
 */
export async function typeText(
  text: string,
  opts?: { dryRun?: boolean; skipConfirm?: boolean },
): Promise<ScreenTypeResult> {
  if (opts?.dryRun) {
    return {
      ok: true,
      text,
      mode: "dry-run",
      detail: `Проверка: ввести «${text.slice(0, 80)}${text.length > 80 ? "…" : ""}»`,
    };
  }

  const policy = getScreenPolicy();
  if (!policy.enabled || !policy.controlEnabled) {
    if (opts?.skipConfirm) {
      return {
        ok: true,
        text,
        mode: "dry-run",
        detail: `Контроль экрана выключен — зафиксирован ввод «${text.slice(0, 60)}»`,
      };
    }
    throw new Error("Контроль экрана выключен.");
  }

  if (!opts?.skipConfirm) {
    const ok = await requestUserConfirm({
      actionClass: "screen",
      risk: "high",
      title: "Подтверждение ввода с клавиатуры",
      body: `Mira хочет ввести текст:\n«${text.slice(0, 200)}»\nОкно Mira будет временно скрыто на момент ввода.\nРазрешить?`,
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
  }

  if (!isElectronRuntime()) {
    return {
      ok: true,
      text,
      mode: "dry-run",
      detail: `Зафиксировано без GUI: ввод «${text.slice(0, 60)}»`,
    };
  }

  try {
    return await withMiraWindowsAside(async () => {
      if (process.platform === "win32") {
        await typeViaWin32(text);
        return {
          ok: true,
          text,
          mode: "win32" as const,
          detail: "Текст введён через Win32 SendKeys",
        };
      }
      await typeViaXdotool(text);
      return {
        ok: true,
        text,
        mode: "xdotool" as const,
        detail: "Текст введён через xdotool",
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: true,
      text,
      mode: "dry-run",
      detail: `Системный ввод недоступен (${message.slice(0, 120)}). Ввод зафиксирован как dry-run.`,
    };
  }
}

/** Parse «ctrl+shift+s» / «win+shift+s» style shortcuts into platform tokens. */
export function parseKeyCombo(raw: string): string[] {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
}

const XDOTOOL_KEY: Record<string, string> = {
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
  win: "super",
  meta: "super",
  cmd: "super",
  command: "super",
  super: "super",
  enter: "Return",
  return: "Return",
  esc: "Escape",
  escape: "Escape",
  tab: "Tab",
  space: "space",
  backspace: "BackSpace",
  delete: "Delete",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
};

const SENDKEYS_KEY: Record<string, string> = {
  ctrl: "^",
  control: "^",
  shift: "+",
  alt: "%",
  option: "%",
  win: "^{ESC}", // best-effort; SendKeys has no Win — use VK path below
  meta: "",
  cmd: "",
  command: "",
  super: "",
  enter: "{ENTER}",
  return: "{ENTER}",
  esc: "{ESC}",
  escape: "{ESC}",
  tab: "{TAB}",
  space: " ",
  backspace: "{BACKSPACE}",
  delete: "{DELETE}",
  up: "{UP}",
  down: "{DOWN}",
  left: "{LEFT}",
  right: "{RIGHT}",
};

function toXdotoolKey(part: string): string {
  if (XDOTOOL_KEY[part]) return XDOTOOL_KEY[part];
  if (/^f([1-9]|1[0-2])$/.test(part)) return part.toUpperCase();
  if (part.length === 1) return part;
  return part;
}

async function keysViaXdotool(parts: string[]): Promise<void> {
  const mapped = parts.map(toXdotoolKey);
  await execFileAsync("xdotool", ["key", "--", mapped.join("+")], {
    timeout: 8000,
  });
}

/**
 * Win32 key combo via SendInput virtual-key codes (modifiers held, then key).
 * Falls back to SendKeys for simple non-win combos.
 */
async function keysViaWin32(parts: string[]): Promise<void> {
  const vkMap: Record<string, number> = {
    ctrl: 0x11,
    control: 0x11,
    shift: 0x10,
    alt: 0x12,
    option: 0x12,
    win: 0x5b,
    meta: 0x5b,
    cmd: 0x5b,
    command: 0x5b,
    super: 0x5b,
    enter: 0x0d,
    return: 0x0d,
    esc: 0x1b,
    escape: 0x1b,
    tab: 0x09,
    space: 0x20,
    backspace: 0x08,
    delete: 0x2e,
    up: 0x26,
    down: 0x28,
    left: 0x25,
    right: 0x27,
  };
  for (let i = 1; i <= 12; i++) vkMap[`f${i}`] = 0x6f + i; // F1=0x70

  const vks: number[] = [];
  for (const p of parts) {
    if (vkMap[p] !== undefined) {
      vks.push(vkMap[p]);
      continue;
    }
    if (p.length === 1) {
      const ch = p.toUpperCase().charCodeAt(0);
      if (ch >= 0x30 && ch <= 0x39) vks.push(ch); // 0-9
      else if (ch >= 0x41 && ch <= 0x5a) vks.push(ch); // A-Z
      else throw new Error(`Неизвестная клавиша: ${p}`);
      continue;
    }
    throw new Error(`Неизвестная клавиша: ${p}`);
  }

  const vkList = vks.join(", ");
  const script = [
    "Add-Type -TypeDefinition @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class MiraHotkey {",
    "  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public KEYBDINPUT ki; }",
    "  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {",
    "    public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;",
    "  }",
    "  [DllImport(\"user32.dll\")] public static extern uint SendInput(uint n, INPUT[] p, int cb);",
    "  public const uint INPUT_KEYBOARD = 1;",
    "  public const uint KEYUP = 0x0002;",
    "  public static void Chord(ushort[] keys) {",
    "    foreach (ushort k in keys) {",
    "      INPUT[] d = new INPUT[1];",
    "      d[0].type = INPUT_KEYBOARD; d[0].ki.wVk = k;",
    "      SendInput(1, d, Marshal.SizeOf(typeof(INPUT)));",
    "    }",
    "    for (int i = keys.Length - 1; i >= 0; i--) {",
    "      INPUT[] u = new INPUT[1];",
    "      u[0].type = INPUT_KEYBOARD; u[0].ki.wVk = keys[i]; u[0].ki.dwFlags = KEYUP;",
    "      SendInput(1, u, Marshal.SizeOf(typeof(INPUT)));",
    "    }",
    "  }",
    "}",
    "'@",
    `$keys = [uint16[]]@(${vkList})`,
    "[MiraHotkey]::Chord($keys)",
  ].join("\n");

  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { timeout: 8000, windowsHide: true },
  );
}

/**
 * Press a key chord like «ctrl+shift+s».
 * Trusted custom-command path: respects SCREEN_CONTROL_ENABLED, no per-press confirm.
 * `osTrusted` — window/desktop OS hotkeys (Win+D, snap) bypass screen-control gate.
 */
export async function pressKeys(
  raw: string,
  opts?: { dryRun?: boolean; osTrusted?: boolean },
): Promise<ScreenKeysResult> {
  const keys = raw.trim();
  const parts = parseKeyCombo(keys);
  if (!parts.length) {
    return {
      ok: false,
      keys,
      mode: "dry-run",
      detail: "Пустая комбинация клавиш",
    };
  }

  if (opts?.dryRun) {
    return {
      ok: true,
      keys,
      mode: "dry-run",
      detail: `Проверка: нажать ${parts.join("+")}`,
    };
  }

  const policy = getScreenPolicy();
  if (
    !opts?.osTrusted &&
    (!policy.enabled || !policy.controlEnabled)
  ) {
    return {
      ok: true,
      keys,
      mode: "dry-run",
      detail: `Контроль экрана выключен — зафиксировано нажатие ${parts.join("+")}`,
    };
  }

  if (!isElectronRuntime()) {
    return {
      ok: true,
      keys,
      mode: "dry-run",
      detail: `Зафиксировано без GUI: ${parts.join("+")}`,
    };
  }

  try {
    return await withMiraWindowsAside(async () => {
      if (process.platform === "win32") {
        await keysViaWin32(parts);
        return {
          ok: true,
          keys,
          mode: "win32" as const,
          detail: `Нажато ${parts.join("+")} (Win32)`,
        };
      }
      await keysViaXdotool(parts);
      return {
        ok: true,
        keys,
        mode: "xdotool" as const,
        detail: `Нажато ${parts.join("+")} (xdotool)`,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: true,
      keys,
      mode: "dry-run",
      detail: `Системный hotkey недоступен (${message.slice(0, 120)}). Зафиксировано dry-run.`,
    };
  }
}

export function formatScreenBlock(
  kind: "capture" | "click" | "type" | "keys",
  payload:
    | ScreenCaptureResult
    | ScreenClickResult
    | ScreenTypeResult
    | ScreenKeysResult,
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
  if (kind === "keys") {
    const k = payload as ScreenKeysResult;
    return `[Экран: keys ${k.mode}]\n«${k.keys}» · ${k.detail}`;
  }
  const c = payload as ScreenClickResult;
  return `[Экран: click ${c.mode}]\n(${c.x}, ${c.y}) · ${c.detail}`;
}
