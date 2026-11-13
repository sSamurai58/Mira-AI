type CoreLevelChipProps = {
  level: number;
  /** 0…100 progress toward the next automatic level. */
  progressPct: number;
};

/**
 * Compact read-only nav chip: ring + level + «растёт с Мирой».
 * Level is automatic — no manual +/-.
 */
export function CoreLevelChip({ level, progressPct }: CoreLevelChipProps) {
  const ringC = 2 * Math.PI * 18;
  const clamped = Math.min(100, Math.max(0, progressPct));
  const ringDash = (clamped / 100) * ringC;

  return (
    <div
      className="core-level-card is-live"
      role="status"
      aria-label={`Уровень ядра ${level}, прогресс ${Math.round(clamped)}% до следующего`}
    >
      <div className="core-level-ring is-live" aria-hidden>
        <svg viewBox="0 0 44 44" width="44" height="44">
          <circle
            className="core-level-ring-track"
            cx="22"
            cy="22"
            r="18"
            fill="none"
            strokeWidth="3.5"
          />
          <circle
            className="core-level-ring-fill"
            cx="22"
            cy="22"
            r="18"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${ringDash} ${ringC}`}
            transform="rotate(-90 22 22)"
          />
        </svg>
        <span>{level}</span>
      </div>
      <div className="core-level-copy">
        <strong>Уровень ядра</strong>
        <span>
          →{level + 1} · {Math.round(clamped)}% · диалоги и обучение
        </span>
      </div>
    </div>
  );
}
