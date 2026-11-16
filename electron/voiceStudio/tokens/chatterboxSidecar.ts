/**
 * Optional Chatterbox sidecar (Resemble) — Multilingual V3 / Turbo / Nano.
 * Env: CHATTERBOX_HOME (dir with mira_chatterbox_infer.py),
 *      CHATTERBOX_PYTHON, CHATTERBOX_MODEL=multilingual|turbo|nano
 * Note: upstream archived (Aug 2026); still useful as optional engine.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveSidecarScript } from "./sidecarScript";

export type ChatterboxSynthRequest = {
  text: string;
  refWav?: string;
  outWav: string;
  speed?: number;
  language?: string;
};

function resolveScript(): { script: string; home: string } | null {
  const home = process.env.CHATTERBOX_HOME?.trim();
  if (home) {
    const script = path.join(home, "mira_chatterbox_infer.py");
    if (fs.existsSync(script)) return { script, home };
    return null;
  }
  const script = resolveSidecarScript("mira_chatterbox_infer.py");
  if (script) return { script, home: path.dirname(script) };
  return null;
}

export function chatterboxAvailable(): {
  ok: boolean;
  detail: string;
  home?: string;
} {
  const resolved = resolveScript();
  if (!resolved) {
    const home = process.env.CHATTERBOX_HOME?.trim();
    if (home && !fs.existsSync(home)) {
      return { ok: false, detail: `CHATTERBOX_HOME не найден: ${home}` };
    }
    return {
      ok: false,
      detail:
        "Chatterbox sidecar: нет mira_chatterbox_infer.py (CHATTERBOX_HOME или tokens/)",
    };
  }
  const model = process.env.CHATTERBOX_MODEL?.trim() || "multilingual";
  return {
    ok: true,
    detail: `Chatterbox sidecar готов (${model}; pip install chatterbox-tts; upstream retired)`,
    home: resolved.home,
  };
}

export function synthesizeViaChatterbox(
  req: ChatterboxSynthRequest,
): { ok: boolean; detail: string } {
  const avail = chatterboxAvailable();
  if (!avail.ok || !avail.home) {
    return { ok: false, detail: avail.detail };
  }
  const resolved = resolveScript();
  if (!resolved) return { ok: false, detail: avail.detail };
  const py = process.env.CHATTERBOX_PYTHON?.trim() || "python3";
  const model = process.env.CHATTERBOX_MODEL?.trim() || "multilingual";
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
        "--model",
        model,
      ],
      {
        timeout: 180_000,
        encoding: "utf8",
        env: {
          ...process.env,
          CHATTERBOX_HOME: avail.home,
        },
      },
    );
    if (!fs.existsSync(req.outWav)) {
      return { ok: false, detail: "Chatterbox не записал WAV" };
    }
    return { ok: true, detail: `Chatterbox sidecar (${model})` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
