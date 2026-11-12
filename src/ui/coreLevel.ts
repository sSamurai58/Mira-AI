const LEVEL_KEY = "mira.coreLevel";
const XP_KEY = "mira.coreXp";
/** Inventory XP snapshot when the auto-growth system first ran (legacy bridge). */
const XP_BASELINE_KEY = "mira.coreXpBaseline";
/** Seeded XP at first sync: max(live, threshold(storedLevel)). */
const XP_SEED_KEY = "mira.coreXpSeed";

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

export const CORE_PROGRESS_EVENT = "mira:core-progress";

/** Notify App to recompute core level from live health. */
export function notifyCoreProgress(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CORE_PROGRESS_EVENT));
}

/** Core level is unbounded: 1, 2, 3, … (no upper cap). */
export function normalizeCoreLevel(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.round(n));
}

export function loadCoreLevel(): number {
  const n = Number(localStorage.getItem(LEVEL_KEY) ?? "1");
  return normalizeCoreLevel(n);
}

export function saveCoreLevel(level: number): void {
  localStorage.setItem(LEVEL_KEY, String(normalizeCoreLevel(level)));
}

function loadXpWatermark(): number {
  const n = Number(localStorage.getItem(XP_KEY) ?? "0");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function saveXpWatermark(xp: number): void {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0;
  localStorage.setItem(XP_KEY, String(safe));
}

/**
 * Weighted XP from Mira's real activity.
 * Dialogue volume is the primary growth signal («растёт с Мирой»);
 * learning / library / voices amplify; catalog skills count lightly
 * so seed files alone do not pin the level.
 */
export function computeCoreXp(signals: CoreProgressSignals): number {
  const n = (v: number | undefined) =>
    Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0;
  return (
    n(signals.utterances) * 4 +
    n(signals.sessions) * 8 +
    n(signals.learnedUnits) * 14 +
    n(signals.libraryItems) * 8 +
    n(signals.skills) * 2 +
    n(signals.customVoices) * 6 +
    n(signals.voiceProjects) * 4 +
    n(signals.browserVisits) * 1
  );
}

/**
 * Soft unbounded curve: L1 at 0 XP; early levels come quickly,
 * then growth slows (sqrt) so there is never a ceiling.
 *
 *   xp 0 → 1, 3 → 2, 12 → 3, 27 → 4, 48 → 5, 75 → 6, …
 */
export function levelFromXp(xp: number): number {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0;
  return normalizeCoreLevel(1 + Math.floor(Math.sqrt(safe / 3)));
}

/** XP required to reach a given level (start of that level). */
export function xpThresholdForLevel(level: number): number {
  const lv = normalizeCoreLevel(level);
  return 3 * (lv - 1) ** 2;
}

/**
 * Ensure legacy watermark levels (old 1…5 hard cap / manual +/-)
 * still grow: seed XP to at least the stored level threshold, then
 * add inventory growth above the first-seen baseline.
 */
function resolveEffectiveXp(liveXp: number): number {
  const live = Number.isFinite(liveXp) && liveXp > 0 ? liveXp : 0;
  let baselineRaw = localStorage.getItem(XP_BASELINE_KEY);
  let seedRaw = localStorage.getItem(XP_SEED_KEY);

  if (baselineRaw == null || seedRaw == null) {
    const seed = Math.max(live, xpThresholdForLevel(loadCoreLevel()));
    localStorage.setItem(XP_BASELINE_KEY, String(live));
    localStorage.setItem(XP_SEED_KEY, String(seed));
    baselineRaw = String(live);
    seedRaw = String(seed);
  }

  const baseline = Number(baselineRaw);
  const seed = Number(seedRaw);
  const safeBaseline = Number.isFinite(baseline) && baseline > 0 ? baseline : 0;
  const safeSeed = Number.isFinite(seed) && seed > 0 ? seed : 0;
  const growth = Math.max(0, live - safeBaseline);
  return Math.max(loadXpWatermark(), safeSeed + growth, live);
}

/**
 * Recompute level from live progress. Level and XP only rise (watermark):
 * never drop if the user deletes content.
 */
export function syncCoreLevelFromProgress(
  signals: CoreProgressSignals,
): { level: number; xp: number } {
  const xp = resolveEffectiveXp(computeCoreXp(signals));
  const computed = levelFromXp(xp);
  const current = loadCoreLevel();
  const next = Math.max(current, computed);
  if (xp !== loadXpWatermark()) saveXpWatermark(xp);
  if (next !== current) saveCoreLevel(next);
  return { level: next, xp };
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
