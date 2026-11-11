const KEY = "mira.coreLevel";

/** Core level is unbounded: 1, 2, 3, … (no upper cap). */
export function normalizeCoreLevel(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.round(n));
}

export function loadCoreLevel(): number {
  const n = Number(localStorage.getItem(KEY) ?? "4");
  return normalizeCoreLevel(n);
}

export function saveCoreLevel(level: number): void {
  localStorage.setItem(KEY, String(normalizeCoreLevel(level)));
}

/** Soft ring fill 0…100 — grows forever but never hard-caps the level. */
export function coreLevelRingPct(level: number): number {
  const lv = normalizeCoreLevel(level);
  return (1 - Math.exp(-lv / 10)) * 100;
}
