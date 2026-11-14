/**
 * Shared launch placement encoding for Workshop UI (mirrors electron/tools/windowLayout).
 */

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
  { id: "maximize", label: "На весь экран" },
  { id: "fullscreen", label: "Полный экран (F11)" },
  { id: "minimize", label: "Свёрнуто" },
  { id: "restore", label: "Восстановить" },
];

export const MONITOR_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "current", label: "Текущий монитор" },
  { id: "next", label: "Следующий монитор" },
  { id: "prev", label: "Предыдущий монитор" },
  { id: "0", label: "Монитор 1" },
  { id: "1", label: "Монитор 2" },
  { id: "2", label: "Монитор 3" },
];

function parseMonitor(raw: string | undefined): MonitorRef {
  if (!raw) return "current";
  const t = raw.trim().toLowerCase();
  if (t === "next" || t === "prev" || t === "current") return t;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 0) return n;
  return "current";
}

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

export function monitorToSelectValue(m: MonitorRef): string {
  return String(m);
}

export function selectValueToMonitor(v: string): MonitorRef {
  return parseMonitor(v);
}
