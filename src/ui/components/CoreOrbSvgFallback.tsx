import type { VoiceState } from "../voiceState";

const NODE_COLORS = [
  "var(--accent)",
  "var(--warning)",
  "var(--success)",
  "var(--danger)",
  "var(--border)",
];

type Props = {
  level: number;
  voiceState: VoiceState;
};

/** Lightweight SVG core if WebGL2 is unavailable. */
export function CoreOrbSvgFallback({ level, voiceState }: Props) {
  const lv = Math.min(5, Math.max(1, Math.round(level)));
  const cx = 260;
  const cy = 260;

  return (
    <svg
      viewBox="0 0 520 520"
      width="100%"
      height="100%"
      aria-hidden
      data-voice={voiceState}
    >
      <defs>
        <radialGradient id="coreGlowFb" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.45" />
          <stop offset="55%" stopColor="var(--border)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="coreCenterFb" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="35%" stopColor="var(--accent)" stopOpacity="0.85" />
          <stop offset="70%" stopColor="var(--border)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r="255" fill="url(#coreGlowFb)" />
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
          stroke="var(--accent)"
          strokeWidth="3"
          strokeDasharray="80 440"
          strokeLinecap="round"
        />
      </g>
      {lv >= 2 ? (
        <g className="core-spin core-spin-c">
          {Array.from({ length: 48 }, (_, i) => {
            const a = (i / 48) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={cx + Math.cos(a) * 100}
                y1={cy + Math.sin(a) * 100}
                x2={cx + Math.cos(a) * 108}
                y2={cy + Math.sin(a) * 108}
                stroke="var(--accent)"
                strokeOpacity={i % 6 === 0 ? 0.85 : 0.35}
                strokeWidth="1.5"
              />
            );
          })}
        </g>
      ) : null}
      {lv >= 3 ? (
        <g className="core-spin core-spin-d">
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            return (
              <circle
                key={i}
                cx={cx + Math.cos(a) * 170}
                cy={cy + Math.sin(a) * 170}
                r="3.5"
                fill={NODE_COLORS[i % NODE_COLORS.length]}
              />
            );
          })}
        </g>
      ) : null}
      {lv >= 4 ? (
        <g className="core-spin core-spin-e">
          {Array.from({ length: 48 }, (_, i) => {
            const a = (i / 48) * Math.PI * 2;
            return (
              <circle
                key={i}
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
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return (
              <circle
                key={i}
                cx={cx + Math.cos(a) * 244}
                cy={cy + Math.sin(a) * 244}
                r="3"
                fill={NODE_COLORS[i % NODE_COLORS.length]}
              />
            );
          })}
        </g>
      ) : null}
      <circle className="core-heart-glow" cx={cx} cy={cy} r="52" fill="url(#coreCenterFb)" />
      <circle className="core-heart" cx={cx} cy={cy} r="26" fill="#ffffff" fillOpacity="0.92" />
    </svg>
  );
}
