import { useMemo, useState } from "react";
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
    <div className="appearance-stack mcp-section">
      <header className="appearance-block-head">
        <div className="row">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>MCP</h2>
          <StubBadge label="0.1.4" />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Каталог подключений сайтов и программ. Плитки как у тем: иконка +
          название → окно с данными. Runtime/OAuth подключается по этапам (см.{" "}
          <span className="mono">docs/MCP.md</span>).
        </p>
      </header>

      <div className="mcp-stage-filters" role="tablist" aria-label="Этапы MCP">
        <button
          type="button"
          className={`btn ${stageFilter === "all" ? "btn-primary" : ""}`}
          onClick={() => setStageFilter("all")}
        >
          Все этапы
        </button>
        {MCP_STAGES.map((s) => (
          <button
            key={s.stage}
            type="button"
            className={`btn ${stageFilter === s.stage ? "btn-primary" : ""}`}
            onClick={() => setStageFilter(s.stage)}
            title={`Каталог #${s.catalogNo}`}
          >
            {s.stage}. {s.title}
          </button>
        ))}
      </div>

      {stages.map((stage) => {
        const items = MCP_CONNECTORS.filter((c) => c.stage === stage.stage);
        return (
          <section key={stage.stage} className="mcp-stage-block">
            <header className="appearance-block-head">
              <div className="row" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
                <h3 style={{ margin: 0, fontSize: "0.98rem" }}>
                  Этап {stage.stage} · {stage.title}
                </h3>
                <span className="muted mono" style={{ fontSize: "0.75rem" }}>
                  каталог #{stage.catalogNo}
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {stage.blurb}
              </p>
            </header>
            <div className="theme-grid mcp-tile-grid">
              {items.map((c) => {
                const draft = drafts[c.id];
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`theme-card mcp-tile ${draft?.enabled ? "active" : ""}`}
                    onClick={() => setOpenId(c.id)}
                  >
                    <span className="mcp-tile-ribbon" aria-hidden>
                      <McpBrandIcon id={c.icon} color={c.color} size={36} />
                    </span>
                    <span className="theme-card-body mcp-tile-body">
                      <strong>{c.name}</strong>
                      <span className="mono muted">
                        {MCP_AUTH_LABEL[c.auth]} · {MCP_STATUS_LABEL[c.status]}
                      </span>
                    </span>
                    {draft?.enabled ? (
                      <span className="appearance-check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {note ? <p className="muted">{note}</p> : null}

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
                ? `Черновик «${open.name}» сохранён (ожидает MCP runtime).`
                : `Черновик «${open.name}» обновлён.`,
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
      >
        <div className="row" style={{ alignItems: "flex-start", gap: "0.75rem" }}>
          <McpBrandIcon id={c.icon} color={c.color} size={44} />
          <div style={{ flex: 1 }}>
            <h2 id="mcp-connector-title" style={{ margin: 0 }}>
              {c.name}
            </h2>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              Этап {c.stage} · {MCP_AUTH_LABEL[c.auth]} ·{" "}
              {MCP_STATUS_LABEL[c.status]}
            </p>
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

        <div className="modal-body stack" style={{ gap: "0.85rem" }}>
          <p style={{ margin: 0 }}>{c.summary}</p>

          <div>
            <strong style={{ fontSize: "0.85rem" }}>Голосовые команды</strong>
            <ul className="mcp-voice-list">
              {c.voiceExamples.map((ex) => (
                <li key={ex}>{ex}</li>
              ))}
            </ul>
          </div>

          {c.envKeys.length > 0 ? (
            <div className="stack" style={{ gap: "0.45rem" }}>
              <strong style={{ fontSize: "0.85rem" }}>
                Данные для подключения
              </strong>
              {c.envKeys.map((key) => (
                <label key={key} className="stack" style={{ gap: "0.2rem" }}>
                  <span className="muted mono" style={{ fontSize: "0.78rem" }}>
                    {key}
                  </span>
                  <input
                    className="input"
                    type={
                      key.includes("TOKEN") || key.includes("SECRET") || key.includes("KEY")
                        ? "password"
                        : "text"
                    }
                    autoComplete="off"
                    placeholder="черновик (не публикуется в git)"
                    value={fields[key] ?? ""}
                    onChange={(e) =>
                      setFields((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Отдельный API-ключ не нужен — локальный / OS bridge (когда runtime
              будет готов).
            </p>
          )}

          <label className="stack" style={{ gap: "0.2rem" }}>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Заметки
            </span>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: workspace URL, id доски…"
            />
          </label>

          <label className="row" style={{ gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Пометить к подключению (черновик каталога)</span>
          </label>

          <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            Реальный MCP-runtime и OAuth в 0.1.4 ещё не активны — сохраняется
            только локальный черновик настроек.
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
