/**
 * Headless smoke: core level XP grows past legacy watermark 5
 * when Mira activity increases (dialogs / learning signals).
 */
import assert from "node:assert/strict";
import {
  computeCoreXp,
  coreLevelRingPct,
  levelFromXp,
  miraLevelToHoloScale,
  syncCoreLevelFromProgress,
  xpThresholdForLevel,
  type CoreProgressSignals,
} from "../src/ui/coreLevel";

type Store = Record<string, string>;

function installLocalStorage(initial: Store = {}) {
  const store: Store = { ...initial };
  const ls = {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]!
        : null;
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key];
    },
  };
  (
    globalThis as unknown as { localStorage: typeof ls }
  ).localStorage = ls;
  return store;
}

function main() {
  // Curve: early levels reachable, no hard ceiling at 5.
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(3), 2);
  assert.equal(levelFromXp(xpThresholdForLevel(5)), 5);
  assert.ok(levelFromXp(xpThresholdForLevel(6)) >= 6);
  assert.ok(levelFromXp(10_000) > 20);

  // Holographic visibility 0…4 tracks Mira level (anchors from 0.1.9).
  assert.ok(Math.abs(miraLevelToHoloScale(1) - 0.3) < 1e-9);
  assert.ok(Math.abs(miraLevelToHoloScale(5) - 2) < 1e-9);
  assert.ok(Math.abs(miraLevelToHoloScale(15) - 3.5) < 1e-9);
  assert.equal(miraLevelToHoloScale(50), 4);
  assert.equal(miraLevelToHoloScale(100), 4);
  assert.ok(miraLevelToHoloScale(3) > miraLevelToHoloScale(1));
  assert.ok(miraLevelToHoloScale(10) > miraLevelToHoloScale(5));

  // Dialogue outweighs static catalog skills.
  const chatHeavy = computeCoreXp({
    utterances: 20,
    sessions: 5,
    skills: 10,
  });
  const skillsOnly = computeCoreXp({ skills: 10 });
  assert.ok(chatHeavy > skillsOnly);

  // Legacy stuck-at-5: old hard-cap watermark with near-empty inventory.
  installLocalStorage({ "mira.coreLevel": "5" });
  const almostEmpty: CoreProgressSignals = {
    skills: 1,
    sessions: 1,
    utterances: 2,
  };
  const first = syncCoreLevelFromProgress(almostEmpty);
  assert.equal(first.level, 5, "watermark keeps level 5");
  assert.ok(
    first.xp >= xpThresholdForLevel(5),
    "seed XP to current level so ring can move",
  );
  assert.ok(
    computeCoreXp(almostEmpty) < xpThresholdForLevel(5),
    "live inventory alone is below L5 (legacy gap)",
  );

  // A few more dialogs must raise effective XP (ring / next level).
  const aBitMore: CoreProgressSignals = {
    ...almostEmpty,
    utterances: 6,
    sessions: 2,
  };
  const mid = syncCoreLevelFromProgress(aBitMore);
  assert.ok(mid.xp > first.xp, "effective XP rises with a few more dialogs");
  assert.ok(mid.level >= 5);

  // Sustained usage → level rises past 5 (no ceiling).
  const richer: CoreProgressSignals = {
    ...almostEmpty,
    sessions: 12,
    utterances: 80,
    learnedUnits: 4,
    libraryItems: 3,
  };
  const grown = syncCoreLevelFromProgress(richer);
  assert.ok(grown.xp > mid.xp, "XP rises with Mira usage");
  assert.ok(
    grown.level > 5,
    `expected level > 5 after growth, got ${grown.level} (xp=${grown.xp})`,
  );

  // Watermark: deleting content must not drop level/XP.
  const afterDelete = syncCoreLevelFromProgress({ skills: 1 });
  assert.equal(afterDelete.level, grown.level);
  assert.equal(afterDelete.xp, grown.xp);

  console.log(
    JSON.stringify(
      {
        ok: true,
        first,
        grown,
        afterDelete,
        chatHeavy,
        skillsOnly,
      },
      null,
      2,
    ),
  );
}

main();
