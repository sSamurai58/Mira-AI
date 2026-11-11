export type ThemeId =
  | "deep-sea-neon"
  | "volcanic-ash"
  | "arctic-neon"
  | "neural-network"
  | "digital-pulse"
  | "cyber-moss"
  | "tech-noir"
  | "cyber-punch"
  | "noir-gold"
  | "midnight-neon"
  | "neon-synth"
  | "void-orchid"
  | "signal-spectrum"
  | "neon-lux";

export type ThemeTokens = {
  bg: string;
  bgElevated: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentFg: string;
  danger: string;
  warning: string;
  success: string;
  terminalBg: string;
  terminalFg: string;
};

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  tokens: ThemeTokens;
};

const baseDanger = {
  danger: "#F87171",
  warning: "#FBBF24",
  success: "#34D399",
};

export const THEMES: ThemeDefinition[] = [
  {
    id: "deep-sea-neon",
    name: "Deep Sea Neon",
    tokens: {
      bg: "#000814",
      bgElevated: "#001D3D",
      border: "#003566",
      text: "#F8FAFC",
      textMuted: "#94A3B8",
      accent: "#FFC300",
      accentFg: "#000814",
      ...baseDanger,
      terminalBg: "#000814",
      terminalFg: "#F8FAFC",
    },
  },
  {
    id: "volcanic-ash",
    name: "Volcanic Ash",
    tokens: {
      bg: "#212529",
      bgElevated: "#2C3035",
      border: "#8338EC66",
      text: "#E9ECEF",
      textMuted: "#ADB5BD",
      accent: "#FB5607",
      accentFg: "#FFFFFF",
      danger: "#FB5607",
      warning: "#FBBF24",
      success: "#8338EC",
      terminalBg: "#212529",
      terminalFg: "#E9ECEF",
    },
  },
  {
    id: "arctic-neon",
    name: "Arctic Neon",
    tokens: {
      bg: "#03045E",
      bgElevated: "#0077B6",
      border: "#00B4D8",
      text: "#F0F9FF",
      textMuted: "#90E0EF",
      accent: "#00B4D8",
      accentFg: "#03045E",
      ...baseDanger,
      terminalBg: "#03045E",
      terminalFg: "#F0F9FF",
    },
  },
  {
    id: "neural-network",
    name: "Neural Network",
    tokens: {
      bg: "#0F172A",
      bgElevated: "#1E293B",
      border: "#6366F1",
      text: "#FFFFFF",
      textMuted: "#94A3B8",
      accent: "#22D3EE",
      accentFg: "#0F172A",
      ...baseDanger,
      terminalBg: "#0F172A",
      terminalFg: "#FFFFFF",
    },
  },
  {
    id: "digital-pulse",
    name: "Digital Pulse",
    tokens: {
      bg: "#0F172A",
      bgElevated: "#2E1065",
      border: "#DDD6FE44",
      text: "#DDD6FE",
      textMuted: "#A78BFA",
      accent: "#F472B6",
      accentFg: "#0F172A",
      ...baseDanger,
      terminalBg: "#0F172A",
      terminalFg: "#DDD6FE",
    },
  },
  {
    id: "cyber-moss",
    name: "Cyber Moss",
    tokens: {
      bg: "#1A1A1A",
      bgElevated: "#243024",
      border: "#386641",
      text: "#F2F2F2",
      textMuted: "#A3A3A3",
      accent: "#D7FF44",
      accentFg: "#1A1A1A",
      ...baseDanger,
      terminalBg: "#1A1A1A",
      terminalFg: "#F2F2F2",
    },
  },
  {
    id: "tech-noir",
    name: "Tech Noir",
    tokens: {
      bg: "#111111",
      bgElevated: "#1F2937",
      border: "#4B5563",
      text: "#D1D5DB",
      textMuted: "#9CA3AF",
      accent: "#DC2626",
      accentFg: "#FFFFFF",
      ...baseDanger,
      terminalBg: "#111111",
      terminalFg: "#D1D5DB",
    },
  },
  {
    id: "cyber-punch",
    name: "Cyber Punch",
    tokens: {
      bg: "#121212",
      bgElevated: "#1C1C1C",
      border: "#333333",
      text: "#FFFFFF",
      textMuted: "#A3A3A3",
      accent: "#FFD000",
      accentFg: "#121212",
      danger: "#FF0022",
      warning: "#FBBF24",
      success: "#34D399",
      terminalBg: "#121212",
      terminalFg: "#FFFFFF",
    },
  },
  {
    id: "noir-gold",
    name: "Noir Gold",
    tokens: {
      bg: "#19171B",
      bgElevated: "#252628",
      border: "#5D0018",
      text: "#F5F5F4",
      textMuted: "#A8A29E",
      accent: "#D29F22",
      accentFg: "#19171B",
      ...baseDanger,
      terminalBg: "#19171B",
      terminalFg: "#F5F5F4",
    },
  },
  {
    id: "midnight-neon",
    name: "Midnight Neon",
    tokens: {
      bg: "#091221",
      bgElevated: "#0D1F3C",
      border: "#0585E6",
      text: "#E0F2FE",
      textMuted: "#7DD3FC",
      accent: "#0585E6",
      accentFg: "#091221",
      ...baseDanger,
      terminalBg: "#091221",
      terminalFg: "#E0F2FE",
    },
  },
  {
    id: "neon-synth",
    name: "Neon Synth",
    tokens: {
      bg: "#0B0E14",
      bgElevated: "#1A1028",
      border: "#D403E166",
      text: "#F8FAFC",
      textMuted: "#C4B5FD",
      accent: "#09FBFF",
      accentFg: "#0B0E14",
      ...baseDanger,
      terminalBg: "#0B0E14",
      terminalFg: "#F8FAFC",
    },
  },
  {
    id: "void-orchid",
    name: "Void Orchid",
    tokens: {
      bg: "#040607",
      bgElevated: "#1A1220",
      border: "#4928C2",
      text: "#E3D9FC",
      textMuted: "#C4B5FD",
      accent: "#BF40FA",
      accentFg: "#040607",
      ...baseDanger,
      terminalBg: "#040607",
      terminalFg: "#E3D9FC",
    },
  },
  {
    id: "signal-spectrum",
    name: "Signal Spectrum",
    tokens: {
      bg: "#06070A",
      bgElevated: "#12141A",
      border: "#AEB6C2",
      text: "#F5F7FF",
      textMuted: "#AEB6C2",
      accent: "#3D5AFE",
      accentFg: "#F5F7FF",
      danger: "#FF2FA3",
      warning: "#FF8A1E",
      success: "#34D399",
      terminalBg: "#06070A",
      terminalFg: "#F5F7FF",
    },
  },
  {
    id: "neon-lux",
    name: "Neon Lux",
    tokens: {
      bg: "#0D0303",
      bgElevated: "#1A0A0A",
      border: "#BBEF1F44",
      text: "#EFF8FF",
      textMuted: "#A8B8C4",
      accent: "#BBEF1F",
      accentFg: "#0D0303",
      ...baseDanger,
      terminalBg: "#0D0303",
      terminalFg: "#EFF8FF",
    },
  },
];

export const DEFAULT_THEME_ID: ThemeId = "deep-sea-neon";

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function applyTheme(id: ThemeId): void {
  const theme = getTheme(id);
  const root = document.documentElement;
  const { tokens } = theme;
  root.style.setProperty("--bg", tokens.bg);
  root.style.setProperty("--bg-elevated", tokens.bgElevated);
  root.style.setProperty("--border", tokens.border);
  root.style.setProperty("--text", tokens.text);
  root.style.setProperty("--text-muted", tokens.textMuted);
  root.style.setProperty("--accent", tokens.accent);
  root.style.setProperty("--accent-fg", tokens.accentFg);
  root.style.setProperty("--danger", tokens.danger);
  root.style.setProperty("--warning", tokens.warning);
  root.style.setProperty("--success", tokens.success);
  root.style.setProperty("--terminal-bg", tokens.terminalBg);
  root.style.setProperty("--terminal-fg", tokens.terminalFg);
  // Derived HUD tokens from the active theme (no hardcoded neon palette)
  root.style.setProperty(
    "--track",
    mixHex(tokens.border, tokens.bgElevated, 0.45) ?? tokens.border,
  );
  root.style.setProperty(
    "--panel-line",
    `color-mix(in srgb, ${tokens.accent} 26%, transparent)`,
  );
  root.dataset.theme = theme.id;
  localStorage.setItem("mira.theme", theme.id);
}

function mixHex(a: string, b: string, t: number): string | null {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return null;
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  const to = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to(m(pa[0], pb[0]))}${to(m(pa[1], pb[1]))}${to(m(pa[2], pb[2]))}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (h.length === 6) {
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  }
  if (h.length === 8) {
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

export function loadStoredThemeId(): ThemeId {
  const raw = localStorage.getItem("mira.theme");
  if (raw && THEMES.some((t) => t.id === raw)) return raw as ThemeId;
  return DEFAULT_THEME_ID;
}
