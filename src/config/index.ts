/** App config surface — runtime secrets stay in Electron `.env`. */
export const APP_NAME = "Mira";
/**
 * Current product version (injected from package.json via Vite `define`).
 * Shown next to the Mira brand in the nav.
 */
export const APP_VERSION: string =
  typeof __MIRA_VERSION__ === "string" ? __MIRA_VERSION__ : "0.0.0";
/** @deprecated use APP_VERSION — kept as alias for older imports */
export const APP_PHASE = APP_VERSION;
export const DEFAULT_THEME_ID = "deep-sea-neon";
