/**
 * Resolve mira_*_infer.py for Electron (dev dist + packaged resources).
 */
import fs from "node:fs";
import path from "node:path";

export function resolveSidecarScript(fileName: string): string | null {
  const candidates = [
    path.join(__dirname, fileName),
    // tsc outDir=dist-electron → source tree sibling in repo checkout
    path.join(__dirname, "..", "..", "..", "electron", "voiceStudio", "tokens", fileName),
    // electron-builder extraResources → voice-sidecars/
    typeof process.resourcesPath === "string"
      ? path.join(process.resourcesPath, "voice-sidecars", fileName)
      : "",
  ].filter(Boolean);
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}
