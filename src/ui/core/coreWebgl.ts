/**
 * Plasma / filament holographic core for Mira.
 * Visual target: turbulent dual-tone energy sphere (cyan + warm),
 * constantly in motion, denser with level 1…∞. Colors from theme tokens.
 */

import { normalizeCoreLevel } from "../coreLevel";

export type CoreVoice = "idle" | "listening" | "thinking" | "speaking";

export type CorePalette = {
  /** Cool filament (theme accent / success mix) */
  cool: [number, number, number];
  /** Warm filament (theme warning / accent mix) */
  warm: [number, number, number];
  /** Hot nucleus highlight */
  glow: [number, number, number];
};

type Band = "cool" | "warm" | "glow";

type Layer = {
  positions: Float32Array;
  phases: Float32Array;
  seeds: Float32Array;
  count: number;
  spin: number;
  tiltX: number;
  tiltZ: number;
  size: number;
  band: Band;
  turbulence: number;
  minLevel: number;
};

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in float aPhase;
layout(location=2) in float aSeed;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform float uTime;
uniform float uPulse;
uniform float uJitter;
uniform float uPointScale;
uniform float uTurbulence;
out float vAlpha;
out float vHot;
out float vBandMix;

float hash(float n){ return fract(sin(n)*43758.5453123); }

// Cheap curl-ish displacement so filaments weave instead of sit as a disc
vec3 plasmaCurl(vec3 p, float t, float s){
  float a = sin(p.y * 5.4 + t * 1.7 + s);
  float b = cos(p.z * 4.8 + t * 2.1 + s * 1.3);
  float c = sin(p.x * 6.1 + t * 1.3 + s * 0.7);
  float d = cos(p.x * 3.2 + p.y * 2.7 - t * 2.4 + s);
  float e = sin(p.z * 3.8 + p.x * 2.1 + t * 1.9);
  float f = cos(p.y * 4.1 - p.z * 3.3 + t * 2.7 + s * 2.0);
  return vec3(b - c, c - a, a - b) * 0.5
       + vec3(e - f, f - d, d - e) * 0.35;
}

void main(){
  float t = uTime;
  float s = aSeed * 6.28318;
  float turb = uTurbulence * uJitter;
  vec3 p = aPos;
  float r0 = length(p);
  vec3 nrm = r0 > 1e-4 ? p / r0 : vec3(0.0, 1.0, 0.0);

  // Multi-scale living filament motion
  vec3 curl = plasmaCurl(p * 1.15, t, s);
  vec3 curl2 = plasmaCurl(p * 2.4 + curl * 0.4, t * 1.35, s + 2.1);
  float w1 = sin(t * 2.15 + s + p.y * 8.0) * cos(t * 1.25 + p.z * 5.5);
  vec3 drift = curl * 0.085
    + curl2 * 0.04
    + nrm * (w1 * 0.028)
    + vec3(
        sin(t * 4.4 + s),
        cos(t * 3.8 + s * 1.3),
        sin(t * 2.6 + s * 2.1)
      ) * 0.018;
  p += drift * turb;

  // Soft radial breath — outer shells expand more so silhouette stays organic
  float breath = 1.0
    + uPulse * (0.04 + smoothstep(0.35, 1.2, r0) * 0.05)
    + sin(t * 2.05 + s) * 0.01 * turb;
  p *= breath;

  vec4 world = uModel * vec4(p, 1.0);
  gl_Position = uViewProj * world;

  float depth = clamp(0.38 + world.z * 0.42, 0.18, 1.0);
  float hot = smoothstep(0.18, 0.0, r0) * 0.7 + aPhase * 0.28;

  // Soft spherical falloff — no hard cookie-cutter rim
  float softEdge = 1.0 - smoothstep(0.72, 1.55, r0);
  softEdge *= softEdge;

  // Filament tips (high r, low phase) fade to wisps
  float tipFade = mix(1.0, 0.35, smoothstep(0.85, 1.45, r0) * (1.0 - aPhase));

  float sz = uPointScale * mix(0.85, 2.9, hot) * depth;
  // Outer filaments stay thin so strands read as lines, not a filled disc
  sz *= mix(1.0, 0.72, smoothstep(0.45, 1.1, r0));
  sz *= mix(1.0, 1.45, tipFade < 0.55 ? 1.0 : 0.0);
  gl_PointSize = max(1.0, sz);

  vAlpha = mix(0.18, 0.92, aPhase) * depth * mix(0.5, 1.0, hot) * softEdge * tipFade;
  vHot = clamp(hot + hash(aSeed + t * 0.01) * 0.06, 0.0, 1.0);
  vBandMix = aPhase;
}
`;

const FRAG = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uGain;
in float vAlpha;
in float vHot;
in float vBandMix;
out vec4 outColor;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  // Soft sprite discard — never a hard pixel circle
  float fall = 1.0 - smoothstep(0.55, 1.0, d);
  if (fall <= 0.001) discard;
  float core = exp(-d * d * 4.2);
  float bloom = pow(fall, 1.6);
  float a = (core * 0.9 + bloom * 0.4) * vAlpha * uGain;
  if (a < 0.004) discard;
  vec3 col = mix(uColor, vec3(1.0), vHot * 0.42);
  col = mix(col, uColor * 1.2, vBandMix * 0.22);
  outColor = vec4(col * a, a);
}
`;

function budget(base: number, level: number, softCap: number): number {
  const scale = 1 + Math.log2(1 + Math.max(0, level - 1)) * 0.62;
  return Math.min(softCap, Math.max(12, Math.floor(base * scale)));
}

function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Noisy arc from near-center toward outer shell — plasma filament strand. */
function filamentStrand(
  points: number,
  radius: number,
  seed: number,
  chaos: number,
): { pos: Float32Array; phase: Float32Array; seeds: Float32Array } {
  const pos = new Float32Array(points * 3);
  const phase = new Float32Array(points);
  const seeds = new Float32Array(points);

  const ax = rand(seed) * Math.PI * 2;
  const ay = Math.acos(2 * rand(seed + 1) - 1);
  let dir: [number, number, number] = [
    Math.sin(ay) * Math.cos(ax),
    Math.cos(ay),
    Math.sin(ay) * Math.sin(ax),
  ];
  // Start slightly off-center so strands braid instead of radiating as a disc
  const startR = 0.04 + rand(seed + 2.2) * 0.1;
  let px = dir[0] * startR + (rand(seed + 3) - 0.5) * 0.05;
  let py = dir[1] * startR + (rand(seed + 4) - 0.5) * 0.05;
  let pz = dir[2] * startR + (rand(seed + 5) - 0.5) * 0.05;

  // Per-strand length variance → irregular soft silhouette (not a hard sphere)
  const reach = radius * (0.62 + rand(seed + 6.1) * 0.55);

  for (let i = 0; i < points; i++) {
    const t = i / Math.max(1, points - 1);
    // Stronger lateral wander for curl-noise filament look
    const jx = (rand(seed + i * 3.1) - 0.5) * chaos * 1.35;
    const jy = (rand(seed + i * 5.7) - 0.5) * chaos * 1.35;
    const jz = (rand(seed + i * 9.3) - 0.5) * chaos * 1.35;
    // Twist around the primary axis so strands form ribbons
    const twist = Math.sin(t * Math.PI * (2.5 + rand(seed) * 3)) * chaos * 0.55;
    dir = [
      dir[0] * 0.72 + jx + (rand(seed + i) - 0.5) * 0.12 + dir[1] * twist * 0.15,
      dir[1] * 0.72 + jy + (rand(seed + i + 0.2) - 0.5) * 0.12 + dir[2] * twist * 0.15,
      dir[2] * 0.72 + jz + (rand(seed + i + 0.4) - 0.5) * 0.12 + dir[0] * twist * 0.15,
    ];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir = [dir[0] / len, dir[1] / len, dir[2] / len];
    const step = reach / points;
    px += dir[0] * step;
    py += dir[1] * step;
    pz += dir[2] * step;
    // Loose spherical attraction — keep volume without a hard shell
    const r = Math.hypot(px, py, pz) || 1;
    const targetR = 0.06 + t * reach;
    const pull = (targetR - r) * 0.22;
    px += (px / r) * pull;
    py += (py / r) * pull;
    pz += (pz / r) * pull;

    pos[i * 3] = px;
    pos[i * 3 + 1] = py;
    pos[i * 3 + 2] = pz;
    // Tip of strand is dimmer → soft organic perimeter
    phase[i] = 0.2 + (1 - t) * 0.7 + rand(seed + i * 0.17) * 0.12;
    seeds[i] = rand(seed + i * 0.37);
  }
  return { pos, phase, seeds };
}

function packStrands(
  strandCount: number,
  pointsPer: number,
  radius: number,
  chaos: number,
  seed0: number,
): { positions: Float32Array; phases: Float32Array; seeds: Float32Array } {
  const count = strandCount * pointsPer;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const seeds = new Float32Array(count);
  let o = 0;
  for (let s = 0; s < strandCount; s++) {
    const strand = filamentStrand(
      pointsPer,
      radius * (0.75 + rand(seed0 + s) * 0.35),
      seed0 + s * 19.17,
      chaos,
    );
    positions.set(strand.pos, o * 3);
    phases.set(strand.phase, o);
    seeds.set(strand.seeds, o);
    o += pointsPer;
  }
  return { positions, phases, seeds };
}

function nucleusCloud(
  count: number,
  radius: number,
  seed0: number,
): { positions: Float32Array; phases: Float32Array; seeds: Float32Array } {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = rand(seed0 + i);
    const v = rand(seed0 + i + 0.5);
    const w = rand(seed0 + i + 1.1);
    const a = u * Math.PI * 2;
    const b = Math.acos(2 * v - 1);
    const r = radius * Math.pow(w, 0.45);
    positions[i * 3] = Math.sin(b) * Math.cos(a) * r;
    positions[i * 3 + 1] = Math.cos(b) * r;
    positions[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
    phases[i] = 0.7 + rand(seed0 + i * 2) * 0.3;
    seeds[i] = rand(seed0 + i * 3);
  }
  return { positions, phases, seeds };
}

function sparkShell(
  count: number,
  radius: number,
  seed0: number,
): { positions: Float32Array; phases: Float32Array; seeds: Float32Array } {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rand(seed0 + i) * Math.PI * 2;
    const b = Math.acos(2 * rand(seed0 + i + 0.3) - 1);
    // Wide radial scatter so sparks don't form a crisp spherical rim
    const r = radius * (0.7 + rand(seed0 + i + 0.7) * 0.55);
    positions[i * 3] = Math.sin(b) * Math.cos(a) * r;
    positions[i * 3 + 1] = Math.cos(b) * r;
    positions[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
    phases[i] = 0.2 + rand(seed0 + i * 1.7) * 0.45;
    seeds[i] = rand(seed0 + i * 4.2);
  }
  return { positions, phases, seeds };
}

function buildLayers(level: number): Layer[] {
  const lv = normalizeCoreLevel(level);
  const layers: Layer[] = [];
  const chaos = 0.7 + Math.min(1.35, Math.log2(1 + lv) * 0.32);

  // Compact nucleus — bright focus, not a blown-out white disc
  {
    const n = nucleusCloud(budget(140, lv, 420), 0.14, 11.1);
    layers.push({
      ...n,
      count: n.phases.length,
      spin: 0.45,
      tiltX: 0.25,
      tiltZ: 0.12,
      size: 2.1,
      band: "glow",
      turbulence: 0.55,
      minLevel: 1,
    });
  }

  // Warm inner filaments — denser strands, thinner points
  {
    const strands = budget(36, lv, 110);
    const pts = budget(36, lv, 72);
    const pack = packStrands(strands, pts, 0.78, chaos, 3.3);
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: 0.48,
      tiltX: 0.55,
      tiltZ: -0.25,
      size: 1.35,
      band: "warm",
      turbulence: 1.35,
      minLevel: 1,
    });
  }

  // Cool mid filaments weaving through warm
  {
    const strands = budget(30, lv, 100);
    const pts = budget(34, lv, 68);
    const pack = packStrands(strands, pts, 0.98, chaos * 1.05, 7.7);
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: -0.38,
      tiltX: -0.45,
      tiltZ: 0.75,
      size: 1.25,
      band: "cool",
      turbulence: 1.25,
      minLevel: 1,
    });
  }

  if (lv >= 2) {
    const pack = packStrands(
      budget(24, lv, 85),
      budget(30, lv, 60),
      1.08,
      chaos * 1.1,
      13.2,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: 0.32,
      tiltX: 0.95,
      tiltZ: 0.4,
      size: 1.15,
      band: "warm",
      turbulence: 1.4,
      minLevel: 2,
    });
  }

  if (lv >= 3) {
    const pack = packStrands(
      budget(28, lv, 95),
      budget(38, lv, 76),
      1.18,
      chaos * 1.2,
      21.5,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: -0.52,
      tiltX: -0.8,
      tiltZ: -0.6,
      size: 1.1,
      band: "cool",
      turbulence: 1.5,
      minLevel: 3,
    });
  }

  if (lv >= 4) {
    // Sparse outer sparks — soft perimeter flecks, not a hard shell
    const sparks = sparkShell(budget(180, lv, 650), 1.32, 31);
    layers.push({
      ...sparks,
      count: sparks.phases.length,
      spin: 0.22,
      tiltX: 0.35,
      tiltZ: 0.55,
      size: 1.05,
      band: "warm",
      turbulence: 1.05,
      minLevel: 4,
    });
  }

  if (lv >= 5) {
    const pack = packStrands(
      budget(34, lv, 110),
      budget(40, lv, 80),
      1.32,
      chaos * 1.3,
      44.4,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: 0.58,
      tiltX: 1.15,
      tiltZ: -0.95,
      size: 1.05,
      band: "cool",
      turbulence: 1.55,
      minLevel: 5,
    });
  }

  // Beyond 5 — keep adding filament shells (capped tiers)
  if (lv >= 6) {
    const tiers = Math.min(10, lv - 5);
    for (let i = 0; i < tiers; i++) {
      const tier = 6 + i;
      if (lv < tier) break;
      const pack = packStrands(
        budget(14 + i * 2, lv, 60),
        budget(24, lv, 48),
        1.12 + i * 0.07,
        chaos * (1.15 + i * 0.04),
        55 + i * 9.1,
      );
      layers.push({
        ...pack,
        count: pack.phases.length,
        spin: (i % 2 === 0 ? 0.28 : -0.34) * (1 + i * 0.03),
        tiltX: 0.45 + i * 0.15,
        tiltZ: -0.35 - i * 0.1,
        size: 0.95,
        band: i % 2 === 0 ? "warm" : "cool",
        turbulence: 1.3 + i * 0.05,
        minLevel: tier,
      });
    }
  }

  return layers.filter((l) => l.minLevel <= lv);
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh) ?? "shader error";
    gl.deleteShader(sh);
    throw new Error(info);
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram {
  const prog = gl.createProgram()!;
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog) ?? "link error";
    gl.deleteProgram(prog);
    throw new Error(info);
  }
  return prog;
}

function mat4Identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Perspective(
  out: Float32Array,
  fovy: number,
  aspect: number,
  near: number,
  far: number,
): void {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}

function mat4LookAt(
  out: Float32Array,
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number],
): void {
  const zx = eye[0] - center[0];
  const zy = eye[1] - center[1];
  const zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  const z0 = zx / len;
  const z1 = zy / len;
  const z2 = zz / len;
  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2) || 1;
  x0 /= len;
  x1 /= len;
  x2 /= len;
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;
  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
}

function mat4Multiply(out: Float32Array, a: Float32Array, b: Float32Array): void {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  out.set(o);
}

function mat4FromEuler(
  out: Float32Array,
  ax: number,
  ay: number,
  az: number,
): void {
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  out[0] = cy * cz + sy * sx * sz;
  out[1] = cx * sz;
  out[2] = -sy * cz + cy * sx * sz;
  out[3] = 0;
  out[4] = -cy * sz + sy * sx * cz;
  out[5] = cx * cz;
  out[6] = sy * sz + cy * sx * cz;
  out[7] = 0;
  out[8] = sy * cx;
  out[9] = -sx;
  out[10] = cy * cx;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
}

export type CoreHandle = {
  setLevel: (level: number) => void;
  setVoice: (voice: CoreVoice) => void;
  setPalette: (palette: CorePalette) => void;
  resize: () => void;
  destroy: () => void;
};

export function createCoreWebgl(
  canvas: HTMLCanvasElement,
  opts: {
    level: number;
    voice: CoreVoice;
    palette: CorePalette;
  },
): CoreHandle | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  let level = normalizeCoreLevel(opts.level);
  let voice: CoreVoice = opts.voice;
  let palette = opts.palette;
  let layers = buildLayers(level);
  let raf = 0;
  let running = true;
  const start = performance.now();

  let prog: WebGLProgram;
  try {
    prog = link(gl, VERT, FRAG);
  } catch {
    return null;
  }

  const uViewProj = gl.getUniformLocation(prog, "uViewProj");
  const uModel = gl.getUniformLocation(prog, "uModel");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uPulse = gl.getUniformLocation(prog, "uPulse");
  const uJitter = gl.getUniformLocation(prog, "uJitter");
  const uPointScale = gl.getUniformLocation(prog, "uPointScale");
  const uTurbulence = gl.getUniformLocation(prog, "uTurbulence");
  const uColor = gl.getUniformLocation(prog, "uColor");
  const uGain = gl.getUniformLocation(prog, "uGain");

  type GpuLayer = Layer & {
    vao: WebGLVertexArrayObject;
    posBuf: WebGLBuffer;
    phaseBuf: WebGLBuffer;
    seedBuf: WebGLBuffer;
  };

  function uploadLayers(src: Layer[]): GpuLayer[] {
    return src.map((layer) => {
      const vao = gl!.createVertexArray()!;
      gl!.bindVertexArray(vao);
      const posBuf = gl!.createBuffer()!;
      gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuf);
      gl!.bufferData(gl!.ARRAY_BUFFER, layer.positions, gl!.STATIC_DRAW);
      gl!.enableVertexAttribArray(0);
      gl!.vertexAttribPointer(0, 3, gl!.FLOAT, false, 0, 0);
      const phaseBuf = gl!.createBuffer()!;
      gl!.bindBuffer(gl!.ARRAY_BUFFER, phaseBuf);
      gl!.bufferData(gl!.ARRAY_BUFFER, layer.phases, gl!.STATIC_DRAW);
      gl!.enableVertexAttribArray(1);
      gl!.vertexAttribPointer(1, 1, gl!.FLOAT, false, 0, 0);
      const seedBuf = gl!.createBuffer()!;
      gl!.bindBuffer(gl!.ARRAY_BUFFER, seedBuf);
      gl!.bufferData(gl!.ARRAY_BUFFER, layer.seeds, gl!.STATIC_DRAW);
      gl!.enableVertexAttribArray(2);
      gl!.vertexAttribPointer(2, 1, gl!.FLOAT, false, 0, 0);
      gl!.bindVertexArray(null);
      return { ...layer, vao, posBuf, phaseBuf, seedBuf };
    });
  }

  let gpu = uploadLayers(layers);

  const proj = mat4Identity();
  const view = mat4Identity();
  const viewProj = mat4Identity();
  const model = mat4Identity();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }

  function rebuild() {
    for (const layer of gpu) {
      gl!.deleteBuffer(layer.posBuf);
      gl!.deleteBuffer(layer.phaseBuf);
      gl!.deleteBuffer(layer.seedBuf);
      gl!.deleteVertexArray(layer.vao);
    }
    layers = buildLayers(level);
    gpu = uploadLayers(layers);
  }

  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    resize();
    const t = (now - start) / 1000;

    let pulse = 0.4 + Math.sin(t * 1.7) * 0.35;
    let jitter = 0.85;
    let speed = 1;
    let gain = 1.05;
    if (voice === "listening") {
      pulse = 0.75 + Math.sin(t * 3.4) * 0.45;
      jitter = 1.05;
    } else if (voice === "thinking") {
      pulse = 0.55 + Math.sin(t * 8.2) * 0.4;
      jitter = 1.55;
      speed = 1.7;
    } else if (voice === "speaking") {
      pulse = 0.9 + Math.sin(t * 5.5) * 0.4;
      jitter = 1.25;
      speed = 1.4;
      gain = 1.25;
    }

    const aspect = canvas.width / Math.max(1, canvas.height);
    // Wider FOV + pulled-back camera so soft filament tips never hit a hard frame edge
    mat4Perspective(proj, (48 * Math.PI) / 180, aspect, 0.1, 20);
    mat4LookAt(view, [0, 0.06, 3.85], [0, 0, 0], [0, 1, 0]);
    mat4Multiply(viewProj, proj, view);

    gl!.disable(gl!.DEPTH_TEST);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    gl!.useProgram(prog);
    gl!.uniformMatrix4fv(uViewProj, false, viewProj);
    gl!.uniform1f(uTime, t * speed);
    gl!.uniform1f(uPulse, pulse);
    gl!.uniform1f(uJitter, jitter);
    gl!.uniform1f(uPointScale, (canvas.height / 400) * 1.85);
    gl!.uniform1f(uGain, gain);

    for (const layer of gpu) {
      mat4FromEuler(
        model,
        layer.tiltX * 0.4 + Math.sin(t * 0.18) * 0.1,
        t * layer.spin * speed,
        layer.tiltZ * 0.4 + Math.cos(t * 0.11) * 0.06,
      );
      // Slight overall scale-down leaves margin for soft falloff inside the canvas
      model[0] *= 0.82;
      model[1] *= 0.82;
      model[2] *= 0.82;
      model[4] *= 0.82;
      model[5] *= 0.82;
      model[6] *= 0.82;
      model[8] *= 0.82;
      model[9] *= 0.82;
      model[10] *= 0.82;
      gl!.uniformMatrix4fv(uModel, false, model);
      gl!.uniform1f(uTurbulence, layer.turbulence);
      const rgb =
        layer.band === "cool"
          ? palette.cool
          : layer.band === "warm"
            ? palette.warm
            : palette.glow;
      gl!.uniform3f(uColor, rgb[0], rgb[1], rgb[2]);
      gl!.bindVertexArray(layer.vao);
      gl!.drawArrays(gl!.POINTS, 0, layer.count);
    }
    gl!.bindVertexArray(null);
  }

  resize();
  raf = requestAnimationFrame(frame);

  return {
    setLevel(next) {
      const n = normalizeCoreLevel(next);
      if (n === level) return;
      level = n;
      rebuild();
    },
    setVoice(next) {
      voice = next;
    },
    setPalette(next) {
      palette = next;
    },
    resize,
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      for (const layer of gpu) {
        gl.deleteBuffer(layer.posBuf);
        gl.deleteBuffer(layer.phaseBuf);
        gl.deleteBuffer(layer.seedBuf);
        gl.deleteVertexArray(layer.vao);
      }
      gl.deleteProgram(prog);
    },
  };
}

export function parseCssRgb(raw: string): [number, number, number] {
  const s = raw.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  }
  const m = s.match(
    /rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i,
  );
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);
    if (a > 1 || b > 1 || c > 1) return [a / 255, b / 255, c / 255];
    return [a, b, c];
  }
  return [0.35, 0.75, 1];
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function lift(rgb: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.min(1, rgb[0] * (1 - amount) + amount),
    Math.min(1, rgb[1] * (1 - amount) + amount),
    Math.min(1, rgb[2] * (1 - amount) + amount),
  ];
}

/** Cool/warm plasma bands derived from active theme tokens. */
export function paletteFromElement(el: Element): CorePalette {
  const cs = getComputedStyle(el);
  const accent = parseCssRgb(cs.getPropertyValue("--accent") || "#5ad0ff");
  const success = parseCssRgb(cs.getPropertyValue("--success") || "#5dffb1");
  const warning = parseCssRgb(cs.getPropertyValue("--warning") || "#ffb45c");
  const cool = lift(mixRgb(accent, success, 0.35), 0.12);
  const warm = lift(mixRgb(warning, accent, 0.25), 0.08);
  return {
    cool,
    warm,
    glow: lift(mixRgb(warm, cool, 0.35), 0.55),
  };
}
