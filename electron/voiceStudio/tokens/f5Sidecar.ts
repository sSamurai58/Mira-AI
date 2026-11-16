/**
 * Optional F5-TTS sidecar — primary quality/RU clone path for Mira.
 * Env: F5_HOME (dir with mira_f5_infer.py), F5_PYTHON (default python3).
 * If F5_HOME unset, uses the script shipped next to this module.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveSidecarScript } from "./sidecarScript";

export type F5SynthRequest = {
  text: string;
  refWav?: string;
  outWav: string;
  speed?: number;
  language?: string;
};

function resolveScript(): { script: string; home: string } | null {
  const home = process.env.F5_HOME?.trim();
  if (home) {
    const script = path.join(home, "mira_f5_infer.py");
    if (fs.existsSync(script)) return { script, home };
    return null;
  }
  const script = resolveSidecarScript("mira_f5_infer.py");
  if (script) return { script, home: path.dirname(script) };
  return null;
}

export function f5TtsAvailable(): {
  ok: boolean;
  detail: string;
  home?: string;
} {
  const resolved = resolveScript();
  if (!resolved) {
    const home = process.env.F5_HOME?.trim();
    if (home && !fs.existsSync(home)) {
      return { ok: false, detail: `F5_HOME не найден: ${home}` };
    }
    return {
      ok: false,
      detail:
        "F5 sidecar: нет mira_f5_infer.py (задайте F5_HOME или положите скрипт рядом с tokens/)",
    };
  }
  return {
    ok: true,
    detail:
      "F5-TTS sidecar готов (нужен pip install f5-tts + ru/base ckpt при первом запуске)",
    home: resolved.home,
  };
}

export function synthesizeViaF5(
  req: F5SynthRequest,
): { ok: boolean; detail: string } {
  const avail = f5TtsAvailable();
  if (!avail.ok || !avail.home) {
    return { ok: false, detail: avail.detail };
  }
  const resolved = resolveScript();
  if (!resolved) return { ok: false, detail: avail.detail };
  const py = process.env.F5_PYTHON?.trim() || "python3";
  try {
    execFileSync(
      py,
      [
        resolved.script,
        "--text",
        req.text,
        "--out",
        req.outWav,
        ...(req.refWav ? ["--ref", req.refWav] : []),
        "--speed",
        String(req.speed ?? 1),
        "--language",
        req.language ?? "ru",
      ],
      {
        timeout: 180_000,
        encoding: "utf8",
        env: {
          ...process.env,
          F5_HOME: avail.home,
        },
      },
    );
    if (!fs.existsSync(req.outWav)) {
      return { ok: false, detail: "F5-TTS не записал WAV" };
    }
    return { ok: true, detail: "F5-TTS sidecar" };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
