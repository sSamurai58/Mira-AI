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

type HomeRailProps = {
  modelLabel: string;
  voiceNote?: string;
};

/** Right column: resources · load · action journal (demo metrics). */
export function HomeRail({ modelLabel, voiceNote }: HomeRailProps) {
  return (
    <aside className="home-rail">
      <section className="glass-card">
        <h3 className="card-kicker">Ресурсы</h3>
        <div className="ring-row">
          <Ring value={62} label="GPU" tone="accent" />
          <Ring value={62} label="VRAM" sub="7,4 ГБ" tone="success" />
          <Ring value={48} label="ОЗУ" tone="warning" />
        </div>
        <p className="mono tiny muted" style={{ margin: "12px 0 0" }}>
          модель · {modelLabel}
          {voiceNote ? ` · ${voiceNote}` : ""}
        </p>
      </section>

      <section className="glass-card">
        <h3 className="card-kicker">Нагрузка за час</h3>
        <LoadChart />
      </section>

      <section className="glass-card journal-card">
        <h3 className="card-kicker">Журнал действий</h3>
        <ol className="journal-list">
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
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          className="ring-value"
          fill="var(--text)"
        >
          {sub ? value : `${value}%`}
        </text>
      </svg>
      <span className="mono tiny">{label}</span>
      {sub ? <span className="mono tiny muted">{sub}</span> : null}
    </div>
  );
}

function LoadChart() {
  const points = [28, 36, 32, 48, 44, 55, 50, 62, 58, 70, 62];
  const w = 300;
  const h = 120;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - (p / 100) * (h - 16) - 8;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  const lastX = (points.length - 1) * step;
  const lastY = h - (points[points.length - 1]! / 100) * (h - 16) - 8;

  return (
    <svg
      className="load-chart"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="120"
      role="img"
      aria-label="График нагрузки за час, примерные данные"
    >
      <defs>
        <linearGradient id="loadStroke" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="55%" stopColor="var(--success)" />
          <stop offset="100%" stopColor="var(--warning)" />
        </linearGradient>
        <linearGradient id="loadFill" x1="0%" y1="0%" x2="0%" y2="100%">
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
      <path d={area} fill="url(#loadFill)" />
      <path
        d={path}
        fill="none"
        stroke="url(#loadStroke)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <line
        x1={lastX}
        y1="8"
        x2={lastX}
        y2={h - 4}
        stroke="var(--text-muted)"
        strokeDasharray="3 4"
        strokeOpacity="0.7"
      />
      <circle cx={lastX} cy={lastY} r="4" fill="var(--warning)" />
      <g transform={`translate(${Math.max(8, lastX - 70)}, ${Math.max(8, lastY - 28)})`}>
        <rect
          width="78"
          height="22"
          rx="6"
          fill="var(--bg)"
          stroke="var(--accent)"
          strokeOpacity="0.45"
        />
        <text x="8" y="15" className="chart-tip" fill="var(--text-muted)">
          сейчас · 62%
        </text>
      </g>
    </svg>
  );
}
