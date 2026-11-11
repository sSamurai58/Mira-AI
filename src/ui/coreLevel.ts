const KEY = "mira.coreLevel";

export function loadCoreLevel(): number {
  const n = Number(localStorage.getItem(KEY) ?? "4");
  if (!Number.isFinite(n)) return 4;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function saveCoreLevel(level: number): void {
  localStorage.setItem(KEY, String(Math.min(5, Math.max(1, Math.round(level)))));
}
