/**
 * Optional CosyVoice sidecar — if COSYVOICE_HOME + python env exist, use it.
 * Otherwise returns null and Mira uses neural pack + speaker.xvec.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type CosySynthRequest = {
  text: string;
  /** Path to saved speaker.pt if present */
  speakerPt?: string;
  /** Fallback reference wav */
  refWav?: string;
  outWav: string;
  speed?: number;
  instruct?: string;
};

export function cosyVoiceAvailable(): {
  ok: boolean;
  detail: string;
  home?: string;
} {
  const home = process.env.COSYVOICE_HOME?.trim();
  if (!home) {
    return {
      ok: false,
      detail: "COSYVOICE_HOME не задан — используем Mira neural + speaker pack",
    };
  }
  if (!fs.existsSync(home)) {
    return { ok: false, detail: `COSYVOICE_HOME не найден: ${home}` };
  }
  const infer = path.join(home, "mira_cosy_infer.py");
  if (!fs.existsSync(infer)) {
    return {
      ok: false,
      detail: `Нет ${infer} — положите скрипт инференса CosyVoice`,
      home,
    };
  }
  return { ok: true, detail: "CosyVoice sidecar готов", home };
}

export function synthesizeViaCosy(
  req: CosySynthRequest,
): { ok: boolean; detail: string } {
  const avail = cosyVoiceAvailable();
  if (!avail.ok || !avail.home) {
    return { ok: false, detail: avail.detail };
  }
  const py = process.env.COSYVOICE_PYTHON?.trim() || "python3";
  const script = path.join(avail.home, "mira_cosy_infer.py");
  try {
    execFileSync(
      py,
      [
        script,
        "--text",
        req.text,
        "--out",
        req.outWav,
        ...(req.speakerPt ? ["--speaker", req.speakerPt] : []),
        ...(req.refWav ? ["--ref", req.refWav] : []),
        ...(req.instruct ? ["--instruct", req.instruct] : []),
        "--speed",
        String(req.speed ?? 1),
      ],
      { timeout: 120_000, encoding: "utf8" },
    );
    if (!fs.existsSync(req.outWav)) {
      return { ok: false, detail: "CosyVoice не записал WAV" };
    }
    return { ok: true, detail: "CosyVoice sidecar" };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
