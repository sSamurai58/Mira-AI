/**
 * Regression: enabling/saving integrations must not tear down the UI.
 *
 * Root causes covered:
 * 1) Vite watching project `.env` → full renderer reload on Save
 * 2) Fragile settings-env snap shaping (missing secretsSet/values)
 * 3) setSettingsEnv round-trip keeps toggled flags
 * 4) TitleBar/frameless shell: atmosphere must stay under opaque isolated body;
 *    content must be app-region no-drag so clicks/triggers reach Integrations
 * 5) Screen click aside uses hide/show (not minimize/restore) for frameless
 * 6) ConfirmModal portals to document.body (triggers stay above chrome)
 * 7) Voice Studio trained-phrases + CatalogEditModal also portal (Workshop nav rail)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../electron/config";
import { getSettingsEnv, setSettingsEnv } from "../electron/settingsEnv";

const root = path.resolve(__dirname, "..");

function stripCssComments(block: string): string {
  return block.replace(/\/\*[\s\S]*?\*\//g, "");
}

async function main() {
  const viteConfig = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
  assert.match(
    viteConfig,
    /ignored:\s*\[[^\]]*["']\*\*\/\.env["']/,
    "vite.config.ts must ignore **/.env so Settings Save does not full-reload the renderer",
  );

  const css = fs.readFileSync(path.join(root, "src/ui/styles.css"), "utf8");
  const shellBlock = css.match(/\.app-shell\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(shellBlock, ".app-shell rule missing");
  assert.equal(
    /(?:^|[^a-z-])isolation\s*:\s*isolate/m.test(stripCssComments(shellBlock)),
    false,
    ".app-shell must not set isolation: isolate (GPU blank-UI with atmosphere)",
  );

  const bodyBlock = css.match(/\.app-shell-body\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(bodyBlock, ".app-shell-body rule missing after TitleBar layout");
  const bodyClean = stripCssComments(bodyBlock);
  assert.match(bodyClean, /z-index:\s*1/, "app-shell-body must stay above atmosphere");
  assert.match(
    bodyClean,
    /isolation:\s*isolate/,
    "app-shell-body must isolate so atmosphere cannot blank Integrations",
  );
  assert.match(
    bodyClean,
    /background:\s*var\(--bg\)/,
    "app-shell-body must be opaque against atmosphere bleed",
  );
  assert.match(
    bodyClean,
    /-webkit-app-region:\s*no-drag/,
    "app-shell-body must be no-drag under frameless TitleBar",
  );

  const titleBlock = css.match(/\.mira-titlebar\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(titleBlock, ".mira-titlebar rule missing");
  assert.match(
    stripCssComments(titleBlock),
    /overflow:\s*hidden/,
    "mira-titlebar must clip the drag layer",
  );

  const atmosphereBlock = css.match(/\.atmosphere\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(
    stripCssComments(atmosphereBlock),
    /z-index:\s*0/,
    "atmosphere must stay at z-index 0 under chrome",
  );

  const screenSrc = fs.readFileSync(
    path.join(root, "electron/tools/screen.ts"),
    "utf8",
  );
  assert.match(
    screenSrc,
    /withMiraWindowsAside/,
    "screen control must park Mira windows during click/type",
  );
  assert.match(
    screenSrc,
    /win\.hide\(\)/,
    "screen aside must hide() frameless windows (not only minimize)",
  );
  assert.match(
    screenSrc,
    /win\.show\(\)/,
    "screen aside must show() windows after click/type",
  );
  assert.equal(
    /if\s*\(\s*!win\.isMinimized\(\)\s*\)\s*win\.minimize\(\)/.test(screenSrc),
    false,
    "screen aside must not minimize() frameless windows (blank restore)",
  );

  const confirmSrc = fs.readFileSync(
    path.join(root, "src/ui/components/ConfirmModal.tsx"),
    "utf8",
  );
  assert.match(
    confirmSrc,
    /createPortal/,
    "ConfirmModal must portal to document.body for trigger/integration confirms",
  );

  const voiceStudioSrc = fs.readFileSync(
    path.join(root, "src/ui/components/VoiceStudioPanel.tsx"),
    "utf8",
  );
  assert.match(
    voiceStudioSrc,
    /createPortal\([\s\S]*voice-phrases-modal[\s\S]*document\.body/,
    "Voice Studio trained-phrases modal must portal to document.body above Workshop nav",
  );

  const catalogEditSrc = fs.readFileSync(
    path.join(root, "src/ui/components/CatalogEditModal.tsx"),
    "utf8",
  );
  assert.match(
    catalogEditSrc,
    /createPortal\(modal,\s*document\.body\)/,
    "CatalogEditModal must portal to document.body above Workshop nav",
  );

  const integUiSrc = fs.readFileSync(
    path.join(root, "src/ui/components/SettingsIntegrationsSection.tsx"),
    "utf8",
  );
  assert.match(
    integUiSrc,
    /paths-grid/,
    "Integrations must use Paths-style card grid",
  );
  assert.match(
    integUiSrc,
    /createPortal\([\s\S]*document\.body/,
    "Integrations edit modal must portal to document.body",
  );

  const workshopNavCss =
    css.match(/\.workshop-layout\s*>\s*\.settings-nav\s*\{[\s\S]*?\n\}/)?.[0] ??
    "";
  assert.ok(workshopNavCss, ".workshop-layout > .settings-nav rule missing");
  assert.match(
    workshopNavCss,
    /z-index:\s*2/,
    "Workshop left nav stays sticky z-index 2 — overlays must portal, not fight it",
  );

  loadConfig(true);
  process.env.LLM_PROVIDER = "mock";

  const flags = [
    "WEB_ENABLED",
    "SCREEN_ENABLED",
    "SCREEN_CONTROL_ENABLED",
    "BROWSER_ENABLED",
    "MESSAGING_ENABLED",
    "BLENDER_ENABLED",
  ] as const;

  for (const key of flags) {
    const on = await setSettingsEnv({ [key]: "true" });
    assert.equal(on.ok, true, `enable ${key}`);
    assert.equal(on.values[key], "true", `${key} should read back true`);
    assert.ok(on.secretsSet && typeof on.secretsSet === "object");

    const off = await setSettingsEnv({ [key]: "false" });
    assert.equal(off.ok, true, `disable ${key}`);
    assert.equal(off.values[key], "false", `${key} should read back false`);
  }

  // Re-enable a mix like the Integrations cards do on Save.
  const batch = await setSettingsEnv({
    WEB_ENABLED: "true",
    SCREEN_ENABLED: "true",
    SCREEN_CONTROL_ENABLED: "false",
    BROWSER_ENABLED: "true",
    MESSAGING_ENABLED: "true",
    BLENDER_ENABLED: "true",
    BLENDER_MODE: "dry-run",
    WEB_FETCH_CONFIRM: "true",
    BROWSER_OPEN_CONFIRM: "true",
    MESSAGING_CONFIRM: "true",
    BLENDER_CONFIRM: "true",
  });
  assert.equal(batch.ok, true);
  const snap = getSettingsEnv();
  assert.equal(snap.values.WEB_ENABLED, "true");
  assert.equal(snap.values.BLENDER_ENABLED, "true");
  assert.equal(snap.values.SCREEN_CONTROL_ENABLED, "false");
  assert.equal(snap.values.WEB_FETCH_CONFIRM, "true");
  assert.ok(snap.secretsSet);

  console.log(
    JSON.stringify(
      {
        ok: true,
        envFile: snap.envFile,
        flags: Object.fromEntries(
          flags.map((k) => [k, snap.values[k] ?? ""]),
        ),
        confirms: {
          WEB_FETCH_CONFIRM: snap.values.WEB_FETCH_CONFIRM,
          BROWSER_OPEN_CONFIRM: snap.values.BROWSER_OPEN_CONFIRM,
          MESSAGING_CONFIRM: snap.values.MESSAGING_CONFIRM,
          BLENDER_CONFIRM: snap.values.BLENDER_CONFIRM,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
