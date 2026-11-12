import {
  useEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";
import { syncTextareaHeight } from "../autoGrowTextareas";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Min height in px (default 96). */
  minHeight?: number;
  /** Max height in px (default ~70vh). */
  maxHeight?: number;
};

/** Textarea that grows with content — use for controlled fields across Mira. */
export function AutoGrowTextarea({
  minHeight,
  maxHeight,
  value,
  className,
  style,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (minHeight != null) el.dataset.autogrowMin = String(minHeight);
    else delete el.dataset.autogrowMin;
    if (maxHeight != null) el.dataset.autogrowMax = String(maxHeight);
    else delete el.dataset.autogrowMax;
    syncTextareaHeight(el);
  }, [value, minHeight, maxHeight]);

  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      className={["auto-grow-textarea", className].filter(Boolean).join(" ")}
      style={style}
      rows={rest.rows ?? 3}
    />
  );
}
