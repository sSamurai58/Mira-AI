import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  formatActionLogTime,
  useActionLog,
} from "../actionLog";
import type { VoiceState } from "../voiceState";

/** ~1 hour at 60s cadence after a short warm-up burst. */
const SAMPLE_COUNT = 60;
const POLL_MS = 2500;
const SERIES_STEP_MS = 60_000;

type LoadPoint = {
  t: number;
  cpu: number;
  gpu: number | null;
  ram: number;
};


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
  const journal = useActionLog();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 4_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <aside className="home-rail">
      <section className="glass-card">
        <h3 className="card-kicker">Ресурсы</h3>
        <div className="ring-row">
          <Ring
            value={load.gpu}
            label="GPU"
            tone="accent"
            unavailable={load.gpu == null}
          />
          <Ring
            value={load.vramPct}
            label="VRAM"
            sub={
              load.vramGb != null
                ? `${load.vramGb.toFixed(1).replace(".", ",")} ГБ`
                : undefined
            }
            tone="success"
            unavailable={load.vramPct == null}
          />
          <Ring value={load.ram} label="ОЗУ" tone="warning" />
        </div>
        <p className="mono tiny muted" style={{ margin: "12px 0 0" }}>
          модель · {modelLabel}
          {voiceNote ? ` · ${voiceNote}` : ""}
          {load.source === "ipc" ? "" : " · метрики: браузер"}
        </p>
      </section>

      <section className="glass-card load-card">
        <div className="load-card-head">
          <h3 className="card-kicker">Нагрузка за час</h3>
          <ul className="load-legend" aria-hidden>
            <li data-series="cpu">CPU</li>
            <li data-series="gpu">GPU</li>
            <li data-series="ram">ОЗУ</li>
          </ul>
        </div>
        <LoadChart points={load.series} clock={load.clock} />
      </section>

      <section className="glass-card journal-card">
        <h3 className="card-kicker">Журнал действий</h3>
        <ol className="journal-list hide-scroll">
          {journal.length === 0 ? (
            <li className="journal-item" data-tone="accent">
              <div className="journal-dot" />
              <div className="journal-body">
                <div className="journal-title-row">
                  <span className="journal-title">Пока тихо</span>
                  <span className="mono tiny">—</span>
                </div>
                <p className="journal-reason">
                  Действия чата, голоса и подтверждений появятся здесь.
                </p>
                <span className="tag tag-accent">Система</span>
              </div>
            </li>
          ) : (
            journal.map((item) => (
              <li
                key={item.id}
                className={`journal-item ${item.pending ? "is-pending" : ""}`}
                data-tone={item.tone}
              >
                <div className="journal-dot" />
                <div className="journal-body">
                  <div className="journal-title-row">
                    <span className="journal-title">{item.title}</span>
                    <span className="mono tiny">
                      {formatActionLogTime(item.at, now)}
                    </span>
                  </div>
                  <p className="journal-reason">{item.reason}</p>
                  <span className={`tag tag-${item.tone}`}>{item.tag}</span>
                </div>
              </li>
            ))
          )}
        </ol>
      </section>
    </aside>
  );
}

function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "н/д";
  return `${Math.round(v)}%`;
}

function useLiveLoad(_voiceState: VoiceState) {
  const [series, setSeries] = useState<LoadPoint[]>([]);
  const [gpu, setGpu] = useState<number | null>(null);
  const [ram, setRam] = useState(0);
  const [vramGb, setVramGb] = useState<number | null>(null);
  const [vramTotalGb, setVramTotalGb] = useState<number | null>(null);
  const [clock, setClock] = useState(() => formatClock());
  const [source, setSource] = useState<"ipc" | "browser">("browser");
  const lastSeriesAt = useRef(0);
  const seeded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;

    const pushSample = (point: LoadPoint, force = false) => {
      setSeries((prev) => {
        const warm = prev.length < 12;
        const gap = warm ? POLL_MS : SERIES_STEP_MS;
        const due =
          force ||
          lastSeriesAt.current === 0 ||
          point.t - lastSeriesAt.current >= gap;
        if (!due) return prev;
        lastSeriesAt.current = point.t;
        const rolled = prev.length >= SAMPLE_COUNT ? prev.slice(1) : prev;
        return [...rolled, point];
      });
    };

    const apply = (
      sample: {
        cpu: number;
        ram: number;
        gpu: number | null;
        vramUsedGb: number | null;
        vramTotalGb: number | null;
        ts?: number;
      },
      via: "ipc" | "browser",
    ) => {
      if (cancelled) return;
      const t = sample.ts ?? Date.now();
      setSource(via);
      setRam(sample.ram);
      setGpu(sample.gpu);
      setVramGb(sample.vramUsedGb);
      setVramTotalGb(sample.vramTotalGb);
      const force = !seeded.current;
      seeded.current = true;
      pushSample(
        {
          t,
          cpu: sample.cpu,
          gpu: sample.gpu,
          ram: sample.ram,
        },
        force,
      );
    };

    const tick = async () => {
      frame += 1;
      const mira = window.mira;
      if (mira?.getSystemLoad) {
        try {
          const sample = await mira.getSystemLoad();
          apply(sample, "ipc");
          if (frame % 2 === 0) setClock(formatClock());
          return;
        } catch {
          // fall through to browser best-effort
        }
      }

      apply(sampleBrowserLoad(), "browser");
      if (frame % 2 === 0) setClock(formatClock());
    };

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const vramPct =
    vramGb != null && vramTotalGb != null && vramTotalGb > 0
      ? clamp(Math.round((vramGb / vramTotalGb) * 100), 0, 100)
      : null;

  return {
    series,
    gpu,
    ram,
    vramGb,
    vramPct,
    clock,
    source,
  };
}

function sampleBrowserLoad(): {
  cpu: number;
  ram: number;
  gpu: number | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  ts: number;
} {
  // Best-effort only: Chromium heap is not system RAM, but better than sine waves.
  const mem = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  let ram = 0;
  if (mem && mem.jsHeapSizeLimit > 0) {
    ram = clamp(
      Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100),
      0,
      100,
    );
  }
  return {
    cpu: 0,
    ram,
    gpu: null,
    vramUsedGb: null,
    vramTotalGb: null,
    ts: Date.now(),
  };
}

function formatClock(): string {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTipTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
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
  unavailable,
}: {
  value: number | null;
  label: string;
  sub?: string;
  tone: "accent" | "success" | "warning";
  unavailable?: boolean;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const shown = unavailable || value == null ? 0 : value;
  const dash = (shown / 100) * c;
  return (
    <div className="ring" data-tone={tone} data-na={unavailable ? "1" : "0"}>
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
          style={{
            transition: "stroke-dasharray 700ms var(--ease-out)",
            opacity: unavailable ? 0.35 : 1,
          }}
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          className="ring-value"
          fill="var(--text)"
        >
          {unavailable || value == null
            ? "н/д"
            : sub
              ? `${value}`
              : `${value}%`}
        </text>
      </svg>
      <span className="mono tiny">{label}</span>
      {sub ? <span className="mono tiny muted">{sub}</span> : null}
    </div>
  );
}

const SERIES_META = [
  { key: "cpu" as const, color: "var(--success)", label: "CPU" },
  { key: "gpu" as const, color: "var(--accent)", label: "GPU" },
  { key: "ram" as const, color: "var(--load-ram)", label: "ОЗУ" },
];

function LoadChart({
  points,
  clock,
}: {
  points: LoadPoint[];
  clock: string;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const w = 300;
  const h = 120;
  const n = Math.max(points.length, 2);
  const step = w / (n - 1);

  const yOf = (p: number) => h - (p / 100) * (h - 16) - 8;

  const coordsFor = (key: "cpu" | "gpu" | "ram") =>
    points.map((pt, i) => {
      const raw = pt[key];
      if (raw == null) return null;
      return { x: i * step, y: yOf(raw), p: raw, i };
    });

  const pathFor = (
    coords: Array<{ x: number; y: number } | null>,
  ): string => {
    const parts: string[] = [];
    let drawing = false;
    for (const c of coords) {
      if (!c) {
        drawing = false;
        continue;
      }
      parts.push(`${drawing ? "L" : "M"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`);
      drawing = true;
    }
    return parts.join(" ");
  };

  const activeIdx =
    hoverIdx != null && points[hoverIdx]
      ? hoverIdx
      : Math.max(0, points.length - 1);
  const active = points[activeIdx];
  const tipXGuide = points.length <= 1 ? w : activeIdx * step;
  const tipW = 118;
  const tipH = 52;
  const tipX = Math.min(Math.max(4, tipXGuide - tipW / 2), w - tipW - 4);
  const tipY = 6;

  const onMove = (ev: ReactMouseEvent<SVGSVGElement>) => {
    if (!points.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * w;
    const idx = clamp(Math.round(x / step), 0, points.length - 1);
    setHoverIdx(idx);
  };

  const ariaBits = active
    ? `CPU ${formatPct(active.cpu)}, GPU ${formatPct(active.gpu)}, ОЗУ ${formatPct(active.ram)}, ${clock}`
    : `Нет данных, ${clock}`;

  return (
    <svg
      ref={svgRef}
      className="load-chart load-chart-live"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="120"
      role="img"
      aria-label={`Нагрузка за час. ${ariaBits}`}
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <defs>
        {SERIES_META.map((s) => (
          <linearGradient
            key={s.key}
            id={`loadFill-${s.key}-${uid}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
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
      {SERIES_META.map((s) => {
        const coords = coordsFor(s.key);
        const line = pathFor(coords);
        if (!line) return null;
        const solid = coords.filter(Boolean) as Array<{
          x: number;
          y: number;
        }>;
        const area =
          solid.length > 1
            ? `${line} L ${solid[solid.length - 1]!.x.toFixed(1)} ${h} L ${solid[0]!.x.toFixed(1)} ${h} Z`
            : "";
        return (
          <g key={s.key} className={`load-series load-series-${s.key}`}>
            {area ? (
              <path
                className="load-area"
                d={area}
                fill={`url(#loadFill-${s.key}-${uid})`}
              />
            ) : null}
            <path
              className="load-line"
              d={line}
              fill="none"
              stroke={s.color}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {active ? (
        <>
          <line
            x1={tipXGuide}
            y1="8"
            x2={tipXGuide}
            y2={h - 4}
            stroke="var(--text-muted)"
            strokeDasharray="3 4"
            strokeOpacity="0.7"
          />
          {SERIES_META.map((s) => {
            const v = active[s.key];
            if (v == null) return null;
            return (
              <circle
                key={s.key}
                className="load-tip-dot"
                cx={tipXGuide}
                cy={yOf(v)}
                r="3.8"
                fill={s.color}
              />
            );
          })}
          <g transform={`translate(${tipX}, ${tipY})`}>
            <rect
              width={tipW}
              height={tipH}
              rx="6"
              fill="var(--bg)"
              stroke="var(--accent)"
              strokeOpacity="0.45"
            />
            <text x="8" y="14" className="chart-tip" fill="var(--text-muted)">
              {formatTipTime(active.t)}
            </text>
            <text x="8" y="28" className="chart-tip" fill="var(--success)">
              CPU {formatPct(active.cpu)}
            </text>
            <text x="62" y="28" className="chart-tip" fill="var(--accent)">
              GPU {formatPct(active.gpu)}
            </text>
            <text x="8" y="42" className="chart-tip" fill="var(--load-ram)">
              ОЗУ {formatPct(active.ram)}
            </text>
          </g>
        </>
      ) : (
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          className="chart-tip"
          fill="var(--text-muted)"
        >
          сбор метрик…
        </text>
      )}
    </svg>
  );
}
