/**
 * Optional GPU / CUDA detection for Voice Studio neural TTS.
 * Electron desktop ships a real CPU neural path; CUDA is acceleration only.
 */
import { execFileSync } from "node:child_process";

export type AccelInfo = {
  /** True when a CUDA device appears available on the host. */
  cudaAvailable: boolean;
  /** True when any discrete/accelerated GPU hint is found. */
  gpuHint: boolean;
  /** Backend actually used for Mira neural TTS today. */
  activeBackend: "cpu-ts-mlp";
  detail: string;
};

export function detectAccel(): AccelInfo {
  let cudaAvailable = false;
  let gpuHint = false;
  const notes: string[] = [];

  if (process.env.CUDA_VISIBLE_DEVICES && process.env.CUDA_VISIBLE_DEVICES !== "-1") {
    cudaAvailable = true;
    notes.push(`CUDA_VISIBLE_DEVICES=${process.env.CUDA_VISIBLE_DEVICES}`);
  }
  if (process.env.MIRA_FORCE_CUDA === "1") {
    cudaAvailable = true;
    notes.push("MIRA_FORCE_CUDA=1");
  }

  try {
    const out = execFileSync("nvidia-smi", ["-L"], {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (/GPU\s+\d+/i.test(out)) {
      cudaAvailable = true;
      gpuHint = true;
      notes.push(out.trim().split("\n")[0] ?? "nvidia-smi");
    }
  } catch {
    notes.push("nvidia-smi unavailable");
  }

  // Soft GPU hint on Linux without claiming CUDA kernels.
  try {
    if (process.platform === "linux" && !gpuHint) {
      const render = execFileSync("sh", ["-c", "ls /dev/dri/render* 2>/dev/null | head -1"], {
        encoding: "utf8",
        timeout: 800,
      });
      if (render.trim()) {
        gpuHint = true;
        notes.push(`drm:${render.trim()}`);
      }
    }
  } catch {
    /* ignore */
  }

  return {
    cudaAvailable,
    gpuHint,
    activeBackend: "cpu-ts-mlp",
    detail:
      (cudaAvailable
        ? "CUDA host detected — Mira still runs CPU TS-MLP neural path (CUDA kernels not bundled); GPU may accelerate host elsewhere. "
        : "No CUDA device — shipping full CPU neural encoder→decoder→vocoder. ") +
      notes.join("; "),
  };
}
