import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { StubBadge } from "./StubBadge";
import { McpBrandIcon } from "./McpBrandIcon";
import {
  MCP_AUTH_LABEL,
  MCP_CONNECTORS,
  MCP_STAGES,
  MCP_STATUS_LABEL,
  type McpConnector,
  type McpStageId,
  loadMcpDrafts,
  saveMcpDraft,
  type McpConnectorDraft,
} from "../mcp/catalog";

const STAGE_CHIP: Record<McpStageId, string> = Object.fromEntries(
  MCP_STAGES.map((s) => [s.stage, s.chip]),
) as Record<McpStageId, string>;

function ExternalLink(props: { href: string; children: string }) {
  return (
    <a
      className="mcp-ext-link"
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {props.children}
      <span className="mcp-ext-link-icon" aria-hidden>
        ↗
      </span>
    </a>
  );
}

export function SettingsMcpSection() {
  const [stageFilter, setStageFilter] = useState<McpStageId | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(() => loadMcpDrafts());
  const [note, setNote] = useState("");

  const open = useMemo(
    () => MCP_CONNECTORS.find((c) => c.id === openId) ?? null,
    [openId],
  );

  const stages =
    stageFilter === "all"
      ? MCP_STAGES
      : MCP_STAGES.filter((s) => s.stage === stageFilter);

  const markedCount = Object.values(drafts).filter((d) => d.enabled).length;

  function closeModal() {
    setOpenId(null);
  }

  function upsertDraft(id: string, patch: Partial<McpConnectorDraft>) {
    const prev = drafts[id] ?? {
      enabled: false,
      notes: "",
      fields: {},
      updatedAt: new Date().toISOString(),
    };
    const next: McpConnectorDraft = {
      ...prev,
      ...patch,
      fields: { ...prev.fields, ...(patch.fields ?? {}) },
      updatedAt: new Date().toISOString(),
    };
    setDrafts(saveMcpDraft(id, next));
  }

  return (
    <div className="mcp-section">
      <header className="mcp-hero">
        <div className="mcp-hero-copy">
          <div className="row" style={{ gap: "0.45rem", alignItems: "center" }}>
            <h2 className="mcp-hero-title">MCP</h2>
            <StubBadge label="runtime" />
          </div>
          <p className="mcp-hero-lead">
            Каталог MCP-коннекторов (стандартный разъём tools/resources). Это не
            то же самое, что «Интеграции» (встроенные web/экран/Telegram/Blender).
            Черновик ≠ подключено: статус «подключено» только после успешного
            handshake / API probe.
          </p>
        </div>
        <div className="mcp-hero-stats" aria-label="Сводка каталога">
          <div className="mcp-stat">
            <span className="mcp-stat-value">{MCP_CONNECTORS.length}</span>
            <span className="mcp-stat-label">в каталоге</span>
          </div>
          <div className="mcp-stat">
            <span className="mcp-stat-value">{MCP_STAGES.length}</span>
            <span className="mcp-stat-label">этапов</span>
          </div>
          <div className="mcp-stat">
            <span className="mcp-stat-value">{markedCount}</span>
            <span className="mcp-stat-label">черновики</span>
          </div>
        </div>
      </header>

      <nav className="mcp-stage-rail" aria-label="Этапы MCP">
        <button
          type="button"
          role="tab"
          aria-selected={stageFilter === "all"}
          className={`mcp-chip ${stageFilter === "all" ? "is-active" : ""}`}
          onClick={() => setStageFilter("all")}
        >
          <span className="mcp-chip-num">∗</span>
          <span className="mcp-chip-text">Все</span>
        </button>
        {MCP_STAGES.map((s) => (
          <button
            key={s.stage}
            type="button"
            role="tab"
            aria-selected={stageFilter === s.stage}
            className={`mcp-chip ${stageFilter === s.stage ? "is-active" : ""}`}
            onClick={() => setStageFilter(s.stage)}
            title={`${s.title} · каталог #${s.catalogNo}`}
          >
            <span className="mcp-chip-num">{s.stage}</span>
            <span className="mcp-chip-text">{STAGE_CHIP[s.stage]}</span>
          </button>
        ))}
      </nav>

      <div className="mcp-stages">
        {stages.map((stage) => {
          const items = MCP_CONNECTORS.filter((c) => c.stage === stage.stage);
          return (
            <section key={stage.stage} className="mcp-stage-panel">
              <header className="mcp-stage-head">
                <div className="mcp-stage-kicker">
                  <span className="mcp-stage-badge">Этап {stage.stage}</span>
                  <span className="mcp-stage-cat mono">#{stage.catalogNo}</span>
                </div>
                <h3 className="mcp-stage-title">{stage.title}</h3>
                <p className="mcp-stage-blurb">{stage.blurb}</p>
              </header>

              <div className="mcp-tile-grid">
                {items.map((c) => {
                  const draft = drafts[c.id];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`mcp-tile ${draft?.enabled ? "is-marked" : ""}`}
                      onClick={() => setOpenId(c.id)}
                      style={{ "--mcp-brand": c.color } as CSSProperties}
                    >
                      <span className="mcp-tile-glow" aria-hidden />
                      <span className="mcp-tile-logo" aria-hidden>
                        <McpBrandIcon id={c.icon} color={c.color} size={40} />
                      </span>
                      <span className="mcp-tile-meta">
                        <strong className="mcp-tile-name">{c.name}</strong>
                        <span className="mcp-tile-sub">
                          {MCP_AUTH_LABEL[c.auth]}
                        </span>
                      </span>
                      {draft?.enabled ? (
                        <span className="mcp-tile-check" aria-label="К подключению">
                          ✓
                        </span>
                      ) : (
                        <span className="mcp-tile-open" aria-hidden>
                          →
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {note ? <p className="mcp-toast muted">{note}</p> : null}

      {open ? (
        <McpConnectorModal
          connector={open}
          draft={
            drafts[open.id] ?? {
              enabled: false,
              notes: "",
              fields: {},
              updatedAt: "",
            }
          }
          onClose={closeModal}
          onSave={(next) => {
            upsertDraft(open.id, next);
            setNote(
              next.enabled
                ? `«${open.name}» помечен к подключению (черновик).`
                : `Черновик «${open.name}» сохранён.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function connectorLinks(c: McpConnector): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (c.docsUrl) links.push({ label: "Документация", href: c.docsUrl });
  if (c.setupUrl) links.push({ label: "Как подключить", href: c.setupUrl });
  if (c.oauthHelpUrl) links.push({ label: "OAuth / доступ", href: c.oauthHelpUrl });
  if (c.apiDocsUrl) links.push({ label: "API", href: c.apiDocsUrl });
  return links;
}

type McpLiveStatus = {
  state: string;
  detail: string;
  live: boolean;
  tools: string[];
};

function runtimeLabel(st: McpLiveStatus | null, draftEnabled: boolean): string {
  if (st?.live && st.state === "connected") return "подключено";
  if (st?.state === "connecting") return "подключение…";
  if (st?.state === "needs-auth") return "нужен OAuth";
  if (st?.state === "error") return "ошибка";
  if (draftEnabled || st?.state === "draft") return "черновик";
  return "не подключено";
}

function McpConnectorModal(props: {
  connector: McpConnector;
  draft: McpConnectorDraft;
  onClose: () => void;
  onSave: (draft: McpConnectorDraft) => void;
}) {
  const { connector: c, draft, onClose, onSave } = props;
  const [enabled, setEnabled] = useState(draft.enabled);
  const [notes, setNotes] = useState(draft.notes);
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { ...draft.fields };
    for (const f of c.envFields) {
      if (init[f.key] === undefined) init[f.key] = "";
    }
    return init;
  });
  const [live, setLive] = useState<McpLiveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const links = connectorLinks(c);

  async function refreshLive() {
    if (!window.mira?.mcpRuntimeStatus) return;
    try {
      const rows = await window.mira.mcpRuntimeStatus(c.id);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) {
        setLive({
          state: row.state,
          detail: row.detail,
          live: Boolean(row.live),
          tools: row.tools ?? [],
        });
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refreshLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide mcp-connector-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-connector-title"
        onClick={(e) => e.stopPropagation()}
        style={{ "--mcp-brand": c.color } as CSSProperties}
      >
        <div className="mcp-modal-top">
          <span className="mcp-modal-logo" aria-hidden>
            <McpBrandIcon id={c.icon} color={c.color} size={48} />
          </span>
          <div className="mcp-modal-heading">
            <h2 id="mcp-connector-title">{c.name}</h2>
            <div className="mcp-modal-tags">
              <span className="mcp-tag">Этап {c.stage}</span>
              <span className="mcp-tag">{MCP_AUTH_LABEL[c.auth]}</span>
              <span className="mcp-tag">{MCP_STATUS_LABEL[c.status]}</span>
              <span
                className={`mcp-tag ${live?.live ? "mcp-tag-live" : "mcp-tag-draft"}`}
              >
                {runtimeLabel(live, enabled)}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn catalog-edit-close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <path
                d="M3.2 3.2l9.6 9.6M12.8 3.2L3.2 12.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="modal-body mcp-modal-body">
          <p className="mcp-modal-summary">{c.summary}</p>
          <p className="mcp-modal-description">{c.description}</p>

          {c.builtinHint ? (
            <p className="mcp-modal-builtin" role="note">
              {c.builtinHint}
            </p>
          ) : null}

          {links.length > 0 ? (
            <div className="mcp-modal-block">
              <h4>Ссылки</h4>
              <ul className="mcp-link-list">
                {links.map((l) => (
                  <li key={l.href + l.label}>
                    <ExternalLink href={l.href}>{l.label}</ExternalLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mcp-modal-block">
            <h4>Голосовые команды</h4>
            <ul className="mcp-voice-list">
              {c.voiceExamples.map((ex) => (
                <li key={ex}>
                  <span className="mcp-voice-q">«{ex}»</span>
                </li>
              ))}
            </ul>
          </div>

          {c.envFields.length > 0 ? (
            <div className="mcp-modal-block">
              <h4>Данные для подключения</h4>
              <div className="mcp-fields">
                {c.envFields.map((f) => (
                  <label key={f.key} className="mcp-field">
                    <span className="mono">{f.key}</span>
                    <input
                      className="input"
                      type={
                        /TOKEN|SECRET|KEY|WEBHOOK|PASSWORD/i.test(f.key)
                          ? "password"
                          : "text"
                      }
                      autoComplete="off"
                      placeholder="черновик · не в git"
                      value={fields[f.key] ?? ""}
                      onChange={(e) =>
                        setFields((prev) => ({
                          ...prev,
                          [f.key]: e.target.value,
                        }))
                      }
                    />
                    <span className="mcp-field-hint">{f.hint}</span>
                    {f.help ? (
                      <span className="mcp-field-help">{f.help}</span>
                    ) : null}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted mcp-modal-note">
              API-ключ не нужен — локальный / OS bridge (когда runtime готов).
            </p>
          )}

          <label className="mcp-field">
            <span>Заметки</span>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Workspace URL, id доски, spreadsheet id, комментарий…"
            />
          </label>

          <label className="mcp-toggle-row">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Сохранить как черновик (ещё не подключено)</span>
          </label>

          {live ? (
            <p className="mcp-modal-live" role="status">
              Runtime: <strong>{runtimeLabel(live, enabled)}</strong>
              {live.detail ? ` — ${live.detail}` : ""}
              {live.tools?.length
                ? ` · tools: ${live.tools.slice(0, 6).join(", ")}`
                : ""}
            </p>
          ) : null}

          <p className="muted mcp-modal-foot">
            «Подключить» запускает реальный MCP/OAuth/API probe. Успех →
            «подключено»; иначе остаётесь в «черновик» / «нужен OAuth» / «ошибка».
            Не путать с Настройки → Интеграции (built-in tools).
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !window.mira?.mcpDisconnect}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await window.mira?.mcpDisconnect?.(c.id);
                  await refreshLive();
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Отключить
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              onSave({
                enabled,
                notes,
                fields,
                updatedAt: new Date().toISOString(),
              })
            }
          >
            Сохранить черновик
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !window.mira?.mcpConnect}
            onClick={() => {
              void (async () => {
                setBusy(true);
                onSave({
                  enabled: true,
                  notes,
                  fields,
                  updatedAt: new Date().toISOString(),
                });
                try {
                  const st = await window.mira!.mcpConnect!({
                    connectorId: c.id,
                    fields,
                    auth: c.auth,
                    command: fields.MCP_COMMAND || fields.command,
                    url: fields.MCP_URL || fields.url,
                  });
                  setLive({
                    state: st.state,
                    detail: st.detail,
                    live: Boolean(st.live),
                    tools: st.tools ?? [],
                  });
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {busy ? "Подключение…" : "Подключить"}
          </button>
        </div>
      </div>
    </div>
  );
}
