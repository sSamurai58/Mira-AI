import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type ThemeSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ThemeSelectProps = {
  value: string;
  options: ThemeSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
  id?: string;
};

/** Themed dropdown — replaces native `<select>` popup (OS white lists). */
export function ThemeSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Выберите…",
  className = "",
  id,
  "aria-label": ariaLabel,
}: ThemeSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`theme-select ${open ? "is-open" : ""} ${className}`.trim()}
    >
      <button
        type="button"
        id={id}
        className="theme-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className={`theme-select-label ${selected ? "" : "is-placeholder"}`}>
          {label}
        </span>
        <span className="theme-select-caret" aria-hidden />
      </button>

      {open ? (
        <ul
          id={listId}
          className="theme-select-menu hide-scroll"
          role="listbox"
          aria-activedescendant={
            selected ? `${listId}-${selected.value}` : undefined
          }
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${opt.value}`}
                  role="option"
                  aria-selected={active}
                  className={`theme-select-option ${active ? "is-active" : ""}`}
                  disabled={opt.disabled}
                  onClick={() => pick(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
