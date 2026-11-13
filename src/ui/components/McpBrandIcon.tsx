import type { ReactNode } from "react";
import type { McpIconId } from "../mcp/catalog";
import {
  OfficialBrandIcon,
  type OfficialBrandAsset,
} from "./OfficialBrandIcon";

type IconProps = { id: McpIconId; color: string; size?: number };

/** Official logos vendored in public/brand-icons/ */
const BRAND_ASSETS: Partial<Record<McpIconId, OfficialBrandAsset>> = {
  todoist: { file: "todoist.svg", bg: "#1A0A08", scale: 0.72 },
  linear: { file: "linear.svg", bg: "#5E6AD2", scale: 0.62 },
  notion: { file: "notion.svg", bg: "#000000", scale: 0.62 },
  asana: { file: "asana.svg", bg: "#FFFFFF", scale: 0.72 },
  clickup: { file: "clickup.svg", bg: "#1B1140", scale: 0.72 },
  jira: { file: "jira.svg", bg: "#0B1A2A", scale: 0.72 },
  "ms-todo": { file: "ms-todo.png", bg: "#2564CF", scale: 0.78 },
  ticktick: { file: "ticktick.svg", bg: "#4772FA", scale: 0.62 },
  gcal: { file: "gcal.svg", bg: "#FFFFFF", scale: 0.82 },
  outlook: { file: "outlook.svg", bg: "#0B1A2A", scale: 0.78 },
  "apple-cal": { file: "apple.svg", bg: "#F2F2F7", scale: 0.58 },
  calendly: { file: "calendly.svg", bg: "#006BFF", scale: 0.62 },
  toggl: { file: "toggl.svg", bg: "#E57CD8", scale: 0.62 },
  gmail: { file: "gmail.svg", bg: "#FFFFFF", scale: 0.78 },
  slack: { file: "slack.svg", bg: "#4A154B", scale: 0.7 },
  telegram: { file: "telegram.svg", bg: "#229ED9", scale: 0.82 },
  discord: { file: "discord.svg", bg: "#5865F2", scale: 0.62 },
  teams: { file: "teams.svg", bg: "#2B2F7A", scale: 0.78 },
  whatsapp: { file: "whatsapp.svg", bg: "#075E54", scale: 0.82 },
  obsidian: { file: "obsidian.svg", bg: "#1E1E2E", scale: 0.78 },
  "apple-notes": { file: "apple.svg", bg: "#FFD60A", scale: 0.55 },
  bear: { file: "bear.png", bg: "#C65E4A", scale: 0.78 },
  logseq: { file: "logseq.svg", bg: "#002B36", scale: 0.62 },
  github: { file: "github.svg", bg: "#24292F", scale: 0.72 },
  gitlab: { file: "gitlab.svg", bg: "#171321", scale: 0.72 },
  vscode: { file: "vscode.svg", bg: "#1E1E1E", scale: 0.78 },
  docker: { file: "docker.svg", bg: "#2496ED", scale: 0.72 },
  sentry: { file: "sentry.svg", bg: "#362D59", scale: 0.62 },
  vercel: { file: "vercel.svg", bg: "#000000", scale: 0.55 },
  figma: { file: "figma.svg", bg: "#1E1E1E", scale: 0.72 },
  blender: { file: "blender.svg", bg: "#1D1D1D", scale: 0.78 },
  canva: { file: "canva.svg", bg: "#00C4CC", scale: 0.62 },
  miro: { file: "miro.svg", bg: "#050038", scale: 0.72 },
  excalidraw: { file: "excalidraw.svg", bg: "#6965DB", scale: 0.62 },
  gsheets: { file: "gsheets.svg", bg: "#0F9D58", scale: 0.62 },
  excel: { file: "excel.svg", bg: "#0F3D24", scale: 0.78 },
  gdocs: { file: "gdocs.svg", bg: "#4285F4", scale: 0.62 },
  airtable: { file: "airtable.svg", bg: "#FFFFFF", scale: 0.72 },
  onedrive: { file: "onedrive.svg", bg: "#0B1A2A", scale: 0.72 },
  hubspot: { file: "hubspot.svg", bg: "#FFFFFF", scale: 0.72 },
  salesforce: { file: "salesforce.svg", bg: "#00A1E0", scale: 0.72 },
  amocrm: { file: "amocrm.png", bg: "#4C8BF5", scale: 0.78 },
  bitrix: { file: "bitrix.png", bg: "#2FC6F6", scale: 0.78 },
  stripe: { file: "stripe.svg", bg: "#635BFF", scale: 0.72 },
  chrome: { file: "chrome.svg", bg: "#202124", scale: 0.78 },
  firefox: { file: "firefox.svg", bg: "#20123A", scale: 0.82 },
  edge: { file: "edge.svg", bg: "#0B1A2A", scale: 0.78 },
  raindrop: { file: "raindrop.png", bg: "#0A64FF", scale: 0.78 },
  pocket: { file: "pocket.svg", bg: "#EF4056", scale: 0.62 },
};

/**
 * MCP connector brand marks — vendored official logos where available.
 * Falls back to a simple monogram tile for unknown / niche ids (e.g. mem).
 */
export function McpBrandIcon({ id, color, size = 28 }: IconProps) {
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

  // Niche / no reliable official asset yet
  switch (id) {
    case "mem":
      return (
        <Frame bg="#111">
          <text
            x="12"
            y="15.5"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="#fff"
            fontFamily="Arial,sans-serif"
          >
            Mem
          </text>
        </Frame>
      );
    default:
      return (
        <Frame bg={color || "#555"}>
          <circle cx="12" cy="12" r="3" fill="#fff" />
        </Frame>
      );
  }
}
