import { useEffect, useMemo, useState } from "react";
import { StubBadge } from "./StubBadge";
import { Field, ToggleRow } from "./SettingsFormBits";

type BackupStatus = {
  packages?: string[];
  dirs?: Record<string, unknown>;
  [key: string]: unknown;
};

type LogRow = {
  created_at: string;
  level: string;
  category: string;
  message: string;
};

const FORGET_ACTIONS = [
  {
    scope: "memory" as const,
    label: "Память",
    hint: "Сессии и utterances диалога",
  },
  {
    scope: "learned" as const,
    label: "Выученное",
    hint: "Юниты обучения",
  },
  {
    scope: "library" as const,
    label: "Библиотека",
    hint: "Материалы и файлы",
  },
  {
    scope: "voice-studio" as const,
    label: "Студия",
    hint: "Клипы и модели голоса",
  },
];

export function SettingsDataPrivacySection(props: {
  healthText: string;
  onOpenDoctor?: () => void;
}) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [packagePath, setPackagePath] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logMeta, setLogMeta] = useState<string>("");
  const [logFile, setLogFile] = useState("");
  const [showHealth, setShowHealth] = useState(false);
  const [showStatusJson, setShowStatusJson] = useState(false);
  const live = Boolean(window.mira?.getBackupStatus);

  const packageCount = status?.packages?.length ?? 0;

  const healthSummary = useMemo(() => {
    try {
      const parsed = JSON.parse(props.healthText) as Record<string, unknown>;
      const bits: string[] = [];
      if (typeof parsed.sessions === "number") {
        bits.push(`сессий ${parsed.sessions}`);
      }
      if (typeof parsed.utterances === "number") {
        bits.push(`реплик ${parsed.utterances}`);
      }
      if (typeof parsed.learnedUnits === "number") {
        bits.push(`выучено ${parsed.learnedUnits}`);
      }
      if (typeof parsed.phase === "string") bits.push(String(parsed.phase));
      return bits.join(" · ") || "health ok";
    } catch {
      return props.healthText.slice(0, 80) || "—";
    }
  }, [props.healthText]);

  async function refreshStatus() {
    if (!window.mira?.getBackupStatus) {
      setStatus(null);
      setNote("IPC недоступен");
      return;
    }
    const st = (await window.mira.getBackupStatus()) as BackupStatus;
    setStatus(st);
    if (!packagePath && st.packages?.[0]) {
      setPackagePath(`data/backups/${st.packages[0]}`);
    }
  }

  async function refreshLogs() {
    if (!window.mira?.listAppLogs) {
      setLogLines(["IPC недоступен"]);
      return;
    }
    const [rows, loggingStatus] = await Promise.all([
      window.mira.listAppLogs({ limit: 40 }),
      window.mira.getLoggingStatus(),
    ]);
    if (!logFile && loggingStatus.latestFile) {
      setLogFile(loggingStatus.latestFile);
    }
    setLogMeta(
      [
        loggingStatus.dir ? `dir ${loggingStatus.dir}` : null,
        loggingStatus.latestFile
          ? `file ${loggingStatus.latestFile}`
          : null,
        `rows ${rows.length}`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    setLogLines(
      (rows as LogRow[]).map(
        (r) => `${r.created_at} [${r.level}/${r.category}] ${r.message}`,
      ),
    );
  }

  useEffect(() => {
    void refreshStatus();
    void refreshLogs();
  }, []);

  return (
    <div className="stack paths-panel settings-polish">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
              Данные и приватность
            </h2>
            <StubBadge label="F13" />
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Backup, «забыть», Doctor и логи сессии. Секреты в пакет — только
            явно.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => props.onOpenDoctor?.()}
        >
          Doctor
        </button>
      </div>

      <div className="settings-stat-row">
        <span className="settings-stat-chip">
          Пакеты <strong>{packageCount}</strong>
        </span>
        <span className="settings-stat-chip" title={healthSummary}>
          Health <strong>{healthSummary}</strong>
        </span>
        {!live ? <span className="chip">browser-demo</span> : null}
      </div>

      {note ? (
        <p className="muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}
      {busy ? (
        <p className="muted mono" style={{ margin: 0 }}>
          busy: {busy}
        </p>
      ) : null}

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Резервная копия</h3>
        <ToggleRow
          label="Включить .env в экспорт"
          hint="Не рекомендуется — токены попадут в пакет"
          checked={includeSecrets}
          onChange={setIncludeSecrets}
        />
        <Field
          label="Путь пакета"
          hint="Относительно data/ · для import"
        >
          <input
            value={packagePath}
            onChange={(e) => setPackagePath(e.target.value)}
            placeholder="data/backups/mira-backup-…"
            spellCheck={false}
          />
        </Field>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null || !live}
            onClick={() => {
              setBusy("export");
              void window.mira
                ?.exportBackup({ includeSecrets })
                .then((res) => {
                  setNote(res.detail);
                  setPackagePath(res.packagePath);
                  return refreshStatus();
                })
                .catch((err) =>
                  setNote(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setBusy(null));
            }}
          >
            Export backup
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || !live || !packagePath.trim()}
            onClick={() => {
              setBusy("import");
              void window.mira
                ?.importBackup(packagePath.trim())
                .then((res) => {
                  setNote(res.detail);
                  return refreshStatus();
                })
                .catch((err) =>
                  setNote(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setBusy(null));
            }}
          >
            Import backup
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || !live}
            onClick={() => {
              setBusy("status");
              void refreshStatus().finally(() => setBusy(null));
            }}
          >
            Обновить статус
          </button>
        </div>
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Забыть данные</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Операции с confirm в Electron. Карточки не затирают диск без
          подтверждения.
        </p>
        <div className="settings-forget-grid">
          {FORGET_ACTIONS.map((a) => (
            <button
              key={a.scope}
              type="button"
              className="settings-forget-card"
              disabled={busy !== null || !live}
              onClick={() => {
                setBusy(`forget-${a.scope}`);
                void window.mira
                  ?.forgetData(a.scope)
                  .then((res) => {
                    setNote(
                      `${res.detail} · ${JSON.stringify(res.deleted)}`,
                    );
                    return refreshStatus();
                  })
                  .catch((err) =>
                    setNote(
                      err instanceof Error ? err.message : String(err),
                    ),
                  )
                  .finally(() => setBusy(null));
              }}
            >
              <strong>{a.label}</strong>
              <span className="muted">{a.hint}</span>
            </button>
          ))}
          <button
            type="button"
            className="settings-forget-card is-danger"
            disabled={busy !== null || !live}
            onClick={() => {
              setBusy("forget-all");
              void window.mira
                ?.forgetData("all")
                .then((res) => {
                  setNote(`${res.detail} · ${JSON.stringify(res.deleted)}`);
                  return refreshStatus();
                })
                .catch((err) =>
                  setNote(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setBusy(null));
            }}
          >
            <strong>Забыть всё</strong>
            <span className="muted">Память + обучение + библиотека + студия</span>
          </button>
        </div>
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Логи сессии</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          SQLite `app_logs` и файлы `data/logs/mira-YYYY-MM-DD.jsonl`.
          {logMeta ? ` · ${logMeta}` : ""}
        </p>
        <Field label="Файл лога" hint="mira-….jsonl">
          <input
            value={logFile}
            onChange={(e) => setLogFile(e.target.value)}
            placeholder="mira-….jsonl"
            spellCheck={false}
          />
        </Field>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => {
              setBusy("logs");
              void refreshLogs().finally(() => setBusy(null));
            }}
          >
            Обновить логи
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || !logFile || !live}
            onClick={() => {
              if (!window.mira || !logFile) return;
              setBusy("logfile");
              void window.mira
                .readLogFile(logFile, 60)
                .then((text) => {
                  setLogLines(text.split(/\r?\n/).filter(Boolean));
                  setLogMeta(`tail ${logFile}`);
                })
                .catch((err) =>
                  setNote(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setBusy(null));
            }}
          >
            Хвост файла
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy !== null || !live}
            onClick={() => {
              if (!window.mira) return;
              setBusy("clear-logs");
              void window.mira
                .clearAppLogs()
                .then((res) => {
                  setNote(`Логи очищены: ${res.deleted}`);
                  return refreshLogs();
                })
                .finally(() => setBusy(null));
            }}
          >
            Очистить DB-логи
          </button>
        </div>
        <div className="integ-conn-log mono settings-log-viewer">
          {logLines.length
            ? logLines.join("\n")
            : "Логов пока нет — нажмите «Обновить логи»."}
        </div>
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Служебные сведения</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Сырой JSON спрятан — раскройте, если нужен Doctor/debug.
        </p>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setShowHealth((v) => !v)}
          >
            {showHealth ? "Скрыть health" : "Показать health"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setShowStatusJson((v) => !v)}
          >
            {showStatusJson ? "Скрыть backup JSON" : "Показать backup JSON"}
          </button>
        </div>
        {showHealth ? (
          <pre className="integ-conn-log mono settings-log-viewer">
            {props.healthText || "—"}
          </pre>
        ) : null}
        {showStatusJson ? (
          <pre className="integ-conn-log mono settings-log-viewer">
            {status ? JSON.stringify(status, null, 2) : "—"}
          </pre>
        ) : null}
      </article>
    </div>
  );
}
