import type { VoiceState } from "../voiceState";

type CoreOrbProps = {
  level?: number;
  voiceState?: VoiceState;
  size?: number;
};

const NODE_COLORS = [
  "var(--accent)",
  "var(--warning)",
  "var(--success)",
  "var(--danger)",
  "var(--border)",
];

function clampLevel(level: number): number {
  return Math.min(5, Math.max(1, Math.round(level)));
}

/** Animated SVG AI core — layers unlock with level 1…5. Colors from theme tokens. */
export function CoreOrb({
  level = 4,
  voiceState = "idle",
  size = 320,
}: CoreOrbProps) {
  const lv = clampLevel(level);
  const cx = 260;
  const cy = 260;

  return (
    <div
      className="core-orb"
      data-voice={voiceState}
      data-level={lv}
      style={{ width: size, maxWidth: "100%" }}
      role="img"
      aria-label={`Ядро Mira, уровень ${lv} из 5, состояние ${voiceState}`}
    >
      <svg viewBox="0 0 520 520" width="100%" height="100%" aria-hidden>
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.45" />
            <stop offset="55%" stopColor="var(--border)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreCenter" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="var(--accent)" stopOpacity="0.85" />
            <stop offset="70%" stopColor="var(--border)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="coreArc" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--success)" />
          </linearGradient>
        </defs>

        <circle className="core-backdrop" cx={cx} cy={cy} r="255" fill="url(#coreGlow)" />

        <g className="core-radar">
          <circle
            cx={cx}
            cy={cy}
            r="200"
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.12"
            strokeWidth="80"
            strokeDasharray="90 540"
          />
        </g>

        {[0, 1, 2].map((i) => (
          <circle
            key={`halo-${i}`}
            className="core-halo"
            cx={cx}
            cy={cy}
            r="140"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeOpacity="0.55"
            style={{ animationDelay: `${i * 1.3}s` }}
          />
        ))}

        <g className="core-spin core-spin-a">
          <circle
            cx={cx}
            cy={cy}
            r="60"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeDasharray="70 30 12 30"
            strokeOpacity="0.7"
          />
        </g>
        <g className="core-spin core-spin-b">
          <circle
            cx={cx}
            cy={cy}
            r="82"
            fill="none"
            stroke="var(--border)"
            strokeWidth="1.5"
            strokeOpacity="0.8"
          />
          <circle
            cx={cx}
            cy={cy}
            r="82"
            fill="none"
            stroke="url(#coreArc)"
            strokeWidth="3"
            strokeDasharray="80 440"
            strokeLinecap="round"
          />
        </g>

        {lv >= 2 ? (
          <g className="core-spin core-spin-c">
            {Array.from({ length: 72 }, (_, i) => {
              const a = (i / 72) * Math.PI * 2;
              const r0 = 100;
              const r1 = 108;
              return (
                <line
                  key={i}
                  x1={cx + Math.cos(a) * r0}
                  y1={cy + Math.sin(a) * r0}
                  x2={cx + Math.cos(a) * r1}
                  y2={cy + Math.sin(a) * r1}
                  stroke="var(--accent)"
                  strokeOpacity={i % 6 === 0 ? 0.85 : 0.35}
                  strokeWidth="1.5"
                />
              );
            })}
            {[0, 1, 2].map((i) => {
              const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
              return (
                <circle
                  key={`n2-${i}`}
                  cx={cx + Math.cos(a) * 128}
                  cy={cy + Math.sin(a) * 128}
                  r="4"
                  fill={NODE_COLORS[i % NODE_COLORS.length]}
                />
              );
            })}
            <path
              d={wavyRing(cx, cy, 148, 5, 8)}
              fill="none"
              stroke="var(--success)"
              strokeOpacity="0.55"
              strokeWidth="1.5"
            />
          </g>
        ) : null}

        {lv >= 3 ? (
          <g className="core-spin core-spin-d">
            <polygon
              points={hexPoints(cx, cy, 170)}
              fill="none"
              stroke="var(--warning)"
              strokeOpacity="0.55"
              strokeWidth="1.5"
            />
            {Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
              return (
                <circle
                  key={`hx-${i}`}
                  cx={cx + Math.cos(a) * 170}
                  cy={cy + Math.sin(a) * 170}
                  r="3.5"
                  fill={NODE_COLORS[i % NODE_COLORS.length]}
                />
              );
            })}
            <path
              d={wavyRing(cx, cy, 186, 8, 9)}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity="0.45"
              strokeWidth="1.5"
            />
            <circle
              cx={cx}
              cy={cy}
              r="200"
              fill="none"
              stroke="var(--border)"
              strokeWidth="5"
              strokeDasharray="60 40"
              strokeOpacity="0.5"
            />
          </g>
        ) : null}

        {lv >= 4 ? (
          <g className="core-spin core-spin-e">
            <path
              d={wavyRing(cx, cy, 212, 11, 10)}
              fill="none"
              stroke="var(--warning)"
              strokeOpacity="0.4"
              strokeWidth="1.4"
            />
            {Array.from({ length: 48 }, (_, i) => {
              const a = (i / 48) * Math.PI * 2;
              return (
                <circle
                  key={`dot-${i}`}
                  cx={cx + Math.cos(a) * 226}
                  cy={cy + Math.sin(a) * 226}
                  r="1.6"
                  fill="var(--accent)"
                  opacity={0.55}
                />
              );
            })}
          </g>
        ) : null}

        {lv >= 5 ? (
          <g className="core-spin core-spin-f">
            <path
              d={wavyRing(cx, cy, 234, 15, 11)}
              fill="none"
              stroke="var(--success)"
              strokeOpacity="0.45"
              strokeWidth="1.3"
            />
            {Array.from({ length: 16 }, (_, i) => {
              const a = (i / 16) * Math.PI * 2;
              const x = cx + Math.cos(a) * 244;
              const y = cy + Math.sin(a) * 244;
              const j = (i + 5) % 16;
              const a2 = (j / 16) * Math.PI * 2;
              return (
                <g key={`star-${i}`}>
                  <line
                    x1={x}
                    y1={y}
                    x2={cx + Math.cos(a2) * 244}
                    y2={cy + Math.sin(a2) * 244}
                    stroke="var(--accent)"
                    strokeOpacity="0.18"
                    strokeWidth="1"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r="3"
                    fill={NODE_COLORS[i % NODE_COLORS.length]}
                  />
                </g>
              );
            })}
          </g>
        ) : null}

        <circle className="core-heart-glow" cx={cx} cy={cy} r="52" fill="url(#coreCenter)" />
        <circle className="core-heart" cx={cx} cy={cy} r="26" fill="#ffffff" fillOpacity="0.92" />
        <circle
          cx={cx}
          cy={cy}
          r="38"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeOpacity="0.7"
        />
      </svg>
    </div>
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(" ");
}

function wavyRing(
  cx: number,
  cy: number,
  radius: number,
  waves: number,
  amp: number,
): string {
  const steps = 120;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2;
    const rr = radius + Math.sin(a * waves) * amp;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return `${d} Z`;
}
