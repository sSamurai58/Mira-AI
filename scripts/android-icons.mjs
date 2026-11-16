#!/usr/bin/env node
/**
 * Generate Android launcher mipmaps from build/icon-512.png (Mira mark).
 * Requires: npm i -D sharp  OR  system Pillow via python fallback.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "build", "icon-512.png");
const res = path.join(root, "android", "app", "src", "main", "res");

const SIZES = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
];

if (!fs.existsSync(src)) {
  console.error("missing", src);
  process.exit(1);
}

// Prefer committed mipmaps on CI (no Pillow). Regenerate locally when changing brand mark.
const probe = path.join(res, "mipmap-xxxhdpi", "ic_launcher.png");
const check = spawnSync("python3", ["-c", "from PIL import Image"], { encoding: "utf8" });
if (check.status !== 0) {
  if (fs.existsSync(probe)) {
    console.warn("Pillow missing — keeping committed Android mipmaps.");
    process.exit(0);
  }
  console.error("Pillow required to generate icons (pip install pillow)");
  process.exit(1);
}

function writePng(outPath, size) {
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(src)}).convert("RGBA")
im = im.resize((${size}, ${size}), Image.Resampling.LANCZOS)
im.save(${JSON.stringify(outPath)}, "PNG")
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
}

for (const [folder, size] of SIZES) {
  const dir = path.join(res, folder);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of [
    "ic_launcher.png",
    "ic_launcher_round.png",
    "ic_launcher_foreground.png",
  ]) {
    const out = path.join(dir, name);
    writePng(out, size);
    console.log("wrote", path.relative(root, out), size);
  }
}

// Adaptive icon background — Mira dark
const bgXml = path.join(res, "values", "ic_launcher_background.xml");
fs.mkdirSync(path.dirname(bgXml), { recursive: true });
fs.writeFileSync(
  bgXml,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B0B0E</color>
</resources>
`,
);

console.log("Android launcher icons updated from build/icon-512.png");
