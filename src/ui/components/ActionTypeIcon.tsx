import type { CustomCommandActionType } from "../customCommandsLocal";

export function ActionTypeIcon({ type }: { type: CustomCommandActionType }) {
  if (type === "open_url") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M3 10h14M10 3c2.2 2.5 2.2 11.5 0 14M10 3c-2.2 2.5-2.2 11.5 0 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    );
  }
  if (type === "launch" || type === "open_path" || type === "open_folder") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <path
          d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l1.5 1.5H15.5A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    );
  }
  if (type === "keys" || type === "type") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <rect
          x="2.5"
          y="5"
          width="15"
          height="10"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5 8.5h2M9 8.5h2M13 8.5h2M6.5 12h7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "click") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <path
          d="M9 3v8.5l2.2-1.4 1.5 3.2 1.8-.8-1.5-3.2L16 8.2 9 3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === "clipboard_copy" || type === "clipboard_paste") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <rect
          x="6"
          y="4"
          width="9"
          height="12"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5 14H4.5A1.5 1.5 0 0 1 3 12.5v-8A1.5 1.5 0 0 1 4.5 3H12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    );
  }
  if (type === "pause") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M10 6v4.5l3 1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "notify" || type === "hud_say") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <path
          d="M10 3a5 5 0 0 1 5 5v2.5l1.5 2.5H3.5L5 10.5V8a5 5 0 0 1 5-5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M8.5 15.5a1.5 1.5 0 0 0 3 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    );
  }
  if (
    type === "window_minimize" ||
    type === "window_minimize_all" ||
    type === "window_close" ||
    type === "window_snap" ||
    type === "desktop_new" ||
    type === "desktop_close" ||
    type === "desktop_switch"
  ) {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <rect
          x="3.5"
          y="5"
          width="13"
          height="10"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M3.5 8h13"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    );
  }
  if (type === "terminal") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <rect
          x="2.5"
          y="4"
          width="15"
          height="12"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5.5 8l2.5 2-2.5 2M10 13h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
      <path
        d="M4 8.5v3a1 1 0 0 0 1 1h1.5L10 15.5V4.5L6.5 7.5H5a1 1 0 0 0-1 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M13 7.2a3 3 0 0 1 0 5.6M14.8 5.2a5.2 5.2 0 0 1 0 9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
