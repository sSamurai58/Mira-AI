#!/usr/bin/env node
/**
 * Download official brand logos into public/brand-icons/ for offline Electron use.
 *
 * Sources (prefer colored official marks; Simple Icons MIT for mono glyphs):
 * - Iconify Logos: https://api.iconify.design/logos/...
 * - Iconify VS Code Icons: https://api.iconify.design/vscode-icons/...
 * - Simple Icons (jsDelivr): https://cdn.jsdelivr.net/npm/simple-icons@13/icons/...
 * - Wikimedia Commons SVG
 * - Google favicon service (PNG) as last resort for brands without SVG
 *
 * Re-run: node scripts/vendor-brand-icons.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "brand-icons");

/** @type {Array<{ file: string; url: string; note: string; whiteFill?: boolean }>} */
const ASSETS = [
  // Paths apps
  { file: "chrome.svg", url: "https://api.iconify.design/logos/chrome.svg", note: "Iconify logos — Google Chrome (multicolor)" },
  { file: "discord.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/discord.svg", note: "Simple Icons MIT — Discord Clyde (mono → white)", whiteFill: true },
  { file: "edge.svg", url: "https://api.iconify.design/logos/microsoft-edge.svg", note: "Iconify logos — Microsoft Edge" },
  { file: "excel.svg", url: "https://api.iconify.design/vscode-icons/file-type-excel.svg", note: "Iconify vscode-icons — Microsoft Excel" },
  { file: "firefox.svg", url: "https://api.iconify.design/logos/firefox.svg", note: "Iconify logos — Firefox" },
  { file: "notion.svg", url: "https://api.iconify.design/logos/notion-icon.svg", note: "Iconify logos — Notion mark" },
  { file: "obsidian.svg", url: "https://api.iconify.design/logos/obsidian-icon.svg", note: "Iconify logos — Obsidian" },
  { file: "photoshop.svg", url: "https://api.iconify.design/logos/adobe-photoshop.svg", note: "Iconify logos — Adobe Photoshop" },
  { file: "slack.svg", url: "https://api.iconify.design/logos/slack-icon.svg", note: "Iconify logos — Slack" },
  { file: "spotify.svg", url: "https://api.iconify.design/logos/spotify-icon.svg", note: "Iconify logos — Spotify" },
  { file: "steam.svg", url: "https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg", note: "Wikimedia Commons — Steam icon logo" },
  { file: "telegram.svg", url: "https://api.iconify.design/logos/telegram.svg", note: "Iconify logos — Telegram" },
  { file: "vlc.png", url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.videolan.org/&size=128", note: "Google favicon — VLC / VideoLAN" },
  { file: "vscode.svg", url: "https://api.iconify.design/logos/visual-studio-code.svg", note: "Iconify logos — Visual Studio Code" },
  { file: "whatsapp.svg", url: "https://api.iconify.design/logos/whatsapp-icon.svg", note: "Iconify logos — WhatsApp" },
  { file: "word.svg", url: "https://api.iconify.design/vscode-icons/file-type-word.svg", note: "Iconify vscode-icons — Microsoft Word" },
  { file: "zoom.svg", url: "https://api.iconify.design/logos/zoom-icon.svg", note: "Iconify logos — Zoom" },

  // MCP / shared brands
  { file: "todoist.svg", url: "https://api.iconify.design/logos/todoist-icon.svg", note: "Iconify logos — Todoist" },
  { file: "linear.svg", url: "https://api.iconify.design/logos/linear.svg", note: "Iconify logos — Linear (→ white)", whiteFill: true },
  { file: "asana.svg", url: "https://api.iconify.design/logos/asana.svg", note: "Iconify logos — Asana" },
  { file: "clickup.svg", url: "https://api.iconify.design/logos/clickup-icon.svg", note: "Iconify logos — ClickUp" },
  { file: "jira.svg", url: "https://api.iconify.design/logos/jira.svg", note: "Iconify logos — Jira" },
  { file: "ms-todo.png", url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://todo.microsoft.com/&size=128", note: "Google favicon — Microsoft To Do" },
  { file: "ticktick.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/ticktick.svg", note: "Simple Icons MIT — TickTick", whiteFill: true },
  { file: "gcal.svg", url: "https://api.iconify.design/logos/google-calendar.svg", note: "Iconify logos — Google Calendar" },
  { file: "outlook.svg", url: "https://api.iconify.design/vscode-icons/file-type-outlook.svg", note: "Iconify vscode-icons — Outlook" },
  { file: "apple.svg", url: "https://api.iconify.design/logos/apple.svg", note: "Iconify logos — Apple" },
  { file: "calendly.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/calendly.svg", note: "Simple Icons MIT — Calendly", whiteFill: true },
  { file: "toggl.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/toggl.svg", note: "Simple Icons MIT — Toggl", whiteFill: true },
  { file: "gmail.svg", url: "https://api.iconify.design/logos/google-gmail.svg", note: "Iconify logos — Gmail" },
  { file: "teams.svg", url: "https://api.iconify.design/logos/microsoft-teams.svg", note: "Iconify logos — Microsoft Teams" },
  { file: "bear.png", url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://bear.app/&size=128", note: "Google favicon — Bear" },
  { file: "logseq.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/logseq.svg", note: "Simple Icons MIT — Logseq", whiteFill: true },
  { file: "github.svg", url: "https://api.iconify.design/logos/github-icon.svg", note: "Iconify logos — GitHub (→ white)", whiteFill: true },
  { file: "gitlab.svg", url: "https://api.iconify.design/logos/gitlab.svg", note: "Iconify logos — GitLab" },
  { file: "docker.svg", url: "https://api.iconify.design/logos/docker-icon.svg", note: "Iconify logos — Docker (→ white)", whiteFill: true },
  { file: "sentry.svg", url: "https://api.iconify.design/logos/sentry-icon.svg", note: "Iconify logos — Sentry (→ white)", whiteFill: true },
  { file: "vercel.svg", url: "https://api.iconify.design/logos/vercel-icon.svg", note: "Iconify logos — Vercel (→ white)", whiteFill: true },
  { file: "figma.svg", url: "https://api.iconify.design/logos/figma.svg", note: "Iconify logos — Figma" },
  { file: "blender.svg", url: "https://api.iconify.design/logos/blender.svg", note: "Iconify logos — Blender" },
  { file: "canva.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/canva.svg", note: "Simple Icons MIT — Canva", whiteFill: true },
  { file: "miro.svg", url: "https://api.iconify.design/logos/miro.svg", note: "Iconify logos — Miro (→ white)", whiteFill: true },
  { file: "excalidraw.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/excalidraw.svg", note: "Simple Icons MIT — Excalidraw", whiteFill: true },
  { file: "gsheets.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/googlesheets.svg", note: "Simple Icons MIT — Google Sheets", whiteFill: true },
  { file: "gdocs.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/googledocs.svg", note: "Simple Icons MIT — Google Docs", whiteFill: true },
  { file: "airtable.svg", url: "https://api.iconify.design/logos/airtable.svg", note: "Iconify logos — Airtable" },
  { file: "onedrive.svg", url: "https://api.iconify.design/logos/microsoft-onedrive.svg", note: "Iconify logos — OneDrive" },
  { file: "hubspot.svg", url: "https://api.iconify.design/logos/hubspot.svg", note: "Iconify logos — HubSpot" },
  { file: "salesforce.svg", url: "https://api.iconify.design/logos/salesforce.svg", note: "Iconify logos — Salesforce" },
  { file: "amocrm.png", url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.amocrm.ru/&size=128", note: "Google favicon — amoCRM" },
  { file: "bitrix.png", url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.bitrix24.com/&size=128", note: "Google favicon — Bitrix24" },
  { file: "stripe.svg", url: "https://api.iconify.design/logos/stripe.svg", note: "Iconify logos — Stripe (→ white)", whiteFill: true },
  { file: "raindrop.png", url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://raindrop.io/&size=128", note: "Google favicon — Raindrop.io" },
  { file: "pocket.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/pocket.svg", note: "Simple Icons MIT — Pocket", whiteFill: true },
  { file: "windows.svg", url: "https://api.iconify.design/logos/microsoft-windows.svg", note: "Iconify logos — Windows / Explorer (→ white)", whiteFill: true },

  // LLM / API providers
  { file: "openai.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/openai.svg", note: "Simple Icons MIT — OpenAI", whiteFill: true },
  { file: "anthropic.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/anthropic.svg", note: "Simple Icons MIT — Anthropic", whiteFill: true },
  { file: "gemini.svg", url: "https://api.iconify.design/logos/google-gemini.svg", note: "Iconify logos — Google Gemini (multicolor)" },
  { file: "google.svg", url: "https://api.iconify.design/logos/google-icon.svg", note: "Iconify logos — Google" },
  { file: "xai.svg", url: "https://api.iconify.design/simple-icons/x.svg", note: "Iconify simple-icons — X / xAI (→ white)", whiteFill: true },
  { file: "xai.png", url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://x.ai/&size=128", note: "Google favicon — x.ai" },
  { file: "elevenlabs.svg", url: "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/elevenlabs.svg", note: "Simple Icons MIT — ElevenLabs", whiteFill: true },
];

function forceWhiteFill(svg) {
  let out = svg;
  // Replace solid hex fills only (keep url(#…) gradient fills).
  out = out.replace(/fill="#[0-9A-Fa-f]{3,8}"/g, 'fill="#FFFFFF"');
  out = out.replace(/fill='#[0-9A-Fa-f]{3,8}'/g, "fill='#FFFFFF'");
  if (!/fill=/.test(out)) {
    out = out.replace(/<svg\b([^>]*)>/, '<svg$1 fill="#FFFFFF">');
  }
  return out;
}

async function fetchBuf(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mira-AI-brand-icon-vendor/1.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

mkdirSync(OUT, { recursive: true });

const sources = [];
let ok = 0;
let fail = 0;

for (const asset of ASSETS) {
  const dest = join(OUT, asset.file);
  try {
    let buf = await fetchBuf(asset.url);
    if (asset.whiteFill && asset.file.endsWith(".svg")) {
      buf = Buffer.from(forceWhiteFill(buf.toString("utf8")), "utf8");
    }
    // Sanity: reject tiny HTML error pages
    if (buf.length < 80) throw new Error(`too small (${buf.length}b)`);
    const head = buf.subarray(0, 32).toString("utf8").toLowerCase();
    if (head.includes("<!doctype") || head.includes("<html")) {
      throw new Error("got HTML instead of image");
    }
    writeFileSync(dest, buf);
    sources.push(`- \`${asset.file}\` — ${asset.note}\n  ${asset.url}`);
    console.log(`OK  ${asset.file} (${buf.length}b)`);
    ok++;
  } catch (err) {
    console.error(`FAIL ${asset.file}: ${err.message || err}`);
    fail++;
  }
}

const readme = `# Brand icons (vendored)

Official / current brand marks used by Paths and MCP tiles.
Do not hand-draw replacements — re-run \`node scripts/vendor-brand-icons.mjs\`.

Decorative UI only; trademarks belong to their owners.

## Sources

${sources.join("\n")}
`;
writeFileSync(join(OUT, "README.md"), readme);

console.log(`\nDone: ${ok} ok, ${fail} failed → ${OUT}`);
if (fail) process.exit(1);
