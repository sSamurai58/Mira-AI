import type { ReactNode } from "react";
import type { AppPathKind } from "../pathsLocal";

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
 * Filled, high-contrast app tiles for Workshop → Пути cards.
 * Decorative UI only — simplified geometries, not trademark endorsement.
 */
export function AppPathIcon({ id, size = 36 }: Props) {
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
    case "chrome":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#202124" />
          <circle cx="12" cy="12" r="9" fill="#EA4335" />
          <path fill="#FBBC04" d="M12 12 18.9 7.2A9 9 0 0 1 20.8 14.5H12Z" />
          <path fill="#34A853" d="M12 12 5.1 7.2A9 9 0 0 0 12 21V12Z" />
          <path fill="#4285F4" d="M12 12 5.1 7.2h13.8L12 12Z" />
          <circle cx="12" cy="12" r="3.6" fill="#fff" />
          <circle cx="12" cy="12" r="2.2" fill="#4285F4" />
        </svg>
      );
    case "discord":
      return (
        <Frame bg="#5865F2">
          <path
            fill="#fff"
            d="M18.6 6.3A14.5 14.5 0 0 0 15.2 5l-.3.6a13.3 13.3 0 0 0-5.8 0L8.8 5a14.4 14.4 0 0 0-3.4 1.3C2.9 10.1 2.3 13.8 2.6 17.5A14.6 14.6 0 0 0 7 19.7l.7-1.1a9.5 9.5 0 0 1-1.5-.7l.3-.3c2.9 1.3 6 1.3 8.8 0l.3.3c-.5.3-1 .5-1.5.7l.7 1.1a14.5 14.5 0 0 0 4.4-2.2c.4-4-.7-7.6-2.6-11.2ZM9.5 14.8c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Zm5 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Z"
          />
        </Frame>
      );
    case "edge":
      return (
        <Frame bg="#0078D7">
          <path
            fill="#fff"
            d="M12.2 3.2c-3.2 0-6 1.7-7.5 4.3 2.4-2.1 5.6-2.6 8-1.2 1.9 1.1 3 3 3 5.2 0 .4 0 .8-.1 1.2H5.2c.3 4.2 3.6 7.1 7.6 7.1 2.6 0 4.6-1 5.9-2.6A7.6 7.6 0 0 0 20.4 12c0-4.7-3.5-8.8-8.2-8.8Zm-5.4 9.3h9.1c-.2-2.3-1.9-3.9-4.3-3.9-2.3 0-4.2 1.5-4.8 3.9Z"
          />
          <path
            fill="#36C5F0"
            opacity="0.85"
            d="M4.6 11.8c.7-3.3 3.4-5.6 6.8-5.6 1.4 0 2.7.4 3.8 1.2-2.5-1.8-6.1-1.5-8.4.9-.9 1-1.5 2.2-1.8 3.5h-.4Z"
          />
        </Frame>
      );
    case "excel":
      return (
        <Frame bg="#107C41">
          <rect x="10.5" y="4.5" width="9.5" height="15" rx="1.2" fill="#fff" />
          <path
            fill="#21A366"
            d="M4 7.2h8.2v9.6H4A1.2 1.2 0 0 1 2.8 15.6V8.4A1.2 1.2 0 0 1 4 7.2Z"
          />
          <path
            fill="#fff"
            d="m6.1 9.4 1.7 2.6 1.7-2.6h1.35l-2.35 3.3 2.45 3.5H9.55L7.8 13.6l-1.75 2.6H4.7l2.45-3.5-2.35-3.3H6.1Z"
          />
          <path stroke="#107C41" strokeWidth="0.7" d="M12.5 9.5h6M12.5 12h6M12.5 14.5h6" />
        </Frame>
      );
    case "firefox":
      return (
        <Frame bg="#20123A">
          <circle cx="12" cy="12.2" r="7.6" fill="#FF7139" />
          <path
            fill="#FF9851"
            d="M12 4.6c2.8 0 4.6 1.4 5.5 2.6-.9-.3-2-.4-3.2-.2-2.4.4-4.3 2-5 4.2-.5 1.5-.3 3 .6 4.1-2.1-1.3-3.2-3.6-3.2-6.1 0-2.5 1.8-4.6 5.3-4.6Z"
          />
          <path
            fill="#E66000"
            d="M18.4 9.2c.5 1 .7 2.1.6 3.3-.3 3.2-2.8 5.7-6 6.1 2.8-.7 4.6-2.8 4.9-5.4.1-1.1 0-2.1-.4-3-.3-.6-.7-1.1-1.1-1.5.7.1 1.4.3 2 .5Z"
          />
          <circle cx="13.2" cy="12.4" r="3.2" fill="#FFCB6B" />
        </Frame>
      );
    case "notion":
      return (
        <Frame bg="#ffffff">
          <path
            fill="#000"
            d="M6.2 5.2h2.2l.4 1.1h.05c.4-.7 1.1-1.3 2.2-1.3 1.7 0 2.8 1.2 2.8 3.2v8.5h-2.6V9.5c0-.95-.4-1.55-1.2-1.55-.85 0-1.5.65-1.5 1.75v7.9H6.2V5.2Zm9.8-.2c2.3 0 3.9 1.5 3.9 3.7 0 2.5-1.7 3.9-4 3.9h-.85V18.7h-2.6V5h3.55Zm-.75 5.5h.65c1.15 0 1.85-.65 1.85-1.7 0-1-.65-1.6-1.75-1.6h-.75v3.3Z"
          />
        </Frame>
      );
    case "obsidian":
      return (
        <Frame bg="#1E1E2E">
          <path fill="#A78BFA" d="M12 2.8 19.5 10.5 16.2 21H7.8L4.5 10.5 12 2.8Z" />
          <path fill="#7C3AED" d="M12 6.2 16.2 11.5 14.5 18h-5L8 11.5 12 6.2Z" />
          <path fill="#E0D4FF" d="M12 8.5 14.2 12l-1.1 3.8h-2.2L9.8 12 12 8.5Z" />
        </Frame>
      );
    case "photoshop":
      return (
        <Frame bg="#001E36">
          <text
            x="12"
            y="16.2"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#31A8FF"
            fontFamily="Arial, Helvetica, sans-serif"
          >
            Ps
          </text>
        </Frame>
      );
    case "slack":
      return (
        <Frame bg="#4A154B">
          <path fill="#E01E5A" d="M8.5 3.8a1.7 1.7 0 0 0 0 3.4h1.7V5.5A1.7 1.7 0 0 0 8.5 3.8Z" />
          <path fill="#E01E5A" d="M8.5 8.2H3.8a1.7 1.7 0 1 0 0 3.4h4.7a1.7 1.7 0 0 0 0-3.4Z" />
          <path fill="#36C5F0" d="M20.2 8.5a1.7 1.7 0 0 0-3.4 0v1.7h1.7a1.7 1.7 0 0 0 1.7-1.7Z" />
          <path fill="#36C5F0" d="M15.8 8.5v-4.7a1.7 1.7 0 1 0-3.4 0v4.7a1.7 1.7 0 0 0 3.4 0Z" />
          <path fill="#2EB67D" d="M15.5 20.2a1.7 1.7 0 0 0 0-3.4h-1.7v1.7a1.7 1.7 0 0 0 1.7 1.7Z" />
          <path fill="#2EB67D" d="M15.5 15.8h4.7a1.7 1.7 0 1 0 0-3.4h-4.7a1.7 1.7 0 0 0 0 3.4Z" />
          <path fill="#ECB22E" d="M3.8 15.5a1.7 1.7 0 0 0 3.4 0v-1.7H5.5a1.7 1.7 0 0 0-1.7 1.7Z" />
          <path fill="#ECB22E" d="M8.2 15.5v4.7a1.7 1.7 0 1 0 3.4 0v-4.7a1.7 1.7 0 0 0-3.4 0Z" />
        </Frame>
      );
    case "spotify":
      return (
        <Frame bg="#1DB954">
          <circle cx="12" cy="12" r="8.2" fill="#191414" />
          <path
            d="M7.2 10.2c2.8-1 6.2-.8 8.8.6"
            stroke="#1DB954"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M7.6 13c2.3-.8 5.1-.6 7.2.5"
            stroke="#1DB954"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M8 15.6c1.8-.6 3.9-.5 5.5.3"
            stroke="#1DB954"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
          />
        </Frame>
      );
    case "steam":
      return (
        <Frame bg="#1B2838">
          <circle cx="12" cy="12" r="8" fill="#171A21" stroke="#66C0F4" strokeWidth="1.2" />
          <circle cx="15.2" cy="9.2" r="3.1" fill="none" stroke="#66C0F4" strokeWidth="1.5" />
          <circle cx="15.2" cy="9.2" r="1.2" fill="#66C0F4" />
          <path
            d="M13.4 11.4 9.2 14.8a2.2 2.2 0 1 1-2.2-2.2l4.2-2.4"
            fill="none"
            stroke="#c7d5e0"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="7.2" cy="15.6" r="1.1" fill="#c7d5e0" />
        </Frame>
      );
    case "telegram":
      return (
        <Frame bg="#26A5E4">
          <path
            fill="#fff"
            d="M6.2 11.6 17.8 6.8c.55-.22 1.05.14.88.82l-2 9.4c-.14.66-.55.82-1.12.5l-3.1-2.28-1.5 1.44c-.18.18-.33.32-.66.32l.22-3.2 6.05-5.45c.25-.22.05-.34-.28-.14L7.4 12.4l-3.1-.96c-.68-.2-.7-.68.16-1.02l1.74.18Z"
          />
        </Frame>
      );
    case "vlc":
      return (
        <Frame bg="#2A2A2A">
          <path fill="#FF8800" d="M12 3.5 16.8 20.5h-2.4L12 12.8 9.6 20.5H7.2L12 3.5Z" />
          <path fill="#FFB100" d="M12 7.2 14.6 16.8h-1.5L12 11.5l-1.1 5.3H9.4L12 7.2Z" />
        </Frame>
      );
    case "vscode":
      return (
        <Frame bg="#007ACC">
          <path
            fill="#fff"
            d="m4.4 7.4 5.9-3.2c.4-.2.8-.2 1.1 0l7.4 4.2c.5.3.5.9 0 1.2l-7.4 4.2c-.3.2-.7.2-1.1 0L4.4 10.6V7.4Zm0 6.2 5.9 3.2c.4.2.8.2 1.1 0l7.4-4.2V16c0 .3-.2.6-.4.7l-7 3.6c-.3.2-.7.2-1.1 0l-5.9-3.2V13.6Z"
          />
          <path
            fill="#1F9CF0"
            d="m11.4 4.2 7.4 4.2c.5.3.5.9 0 1.2l-7.4 4.2V4.2Z"
            opacity="0.55"
          />
        </Frame>
      );
    case "whatsapp":
      return (
        <Frame bg="#25D366">
          <path
            fill="#fff"
            d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5Zm4.9 12.1c-.2.6-1.2 1.1-1.9 1.2-.5.1-1.1.1-1.8-.1-2.4-.7-5-3.1-5.5-5.4-.2-.7.1-1.4.5-1.7.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.7 1.7c.1.2 0 .4-.2.6l-.4.5c-.1.2-.3.3-.1.6.5.8 1.5 2 2.7 2.6.3.2.5.1.7-.1l.5-.6c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.2.5.5-.1.1 0 .5-.3 1Z"
          />
        </Frame>
      );
    case "word":
      return (
        <Frame bg="#185ABD">
          <rect x="10.5" y="4.5" width="9.5" height="15" rx="1.2" fill="#fff" />
          <path
            fill="#2B7CD3"
            d="M4 7.2h8.2v9.6H4A1.2 1.2 0 0 1 2.8 15.6V8.4A1.2 1.2 0 0 1 4 7.2Z"
          />
          <path
            fill="#fff"
            d="m5.1 9.5 1.15 5.4h1.2l.95-3.7.95 3.7h1.2l1.15-5.4h-1.25l-.7 3.55-.9-3.55H7.95l-.9 3.55-.7-3.55H5.1Z"
          />
          <path stroke="#185ABD" strokeWidth="0.7" d="M12.5 9.5h6M12.5 12h6M12.5 14.5h6" />
        </Frame>
      );
    case "zoom":
      return (
        <Frame bg="#0B5CFF">
          <rect x="3.5" y="7.5" width="11" height="9" rx="2.2" fill="#fff" />
          <path fill="#fff" d="m15.2 10.2 5.3-2.4v8.4l-5.3-2.4Z" />
        </Frame>
      );
    case "notepad":
      return (
        <Frame bg="#F4C430">
          <rect x="6" y="4.5" width="12" height="15" rx="1.4" fill="#FFF8DC" />
          <path stroke="#C9A227" strokeWidth="1.2" d="M8.5 9h7M8.5 12h7M8.5 15h4.5" />
          <rect x="9.5" y="3.2" width="5" height="2.2" rx="0.6" fill="#E8B923" />
        </Frame>
      );
    case "explorer":
      return (
        <Frame bg="#FFB900">
          <path
            fill="#FFE08A"
            d="M4 8.2A1.6 1.6 0 0 1 5.6 6.6h3.2L10.4 8h8A1.6 1.6 0 0 1 20 9.6v7.2A1.6 1.6 0 0 1 18.4 18.4H5.6A1.6 1.6 0 0 1 4 16.8V8.2Z"
          />
          <path fill="#FFF3C4" d="M4 10.2h16v6.6A1.6 1.6 0 0 1 18.4 18.4H5.6A1.6 1.6 0 0 1 4 16.8v-6.6Z" />
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
