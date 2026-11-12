const KEY = "mira.coreLevel";

/** Progress counters that feed automatic core growth. */
export type CoreProgressSignals = {
  sessions?: number;
  utterances?: number;
  learnedUnits?: number;
  libraryItems?: number;
  skills?: number;
  voiceProjects?: number;
  customVoices?: number;
  browserVisits?: number;
};

/** Core level is unbounded: 1, 2, 3, … (no upper cap). */
export function normalizeCoreLevel(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.round(n));
}

export function loadCoreLevel(): number {
  const n = Number(localStorage.getItem(KEY) ?? "1");
  return normalizeCoreLevel(n);
}

export function saveCoreLevel(level: number): void {
  localStorage.setItem(KEY, String(normalizeCoreLevel(level)));
}

/**
 * Weighted XP from Mira's real activity. Learned units and library matter most;
 * dialogue volume (utterances / sessions) and skills also count.
 */
export function computeCoreXp(signals: CoreProgressSignals): number {
  const n = (v: number | undefined) =>
    Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0;
  return (
    n(signals.learnedUnits) * 12 +
    n(signals.libraryItems) * 6 +
    n(signals.skills) * 5 +
    n(signals.sessions) * 3 +
    n(signals.utterances) * 1 +
    n(signals.customVoices) * 4 +
    n(signals.voiceProjects) * 3 +
    n(signals.browserVisits) * 1
  );
}

/**
 * Soft unbounded curve: L1 at 0 XP; early levels come relatively quickly,
 * then growth slows (sqrt) so there is never a ceiling.
 *
 *   xp 0 → 1, 4 → 2, 16 → 3, 36 → 4, 100 → 6, …
 */
export function levelFromXp(xp: number): number {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0;
  return normalizeCoreLevel(1 + Math.floor(Math.sqrt(safe / 4)));
}

/** XP required to reach a given level (start of that level). */
export function xpThresholdForLevel(level: number): number {
  const lv = normalizeCoreLevel(level);
  return 4 * (lv - 1) ** 2;
}

/**
 * Recompute level from live progress. Level only rises (watermark):
 * never drops if the user deletes content.
 */
export function syncCoreLevelFromProgress(
  signals: CoreProgressSignals,
): number {
  const computed = levelFromXp(computeCoreXp(signals));
  const current = loadCoreLevel();
  const next = Math.max(current, computed);
  if (next !== current) saveCoreLevel(next);
  return next;
}

/**
 * Ring fill 0…100 = fraction toward the next automatic level.
 * Watermark level is used so the ring never implies a drop.
 */
export function coreLevelRingPct(level: number, xp = 0): number {
  const lv = normalizeCoreLevel(level);
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const lo = xpThresholdForLevel(lv);
  const hi = xpThresholdForLevel(lv + 1);
  if (hi <= lo) return 0;
  const effective = Math.max(safe, lo);
  return Math.min(100, Math.max(0, ((effective - lo) / (hi - lo)) * 100));
}
