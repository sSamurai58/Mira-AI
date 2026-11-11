#!/usr/bin/env node
/**
 * Build Mira Windows installer into Windows/.
 * Usage (from repo root): node Windows/scripts/build-installer.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = path.join(root, "Windows/config/electron-builder.windows.yml");

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...opts.env },
    shell: process.platform === "win32",
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

function main() {
  if (!fs.existsSync(config)) {
    console.error("Missing Windows builder config:", config);
    process.exit(1);
  }

  // App + electron compile
  run("npm", ["run", "build"], {
    env: { LLM_PROVIDER: "mock" },
  });

  // Windows NSIS + portable → Windows/
  run(
    "npx",
    [
      "electron-builder",
      "--win",
      "--x64",
      "--config",
      "Windows/config/electron-builder.windows.yml",
    ],
    { env: { LLM_PROVIDER: "mock" } },
  );

  const out = path.join(root, "Windows");
  const files = fs
    .readdirSync(out)
    .filter((f) => /\.(exe|yml|yaml|blockmap)$/i.test(f));
  console.log("\nWindows artifacts:");
  for (const f of files) {
    const st = fs.statSync(path.join(out, f));
    console.log(`  - ${f} (${Math.round(st.size / 1024 / 1024)} MB)`);
  }
}

main();
