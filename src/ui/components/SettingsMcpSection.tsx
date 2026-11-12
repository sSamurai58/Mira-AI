import { useMemo, useState, type CSSProperties } from "react";
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
            <StubBadge label="0.1.4" />
          </div>
          <p className="mcp-hero-lead">
            Подключения сайтов и программ для продуктивности. Выберите плитку —
            откроется карточка с данными коннектора.
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
            <span className="mcp-stat-label">к подключению</span>
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
    for (const key of c.envKeys) {
      if (init[key] === undefined) init[key] = "";
    }
    return init;
  });

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

          {c.builtinHint ? (
            <p className="mcp-modal-builtin" role="note">
              {c.builtinHint}
            </p>
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

          {c.envKeys.length > 0 ? (
            <div className="mcp-modal-block">
              <h4>Данные для подключения</h4>
              <div className="mcp-fields">
                {c.envKeys.map((key) => (
                  <label key={key} className="mcp-field">
                    <span className="mono">{key}</span>
                    <input
                      className="input"
                      type={
                        /TOKEN|SECRET|KEY|WEBHOOK/i.test(key)
                          ? "password"
                          : "text"
                      }
                      autoComplete="off"
                      placeholder="черновик · не в git"
                      value={fields[key] ?? ""}
                      onChange={(e) =>
                        setFields((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                    />
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
              placeholder="Workspace URL, id доски, комментарий…"
            />
          </label>

          <label className="mcp-toggle-row">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Пометить к подключению</span>
          </label>

          <p className="muted mcp-modal-foot">
            MCP-runtime и OAuth в 0.1.4 ещё не активны — только локальный
            черновик.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="button"
            className="btn btn-primary"
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
        </div>
      </div>
    </div>
  );
}
