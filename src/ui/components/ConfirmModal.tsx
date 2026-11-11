import { useEffect, useMemo, useState } from "react";

export type SkillProposeForm = {
  defaultId: string;
  defaultName: string;
  summary: string;
  existingIds: string[];
  sourceTitle: string;
};

type ConfirmModalProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  skillPropose?: SkillProposeForm | null;
  onConfirm: (fields?: { skillId?: string; skillName?: string }) => void;
  onCancel: () => void;
};

function normalizeSkillId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Подтвердить",
  skillPropose = null,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [skillId, setSkillId] = useState(skillPropose?.defaultId ?? "");
  const [skillName, setSkillName] = useState(skillPropose?.defaultName ?? "");

  useEffect(() => {
    if (!open || !skillPropose) return;
    setSkillId(skillPropose.defaultId);
    setSkillName(skillPropose.defaultName);
  }, [open, skillPropose]);

  const normalizedId = useMemo(() => normalizeSkillId(skillId), [skillId]);
  const existing = useMemo(
    () => new Set((skillPropose?.existingIds ?? []).map((id) => id.toLowerCase())),
    [skillPropose],
  );
  const duplicate =
    Boolean(skillPropose) &&
    Boolean(normalizedId) &&
    existing.has(normalizedId);
  const invalidId = Boolean(skillPropose) && !normalizedId;
  const canSubmit = !skillPropose || (!duplicate && !invalidId);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className={`modal ${skillPropose ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p className="modal-body">{body}</p>

        {skillPropose ? (
          <div className="skill-propose-form">
            <label className="settings-field">
              <span className="settings-field-label">ID skill</span>
              <input
                className="mono"
                type="text"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={duplicate || invalidId}
              />
              <span className="settings-field-hint">
                Латиница, цифры, `-` / `_`. Нормализуется:{" "}
                <code>{normalizedId || "—"}</code>
              </span>
              {invalidId ? (
                <span className="field-error">Укажите непустой ID</span>
              ) : null}
              {duplicate ? (
                <span className="field-error">
                  Skill с ID «{normalizedId}» уже есть в каталоге
                </span>
              ) : null}
            </label>

            <label className="settings-field">
              <span className="settings-field-label">Название</span>
              <input
                type="text"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                autoComplete="off"
              />
            </label>

            <div className="skill-propose-summary">
              <span className="settings-field-label">Краткая сводка</span>
              <pre className="skill-propose-summary-body">
                {skillPropose.summary}
              </pre>
              <span className="settings-field-hint">
                Источник: {skillPropose.sourceTitle} · по умолчанию skill выключен
              </span>
            </div>
          </div>
        ) : null}

        <p className="mono muted">Режим confirm: always (до F12)</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              if (skillPropose) {
                onConfirm({
                  skillId: normalizedId,
                  skillName: skillName.trim() || skillPropose.defaultName,
                });
                return;
              }
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
