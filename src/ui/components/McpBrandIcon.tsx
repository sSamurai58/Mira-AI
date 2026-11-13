import type { ReactNode } from "react";
import type { McpIconId } from "../mcp/catalog";

type IconProps = { id: McpIconId; color: string; size?: number };

/**
 * Recognizable brand marks (simplified official geometries / Simple Icons–style).
 * Decorative UI only — not trademark endorsement.
 */
export function McpBrandIcon({ id, color, size = 28 }: IconProps) {
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
    case "todoist":
      return (
        <Frame bg={color}>
          <path
            fill="#fff"
            d="M12 1.5A10.5 10.5 0 1 0 22.5 12 10.51 10.51 0 0 0 12 1.5Zm-1.06 14.2-3.54-3.54 1.28-1.28 2.26 2.26 5.18-5.18 1.28 1.28Z"
          />
        </Frame>
      );
    case "linear":
      return (
        <Frame bg={color}>
          <path
            fill="#fff"
            d="M2.86 12.75a9.14 9.14 0 0 0 8.39 8.39L2.86 12.75Zm3.1-4.84 10.13 10.13a9.14 9.14 0 0 0 1.64-2.48L8.44 5.27a9.2 9.2 0 0 0-2.48 1.64ZM12.75 2.86 21.14 11.25A9.14 9.14 0 0 0 12.75 2.86Z"
          />
        </Frame>
      );
    case "notion":
      return (
        <Frame bg="#ffffff">
          <path
            fill="#000"
            d="M4.5 4.2h2.1l.35 1.1h.05c.4-.7 1.15-1.3 2.25-1.3 1.7 0 2.85 1.2 2.85 3.25V16.8H9.4V8.55c0-.95-.4-1.55-1.25-1.55-.85 0-1.5.65-1.5 1.75V16.8H4.5V4.2Zm10.2-.2c2.35 0 3.95 1.5 3.95 3.75 0 2.55-1.75 3.95-4.05 3.95h-.85V16.8h-2.65V4H14.7Zm-.75 5.55h.65c1.15 0 1.85-.65 1.85-1.7 0-1-.65-1.6-1.75-1.6h-.75v3.3Z"
          />
        </Frame>
      );
    case "asana":
      return (
        <Frame bg="#F06A6A">
          <circle cx="12" cy="7.2" r="2.6" fill="#fff" />
          <circle cx="7.2" cy="15.4" r="2.6" fill="#fff" />
          <circle cx="16.8" cy="15.4" r="2.6" fill="#fff" />
        </Frame>
      );
    case "clickup":
      return (
        <Frame bg="#7B68EE">
          <path
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 11.5 12 18l7-6.5"
          />
          <path
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.55"
            d="M7.5 8.5 12 12.5 16.5 8.5"
          />
        </Frame>
      );
    case "jira":
      return (
        <Frame bg="#2684FF">
          <path
            fill="#fff"
            d="M12.2 3.2 20.8 12l-8.6 8.8L3.6 12l8.6-8.8Zm0 4.4L8 12l4.2 4.4L16.4 12 12.2 7.6Z"
          />
        </Frame>
      );
    case "ms-todo":
      return (
        <Frame bg="#2564CF">
          <path
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m5.5 12 4 4 9-10"
          />
        </Frame>
      );
    case "ticktick":
      return (
        <Frame bg="#4772FA">
          <path
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m5.5 12.2 4.2 4.2L18.5 7.5"
          />
        </Frame>
      );
    case "gcal":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#fff" />
          <path fill="#1A73E8" d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v3H3.5V6A1.5 1.5 0 0 1 5 4.5Z" />
          <path fill="#EA4335" d="M3.5 9.5H9v11H5A1.5 1.5 0 0 1 3.5 19Z" />
          <path fill="#34A853" d="M15 9.5h5.5V19a1.5 1.5 0 0 1-1.5 1.5h-4Z" />
          <path fill="#FBBC04" d="M9 15.5h6V20.5H9Z" />
          <path fill="#4285F4" d="M9 9.5h6v6H9Z" />
          <text x="12" y="17.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff" fontFamily="Arial,sans-serif">
            31
          </text>
        </svg>
      );
    case "outlook":
      return (
        <Frame bg="#0078D4">
          <rect x="4" y="6" width="16" height="12" rx="1.5" fill="#fff" />
          <path d="M4 8.2 12 14l8-5.8" fill="none" stroke="#0078D4" strokeWidth="1.6" />
        </Frame>
      );
    case "apple-cal":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#F2F2F7" />
          <path fill="#FF3B30" d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v3.2H2.5V7A1.5 1.5 0 0 1 4 5.5Z" />
          <circle cx="7.5" cy="7.2" r="0.9" fill="#fff" />
          <circle cx="16.5" cy="7.2" r="0.9" fill="#fff" />
          <text x="12" y="17.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#1C1C1E" fontFamily="Arial,sans-serif">
            12
          </text>
        </svg>
      );
    case "calendly":
      return (
        <Frame bg="#006BFF">
          <circle cx="12" cy="12" r="7" fill="none" stroke="#fff" strokeWidth="1.8" />
          <path d="M12 7.5v5.2l3.2 1.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </Frame>
      );
    case "toggl":
      return (
        <Frame bg="#E57CD8">
          <circle cx="12" cy="13" r="6.2" fill="none" stroke="#fff" strokeWidth="1.8" />
          <path d="M12 4.8v4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </Frame>
      );
    case "gmail":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#fff" />
          <path fill="#EA4335" d="M3.5 6.5 12 13l8.5-6.5V18.5H3.5Z" />
          <path fill="#C5221F" d="M3.5 6.5 12 13l-.5 4.5L3.5 12Z" />
          <path fill="#FBBC04" d="M20.5 6.5 12 13l.5 4.5 8-5.5Z" />
          <path fill="#34A853" d="M3.5 18.5V12l8 5.5Z" />
          <path fill="#4285F4" d="M20.5 18.5V12l-8 5.5Z" />
        </svg>
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
    case "telegram":
      return (
        <Frame bg="#26A5E4">
          <path
            fill="#fff"
            d="M9.4 13.7 18.2 6.9c.4-.3.8.1.6.5l-2.1 9.9c-.2.7-.6.9-1.2.6l-3.3-2.4-1.6 1.5c-.2.2-.3.3-.6.3l.2-3.4 6.2-5.6c.3-.2 0-.4-.3-.2l-7.7 4.8-3.3-1c-.7-.2-.7-.7.2-1.1l12.8-4.9c.6-.3 1.2.2 1 .9L14.2 17c-.2.9-.8 1.1-1.5.7l-3.3-2.4"
          />
        </Frame>
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
    case "teams":
      return (
        <Frame bg="#5059C9">
          <circle cx="16.5" cy="7.5" r="2.2" fill="#fff" />
          <rect x="5" y="9" width="9.5" height="9" rx="1.5" fill="#fff" />
          <path fill="#7B83EB" d="M13.2 11.2h6.3A1.5 1.5 0 0 1 21 12.7v5.2a1.5 1.5 0 0 1-1.5 1.5h-6.3v-8.2Z" />
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
    case "obsidian":
      return (
        <Frame bg="#1E1E2E">
          <path fill="#A78BFA" d="M12 2.8 19.5 10.5 16.2 21H7.8L4.5 10.5 12 2.8Z" />
          <path fill="#7C3AED" d="M12 6.2 16.2 11.5 14.5 18h-5L8 11.5 12 6.2Z" />
        </Frame>
      );
    case "apple-notes":
      return (
        <Frame bg="#FFD60A">
          <rect x="5.5" y="4" width="13" height="16" rx="1.5" fill="#FFF9E6" />
          <path stroke="#C9A227" strokeWidth="1.2" d="M8 9h8M8 12.2h8M8 15.4h5.5" />
        </Frame>
      );
    case "bear":
      return (
        <Frame bg="#C65E4A">
          <circle cx="8.2" cy="8.5" r="2.3" fill="#fff" />
          <circle cx="15.8" cy="8.5" r="2.3" fill="#fff" />
          <ellipse cx="12" cy="14.5" rx="5.5" ry="4.5" fill="#fff" />
          <circle cx="10" cy="14" r="0.7" fill="#C65E4A" />
          <circle cx="14" cy="14" r="0.7" fill="#C65E4A" />
        </Frame>
      );
    case "logseq":
      return (
        <Frame bg="#002B36">
          <circle cx="7.5" cy="8" r="2" fill="#86C0FF" />
          <circle cx="16.5" cy="8" r="2" fill="#86C0FF" />
          <circle cx="12" cy="16.5" r="2" fill="#86C0FF" />
          <path stroke="#86C0FF" strokeWidth="1.3" d="M9 9.2 11 14.5M15 9.2 13 14.5M9.5 8h5" />
        </Frame>
      );
    case "mem":
      return (
        <Frame bg="#111">
          <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="Arial,sans-serif">
            Mem
          </text>
        </Frame>
      );
    case "github":
      return (
        <Frame bg="#24292F">
          <path
            fill="#fff"
            d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.6-1.3-2.2-.3-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.7-.1-.2-.4-1.3.1-2.6 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.4.1 2.6.7.7 1.1 1.6 1.1 2.7 0 3.8-2.3 4.6-4.5 4.9.3.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2Z"
          />
        </Frame>
      );
    case "gitlab":
      return (
        <Frame bg="#FC6D26">
          <path
            fill="#fff"
            d="m12 19.5 3.4-10.4h2.3L12 21.5 6.3 9.1h2.3L12 19.5Zm-5.8-10.4L4.5 14.2 2.2 9.1h4Zm11.6 0h4l-2.3 5.1-1.7-5.1ZM8.6 9.1h6.8L12 19.5 8.6 9.1Z"
          />
        </Frame>
      );
    case "vscode":
      return (
        <Frame bg="#007ACC">
          <path
            fill="#fff"
            d="m4.2 7.1 6.3-3.1 9.3 7.1-9.3 7.1-6.3-3.1 6.1-4ZM4.2 7.1 10.5 12 4.2 16.9"
          />
        </Frame>
      );
    case "docker":
      return (
        <Frame bg="#2496ED">
          <path
            fill="#fff"
            d="M4 13.2h2.1v2.1H4zm2.5 0H8.6v2.1H6.5zm2.5 0h2.1v2.1H9zm2.5 0h2.1v2.1H11.5zm-5-2.5H8.6v2.1H6.5zm2.5 0h2.1v2.1H9zm2.5 0h2.1v2.1H11.5zm2.5 0H16.6v2.1H14zm-5-2.5H8.6V10.3H6.5zm2.5 0h2.1v2.1H9Zm8.3 4.2c-.2-.2-.5-.2-.9-.1-.1-.8-.5-1.5-1.4-1.9l-.3-.1-.2.3c-.5.6-.4 1.5.1 2 .2.2.5.4.9.5-.1.2-.1.3-.1.5 0 .5.2 1 .6 1.4.4.4.9.6 1.5.6H21v-.4c0-1.2-.5-2.1-1.7-2.5l.1-.3Zm-1.5 2.5c-.2 0-.3-.1-.3-.3s.1-.3.3-.3.3.1.3.3-.1.3-.3.3Z"
          />
        </Frame>
      );
    case "sentry":
      return (
        <Frame bg="#362D59">
          <path
            fill="#fff"
            d="M12.8 4.2 21 18.5H15.7L12.8 13 9.9 18.5H3L12.8 4.2Zm0 5.2L9.2 16.2h7.2l-3.6-6.8Z"
          />
        </Frame>
      );
    case "vercel":
      return (
        <Frame bg="#000">
          <path fill="#fff" d="m12 5 9 14H3l9-14Z" />
        </Frame>
      );
    case "figma":
      return (
        <Frame bg="#1E1E1E">
          <path fill="#F24E1E" d="M8.5 2.8h3.5v5.2H8.5a2.6 2.6 0 0 1 0-5.2Z" />
          <path fill="#FF7262" d="M12 2.8h3.5a2.6 2.6 0 0 1 0 5.2H12V2.8Z" />
          <path fill="#A259FF" d="M8.5 8h3.5v5.2H8.5a2.6 2.6 0 1 1 0-5.2Z" />
          <path fill="#1ABCFE" d="M12 8h3.5a2.6 2.6 0 1 1 0 5.2H12V8Z" />
          <path fill="#0ACF83" d="M8.5 13.2H12V18.4a2.6 2.6 0 1 1-3.5-2.4 2.6 2.6 0 0 1 0-2.8Z" />
        </Frame>
      );
    case "blender":
      return (
        <Frame bg="#E87D0D">
          {/* Blender-like orange circle + blue claw approximation */}
          <circle cx="12" cy="12" r="7.2" fill="#1D1D1D" />
          <circle cx="12" cy="12" r="4.2" fill="#E87D0D" />
          <path
            fill="#265787"
            d="M12 3.5c2.2 0 4.1.9 5.4 2.3L15.8 8A4.4 4.4 0 0 0 12 6.6 5.4 5.4 0 0 0 6.6 12c0 1.4.5 2.7 1.4 3.7L5.6 17.7A7.2 7.2 0 0 1 12 3.5Z"
          />
          <circle cx="16.8" cy="7.4" r="1.5" fill="#265787" />
        </Frame>
      );
    case "canva":
      return (
        <Frame bg="#00C4CC">
          <path
            fill="#fff"
            d="M12 3.5c-4.7 0-8.5 2.9-8.5 6.5 0 2.4 1.6 4.5 4 5.5L6.2 20l4.2-2.2c.5.1 1 .1 1.6.1 4.7 0 8.5-2.9 8.5-6.5S16.7 3.5 12 3.5Zm-1.2 9.7c-1.4 0-2.5-1.4-2.5-3.1S9.4 7 10.8 7s2.5 1.4 2.5 3.1-1.1 3.1-2.5 3.1Zm4.6 0c-1.4 0-2.5-1.4-2.5-3.1S14 7 15.4 7s2.5 1.4 2.5 3.1-1.1 3.1-2.5 3.1Z"
          />
        </Frame>
      );
    case "miro":
      return (
        <Frame bg="#FFD02F">
          <path fill="#050038" d="M5 18.5V5.5l4.2 6.2L13.5 5.5 18 12l1 6.5H5Z" />
        </Frame>
      );
    case "excalidraw":
      return (
        <Frame bg="#6965DB">
          <path
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            d="M6 16c2-5 5-8 10-9M8 18c3-2 7-3 10-2"
          />
          <circle cx="7.5" cy="16.5" r="1.3" fill="#fff" />
        </Frame>
      );
    case "gsheets":
      return (
        <Frame bg="#0F9D58">
          <rect x="5.5" y="3.5" width="13" height="17" rx="1.5" fill="#fff" />
          <path stroke="#0F9D58" strokeWidth="1.2" d="M5.5 9h13M5.5 14h13M12 9v11.5" />
        </Frame>
      );
    case "excel":
      return (
        <Frame bg="#217346">
          <text x="12" y="15.8" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" fontFamily="Arial,sans-serif">
            X
          </text>
        </Frame>
      );
    case "gdocs":
      return (
        <Frame bg="#4285F4">
          <rect x="6" y="3.5" width="12" height="17" rx="1.5" fill="#fff" />
          <path stroke="#4285F4" strokeWidth="1.3" d="M8.5 9h7M8.5 12h7M8.5 15h5" />
        </Frame>
      );
    case "airtable":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#fff" />
          <path fill="#FFBF00" d="M3.8 18.5 12 4.5l8.2 14H3.8Z" />
          <circle cx="12" cy="15.2" r="2.6" fill="#18BFFF" />
          <path fill="#F82B60" d="M12 4.5 8.2 11h7.6L12 4.5Z" />
        </svg>
      );
    case "onedrive":
      return (
        <Frame bg="#094AB2">
          <path
            fill="#fff"
            d="M7.2 15.8c-1.8 0-3.2-1.3-3.2-3s1.4-3.1 3.2-3.1c.2-2.1 2-3.7 4.2-3.7 1.9 0 3.5 1.1 4.1 2.7 1.8-.1 3.3 1.3 3.3 3.1 0 1.8-1.5 3.2-3.4 3.2H7.2Z"
          />
        </Frame>
      );
    case "hubspot":
      return (
        <Frame bg="#FF7A59">
          <circle cx="12" cy="14.2" r="4.2" fill="#fff" />
          <path stroke="#fff" strokeWidth="2" strokeLinecap="round" d="M12 4.5v5.2" />
          <circle cx="17" cy="8.2" r="1.7" fill="#fff" />
        </Frame>
      );
    case "salesforce":
      return (
        <Frame bg="#00A1E0">
          <path
            fill="#fff"
            d="M9.2 10.2c0-1.7 1.3-3 3-3 .8 0 1.5.3 2 .8A3 3 0 0 1 19 11.5c0 1.9-1.5 3.4-3.5 3.4H9.8c-2 0-3.6-1.6-3.6-3.6 0-1.7 1.2-3.1 2.8-3.4.1.8.2 1.5.2 2.3Z"
          />
        </Frame>
      );
    case "amocrm":
      return (
        <Frame bg="#4C8BF5">
          <text x="12" y="15.2" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff" fontFamily="Arial,sans-serif">
            amo
          </text>
        </Frame>
      );
    case "bitrix":
      return (
        <Frame bg="#2FC6F6">
          <text x="12" y="15.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="Arial,sans-serif">
            B24
          </text>
        </Frame>
      );
    case "stripe":
      return (
        <Frame bg="#635BFF">
          <path
            fill="#fff"
            d="M10.4 9.8c0-.9.7-1.3 1.9-1.3 1.7 0 2.5.6 2.5 2v5.7h-2.3v-5.2c0-.6-.3-.9-.9-.9-.6 0-1.3.3-1.3 1.4v4.7H7.9V9.9c.6-.4 1.5-.2 2.5-.1Z"
          />
        </Frame>
      );
    case "chrome":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#fff" />
          <circle cx="12" cy="12" r="3.2" fill="#4285F4" />
          <path fill="#EA4335" d="M12 4.5a7.5 7.5 0 0 1 6.5 3.75L12 12 5.5 8.25A7.5 7.5 0 0 1 12 4.5Z" />
          <path fill="#FBBC05" d="M18.5 8.25A7.5 7.5 0 0 1 12 19.5L12 12l6.5-3.75Z" />
          <path fill="#34A853" d="M5.5 8.25 12 12l0 7.5A7.5 7.5 0 0 1 5.5 8.25Z" />
          <circle cx="12" cy="12" r="2.1" fill="#fff" />
          <circle cx="12" cy="12" r="1.5" fill="#4285F4" />
        </svg>
      );
    case "firefox":
      return (
        <Frame bg="#20123A">
          <path
            fill="#FF7139"
            d="M19.5 9.2c-.3-1.2-1.7-2.4-2.3-2.7.5 1 .6 1.7.5 2.1-1.3-1-2.7-1.5-4.3-1.5-1.2 0-2 .2-2.6.3C9.3 5.5 11 3.8 13.6 3.5c-2.4-.7-5 .2-6.4 1.8C5.6 4 5.2 2.8 5.2 2.8c-1.6 2.1-1.5 5-.8 6.6-1 .8-1.6 2.1-1.6 3.5 0 3.6 3.4 7.1 8.2 7.1 5.3 0 8.5-3.5 8.5-7.2 0-.7-.1-1.6-.4-2.4.3.1.4.2.4.2Z"
          />
        </Frame>
      );
    case "edge":
      return (
        <Frame bg="#0078D7">
          <path
            fill="#fff"
            d="M12 4c3.2 0 6.1 1.7 7.6 4.3-1.6-.3-3.2-.1-4.5.5C13.7 7.5 11 7.7 9 9.4 7.4 10.7 6.5 12.6 6.5 14.6c0 2.7 1.8 4.9 4.6 5.7-3.9-.5-6.6-3.3-6.6-7C4.5 8.1 7.8 4 12 4Zm8.2 6.3c.2.6.3 1.3.3 2 0 3.7-2.5 6.4-6.5 6.4-2.2 0-3.9-.8-4.9-2 2.8.2 5.6-.8 7.1-2.8.9-1.2 1.1-2.4 1-3.6Z"
          />
        </Frame>
      );
    case "raindrop":
      return (
        <Frame bg="#0A64FF">
          <path fill="#fff" d="M12 3.5c3.8 4.5 6.2 7.6 6.2 10.6a6.2 6.2 0 1 1-12.4 0c0-3 2.4-6.1 6.2-10.6Z" />
        </Frame>
      );
    case "pocket":
      return (
        <Frame bg="#EF4056">
          <path fill="#fff" d="M5 6.5h14v5.2c0 3.9-2.9 7-7 7s-7-3.1-7-7V6.5Z" />
          <path fill="none" stroke="#EF4056" strokeWidth="1.8" strokeLinecap="round" d="m8.2 11.2 3.8 3.5 3.8-3.5" />
        </Frame>
      );
    default:
      return (
        <Frame bg="#555">
          <circle cx="12" cy="12" r="3" fill="#fff" />
        </Frame>
      );
  }
}
