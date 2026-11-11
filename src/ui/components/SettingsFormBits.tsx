import { useState, type ReactNode } from "react";

export function IntegCard(props: {
  kicker: string;
  title: string;
  purpose: string;
  howto: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className="integ-card">
      <header className="integ-card-head">
        <p className="card-kicker">{props.kicker}</p>
        <h3 className="integ-card-title">{props.title}</h3>
      </header>
      <div className="integ-help">
        <div className="integ-help-block">
          <span className="integ-help-label">Для чего нужно</span>
          <p>{props.purpose}</p>
        </div>
        <div className="integ-help-block">
          <span className="integ-help-label">Как настроить</span>
          <div className="integ-howto">{props.howto}</div>
        </div>
      </div>
      <div className="integ-fields">{props.children}</div>
      {props.footer ? <div className="integ-footer">{props.footer}</div> : null}
    </article>
  );
}

export function Field(props: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  // Use <div>, not <label>: ThemeSelect / nested buttons break when wrapped in label.
  return (
    <div className="settings-field">
      <span className="settings-field-label">{props.label}</span>
      {props.children}
      {props.hint ? <span className="settings-field-hint">{props.hint}</span> : null}
    </div>
  );
}

export function ToggleRow(props: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="settings-toggle">
      <span className="settings-toggle-copy">
        <span className="settings-field-label">{props.label}</span>
        {props.hint ? (
          <span className="settings-field-hint">{props.hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="settings-toggle-ui" aria-hidden />
    </label>
  );
}

export function SecretField(props: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  secretSet?: boolean;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="settings-field">
      <div className="settings-field-row">
        <span className="settings-field-label">{props.label}</span>
        {props.secretSet ? (
          <span className="integ-status on">ключ сохранён</span>
        ) : null}
      </div>
      <div className="secret-input">
        <input
          type={show ? "text" : "password"}
          value={props.value}
          placeholder={props.placeholder ?? "вставьте ключ…"}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value;
            // Masked placeholder: first real edit replaces the whole mask
            // instead of appending into "••••xxxx" or wiping on focus+Save.
            if (props.value.startsWith("••••") && !next.startsWith("••••")) {
              props.onChange(next);
              return;
            }
            if (props.value.startsWith("••••") && next.startsWith("••••")) {
              const stripped = next.slice(props.value.length);
              props.onChange(stripped);
              return;
            }
            props.onChange(next);
          }}
        />
        <button
          type="button"
          className="btn secret-toggle"
          onClick={() => setShow((v) => !v)}
        >
          {show ? "Скрыть" : "Показать"}
        </button>
      </div>
      {props.hint ? <span className="settings-field-hint">{props.hint}</span> : null}
    </div>
  );
}

export function SaveRow(props: {
  label?: string;
  saving?: boolean;
  note?: string | null;
  onSave: () => void;
  deleteLabel?: string;
  onDelete?: () => void;
  canDelete?: boolean;
  deleting?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="integ-actions">
      <button
        type="button"
        className="btn btn-primary"
        disabled={props.saving || props.deleting}
        onClick={props.onSave}
      >
        {props.saving ? "Сохранение…" : props.label ?? "Сохранить"}
      </button>
      {props.onDelete ? (
        <button
          type="button"
          className="btn btn-danger"
          disabled={
            props.saving || props.deleting || props.canDelete === false
          }
          onClick={props.onDelete}
        >
          {props.deleting ? "Удаление…" : props.deleteLabel ?? "Удалить ключ"}
        </button>
      ) : null}
      {props.children}
      {props.note ? <span className="chip">{props.note}</span> : null}
    </div>
  );
}
