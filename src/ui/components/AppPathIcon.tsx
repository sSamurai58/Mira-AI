import type { ReactNode } from "react";
import type { AppPathKind } from "../pathsLocal";
import {
  OfficialBrandIcon,
  type OfficialBrandAsset,
} from "./OfficialBrandIcon";

export type AppPathIconId =
  | "chrome"
  | "discord"
  | "edge"
  | "excel"
  | "firefox"
  | "notion"
  | "obsidian"
  | "photoshop"
  | "slack"
  | "spotify"
  | "steam"
  | "telegram"
  | "vlc"
  | "vscode"
  | "whatsapp"
  | "word"
  | "zoom"
  | "notepad"
  | "explorer"
  | "calculator"
  | "program"
  | "folder"
  | "file";

type Props = {
  id: AppPathIconId;
  size?: number;
};

const ID_ALIASES: Record<string, AppPathIconId> = {
  chrome: "chrome",
  googlechrome: "chrome",
  discord: "discord",
  edge: "edge",
  microsoftedge: "edge",
  msedge: "edge",
  excel: "excel",
  microsoftexcel: "excel",
  firefox: "firefox",
  mozilla: "firefox",
  notion: "notion",
  obsidian: "obsidian",
  photoshop: "photoshop",
  adobephotoshop: "photoshop",
  ps: "photoshop",
  slack: "slack",
  spotify: "spotify",
  steam: "steam",
  telegram: "telegram",
  vlc: "vlc",
  vlcmediaplayer: "vlc",
  vscode: "vscode",
  code: "vscode",
  visualstudiocode: "vscode",
  "visualstudio code": "vscode",
  whatsapp: "whatsapp",
  word: "word",
  microsoftword: "word",
  zoom: "zoom",
  notepad: "notepad",
  блокнот: "notepad",
  explorer: "explorer",
  проводник: "explorer",
  fileexplorer: "explorer",
  calculator: "calculator",
  калькулятор: "calculator",
};

/** Official logos vendored in public/brand-icons/ */
const BRAND_ASSETS: Partial<Record<AppPathIconId, OfficialBrandAsset>> = {
  chrome: { file: "chrome.svg", bg: "#202124", scale: 0.78 },
  discord: { file: "discord.svg", bg: "#5865F2", scale: 0.62 },
  edge: { file: "edge.svg", bg: "#0B1A2A", scale: 0.78 },
  excel: { file: "excel.svg", bg: "#0F3D24", scale: 0.78 },
  firefox: { file: "firefox.svg", bg: "#20123A", scale: 0.82 },
  notion: { file: "notion.svg", bg: "#000000", scale: 0.62 },
  obsidian: { file: "obsidian.svg", bg: "#1E1E2E", scale: 0.78 },
  photoshop: { file: "photoshop.svg", bg: "#001E36", scale: 0.78 },
  slack: { file: "slack.svg", bg: "#4A154B", scale: 0.7 },
  spotify: { file: "spotify.svg", bg: "#191414", scale: 0.72 },
  steam: { file: "steam.svg", bg: "#1B2838", scale: 0.78 },
  telegram: { file: "telegram.svg", bg: "#229ED9", scale: 0.82 },
  vlc: { file: "vlc.png", bg: "#2A2A2A", scale: 0.78 },
  vscode: { file: "vscode.svg", bg: "#1E1E1E", scale: 0.78 },
  whatsapp: { file: "whatsapp.svg", bg: "#075E54", scale: 0.82 },
  word: { file: "word.svg", bg: "#0E2F5A", scale: 0.78 },
  zoom: { file: "zoom.svg", bg: "#0B5CFF", scale: 0.72 },
  explorer: { file: "windows.svg", bg: "#0078D4", scale: 0.62 },
};

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "")
    .replace(/\.exe$/i, "");
}

/** Map a Paths row (stable id or display name) to a brand / kind icon. */
export function resolveAppPathIconId(item: {
  id: string;
  name: string;
  kind: AppPathKind;
}): AppPathIconId {
  const byId = ID_ALIASES[normalizeKey(item.id)];
  if (byId) return byId;
  const byName = ID_ALIASES[normalizeKey(item.name)];
  if (byName) return byName;
  // Loose name contains (e.g. "Google Chrome", "Adobe Photoshop 2024")
  const name = item.name.trim().toLowerCase();
  const loose: Array<[RegExp, AppPathIconId]> = [
    [/chrome/, "chrome"],
    [/discord/, "discord"],
    [/\bedge\b|microsoft edge/, "edge"],
    [/excel/, "excel"],
    [/firefox/, "firefox"],
    [/notion/, "notion"],
    [/obsidian/, "obsidian"],
    [/photoshop|\bps\b/, "photoshop"],
    [/slack/, "slack"],
    [/spotify/, "spotify"],
    [/steam/, "steam"],
    [/telegram|телеграм/, "telegram"],
    [/\bvlc\b/, "vlc"],
    [/vs\s*code|visual studio code|vscode/, "vscode"],
    [/whatsapp|ватсап|вотсап/, "whatsapp"],
    [/\bword\b|ворд/, "word"],
    [/zoom|зум/, "zoom"],
    [/notepad|блокнот/, "notepad"],
    [/explorer|проводн/, "explorer"],
    [/calc|калькулятор/, "calculator"],
  ];
  for (const [re, id] of loose) {
    if (re.test(name)) return id;
  }
  return item.kind;
}

/**
 * App tiles for Workshop → Пути cards.
 * Seeded brands use vendored official logos; system kinds stay generic glyphs.
 */
export function AppPathIcon({ id, size = 36 }: Props) {
  const brand = BRAND_ASSETS[id];
  if (brand) {
    return <OfficialBrandIcon asset={brand} size={size} />;
  }

  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  const Frame = ({
    bg,
    children,
  }: {
    bg: string;
    children: ReactNode;
  }) => (
    <svg {...common}>
      <rect width="24" height="24" rx="6" fill={bg} />
      {children}
    </svg>
  );

  switch (id) {
    case "notepad":
      return (
        <Frame bg="#F4C430">
          <rect x="6" y="4.5" width="12" height="15" rx="1.4" fill="#FFF8DC" />
          <path stroke="#C9A227" strokeWidth="1.2" d="M8.5 9h7M8.5 12h7M8.5 15h4.5" />
          <rect x="9.5" y="3.2" width="5" height="2.2" rx="0.6" fill="#E8B923" />
        </Frame>
      );
    case "calculator":
      return (
        <Frame bg="#3B3B3B">
          <rect x="5.5" y="3.8" width="13" height="16.4" rx="2" fill="#2A2A2A" />
          <rect x="7" y="5.4" width="10" height="3.4" rx="0.8" fill="#1A1A1A" />
          <rect x="7" y="10" width="2.6" height="2.2" rx="0.4" fill="#e5e5e5" />
          <rect x="10.7" y="10" width="2.6" height="2.2" rx="0.4" fill="#e5e5e5" />
          <rect x="14.4" y="10" width="2.6" height="2.2" rx="0.4" fill="#FFC300" />
          <rect x="7" y="13.2" width="2.6" height="2.2" rx="0.4" fill="#e5e5e5" />
          <rect x="10.7" y="13.2" width="2.6" height="2.2" rx="0.4" fill="#e5e5e5" />
          <rect x="14.4" y="13.2" width="2.6" height="2.2" rx="0.4" fill="#FFC300" />
          <rect x="7" y="16.4" width="6.3" height="2.2" rx="0.4" fill="#e5e5e5" />
          <rect x="14.4" y="16.4" width="2.6" height="2.2" rx="0.4" fill="#FFC300" />
        </Frame>
      );
    case "folder":
      return (
        <Frame bg="#1A2A3A">
          <path
            fill="#FFC300"
            d="M4 7.2A1.6 1.6 0 0 1 5.6 5.6h3.1L10.3 7h8.1A1.6 1.6 0 0 1 20 8.6v7.6A1.6 1.6 0 0 1 18.4 17.8H5.6A1.6 1.6 0 0 1 4 16.2V7.2Z"
          />
          <path
            fill="#FFE08A"
            d="M4 9.6h16v6.6A1.6 1.6 0 0 1 18.4 17.8H5.6A1.6 1.6 0 0 1 4 16.2V9.6Z"
          />
        </Frame>
      );
    case "file":
      return (
        <Frame bg="#1A2A3A">
          <path
            fill="#E8F0FF"
            d="M7 3.8h6.2L17.5 8.2V19a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 19V5A1.2 1.2 0 0 1 7 3.8Z"
          />
          <path fill="#FFC300" d="M13.2 3.8V8.2h4.3" />
        </Frame>
      );
    case "program":
    default:
      return (
        <Frame bg="#001D3D">
          <rect
            x="4.5"
            y="5"
            width="15"
            height="10.5"
            rx="1.6"
            fill="#003566"
            stroke="#FFC300"
            strokeWidth="1.6"
          />
          <rect x="6.2" y="6.6" width="11.6" height="7.4" rx="0.6" fill="#000814" />
          <circle cx="12" cy="10.2" r="1.5" fill="#FFC300" />
          <path
            d="M8.5 18.2h7"
            stroke="#FFC300"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </Frame>
      );
  }
}
