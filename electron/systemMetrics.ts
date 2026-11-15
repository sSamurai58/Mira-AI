import { execFile, execFileSync } from "node:child_process";
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
  gpuSource:
    | "nvidia-smi"
    | "windows-counter"
    | "drm"
    | "macos-ioreg"
    | "none";
  /** How RAM % was computed (macOS freemem alone looks like ~100% always). */
  ramSource: "os-freemem" | "macos-vm-stat" | "linux-meminfo";
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

/** GPU/ioreg is relatively expensive — reuse for a few seconds. */
const GPU_CACHE_MS = 6_000;
/** vm_stat / meminfo: cheap but avoid sync I/O every UI tick. */
const RAM_CACHE_MS = 2_000;

let cachedRam: {
  at: number;
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramSource: SystemLoadSample["ramSource"];
} | null = null;

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

function sampleRamOsFreemem(): {
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramSource: SystemLoadSample["ramSource"];
} {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  return {
    ram: clampPct((used / Math.max(1, total)) * 100),
    ramUsedGb: Number((used / 1024 ** 3).toFixed(2)),
    ramTotalGb: Number((total / 1024 ** 3).toFixed(2)),
    ramSource: "os-freemem",
  };
}

/**
 * macOS: os.freemem() is "completely free" only — file cache looks like 100% used.
 * Activity Monitor style: available ≈ free + inactive + speculative + purgeable.
 */
function sampleRamMacosVmStat(): {
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramSource: SystemLoadSample["ramSource"];
} | null {
  if (process.platform !== "darwin") return null;
  try {
    const out = execFileSync("/usr/bin/vm_stat", {
      encoding: "utf8",
      timeout: 1500,
    });
    const pageSizeMatch = out.match(/page size of\s+(\d+)/i);
    const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
    const pages = (label: string): number => {
      // Values look like "123456." (trailing period is a terminator).
      const m = out.match(new RegExp(`${label}:\\s+([\\d,]+)\\.?`, "i"));
      return m ? Number(m[1].replace(/,/g, "")) : 0;
    };
    // Labels vary slightly across macOS versions.
    const free = pages("Pages free");
    const inactive = pages("Pages inactive");
    const speculative = pages("Pages speculative");
    const purgeable = pages("Pages purgeable");
    const availablePages = free + inactive + speculative + purgeable;
    if (availablePages <= 0 && free <= 0) return null;
    const total = os.totalmem();
    const available = Math.min(total, availablePages * pageSize);
    const used = Math.max(0, total - available);
    return {
      ram: clampPct((used / Math.max(1, total)) * 100),
      ramUsedGb: Number((used / 1024 ** 3).toFixed(2)),
      ramTotalGb: Number((total / 1024 ** 3).toFixed(2)),
      ramSource: "macos-vm-stat",
    };
  } catch {
    return null;
  }
}

/** Linux: MemAvailable from /proc/meminfo (same idea as free -h). */
function sampleRamLinuxMeminfo(): {
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramSource: SystemLoadSample["ramSource"];
} | null {
  if (process.platform !== "linux") return null;
  try {
    const raw = fs.readFileSync("/proc/meminfo", "utf8");
    const num = (key: string): number | null => {
      const m = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
      return m ? Number(m[1]) * 1024 : null;
    };
    const total = num("MemTotal");
    const available = num("MemAvailable");
    if (!total || available == null) return null;
    const used = Math.max(0, total - available);
    return {
      ram: clampPct((used / total) * 100),
      ramUsedGb: Number((used / 1024 ** 3).toFixed(2)),
      ramTotalGb: Number((total / 1024 ** 3).toFixed(2)),
      ramSource: "linux-meminfo",
    };
  } catch {
    return null;
  }
}

function sampleRam(): {
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramSource: SystemLoadSample["ramSource"];
} {
  const now = Date.now();
  if (cachedRam && now - cachedRam.at < RAM_CACHE_MS) {
    return {
      ram: cachedRam.ram,
      ramUsedGb: cachedRam.ramUsedGb,
      ramTotalGb: cachedRam.ramTotalGb,
      ramSource: cachedRam.ramSource,
    };
  }
  const next =
    sampleRamMacosVmStat() ||
    sampleRamLinuxMeminfo() ||
    sampleRamOsFreemem();
  cachedRam = { at: now, ...next };
  return next;
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

/**
 * macOS / Apple Silicon: IOAccelerator PerformanceStatistics.
 * Unified memory → report GPU util when present; "VRAM" ≈ in-use accelerator memory.
 */
async function tryMacosIoregGpu(): Promise<{
  gpu: number | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
} | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync(
      "/usr/sbin/ioreg",
      ["-r", "-d", "1", "-c", "IOAccelerator"],
      { timeout: 2500 },
    );
    const utilMatch =
      stdout.match(/"Device Utilization %"\s*=\s*(\d+)/) ||
      stdout.match(/"Renderer Utilization %"\s*=\s*(\d+)/) ||
      stdout.match(/"Tiler Utilization %"\s*=\s*(\d+)/);
    const inUseMatch =
      stdout.match(/"In use system memory"\s*=\s*(\d+)/) ||
      stdout.match(/"In use system memory"\s*=\s*<([0-9a-fA-F]+)>/);
    let gpu: number | null = null;
    if (utilMatch) gpu = clampPct(Number(utilMatch[1]));
    let vramUsedGb: number | null = null;
    if (inUseMatch) {
      let bytes = Number(inUseMatch[1]);
      if (!Number.isFinite(bytes) && inUseMatch[1]) {
        bytes = parseInt(inUseMatch[1], 16);
      }
      if (Number.isFinite(bytes) && bytes > 0) {
        vramUsedGb = Number((bytes / 1024 ** 3).toFixed(2));
      }
    }
    // Unified memory ceiling ≈ system RAM (honest for Apple Silicon).
    const vramTotalGb =
      vramUsedGb != null
        ? Number((os.totalmem() / 1024 ** 3).toFixed(2))
        : null;
    if (gpu == null && vramUsedGb == null) return null;
    return { gpu, vramUsedGb, vramTotalGb };
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

  const mac = await tryMacosIoregGpu();
  if (mac) {
    cachedGpu = {
      at: now,
      gpu: mac.gpu,
      vramUsedGb: mac.vramUsedGb,
      vramTotalGb: mac.vramTotalGb,
      source: "macos-ioreg",
    };
    return {
      gpu: mac.gpu,
      vramUsedGb: mac.vramUsedGb,
      vramTotalGb: mac.vramTotalGb,
      source: "macos-ioreg",
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
    ramSource: ram.ramSource,
    ts: Date.now(),
  };
}
