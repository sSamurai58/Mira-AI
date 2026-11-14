/** Liquid Glass prefs for Apple themes (renderer). */

export type AppleGlassLevel = "regular" | "clear" | "solid";

export type AppleAppearancePrefs = {
  /** Preferred Apple appearance when using the Apple section. */
  mode: "light" | "dark";
  glass: AppleGlassLevel;
  boldText: boolean;
};

export const DEFAULT_APPLE_APPEARANCE: AppleAppearancePrefs = {
  mode: "dark",
  glass: "clear",
  boldText: false,
};

const LS_KEY = "mira.apple.appearance";
export const APPLE_APPEARANCE_EVENT = "mira:apple-appearance";

export const APPLE_GLASS_LABEL: Record<AppleGlassLevel, string> = {
  solid: "Плотнее",
  regular: "Обычный",
  clear: "Более прозрачный",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function normalizeAppleAppearance(raw: unknown): AppleAppearancePrefs {
  if (!isRecord(raw)) return { ...DEFAULT_APPLE_APPEARANCE };
  const mode = raw.mode === "light" ? "light" : "dark";
  const glass =
    raw.glass === "solid" || raw.glass === "regular" || raw.glass === "clear"
      ? raw.glass
      : DEFAULT_APPLE_APPEARANCE.glass;
  return {
    mode,
    glass,
    boldText: raw.boldText === true,
  };
}

export function loadAppleAppearance(): AppleAppearancePrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_APPLE_APPEARANCE };
    return normalizeAppleAppearance(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_APPLE_APPEARANCE };
  }
}

export function saveAppleAppearance(
  patch: Partial<AppleAppearancePrefs>,
): AppleAppearancePrefs {
  const next = normalizeAppleAppearance({
    ...loadAppleAppearance(),
    ...patch,
  });
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  applyAppleAppearanceToDom(next);
  window.dispatchEvent(
    new CustomEvent(APPLE_APPEARANCE_EVENT, { detail: next }),
  );
  return next;
}

/** Map glass level → CSS custom properties on :root. */
export function applyAppleAppearanceToDom(
  prefs: AppleAppearancePrefs = loadAppleAppearance(),
  themeId?: string,
): void {
  const root = document.documentElement;
  root.dataset.appleGlass = prefs.glass;
  root.dataset.appleBold = prefs.boldText ? "1" : "0";

  const id = themeId ?? root.dataset.theme ?? "";
  const isDark =
    id === "apple-dark" || (id !== "apple-light" && prefs.mode === "dark");
  const levels = isDark
    ? {
        solid: {
          bg: "rgba(28, 28, 30, 0.94)",
          blur: "12px",
          saturate: "140%",
          border: "rgba(255, 255, 255, 0.08)",
          highlight: "rgba(255, 255, 255, 0.12)",
        },
        regular: {
          bg: "rgba(28, 28, 30, 0.72)",
          blur: "24px",
          saturate: "180%",
          border: "rgba(255, 255, 255, 0.14)",
          highlight: "rgba(255, 255, 255, 0.22)",
        },
        clear: {
          bg: "rgba(44, 44, 46, 0.48)",
          blur: "36px",
          saturate: "200%",
          border: "rgba(255, 255, 255, 0.2)",
          highlight: "rgba(255, 255, 255, 0.32)",
        },
      }
    : {
        solid: {
          bg: "rgba(255, 255, 255, 0.94)",
          blur: "12px",
          saturate: "140%",
          border: "rgba(60, 60, 67, 0.12)",
          highlight: "rgba(255, 255, 255, 0.7)",
        },
        regular: {
          bg: "rgba(255, 255, 255, 0.72)",
          blur: "24px",
          saturate: "180%",
          border: "rgba(60, 60, 67, 0.18)",
          highlight: "rgba(255, 255, 255, 0.85)",
        },
        clear: {
          bg: "rgba(255, 255, 255, 0.48)",
          blur: "36px",
          saturate: "200%",
          border: "rgba(60, 60, 67, 0.22)",
          highlight: "rgba(255, 255, 255, 0.95)",
        },
      };

  const g = levels[prefs.glass];
  root.style.setProperty("--apple-glass-bg", g.bg);
  root.style.setProperty("--apple-glass-blur", g.blur);
  root.style.setProperty("--apple-glass-saturate", g.saturate);
  root.style.setProperty("--apple-glass-border", g.border);
  root.style.setProperty("--apple-glass-highlight", g.highlight);
  root.style.setProperty(
    "--apple-font-weight",
    prefs.boldText ? "600" : "400",
  );
}

export function isAppleThemeId(id: string): boolean {
  return id === "apple-light" || id === "apple-dark";
}

export function appleThemeIdForMode(mode: "light" | "dark"): "apple-light" | "apple-dark" {
  return mode === "light" ? "apple-light" : "apple-dark";
}
