import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SystemLoadSample = {
  cpu: number;
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
  gpu: number | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  gpuSource: "nvidia-smi" | "windows-counter" | "drm" | "none";
  ts: number;
};

type CpuSnapshot = { idle: number; total: number };

let prevCpu: CpuSnapshot | null = null;
let cachedGpu: {
  at: number;
  gpu: number | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  source: SystemLoadSample["gpuSource"];
} | null = null;

const GPU_CACHE_MS = 4000;

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function readCpuSnapshot(): CpuSnapshot {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function sampleCpuPct(): number {
  const cur = readCpuSnapshot();
  if (!prevCpu || cur.total <= prevCpu.total) {
    prevCpu = cur;
    return 0;
  }
  const idleDelta = cur.idle - prevCpu.idle;
  const totalDelta = cur.total - prevCpu.total;
  prevCpu = cur;
  if (totalDelta <= 0) return 0;
  return clampPct((1 - idleDelta / totalDelta) * 100);
}

function sampleRam(): {
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
} {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  return {
    ram: clampPct((used / total) * 100),
    ramUsedGb: Number((used / 1024 ** 3).toFixed(2)),
    ramTotalGb: Number((total / 1024 ** 3).toFixed(2)),
  };
}

async function tryNvidiaSmi(): Promise<{
  gpu: number;
  vramUsedGb: number;
  vramTotalGb: number;
} | null> {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      [
        "--query-gpu=utilization.gpu,memory.used,memory.total",
        "--format=csv,noheader,nounits",
      ],
      { timeout: 2500, windowsHide: true },
    );
    const line = stdout.trim().split(/\r?\n/)[0];
    if (!line) return null;
    const parts = line.split(",").map((p) => p.trim());
    const util = Number(parts[0]);
    const usedMiB = Number(parts[1]);
    const totalMiB = Number(parts[2]);
    if (!Number.isFinite(util)) return null;
    return {
      gpu: clampPct(util),
      vramUsedGb: Number.isFinite(usedMiB)
        ? Number((usedMiB / 1024).toFixed(2))
        : 0,
      vramTotalGb: Number.isFinite(totalMiB)
        ? Number((totalMiB / 1024).toFixed(2))
        : 0,
    };
  } catch {
    return null;
  }
}

async function tryWindowsGpuCounter(): Promise<number | null> {
  if (process.platform !== "win32") return null;
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$samples = (Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage').CounterSamples",
    "if (-not $samples) { exit 2 }",
    "($samples | Measure-Object -Property CookedValue -Sum).Sum",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 3500, windowsHide: true },
    );
    const n = Number(String(stdout).trim().replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return clampPct(n);
  } catch {
    return null;
  }
}

function tryDrmGpuBusy(): number | null {
  if (process.platform !== "linux") return null;
  try {
    const drmRoot = "/sys/class/drm";
    const entries = fs.readdirSync(drmRoot);
    const values: number[] = [];
    for (const name of entries) {
      if (!name.startsWith("card") || name.includes("-")) continue;
      const busyPath = path.join(drmRoot, name, "device", "gpu_busy_percent");
      if (!fs.existsSync(busyPath)) continue;
      const raw = fs.readFileSync(busyPath, "utf8").trim();
      const n = Number(raw);
      if (Number.isFinite(n)) values.push(n);
    }
    if (!values.length) return null;
    return clampPct(Math.max(...values));
  } catch {
    return null;
  }
}

async function sampleGpu(): Promise<{
  gpu: number | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  source: SystemLoadSample["gpuSource"];
}> {
  const now = Date.now();
  if (cachedGpu && now - cachedGpu.at < GPU_CACHE_MS) {
    return {
      gpu: cachedGpu.gpu,
      vramUsedGb: cachedGpu.vramUsedGb,
      vramTotalGb: cachedGpu.vramTotalGb,
      source: cachedGpu.source,
    };
  }

  const nvidia = await tryNvidiaSmi();
  if (nvidia) {
    cachedGpu = {
      at: now,
      gpu: nvidia.gpu,
      vramUsedGb: nvidia.vramUsedGb,
      vramTotalGb: nvidia.vramTotalGb,
      source: "nvidia-smi",
    };
    return {
      gpu: nvidia.gpu,
      vramUsedGb: nvidia.vramUsedGb,
      vramTotalGb: nvidia.vramTotalGb,
      source: "nvidia-smi",
    };
  }

  const win = await tryWindowsGpuCounter();
  if (win != null) {
    cachedGpu = {
      at: now,
      gpu: win,
      vramUsedGb: null,
      vramTotalGb: null,
      source: "windows-counter",
    };
    return {
      gpu: win,
      vramUsedGb: null,
      vramTotalGb: null,
      source: "windows-counter",
    };
  }

  const drm = tryDrmGpuBusy();
  if (drm != null) {
    cachedGpu = {
      at: now,
      gpu: drm,
      vramUsedGb: null,
      vramTotalGb: null,
      source: "drm",
    };
    return {
      gpu: drm,
      vramUsedGb: null,
      vramTotalGb: null,
      source: "drm",
    };
  }

  cachedGpu = {
    at: now,
    gpu: null,
    vramUsedGb: null,
    vramTotalGb: null,
    source: "none",
  };
  return {
    gpu: null,
    vramUsedGb: null,
    vramTotalGb: null,
    source: "none",
  };
}

/** Warm CPU counters so the first IPC sample is meaningful. */
export function warmSystemMetrics(): void {
  prevCpu = readCpuSnapshot();
}

export async function sampleSystemLoad(): Promise<SystemLoadSample> {
  const cpu = sampleCpuPct();
  const ram = sampleRam();
  const gpu = await sampleGpu();
  return {
    cpu,
    ram: ram.ram,
    ramUsedGb: ram.ramUsedGb,
    ramTotalGb: ram.ramTotalGb,
    gpu: gpu.gpu,
    vramUsedGb: gpu.vramUsedGb,
    vramTotalGb: gpu.vramTotalGb,
    gpuSource: gpu.source,
    ts: Date.now(),
  };
}
