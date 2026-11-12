import type { McpIconId } from "../mcp/catalog";

/** Compact brand mark for MCP tiles (simplified monograms, not official trademarks). */
export function McpBrandIcon(props: {
  id: McpIconId;
  color: string;
  size?: number;
}) {
  const size = props.size ?? 28;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    "aria-hidden": true as const,
  };
  const fill = props.color;

  switch (props.id) {
    case "todoist":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M9 16.2l4.2 4.2L23 10.5"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "linear":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path d="M8 22 L22 8 L24 10 L10 24 Z" fill="#fff" />
        </svg>
      );
    case "notion":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#111" />
          <path
            d="M11 8h7l5 16h-3.2l-1-3.4h-5.6L12.2 24H9L11 8zm3.1 10.2h3.7L16 12.4l-1.9 5.8z"
            fill="#fff"
          />
        </svg>
      );
    case "asana":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <circle cx="16" cy="11" r="3.2" fill="#fff" />
          <circle cx="10.5" cy="20" r="3.2" fill="#fff" />
          <circle cx="21.5" cy="20" r="3.2" fill="#fff" />
        </svg>
      );
    case "clickup":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M8 14l8 8 8-8"
            fill="none"
            stroke="#fff"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "jira":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path d="M16 6l8 10-8 10-8-10 8-10z" fill="#fff" opacity="0.95" />
          <path d="M16 12l4 4-4 4-4-4 4-4z" fill={fill} />
        </svg>
      );
    case "ms-todo":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M8 16l5 5 11-12"
            fill="none"
            stroke="#083"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "ticktick":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M9 16l5 5 10-11"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "gcal":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#fff" />
          <rect x="6" y="8" width="20" height="18" rx="3" fill={fill} />
          <rect x="6" y="8" width="20" height="5" fill="#1A73E8" />
          <text x="16" y="23" textAnchor="middle" fontSize="10" fill="#fff" fontFamily="system-ui">
            31
          </text>
        </svg>
      );
    case "outlook":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <rect x="7" y="9" width="18" height="14" rx="2" fill="#fff" />
          <path d="M7 11l9 7 9-7" fill="none" stroke={fill} strokeWidth="1.8" />
        </svg>
      );
    case "apple-cal":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#fff" />
          <rect x="6" y="7" width="20" height="19" rx="3" fill="#F2F2F7" />
          <rect x="6" y="7" width="20" height="6" fill={fill} />
          <circle cx="11" cy="10" r="1.2" fill="#fff" />
          <circle cx="21" cy="10" r="1.2" fill="#fff" />
        </svg>
      );
    case "calendly":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <circle cx="16" cy="16" r="8" fill="none" stroke="#fff" strokeWidth="2.2" />
          <path d="M16 10v7l4 2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "toggl":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <circle cx="16" cy="17" r="7" fill="none" stroke="#fff" strokeWidth="2.2" />
          <path d="M16 8v5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case "gmail":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#fff" />
          <path d="M6 10l10 8 10-8v12H6V10z" fill={fill} />
          <path d="M6 10l10 8 10-8" fill="none" stroke="#fff" strokeWidth="1.6" />
        </svg>
      );
    case "slack":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#4A154B" />
          <rect x="13" y="7" width="3.2" height="10" rx="1.5" fill="#E01E5A" />
          <rect x="7" y="13" width="10" height="3.2" rx="1.5" fill="#36C5F0" />
          <rect x="15.8" y="15" width="3.2" height="10" rx="1.5" fill="#2EB67D" />
          <rect x="15" y="15.8" width="10" height="3.2" rx="1.5" fill="#ECB22E" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path d="M8 15.5l16-6-3.5 14-5-3.5-3 3-0.5-5.5L20 12z" fill="#fff" />
        </svg>
      );
    case "discord":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M10 12c2-2 10-2 12 0 1 4 1 8-1 10-1-1-2-1.5-3-2 1-.3 2-1 2.5-2-2 1-4 1.5-6.5 1.5S10 17 8 16c.5 1 1.5 1.7 2.5 2-1 .5-2 1-3 2-2-2-2-6-1-10z"
            fill="#fff"
          />
          <circle cx="13" cy="16" r="1.3" fill={fill} />
          <circle cx="19" cy="16" r="1.3" fill={fill} />
        </svg>
      );
    case "teams":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <rect x="8" y="12" width="10" height="10" rx="2" fill="#fff" />
          <circle cx="22" cy="11" r="3" fill="#fff" />
          <rect x="18" y="14" width="7" height="8" rx="2" fill="#fff" opacity="0.85" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M16 7a9 9 0 00-7.7 13.5L7 25l4.7-1.2A9 9 0 1016 7zm4.6 12.3c-.2.6-1.2 1.1-1.9 1.2-.5.1-1.1.1-1.8-.1-1.1-.3-2.5-.9-3.7-2.1-2.2-2.1-2.8-3.7-3-4.3-.2-.6.1-1.2.4-1.5.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .5.4l.8 1.9c.1.2 0 .4-.1.6l-.3.4c-.1.2-.3.4-.1.7.2.3.7 1.2 1.6 1.9 1.1.9 2 1.2 2.3 1.3.3.1.5.1.7-.1l.5-.6c.2-.2.4-.2.6-.1l1.8.8c.2.1.4.2.4.4 0 .1 0 .6-.4 1.1z"
            fill="#fff"
          />
        </svg>
      );
    case "obsidian":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#1A1A2E" />
          <path d="M16 6l8 8-3 12h-10l-3-12 8-8z" fill={fill} />
          <path d="M16 10l4 5-1.5 8h-5L12 15l4-5z" fill="#C4B5FD" />
        </svg>
      );
    case "apple-notes":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <rect x="8" y="7" width="16" height="18" rx="2" fill="#FFF8DC" />
          <path d="M10 12h12M10 16h12M10 20h8" stroke="#B8860B" strokeWidth="1.4" />
        </svg>
      );
    case "bear":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <circle cx="11" cy="12" r="3" fill="#fff" />
          <circle cx="21" cy="12" r="3" fill="#fff" />
          <ellipse cx="16" cy="19" rx="7" ry="6" fill="#fff" />
          <circle cx="13.5" cy="18" r="1" fill={fill} />
          <circle cx="18.5" cy="18" r="1" fill={fill} />
        </svg>
      );
    case "logseq":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#0B1C2D" />
          <circle cx="10" cy="12" r="2.5" fill={fill} />
          <circle cx="22" cy="12" r="2.5" fill={fill} />
          <circle cx="16" cy="22" r="2.5" fill={fill} />
          <path d="M12 13l3 7M20 13l-3 7M12 12h8" stroke={fill} strokeWidth="1.5" />
        </svg>
      );
    case "mem":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <text
            x="16"
            y="21"
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill="#fff"
            fontFamily="system-ui"
          >
            M
          </text>
        </svg>
      );
    case "gsheets":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <rect x="8" y="7" width="16" height="18" rx="2" fill="#fff" />
          <path d="M8 13h16M8 19h16M16 7v18" stroke={fill} strokeWidth="1.4" />
        </svg>
      );
    case "excel":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <text
            x="16"
            y="21"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#fff"
            fontFamily="system-ui"
          >
            X
          </text>
        </svg>
      );
    case "gdocs":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <rect x="9" y="6" width="14" height="20" rx="2" fill="#fff" />
          <path d="M12 12h8M12 16h8M12 20h5" stroke={fill} strokeWidth="1.4" />
        </svg>
      );
    case "airtable":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#fff" />
          <path d="M6 22 L16 6l10 16H6z" fill={fill} />
          <circle cx="16" cy="18" r="3" fill="#18BFFF" />
        </svg>
      );
    case "onedrive":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M10 20c-2 0-4-1.5-4-3.5S8 13 10 13c.3-2.5 2.5-4 5-4 2.2 0 4 1.2 4.7 3C22 12 24 13.5 24 16c0 2-1.8 4-5 4H10z"
            fill="#fff"
          />
        </svg>
      );
    case "hubspot":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <circle cx="16" cy="18" r="5" fill="#fff" />
          <path d="M16 7v6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="22" cy="12" r="2.2" fill="#fff" />
        </svg>
      );
    case "salesforce":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M12 14c0-2 1.5-3.5 3.5-3.5 1 0 1.8.3 2.4.9A3.5 3.5 0 0122 15.5c0 2.2-1.8 4-4.2 4H12.5C10 19.5 8 17.6 8 15.2c0-2 1.4-3.5 3.2-3.8.2.9.5 1.7.8 2.6z"
            fill="#fff"
          />
        </svg>
      );
    case "amocrm":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <text
            x="16"
            y="21"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="#fff"
            fontFamily="system-ui"
          >
            amo
          </text>
        </svg>
      );
    case "bitrix":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <text
            x="16"
            y="21"
            textAnchor="middle"
            fontSize="14"
            fontWeight="700"
            fill="#fff"
            fontFamily="system-ui"
          >
            B
          </text>
        </svg>
      );
    case "stripe":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M13 12c0-1.2 1-1.7 2.6-1.7 2.4 0 3.4.8 3.4 2.6v7.6h-3.1v-7c0-.8-.4-1.1-1.1-1.1-.8 0-1.8.4-1.8 1.8v6.3H10V12.2C10.8 11.7 11.9 12 13 12z"
            fill="#fff"
          />
        </svg>
      );
    case "chrome":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#fff" />
          <circle cx="16" cy="16" r="10" fill="none" stroke="#EA4335" strokeWidth="3" />
          <circle cx="16" cy="16" r="4" fill={fill} />
          <path d="M16 6l5 9H11L16 6z" fill="#FBBC05" />
          <path d="M6.5 22.5 L16 16l5 9z" fill="#34A853" opacity="0.9" />
        </svg>
      );
    case "firefox":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#1E1E2E" />
          <circle cx="16" cy="17" r="8" fill={fill} />
          <path d="M10 14c3-4 10-4 13 1-2 5-8 7-12 4 1-1 2-2 2-4z" fill="#FFD08A" />
        </svg>
      );
    case "edge":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M8 18c1-6 8-10 14-7-1 5-5 7-10 7H8zm4 2c3 3 10 2 12-3-4 1-7 1-10 0l-2 3z"
            fill="#fff"
          />
        </svg>
      );
    case "raindrop":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path d="M16 6c5 6 8 10 8 14a8 8 0 11-16 0c0-4 3-8 8-14z" fill="#fff" />
        </svg>
      );
    case "pocket":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill={fill} />
          <path
            d="M8 10h16v6c0 5-3.5 9-8 9s-8-4-8-9v-6z"
            fill="#fff"
          />
          <path
            d="M12 15l4 4 4-4"
            fill="none"
            stroke={fill}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="8" fill="#555" />
        </svg>
      );
  }
}
