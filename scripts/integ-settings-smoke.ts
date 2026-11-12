/**
 * Regression: enabling/saving integrations must not tear down the UI.
 *
 * Root causes covered:
 * 1) Vite watching project `.env` → full renderer reload on Save
 * 2) Fragile settings-env snap shaping (missing secretsSet/values)
 * 3) setSettingsEnv round-trip keeps toggled flags
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../electron/config";
import { getSettingsEnv, setSettingsEnv } from "../electron/settingsEnv";

const root = path.resolve(__dirname, "..");

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
    /(?:^|[^a-z-])isolation\s*:\s*isolate/m.test(
      shellBlock.replace(/\/\*[\s\S]*?\*\//g, ""),
    ),
    false,
    ".app-shell must not set isolation: isolate (GPU blank-UI with atmosphere)",
  );
  const atmosphereBlock = css.match(/\.atmosphere\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(
    atmosphereBlock.replace(/\/\*[\s\S]*?\*\//g, ""),
    /z-index:\s*0/,
    "atmosphere must stay at z-index 0 under chrome",
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
  });
  assert.equal(batch.ok, true);
  const snap = getSettingsEnv();
  assert.equal(snap.values.WEB_ENABLED, "true");
  assert.equal(snap.values.BLENDER_ENABLED, "true");
  assert.equal(snap.values.SCREEN_CONTROL_ENABLED, "false");
  assert.ok(snap.secretsSet);

  console.log(
    JSON.stringify(
      {
        ok: true,
        envFile: snap.envFile,
        flags: Object.fromEntries(
          flags.map((k) => [k, snap.values[k] ?? ""]),
        ),
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
