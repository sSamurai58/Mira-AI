/** Static non-glowing atmosphere patterns (Settings → appearance). */

export type BgPatternId =
  | "fine-grid"
  | "dot-grid"
  | "wide-grid"
  | "horiz-rules"
  | "diag-hatch"
  | "iso-diamond"
  | "crosshair"
  | "micro-noise"
  | "brick-offset"
  | "hex-mesh";

export type BgPatternDefinition = {
  id: BgPatternId;
  name: string;
  /** Short RU label for settings */
  label: string;
};

export const BG_PATTERNS: BgPatternDefinition[] = [
  { id: "fine-grid", name: "Fine grid", label: "Мелкая клетка" },
  { id: "dot-grid", name: "Dot grid", label: "Точки" },
  { id: "wide-grid", name: "Wide grid", label: "Редкая клетка" },
  { id: "horiz-rules", name: "Horiz rules", label: "Горизонтали" },
  { id: "diag-hatch", name: "Diag hatch", label: "Диагональ" },
  { id: "iso-diamond", name: "Iso diamond", label: "Ромбы" },
  { id: "crosshair", name: "Crosshair", label: "Крестики" },
  { id: "micro-noise", name: "Micro noise", label: "Микрошум" },
  { id: "brick-offset", name: "Brick offset", label: "Кирпич" },
  { id: "hex-mesh", name: "Hex mesh", label: "Соты" },
];

export const DEFAULT_BG_PATTERN_ID: BgPatternId = "fine-grid";

const KEY = "mira.bgPattern";

export function isBgPatternId(v: string): v is BgPatternId {
  return BG_PATTERNS.some((p) => p.id === v);
}

export function loadStoredBgPatternId(): BgPatternId {
  const raw = localStorage.getItem(KEY);
  if (raw && isBgPatternId(raw)) return raw;
  return DEFAULT_BG_PATTERN_ID;
}

export function applyBgPattern(id: BgPatternId): void {
  const next = isBgPatternId(id) ? id : DEFAULT_BG_PATTERN_ID;
  document.documentElement.dataset.bgPattern = next;
  localStorage.setItem(KEY, next);
}
