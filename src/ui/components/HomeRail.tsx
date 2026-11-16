import {
  memo,
  useEffect,
  useId,
  useMemo,
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
/** Slow IPC — rings/chart don't need sub-5s spam (PowerShell GPU/RAM is costly). */
const POLL_MS = 8_000;
const POLL_HIDDEN_MS = 30_000;
const SERIES_STEP_MS = 60_000;

type LoadPoint = {
  t: number;
  cpu: number;
  gpu: number | null;
  ram: number;
};

type LoadSnap = {
  series: LoadPoint[];
  gpu: number | null;
  ram: number;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
  vramGb: number | null;
  vramTotalGb: number | null;
  processRssGb: number | null;
  source: "ipc" | "browser";
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

  const vramPct =
    load.vramGb != null && load.vramTotalGb != null && load.vramTotalGb > 0
      ? clamp(Math.round((load.vramGb / load.vramTotalGb) * 100), 0, 100)
      : null;

  return (
    <aside className="home-rail">
      <section className="glass-card home-rail-card">
        <h3 className="card-kicker">Ресурсы</h3>
        <div className="ring-row">
          <Ring
            value={load.gpu}
            label="GPU"
            tone="accent"
            unavailable={load.gpu == null}
          />
          <Ring
            value={vramPct}
            label="VRAM"
            sub={
              load.vramGb != null
                ? `${fmtGb(load.vramGb)} ГБ`
                : undefined
            }
            tone="success"
            unavailable={vramPct == null}
          />
          <Ring
            value={load.ram}
            label="ОЗУ"
            sub={
              load.ramUsedGb != null && load.ramTotalGb != null
                ? `${fmtGb(load.ramUsedGb)}/${fmtGb(load.ramTotalGb)} ГБ`
                : undefined
            }
            tone="warning"
          />
        </div>
        <p className="mono tiny muted" style={{ margin: "12px 0 0" }}>
          модель · {modelLabel}
          {voiceNote ? ` · ${voiceNote}` : ""}
          {load.processRssGb != null
            ? ` · Mira ${fmtGb(load.processRssGb)} ГБ`
            : ""}
          {load.source === "ipc" ? "" : " · метрики: браузер"}
        </p>
      </section>

      <section className="glass-card home-rail-card load-card">
        <div className="load-card-head">
          <h3 className="card-kicker">Нагрузка за час</h3>
          <ul className="load-legend" aria-hidden>
            <li data-series="cpu">CPU</li>
            <li data-series="gpu">GPU</li>
            <li data-series="ram">ОЗУ</li>
          </ul>
        </div>
        <LoadChart points={load.series} />
      </section>

      <JournalCard />
    </aside>
  );
}

function JournalCard() {
  const journal = useActionLog();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 8_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="glass-card home-rail-card journal-card">
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
  );
}

function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "н/д";
  return `${Math.round(v)}%`;
}

function fmtGb(v: number): string {
  return v.toFixed(1).replace(".", ",");
}

function useLiveLoad(_voiceState: VoiceState): LoadSnap {
  const [snap, setSnap] = useState<LoadSnap>(() => ({
    series: [],
    gpu: null,
    ram: 0,
    ramUsedGb: null,
    ramTotalGb: null,
    vramGb: null,
    vramTotalGb: null,
    processRssGb: null,
    source: "browser",
  }));
  const lastSeriesAt = useRef(0);
  const seeded = useRef(false);
  const seriesRef = useRef<LoadPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const pushSample = (point: LoadPoint, force = false): LoadPoint[] => {
      const prev = seriesRef.current;
      const warm = prev.length < 12;
      const gap = warm ? POLL_MS : SERIES_STEP_MS;
      const due =
        force ||
        lastSeriesAt.current === 0 ||
        point.t - lastSeriesAt.current >= gap;
      if (!due) return prev;
      lastSeriesAt.current = point.t;
      const rolled = prev.length >= SAMPLE_COUNT ? prev.slice(1) : prev;
      const next = [...rolled, point];
      seriesRef.current = next;
      return next;
    };

    const apply = (
      sample: {
        cpu: number;
        ram: number;
        ramUsedGb?: number;
        ramTotalGb?: number;
        gpu: number | null;
        vramUsedGb: number | null;
        vramTotalGb: number | null;
        processRssGb?: number | null;
        ts?: number;
      },
      via: "ipc" | "browser",
    ) => {
      if (cancelled) return;
      const t = sample.ts ?? Date.now();
      const force = !seeded.current;
      seeded.current = true;
      const series = pushSample(
        {
          t,
          cpu: sample.cpu,
          gpu: sample.gpu,
          ram: sample.ram,
        },
        force,
      );
      setSnap({
        series,
        gpu: sample.gpu,
        ram: sample.ram,
        ramUsedGb:
          sample.ramUsedGb != null && Number.isFinite(sample.ramUsedGb)
            ? sample.ramUsedGb
            : null,
        ramTotalGb:
          sample.ramTotalGb != null && Number.isFinite(sample.ramTotalGb)
            ? sample.ramTotalGb
            : null,
        vramGb: sample.vramUsedGb,
        vramTotalGb: sample.vramTotalGb,
        processRssGb:
          sample.processRssGb != null && Number.isFinite(sample.processRssGb)
            ? sample.processRssGb
            : null,
        source: via,
      });
    };

    const tick = async () => {
      const mira = window.mira;
      if (mira?.getSystemLoad) {
        try {
          const sample = await mira.getSystemLoad();
          apply(sample, "ipc");
          return;
        } catch {
          // fall through
        }
      }
      apply(sampleBrowserLoad(), "browser");
    };

    const schedule = () => {
      if (timer != null) window.clearInterval(timer);
      const ms =
        document.visibilityState === "hidden" ? POLL_HIDDEN_MS : POLL_MS;
      timer = window.setInterval(() => {
        void tick();
      }, ms);
    };

    const onVis = () => {
      schedule();
      if (document.visibilityState === "visible") void tick();
    };

    void tick();
    schedule();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return snap;
}

function sampleBrowserLoad(): {
  cpu: number;
  ram: number;
  gpu: number | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  ts: number;
} {
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

function formatTipTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const Ring = memo(function Ring({
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
          className="ring-arc"
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 32 32)"
          style={{ opacity: unavailable ? 0.35 : 1 }}
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
});

const SERIES_META = [
  { key: "cpu" as const, color: "var(--success)", label: "CPU" },
  { key: "gpu" as const, color: "var(--accent)", label: "GPU" },
  { key: "ram" as const, color: "var(--load-ram)", label: "ОЗУ" },
];

/**
 * Paths are React-memoized; hover tip/guide mutate DOM refs so mousemove
 * never rebuilds SVG paths (was the main home-rail jank source).
 */
const LoadChart = memo(function LoadChart({ points }: { points: LoadPoint[] }) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const guideRef = useRef<SVGLineElement | null>(null);
  const tipGRef = useRef<SVGGElement | null>(null);
  const tipTimeRef = useRef<SVGTextElement | null>(null);
  const tipCpuRef = useRef<SVGTextElement | null>(null);
  const tipGpuRef = useRef<SVGTextElement | null>(null);
  const tipRamRef = useRef<SVGTextElement | null>(null);
  const dotRefs = useRef<Array<SVGCircleElement | null>>([null, null, null]);
  const hoverIdxRef = useRef<number | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const w = 300;
  const h = 120;

  const geometry = useMemo(() => {
    const n = Math.max(points.length, 2);
    const step = w / (n - 1);
    const yOf = (p: number) => h - (p / 100) * (h - 16) - 8;
    const build = (key: "cpu" | "gpu" | "ram") => {
      const coords: Array<{ x: number; y: number; p: number } | null> = [];
      const parts: string[] = [];
      let drawing = false;
      for (let i = 0; i < points.length; i++) {
        const raw = points[i]![key];
        if (raw == null) {
          coords.push(null);
          drawing = false;
          continue;
        }
        const c = { x: i * step, y: yOf(raw), p: raw };
        coords.push(c);
        parts.push(
          `${drawing ? "L" : "M"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`,
        );
        drawing = true;
      }
      const line = parts.join(" ");
      const solid = coords.filter(Boolean) as Array<{
        x: number;
        y: number;
      }>;
      const area =
        solid.length > 1 && line
          ? `${line} L ${solid[solid.length - 1]!.x.toFixed(1)} ${h} L ${solid[0]!.x.toFixed(1)} ${h} Z`
          : "";
      return { line, area, coords, yOf, step };
    };
    return {
      step,
      yOf,
      cpu: build("cpu"),
      gpu: build("gpu"),
      ram: build("ram"),
    };
  }, [points]);

  const paintTip = (idx: number) => {
    const pts = pointsRef.current;
    const pt = pts[idx];
    if (!pt) return;
    const tipW = 118;
    const x = pts.length <= 1 ? w : idx * geometry.step;
    const tipX = Math.min(Math.max(4, x - tipW / 2), w - tipW - 4);
    const guide = guideRef.current;
    if (guide) {
      guide.setAttribute("x1", String(x));
      guide.setAttribute("x2", String(x));
    }
    const tipG = tipGRef.current;
    if (tipG) tipG.setAttribute("transform", `translate(${tipX}, 6)`);
    tipTimeRef.current &&
      (tipTimeRef.current.textContent = formatTipTime(pt.t));
    tipCpuRef.current &&
      (tipCpuRef.current.textContent = `CPU ${formatPct(pt.cpu)}`);
    tipGpuRef.current &&
      (tipGpuRef.current.textContent = `GPU ${formatPct(pt.gpu)}`);
    tipRamRef.current &&
      (tipRamRef.current.textContent = `ОЗУ ${formatPct(pt.ram)}`);
    SERIES_META.forEach((s, i) => {
      const dot = dotRefs.current[i];
      if (!dot) return;
      const v = pt[s.key];
      if (v == null) {
        dot.setAttribute("visibility", "hidden");
        return;
      }
      dot.setAttribute("visibility", "visible");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(geometry.yOf(v)));
    });
    const svg = svgRef.current;
    if (svg) {
      svg.setAttribute(
        "aria-label",
        `Нагрузка за час. CPU ${formatPct(pt.cpu)}, GPU ${formatPct(pt.gpu)}, ОЗУ ${formatPct(pt.ram)}`,
      );
    }
  };

  // Keep tip on the latest sample when series grows (no hover).
  useEffect(() => {
    if (hoverIdxRef.current != null) return;
    if (!points.length) return;
    paintTip(points.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint from latest points/geometry
  }, [points, geometry]);

  const onMove = (ev: ReactMouseEvent<SVGSVGElement>) => {
    const pts = pointsRef.current;
    if (!pts.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = ((ev.clientX - rect.left) / rect.width) * w;
    const idx = clamp(Math.round(x / geometry.step), 0, pts.length - 1);
    if (hoverIdxRef.current === idx) return;
    hoverIdxRef.current = idx;
    paintTip(idx);
  };

  const onLeave = () => {
    hoverIdxRef.current = null;
    if (pointsRef.current.length) paintTip(pointsRef.current.length - 1);
  };

  const last = points.length ? points[points.length - 1] : null;

  return (
    <svg
      ref={svgRef}
      className="load-chart"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="120"
      role="img"
      aria-label={
        last
          ? `Нагрузка за час. CPU ${formatPct(last.cpu)}, GPU ${formatPct(last.gpu)}, ОЗУ ${formatPct(last.ram)}`
          : "Нагрузка за час. Нет данных"
      }
      onMouseMove={onMove}
      onMouseLeave={onLeave}
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
        const built = geometry[s.key];
        if (!built.line) return null;
        return (
          <g key={s.key} className={`load-series load-series-${s.key}`}>
            {built.area ? (
              <path
                className="load-area"
                d={built.area}
                fill={`url(#loadFill-${s.key}-${uid})`}
              />
            ) : null}
            <path
              className="load-line"
              d={built.line}
              fill="none"
              stroke={s.color}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {points.length ? (
        <>
          <line
            ref={guideRef}
            x1={w}
            y1="8"
            x2={w}
            y2={h - 4}
            stroke="var(--text-muted)"
            strokeDasharray="3 4"
            strokeOpacity="0.7"
            pointerEvents="none"
          />
          {SERIES_META.map((s, i) => (
            <circle
              key={s.key}
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              className="load-tip-dot"
              cx={w}
              cy={h / 2}
              r="3.8"
              fill={s.color}
              pointerEvents="none"
            />
          ))}
          <g
            ref={tipGRef}
            transform={`translate(${Math.max(4, w - 122)}, 6)`}
            pointerEvents="none"
          >
            <rect
              width={118}
              height={52}
              rx="6"
              fill="var(--bg)"
              stroke="var(--accent)"
              strokeOpacity="0.45"
            />
            <text
              ref={tipTimeRef}
              x="8"
              y="14"
              className="chart-tip"
              fill="var(--text-muted)"
            >
              {last ? formatTipTime(last.t) : ""}
            </text>
            <text
              ref={tipCpuRef}
              x="8"
              y="28"
              className="chart-tip"
              fill="var(--success)"
            >
              CPU {last ? formatPct(last.cpu) : "н/д"}
            </text>
            <text
              ref={tipGpuRef}
              x="62"
              y="28"
              className="chart-tip"
              fill="var(--accent)"
            >
              GPU {last ? formatPct(last.gpu) : "н/д"}
            </text>
            <text
              ref={tipRamRef}
              x="8"
              y="42"
              className="chart-tip"
              fill="var(--load-ram)"
            >
              ОЗУ {last ? formatPct(last.ram) : "н/д"}
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
});
