/**
 * Windows-first window & virtual-desktop layout helpers for custom commands.
 * Uses OS hotkeys (Win+…) via pressKeys({ osTrusted: true }).
 * Placement tokens are ready for future multi-monitor targeting.
 */
import { pressKeys } from "./screen";

export type WindowPlacement =
  | "default"
  | "left"
  | "right"
  | "maximize"
  | "minimize"
  | "fullscreen"
  | "restore";

export type MonitorRef = "current" | "next" | "prev" | number;

export type LaunchLayout = {
  target: string;
  place: WindowPlacement;
  /** Reserved for multi-monitor: 0-based index or next/prev. */
  monitor: MonitorRef;
};

const PLACE_SET = new Set<string>([
  "default",
  "left",
  "right",
  "maximize",
  "minimize",
  "fullscreen",
  "restore",
]);

export const WINDOW_PLACE_OPTIONS: Array<{
  id: WindowPlacement;
  label: string;
}> = [
  { id: "default", label: "Как обычно" },
  { id: "left", label: "Левая половина" },
  { id: "right", label: "Правая половина" },
  { id: "maximize", label: "На весь экран (maximize)" },
  { id: "fullscreen", label: "Полный экран (F11)" },
  { id: "minimize", label: "Свёрнуто" },
  { id: "restore", label: "Восстановить" },
];

function parseMonitor(raw: string | undefined): MonitorRef {
  if (!raw) return "current";
  const t = raw.trim().toLowerCase();
  if (t === "next" || t === "prev" || t === "current") return t;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 0) return n;
  return "current";
}

/**
 * Encode launch target + optional layout into a single step value.
 * Plain paths stay plain (backward compatible).
 */
export function encodeLaunchValue(layout: LaunchLayout): string {
  const target = layout.target.trim();
  if (!target) return "";
  if (layout.place === "default" && layout.monitor === "current") {
    return target;
  }
  const parts = [target, `place=${layout.place}`];
  if (layout.monitor !== "current") {
    parts.push(`monitor=${layout.monitor}`);
  }
  return parts.join("||");
}

/** Parse launch step value: `path` or `path||place=left||monitor=1`. */
export function parseLaunchValue(raw: string): LaunchLayout {
  const text = (raw || "").trim();
  if (!text) {
    return { target: "", place: "default", monitor: "current" };
  }
  if (!text.includes("||")) {
    return { target: text, place: "default", monitor: "current" };
  }
  const chunks = text.split("||").map((s) => s.trim()).filter(Boolean);
  const target = chunks[0] || "";
  let place: WindowPlacement = "default";
  let monitor: MonitorRef = "current";
  for (const chunk of chunks.slice(1)) {
    const eq = chunk.indexOf("=");
    if (eq < 0) continue;
    const key = chunk.slice(0, eq).trim().toLowerCase();
    const val = chunk.slice(eq + 1).trim().toLowerCase();
    if (key === "place" && PLACE_SET.has(val)) {
      place = val as WindowPlacement;
    } else if (key === "monitor") {
      monitor = parseMonitor(val);
    }
  }
  return { target, place, monitor };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function hotkey(
  combo: string,
  opts: { dryRun: boolean },
): Promise<{ ok: boolean; detail: string }> {
  const res = await pressKeys(combo, {
    dryRun: opts.dryRun,
    osTrusted: true,
  });
  return { ok: res.ok, detail: res.detail };
}

export async function minimizeAllWindows(opts: {
  dryRun: boolean;
}): Promise<{ ok: boolean; detail: string }> {
  if (opts.dryRun) {
    return { ok: true, detail: "Проверка: свернуть все окна (Win+D)" };
  }
  const res = await hotkey("win+d", opts);
  return {
    ok: res.ok,
    detail: res.ok ? `Свернуть все: ${res.detail}` : res.detail,
  };
}

export async function createVirtualDesktop(opts: {
  dryRun: boolean;
}): Promise<{ ok: boolean; detail: string }> {
  if (opts.dryRun) {
    return { ok: true, detail: "Проверка: новый рабочий стол (Win+Ctrl+D)" };
  }
  const res = await hotkey("win+ctrl+d", opts);
  return {
    ok: res.ok,
    detail: res.ok ? `Новый рабочий стол: ${res.detail}` : res.detail,
  };
}

export async function closeVirtualDesktop(opts: {
  dryRun: boolean;
}): Promise<{ ok: boolean; detail: string }> {
  if (opts.dryRun) {
    return { ok: true, detail: "Проверка: закрыть рабочий стол (Win+Ctrl+F4)" };
  }
  const res = await hotkey("win+ctrl+f4", opts);
  return {
    ok: res.ok,
    detail: res.ok ? `Закрыть рабочий стол: ${res.detail}` : res.detail,
  };
}

export async function switchVirtualDesktop(
  direction: "next" | "prev" | "left" | "right",
  opts: { dryRun: boolean },
): Promise<{ ok: boolean; detail: string }> {
  const dir =
    direction === "next" || direction === "right" ? "right" : "left";
  const combo = dir === "right" ? "win+ctrl+right" : "win+ctrl+left";
  const label = dir === "right" ? "следующий" : "предыдущий";
  if (opts.dryRun) {
    return {
      ok: true,
      detail: `Проверка: рабочий стол → ${label} (${combo})`,
    };
  }
  const res = await hotkey(combo, opts);
  return {
    ok: res.ok,
    detail: res.ok
      ? `Рабочий стол (${label}): ${res.detail}`
      : res.detail,
  };
}

export async function moveWindowToMonitor(
  monitor: MonitorRef,
  opts: { dryRun: boolean },
): Promise<{ ok: boolean; detail: string }> {
  if (monitor === "current") {
    return { ok: true, detail: "Монитор: текущий (без перемещения)" };
  }
  const combo =
    monitor === "prev" || monitor === 0
      ? "win+shift+left"
      : "win+shift+right";
  // Numeric index > 0: repeat Win+Shift+Right that many times (best-effort).
  const times =
    typeof monitor === "number" ? Math.min(8, Math.max(1, monitor)) : 1;
  if (opts.dryRun) {
    return {
      ok: true,
      detail: `Проверка: окно на монитор ${String(monitor)} (${combo} ×${times})`,
    };
  }
  let last = { ok: true, detail: "" };
  for (let i = 0; i < times; i++) {
    last = await hotkey(combo, opts);
    if (!last.ok) return last;
    if (i + 1 < times) await sleep(120);
  }
  return {
    ok: last.ok,
    detail: `Монитор ${String(monitor)}: ${last.detail}`,
  };
}

export async function snapForegroundWindow(
  place: WindowPlacement,
  opts: { dryRun: boolean; monitor?: MonitorRef },
): Promise<{ ok: boolean; detail: string }> {
  if (place === "default") {
    return { ok: true, detail: "Раскладка: без изменений" };
  }

  const monitor = opts.monitor ?? "current";
  if (monitor !== "current") {
    const moved = await moveWindowToMonitor(monitor, opts);
    if (!moved.ok) return moved;
    if (!opts.dryRun) await sleep(180);
  }

  const map: Record<Exclude<WindowPlacement, "default">, string> = {
    left: "win+left",
    right: "win+right",
    maximize: "win+up",
    minimize: "win+down",
    restore: "win+down",
    fullscreen: "f11",
  };
  const combo = map[place];
  const labels: Record<Exclude<WindowPlacement, "default">, string> = {
    left: "левая половина",
    right: "правая половина",
    maximize: "maximize",
    minimize: "свернуть",
    restore: "восстановить",
    fullscreen: "полный экран (F11)",
  };

  if (opts.dryRun) {
    return {
      ok: true,
      detail: `Проверка: окно → ${labels[place]} (${combo})`,
    };
  }

  // Maximize then F11 for a more reliable “fullscreen” feel on many apps.
  if (place === "fullscreen") {
    await hotkey("win+up", opts);
    await sleep(150);
  }
  // Snap left/right once more after first press can settle quarter→half on Win11.
  const res = await hotkey(combo, opts);
  if ((place === "left" || place === "right") && res.ok) {
    await sleep(120);
    await hotkey(combo, opts);
  }
  return {
    ok: res.ok,
    detail: res.ok
      ? `Окно → ${labels[place]}: ${res.detail}`
      : res.detail,
  };
}

/**
 * After launching an app, wait briefly then apply placement to the new foreground window.
 */
export async function applyLaunchPlacement(
  place: WindowPlacement,
  monitor: MonitorRef,
  opts: { dryRun: boolean; settleMs?: number },
): Promise<{ ok: boolean; detail: string }> {
  if (place === "default" && monitor === "current") {
    return { ok: true, detail: "" };
  }
  if (!opts.dryRun) {
    await sleep(opts.settleMs ?? 1200);
  }
  if (place === "default") {
    return moveWindowToMonitor(monitor, { dryRun: opts.dryRun });
  }
  return snapForegroundWindow(place, {
    dryRun: opts.dryRun,
    monitor,
  });
}
