import { useEffect, useId, useRef, useState } from "react";
import type { VoiceState } from "../voiceState";

type JournalItem = {
  title: string;
  time: string;
  reason: string;
  tag: string;
  tone: "accent" | "success" | "warning" | "danger";
  pending?: boolean;
};

const DEMO_JOURNAL: JournalItem[] = [
  {
    title: "Диалог открыт",
    time: "сейчас",
    reason: "Главный экран готов к голосу и тексту.",
    tag: "Система",
    tone: "accent",
  },
  {
    title: "Голос",
    time: "локально",
    reason: "TTS/ASR зависят от системных голосов и настроек.",
    tag: "Голос",
    tone: "success",
  },
  {
    title: "Ждёт подтверждения",
    time: "политика",
    reason: "Опасные действия — через ConfirmModal (always).",
    tag: "Голосом",
    tone: "warning",
    pending: true,
  },
];

const SAMPLE_COUNT = 24;

type HomeRailProps = {
  modelLabel: string;
  voiceNote?: string;
  voiceState?: VoiceState;
};

/** Right column: resources · live load · action journal. */
export function HomeRail({
  modelLabel,
  voiceNote,
  voiceState = "idle",
}: HomeRailProps) {
  const load = useLiveLoad(voiceState);

  return (
    <aside className="home-rail">
      <section className="glass-card">
        <h3 className="card-kicker">Ресурсы</h3>
        <div className="ring-row">
          <Ring value={load.gpu} label="GPU" tone="accent" />
          <Ring
            value={load.vramPct}
            label="VRAM"
            sub={`${load.vramGb.toFixed(1).replace(".", ",")} ГБ`}
            tone="success"
          />
          <Ring value={load.ram} label="ОЗУ" tone="warning" />
        </div>
        <p className="mono tiny muted" style={{ margin: "12px 0 0" }}>
          модель · {modelLabel}
          {voiceNote ? ` · ${voiceNote}` : ""}
        </p>
      </section>

      <section className="glass-card load-card">
        <h3 className="card-kicker">Нагрузка за час</h3>
        <LoadChart points={load.series} current={load.gpu} clock={load.clock} />
      </section>

      <section className="glass-card journal-card">
        <h3 className="card-kicker">Журнал действий</h3>
        <ol className="journal-list hide-scroll">
          {DEMO_JOURNAL.map((item) => (
            <li
              key={item.title}
              className={`journal-item ${item.pending ? "is-pending" : ""}`}
              data-tone={item.tone}
            >
              <div className="journal-dot" />
              <div className="journal-body">
                <div className="journal-title-row">
                  <span className="journal-title">{item.title}</span>
                  <span className="mono tiny">{item.time}</span>
                </div>
                <p className="journal-reason">{item.reason}</p>
                <span className={`tag tag-${item.tone}`}>{item.tag}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function voiceBias(state: VoiceState): number {
  switch (state) {
    case "listening":
      return 12;
    case "thinking":
      return 28;
    case "speaking":
      return 18;
    case "error":
      return 8;
    default:
      return 0;
  }
}

function useLiveLoad(voiceState: VoiceState) {
  const [series, setSeries] = useState(() => seedSeries());
  const [gpu, setGpu] = useState(() => series[series.length - 1] ?? 42);
  const [ram, setRam] = useState(48);
  const [vramGb, setVramGb] = useState(7.4);
  const [clock, setClock] = useState(() => formatClock());
  const phaseRef = useRef(Math.random() * Math.PI * 2);
  const voiceRef = useRef(voiceState);
  voiceRef.current = voiceState;

  useEffect(() => {
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      phaseRef.current += 0.18;
      const bias = voiceBias(voiceRef.current);
      const wave =
        42 +
        Math.sin(phaseRef.current) * 14 +
        Math.sin(phaseRef.current * 2.3) * 7 +
        (Math.random() - 0.5) * 6;
      const next = clamp(Math.round(wave + bias), 18, 96);

      // One paint cycle: avoid 4 separate setStates every tick.
      setSeries((prev) => {
        const rolled = prev.length >= SAMPLE_COUNT ? prev.slice(1) : prev;
        return [...rolled, next];
      });
      setGpu(next);
      setRam((r) =>
        clamp(Math.round(r + (Math.random() - 0.48) * 3 + bias * 0.08), 28, 86),
      );
      setVramGb((v) =>
        clamp(
          Number((v + (Math.random() - 0.5) * 0.12 + bias * 0.004).toFixed(2)),
          4.2,
          11.6,
        ),
      );
      if (frame % 2 === 0) setClock(formatClock());
    }, 2500);

    return () => window.clearInterval(id);
  }, []);

  return {
    series,
    gpu,
    ram,
    vramGb,
    vramPct: clamp(Math.round((vramGb / 12) * 100), 10, 100),
    clock,
  };
}

function seedSeries(): number[] {
  const out: number[] = [];
  let v = 40;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    v = clamp(v + (Math.random() - 0.42) * 10, 22, 78);
    out.push(Math.round(v));
  }
  return out;
}

function formatClock(): string {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function Ring({
  value,
  label,
  sub,
  tone,
}: {
  value: number;
  label: string;
  sub?: string;
  tone: "accent" | "success" | "warning";
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <div className="ring" data-tone={tone}>
      <svg viewBox="0 0 64 64" width="60" height="60" aria-hidden>
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="var(--track)"
          strokeWidth="5"
        />
        <circle
          className="ring-arc ring-arc-live"
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dasharray 700ms var(--ease-out)" }}
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          className="ring-value"
          fill="var(--text)"
        >
          {sub ? `${value}` : `${value}%`}
        </text>
      </svg>
      <span className="mono tiny">{label}</span>
      {sub ? <span className="mono tiny muted">{sub}</span> : null}
    </div>
  );
}

function LoadChart({
  points,
  current,
  clock,
}: {
  points: number[];
  current: number;
  clock: string;
}) {
  const uid = useId().replace(/:/g, "");
  const strokeId = `loadStroke-${uid}`;
  const fillId = `loadFill-${uid}`;
  const w = 300;
  const h = 120;
  const n = Math.max(points.length, 2);
  const step = w / (n - 1);

  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - (p / 100) * (h - 16) - 8;
    return { x, y, p };
  });

  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  const last = coords[coords.length - 1] ?? { x: w, y: h / 2, p: current };
  const tipW = 92;
  const tipX = Math.min(Math.max(8, last.x - tipW + 8), w - tipW - 4);
  const tipY = Math.max(6, last.y - 30);

  return (
    <svg
      className="load-chart load-chart-live"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="120"
      role="img"
      aria-label={`Нагрузка сейчас ${current} процентов, ${clock}`}
    >
      <defs>
        <linearGradient id={strokeId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="55%" stopColor="var(--success)" />
          <stop offset="100%" stopColor="var(--warning)" />
        </linearGradient>
        <linearGradient id={fillId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[30, 60, 90].map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2={w}
          y2={y}
          stroke="var(--track)"
          strokeWidth="1"
        />
      ))}
      <path
        className="load-area"
        d={area}
        fill={`url(#${fillId})`}
      />
      <path
        className="load-line"
        d={path}
        fill="none"
        stroke={`url(#${strokeId})`}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line
        x1={last.x}
        y1="8"
        x2={last.x}
        y2={h - 4}
        stroke="var(--text-muted)"
        strokeDasharray="3 4"
        strokeOpacity="0.7"
      />
      <circle
        className="load-tip-dot"
        cx={last.x}
        cy={last.y}
        r="4.5"
        fill="var(--warning)"
      />
      <g transform={`translate(${tipX}, ${tipY})`}>
        <rect
          width={tipW}
          height="22"
          rx="6"
          fill="var(--bg)"
          stroke="var(--accent)"
          strokeOpacity="0.45"
        />
        <text x="8" y="15" className="chart-tip" fill="var(--text-muted)">
          {clock.slice(0, 5)} · {current}%
        </text>
      </g>
    </svg>
  );
}
