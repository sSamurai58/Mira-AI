import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requestUserConfirm } from "../confirmBridge";

export type BlenderPolicy = {
  enabled: boolean;
  binaryPath: string | null;
  found: boolean;
  mode: "live" | "dry-run";
  requireConfirm: boolean;
  outputDir: string;
};

export type BlenderJobResult = {
  ok: boolean;
  mode: "live" | "dry-run" | "denied";
  task: string;
  binaryPath: string | null;
  scriptPath: string;
  outputBlend: string | null;
  logPath: string;
  detail: string;
  stdout: string;
};

function blenderRoot(...parts: string[]): string {
  const { dataRoot } = require("../appPaths") as typeof import("../appPaths");
  const dir = dataRoot("blender", ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function candidateBinaries(): string[] {
  const fromEnv = (process.env.BLENDER_PATH ?? "").trim();
  const list = [
    fromEnv,
    "blender",
    "/usr/bin/blender",
    "/usr/local/bin/blender",
    "/snap/bin/blender",
    "/Applications/Blender.app/Contents/MacOS/Blender",
  ].filter(Boolean);
  return [...new Set(list)];
}

export function resolveBlenderBinary(): string | null {
  for (const cand of candidateBinaries()) {
    if (cand === "blender") {
      // PATH lookup via which-like: try common + leave spawn to fail later
      continue;
    }
    if (fs.existsSync(cand)) return cand;
  }
  // last resort: trust PATH name if BLENDER_PATH unset and user wants live
  if ((process.env.BLENDER_PATH ?? "").trim() === "blender") return "blender";
  return null;
}

export function getBlenderPolicy(): BlenderPolicy {
  const enabled =
    (process.env.BLENDER_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const forceDry =
    (process.env.BLENDER_MODE ?? "").trim().toLowerCase() === "dry-run";
  const binaryPath = resolveBlenderBinary();
  const found = Boolean(binaryPath);
  const requireConfirm =
    (process.env.BLENDER_CONFIRM ?? "true").trim().toLowerCase() !== "false";
  return {
    enabled,
    binaryPath,
    found,
    mode: !forceDry && found ? "live" : "dry-run",
    requireConfirm,
    outputDir: blenderRoot("out"),
  };
}

export function looksLikeBlenderIntent(text: string): boolean {
  return (
    /blender/i.test(text) ||
    /(собери|создай|сделай).{0,40}сцен/i.test(text) ||
    /(куб|cube).{0,30}(свет|light|ламп)/i.test(text) ||
    /(сцен[ауе].{0,20}(куб|cube))/i.test(text)
  );
}

export function isBlenderSkill(item: { id: string; triggers: string[] }): boolean {
  if (item.id.startsWith("blender-")) return true;
  return item.triggers.some((t) => /blender|bpy|сцена 3d|3d scene/i.test(t));
}

function demoSceneScript(outputBlend: string): string {
  const out = outputBlend.replace(/\\/g, "/");
  return `import bpy
import math

# Mira P10 demo: clear default scene, add cube + sun + camera
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1))
cube = bpy.context.active_object
cube.name = "MiraCube"
mat = bpy.data.materials.new(name="MiraCubeMat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.15, 0.55, 0.95, 1.0)
cube.data.materials.append(mat)

bpy.ops.object.light_add(type='SUN', location=(5, -2, 8))
sun = bpy.context.active_object
sun.name = "MiraSun"
sun.data.energy = 3.0

bpy.ops.object.camera_add(location=(7.5, -7.5, 5.5), rotation=(math.radians(60), 0, math.radians(45)))
cam = bpy.context.active_object
cam.name = "MiraCamera"
bpy.context.scene.camera = cam

bpy.ops.wm.save_as_mainfile(filepath=r"${out}")
print("MIRA_BLENDER_OK cube+sun+camera")
`;
}

function runProcess(
  bin: string,
  args: string[],
  timeoutMs = 60_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: String(err) });
    });
  });
}

export async function runDemoScene(opts?: {
  forceDry?: boolean;
}): Promise<BlenderJobResult> {
  const policy = getBlenderPolicy();
  const stamp = Date.now();
  const jobDir = blenderRoot("jobs", String(stamp));
  const scriptPath = path.join(jobDir, "demo_cube_light.py");
  const outputBlend = path.join(policy.outputDir, `mira-demo-${stamp}.blend`);
  const logPath = path.join(jobDir, "run.log");
  const script = demoSceneScript(outputBlend);
  fs.writeFileSync(scriptPath, script, "utf8");
  fs.writeFileSync(
    path.join(jobDir, "manifest.json"),
    JSON.stringify(
      {
        task: "demo-cube-light",
        scriptPath,
        outputBlend,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  const useDry = opts?.forceDry || policy.mode === "dry-run" || !policy.found;
  if (useDry) {
    const detail = policy.found
      ? `Dry-run: скрипт готов (${scriptPath}). Установите BLENDER_MODE=live для запуска.`
      : `Blender не найден. Задан путь BLENDER_PATH или установите Blender. Скрипт сохранён: ${scriptPath}`;
    fs.writeFileSync(logPath, detail + "\n", "utf8");
    return {
      ok: true,
      mode: "dry-run",
      task: "demo-cube-light",
      binaryPath: policy.binaryPath,
      scriptPath,
      outputBlend: null,
      logPath,
      detail,
      stdout: "",
    };
  }

  if (policy.requireConfirm) {
    const ok = await requestUserConfirm({
      actionClass: "blender",
      risk: "low",
      title: "Запуск Blender",
      body: `Mira выполнит bpy-скрипт демо-сцены (куб + свет + камера) через:\n${policy.binaryPath}\n\nРезультат: ${outputBlend}`,
      confirmLabel: "Запустить",
    });
    if (!ok) {
      return {
        ok: false,
        mode: "denied",
        task: "demo-cube-light",
        binaryPath: policy.binaryPath,
        scriptPath,
        outputBlend: null,
        logPath,
        detail: "Пользователь отклонил запуск Blender",
        stdout: "",
      };
    }
  }

  const bin = policy.binaryPath!;
  const ran = await runProcess(bin, [
    "--background",
    "--python",
    scriptPath,
  ]);
  const log = [
    `bin=${bin}`,
    `code=${ran.code}`,
    "--- stdout ---",
    ran.stdout,
    "--- stderr ---",
    ran.stderr,
  ].join("\n");
  fs.writeFileSync(logPath, log, "utf8");
  const ok =
    ran.code === 0 &&
    (ran.stdout.includes("MIRA_BLENDER_OK") || fs.existsSync(outputBlend));
  return {
    ok,
    mode: "live",
    task: "demo-cube-light",
    binaryPath: bin,
    scriptPath,
    outputBlend: fs.existsSync(outputBlend) ? outputBlend : null,
    logPath,
    detail: ok
      ? `Сцена собрана${fs.existsSync(outputBlend) ? `: ${outputBlend}` : ""}`
      : `Blender завершился с ошибкой (code=${ran.code}). См. ${logPath}`,
    stdout: ran.stdout.slice(0, 4000),
  };
}

export function formatBlenderBlock(result: BlenderJobResult): string {
  return [
    "[Blender tool]",
    `task: ${result.task}`,
    `mode: ${result.mode}`,
    `ok: ${result.ok}`,
    `detail: ${result.detail}`,
    result.outputBlend ? `blend: ${result.outputBlend}` : null,
    `script: ${result.scriptPath}`,
    "Опиши пользователю результат коротко: что сделано в сцене (куб, свет, камера) и режим live/dry-run.",
  ]
    .filter(Boolean)
    .join("\n");
}
