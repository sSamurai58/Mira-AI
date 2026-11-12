/**
 * Plasma / filament holographic core for Mira.
 *
 * Visual target (1:1 with ref): white-yellow nucleus → dense tangled orange
 * inner nest → prominent turbulent CYAN/TEAL mid-shell ring → outer wispy
 * orange filaments + sparks. Soft bloom, organic silhouette (no hard CSS
 * circle clip). Theme may tint; structure stays orange/cyan layered.
 */

import { normalizeCoreLevel } from "../coreLevel";

export type CoreVoice = "idle" | "listening" | "thinking" | "speaking";

export type CorePalette = {
  /** Cool filament — cyan / teal mid-shell */
  cool: [number, number, number];
  /** Warm filament — amber / orange nest + outer shell */
  warm: [number, number, number];
  /** Hot nucleus highlight — white-yellow */
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
  /** Extra radial shell lock (0 = free, 1 = cling to shell) */
  shellLock: number;
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
uniform float uShellLock;
out float vAlpha;
out float vHot;
out float vBandMix;

float hash(float n){ return fract(sin(n)*43758.5453123); }

// Multi-octave curl so mid-shell reads as electrical plasma waves
vec3 plasmaCurl(vec3 p, float t, float s){
  float a = sin(p.y * 5.4 + t * 1.7 + s);
  float b = cos(p.z * 4.8 + t * 2.1 + s * 1.3);
  float c = sin(p.x * 6.1 + t * 1.3 + s * 0.7);
  float d = cos(p.x * 3.2 + p.y * 2.7 - t * 2.4 + s);
  float e = sin(p.z * 3.8 + p.x * 2.1 + t * 1.9);
  float f = cos(p.y * 4.1 - p.z * 3.3 + t * 2.7 + s * 2.0);
  float g = sin(p.x * 7.2 - p.y * 5.1 + t * 3.1 + s * 0.4);
  float h = cos(p.z * 6.5 + p.y * 4.4 - t * 2.8 + s * 1.8);
  return vec3(b - c, c - a, a - b) * 0.5
       + vec3(e - f, f - d, d - e) * 0.38
       + vec3(h - g, g - h * 0.6, g - h) * 0.22;
}

void main(){
  float t = uTime;
  float s = aSeed * 6.28318;
  float turb = uTurbulence * uJitter;
  vec3 p = aPos;
  float r0 = length(p);
  vec3 nrm = r0 > 1e-4 ? p / r0 : vec3(0.0, 1.0, 0.0);

  vec3 curl = plasmaCurl(p * 1.2, t, s);
  vec3 curl2 = plasmaCurl(p * 2.6 + curl * 0.45, t * 1.45, s + 2.1);
  vec3 curl3 = plasmaCurl(p * 4.1 - curl2 * 0.3, t * 2.1, s + 5.3);
  float w1 = sin(t * 2.35 + s + p.y * 9.0) * cos(t * 1.35 + p.z * 6.0);

  // Mid-shell: stronger tangential / wavy displacement (electrical ring)
  float shellAmt = uShellLock;
  vec3 tangential = cross(nrm, curl) + cross(curl2, nrm) * 0.6;
  vec3 drift = curl * mix(0.09, 0.055, shellAmt)
    + curl2 * mix(0.045, 0.07, shellAmt)
    + curl3 * mix(0.02, 0.055, shellAmt)
    + tangential * shellAmt * 0.085
    + nrm * (w1 * mix(0.03, 0.055, shellAmt))
    + vec3(
        sin(t * 4.8 + s),
        cos(t * 4.1 + s * 1.3),
        sin(t * 2.9 + s * 2.1)
      ) * mix(0.018, 0.032, shellAmt);
  p += drift * turb;

  // Pull shell layers back toward their birth radius so cyan stays a RING
  if (shellAmt > 0.01 && r0 > 1e-4) {
    float wave = 1.0
      + sin(t * 3.2 + s * 2.0 + p.y * 6.0) * 0.045 * turb
      + cos(t * 2.4 + s + p.x * 5.0) * 0.035 * turb;
    float targetR = r0 * wave;
    float cur = length(p);
    if (cur > 1e-4) {
      vec3 sn = p / cur;
      p = mix(p, sn * targetR, shellAmt * 0.72);
    }
  }

  float breath = 1.0
    + uPulse * (0.035 + smoothstep(0.3, 1.25, r0) * 0.055)
    + sin(t * 2.1 + s) * 0.012 * turb;
  p *= breath;

  vec4 world = uModel * vec4(p, 1.0);
  gl_Position = uViewProj * world;

  float depth = clamp(0.36 + world.z * 0.44, 0.16, 1.0);
  float hot = smoothstep(0.22, 0.0, r0) * 0.85 + aPhase * 0.22;

  // Soft organic falloff — irregular tips, never a cookie-cutter rim
  float softEdge = 1.0 - smoothstep(0.78, 1.65, r0);
  softEdge *= softEdge;
  float tipFade = mix(1.0, 0.28, smoothstep(0.9, 1.5, r0) * (1.0 - aPhase));

  float sz = uPointScale * mix(0.75, 3.4, hot) * depth;
  // Nucleus larger; filaments stay thin; outer wisps slightly elongated
  sz *= mix(1.0, 0.62, smoothstep(0.28, 0.95, r0));
  sz *= mix(1.0, 1.55, tipFade < 0.5 ? 1.0 : 0.0);
  // Shell ring filaments a touch thicker so cyan band reads clearly
  sz *= mix(1.0, 1.18, shellAmt);
  gl_PointSize = max(1.0, sz);

  vAlpha = mix(0.16, 0.95, aPhase) * depth * mix(0.48, 1.0, hot) * softEdge * tipFade;
  // Shell ring stays more opaque so cyan mid-band is prominent
  vAlpha *= mix(1.0, 1.25, shellAmt * aPhase);
  vHot = clamp(hot + hash(aSeed + t * 0.012) * 0.07, 0.0, 1.0);
  vBandMix = aPhase;
}
`;

const FRAG = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uGain;
uniform float uBandKind; // 0 warm, 1 cool, 2 glow
in float vAlpha;
in float vHot;
in float vBandMix;
out vec4 outColor;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float fall = 1.0 - smoothstep(0.5, 1.0, d);
  if (fall <= 0.001) discard;
  float core = exp(-d * d * 4.6);
  float bloom = pow(fall, 1.55);
  float a = (core * 0.92 + bloom * 0.42) * vAlpha * uGain;
  if (a < 0.0035) discard;

  vec3 col = uColor;
  if (uBandKind > 1.5) {
    // Nucleus: push toward white-yellow
    col = mix(uColor, vec3(1.0, 0.97, 0.82), 0.55 + vHot * 0.35);
  } else if (uBandKind > 0.5) {
    // Cool cyan: keep saturated; only slight white at hot tips
    col = mix(uColor, vec3(0.75, 1.0, 0.98), vHot * 0.22);
    col = mix(col, uColor * 1.15, vBandMix * 0.15);
  } else {
    // Warm orange: amber → near-white at hottest filament cores
    col = mix(uColor, vec3(1.0, 0.92, 0.55), vHot * 0.48);
    col = mix(col, uColor * 1.25, vBandMix * 0.2);
  }
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

/** Dense short chaotic strands filling an inner ball (orange nest). */
function tangledBall(
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
    const seed = seed0 + s * 17.3;
    const ax = rand(seed) * Math.PI * 2;
    const ay = Math.acos(2 * rand(seed + 1) - 1);
    let px =
      Math.sin(ay) * Math.cos(ax) * radius * (0.05 + rand(seed + 2) * 0.35);
    let py = Math.cos(ay) * radius * (0.05 + rand(seed + 3) * 0.35);
    let pz =
      Math.sin(ay) * Math.sin(ax) * radius * (0.05 + rand(seed + 4) * 0.35);
    let dir: [number, number, number] = [
      rand(seed + 5) - 0.5,
      rand(seed + 6) - 0.5,
      rand(seed + 7) - 0.5,
    ];
    const d0 = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir = [dir[0] / d0, dir[1] / d0, dir[2] / d0];
    const reach = radius * (0.35 + rand(seed + 8) * 0.55);

    for (let i = 0; i < pointsPer; i++) {
      const t = i / Math.max(1, pointsPer - 1);
      const jx = (rand(seed + i * 2.1) - 0.5) * chaos * 1.6;
      const jy = (rand(seed + i * 3.7) - 0.5) * chaos * 1.6;
      const jz = (rand(seed + i * 5.9) - 0.5) * chaos * 1.6;
      dir = [
        dir[0] * 0.55 + jx,
        dir[1] * 0.55 + jy,
        dir[2] * 0.55 + jz,
      ];
      const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      dir = [dir[0] / len, dir[1] / len, dir[2] / len];
      const step = reach / pointsPer;
      px += dir[0] * step;
      py += dir[1] * step;
      pz += dir[2] * step;
      // Keep inside the inner nest ball
      const r = Math.hypot(px, py, pz) || 1;
      if (r > radius) {
        const k = radius / r;
        px *= k;
        py *= k;
        pz *= k;
      }
      positions[(o + i) * 3] = px;
      positions[(o + i) * 3 + 1] = py;
      positions[(o + i) * 3 + 2] = pz;
      phases[o + i] = 0.35 + (1 - t) * 0.55 + rand(seed + i) * 0.15;
      seeds[o + i] = rand(seed + i * 0.41);
    }
    o += pointsPer;
  }
  return { positions, phases, seeds };
}

/**
 * Turbulent arcs constrained to a spherical shell — cyan mid-ring /
 * outer orange wisps. Thickness + wave amplitude control how ring-like.
 */
function shellArcs(
  strandCount: number,
  pointsPer: number,
  radius: number,
  thickness: number,
  chaos: number,
  seed0: number,
  arcSpan = 0.55,
): { positions: Float32Array; phases: Float32Array; seeds: Float32Array } {
  const count = strandCount * pointsPer;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const seeds = new Float32Array(count);
  let o = 0;
  for (let s = 0; s < strandCount; s++) {
    const seed = seed0 + s * 23.7;
    // Random great-circle-ish plane
    const ax = rand(seed) * Math.PI * 2;
    const ay = Math.acos(2 * rand(seed + 1) - 1);
    const n: [number, number, number] = [
      Math.sin(ay) * Math.cos(ax),
      Math.cos(ay),
      Math.sin(ay) * Math.sin(ax),
    ];
    // Basis on the plane
    let tx: [number, number, number] = [-n[1], n[0], 0];
    if (Math.hypot(tx[0], tx[1], tx[2]) < 0.2) tx = [0, -n[2], n[1]];
    const tl = Math.hypot(tx[0], tx[1], tx[2]) || 1;
    tx = [tx[0] / tl, tx[1] / tl, tx[2] / tl];
    const ty: [number, number, number] = [
      n[1] * tx[2] - n[2] * tx[1],
      n[2] * tx[0] - n[0] * tx[2],
      n[0] * tx[1] - n[1] * tx[0],
    ];
    const startAng = rand(seed + 2) * Math.PI * 2;
    const span = (0.35 + rand(seed + 3) * arcSpan) * Math.PI * 2;
    const rBase = radius * (0.88 + rand(seed + 4) * 0.22);

    for (let i = 0; i < pointsPer; i++) {
      const t = i / Math.max(1, pointsPer - 1);
      const ang = startAng + t * span;
      // High-frequency wave for electrical turbulence (esp. cyan ring)
      const wave =
        Math.sin(ang * (3 + rand(seed) * 5) + seed) * chaos * 0.12 +
        Math.sin(ang * (7 + rand(seed + 5) * 4) + seed * 2) * chaos * 0.07;
      const rOff = (rand(seed + i * 1.3) - 0.5) * thickness + wave * radius;
      const r = rBase + rOff;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      // Lateral jitter off the ideal plane
      const jn = (rand(seed + i * 2.9) - 0.5) * thickness * chaos * 0.85;
      const px = (tx[0] * c + ty[0] * sn) * r + n[0] * jn;
      const py = (tx[1] * c + ty[1] * sn) * r + n[1] * jn;
      const pz = (tx[2] * c + ty[2] * sn) * r + n[2] * jn;
      positions[(o + i) * 3] = px;
      positions[(o + i) * 3 + 1] = py;
      positions[(o + i) * 3 + 2] = pz;
      // Mid-arc brighter; tips fade to wisps
      const tip = Math.min(t, 1 - t) * 2;
      phases[o + i] = 0.25 + tip * 0.55 + rand(seed + i * 0.2) * 0.2;
      seeds[o + i] = rand(seed + i * 0.37);
    }
    o += pointsPer;
  }
  return { positions, phases, seeds };
}

/** Radial filament strands (outer loopy orange tendrils). */
function filamentStrand(
  points: number,
  radius: number,
  seed: number,
  chaos: number,
  startMin = 0.35,
  startMax = 0.55,
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
  const startR = startMin + rand(seed + 2.2) * (startMax - startMin);
  let px = dir[0] * startR + (rand(seed + 3) - 0.5) * 0.04;
  let py = dir[1] * startR + (rand(seed + 4) - 0.5) * 0.04;
  let pz = dir[2] * startR + (rand(seed + 5) - 0.5) * 0.04;
  const reach = radius * (0.7 + rand(seed + 6.1) * 0.5);

  for (let i = 0; i < points; i++) {
    const t = i / Math.max(1, points - 1);
    const jx = (rand(seed + i * 3.1) - 0.5) * chaos * 1.45;
    const jy = (rand(seed + i * 5.7) - 0.5) * chaos * 1.45;
    const jz = (rand(seed + i * 9.3) - 0.5) * chaos * 1.45;
    const twist = Math.sin(t * Math.PI * (2.8 + rand(seed) * 3.5)) * chaos * 0.65;
    dir = [
      dir[0] * 0.68 + jx + (rand(seed + i) - 0.5) * 0.14 + dir[1] * twist * 0.18,
      dir[1] * 0.68 + jy + (rand(seed + i + 0.2) - 0.5) * 0.14 + dir[2] * twist * 0.18,
      dir[2] * 0.68 + jz + (rand(seed + i + 0.4) - 0.5) * 0.14 + dir[0] * twist * 0.18,
    ];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir = [dir[0] / len, dir[1] / len, dir[2] / len];
    const step = reach / points;
    px += dir[0] * step;
    py += dir[1] * step;
    pz += dir[2] * step;
    const r = Math.hypot(px, py, pz) || 1;
    const targetR = startR + t * (reach - startR * 0.3);
    const pull = (targetR - r) * 0.18;
    px += (px / r) * pull;
    py += (py / r) * pull;
    pz += (pz / r) * pull;

    pos[i * 3] = px;
    pos[i * 3 + 1] = py;
    pos[i * 3 + 2] = pz;
    phase[i] = 0.18 + (1 - t) * 0.65 + rand(seed + i * 0.17) * 0.12;
    seeds[i] = rand(seed + i * 0.37);
  }
  return { pos, phase, seeds };
}

function packOuterWisps(
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
      radius * (0.8 + rand(seed0 + s) * 0.4),
      seed0 + s * 19.17,
      chaos,
      0.4,
      0.65,
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
    // Concentrate near center for white-hot sun
    const r = radius * Math.pow(w, 0.7);
    positions[i * 3] = Math.sin(b) * Math.cos(a) * r;
    positions[i * 3 + 1] = Math.cos(b) * r;
    positions[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
    phases[i] = 0.82 + rand(seed0 + i * 2) * 0.18;
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
    // Prefer outer shell; scatter so silhouette stays irregular
    const r = radius * (0.55 + rand(seed0 + i + 0.7) * 0.7);
    positions[i * 3] = Math.sin(b) * Math.cos(a) * r;
    positions[i * 3 + 1] = Math.cos(b) * r;
    positions[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
    phases[i] = 0.15 + rand(seed0 + i * 1.7) * 0.5;
    seeds[i] = rand(seed0 + i * 4.2);
  }
  return { positions, phases, seeds };
}

function buildLayers(level: number): Layer[] {
  const lv = normalizeCoreLevel(level);
  const layers: Layer[] = [];
  const chaos = 0.85 + Math.min(1.4, Math.log2(1 + lv) * 0.35);

  // —— 1. White-yellow nucleus ——
  {
    const n = nucleusCloud(budget(220, lv, 520), 0.12, 11.1);
    layers.push({
      ...n,
      count: n.phases.length,
      spin: 0.55,
      tiltX: 0.2,
      tiltZ: 0.1,
      size: 2.55,
      band: "glow",
      turbulence: 0.4,
      shellLock: 0,
      minLevel: 1,
    });
  }

  // —— 2. Dense tangled orange/amber INNER nest ——
  {
    const pack = tangledBall(
      budget(55, lv, 140),
      budget(28, lv, 56),
      0.52,
      chaos * 1.15,
      3.3,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: 0.52,
      tiltX: 0.6,
      tiltZ: -0.3,
      size: 1.2,
      band: "warm",
      turbulence: 1.15,
      shellLock: 0,
      minLevel: 1,
    });
  }
  // Extra warm density braid through inner volume
  {
    const pack = tangledBall(
      budget(32, lv, 95),
      budget(22, lv, 44),
      0.42,
      chaos,
      5.1,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: -0.4,
      tiltX: -0.5,
      tiltZ: 0.55,
      size: 1.05,
      band: "warm",
      turbulence: 1.05,
      shellLock: 0,
      minLevel: 1,
    });
  }

  // —— 3. Prominent turbulent CYAN mid-shell RING ——
  {
    const pack = shellArcs(
      budget(48, lv, 130),
      budget(42, lv, 78),
      0.72,
      0.1,
      chaos * 1.35,
      7.7,
      0.7,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: -0.62,
      tiltX: 0.35,
      tiltZ: 0.85,
      size: 1.45,
      band: "cool",
      turbulence: 1.65,
      shellLock: 0.92,
      minLevel: 1,
    });
  }
  // Counter-rotating cyan weave (interleaves into orange)
  {
    const pack = shellArcs(
      budget(36, lv, 110),
      budget(36, lv, 70),
      0.62,
      0.14,
      chaos * 1.25,
      9.4,
      0.55,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: 0.48,
      tiltX: -0.7,
      tiltZ: -0.4,
      size: 1.3,
      band: "cool",
      turbulence: 1.55,
      shellLock: 0.85,
      minLevel: 1,
    });
  }
  // Slightly outer cyan fringe weaving into orange shell
  {
    const pack = shellArcs(
      budget(22, lv, 80),
      budget(30, lv, 58),
      0.88,
      0.12,
      chaos * 1.15,
      12.2,
      0.4,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: -0.28,
      tiltX: 0.9,
      tiltZ: 0.25,
      size: 1.15,
      band: "cool",
      turbulence: 1.4,
      shellLock: 0.7,
      minLevel: 1,
    });
  }

  // —— 4. Outer wispy ORANGE filament shell ——
  {
    const pack = packOuterWisps(
      budget(40, lv, 120),
      budget(34, lv, 68),
      1.15,
      chaos * 1.1,
      13.2,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: 0.34,
      tiltX: 0.85,
      tiltZ: 0.35,
      size: 1.1,
      band: "warm",
      turbulence: 1.25,
      shellLock: 0.15,
      minLevel: 1,
    });
  }
  {
    const pack = shellArcs(
      budget(28, lv, 90),
      budget(32, lv, 62),
      1.05,
      0.18,
      chaos * 1.05,
      16.8,
      0.65,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: -0.42,
      tiltX: -0.55,
      tiltZ: 0.7,
      size: 1.05,
      band: "warm",
      turbulence: 1.2,
      shellLock: 0.45,
      minLevel: 1,
    });
  }

  // —— 5. Sparks / embers (visible from level 1; denser with level) ——
  {
    const sparks = sparkShell(budget(160, lv, 700), 1.28, 31);
    layers.push({
      ...sparks,
      count: sparks.phases.length,
      spin: 0.2,
      tiltX: 0.3,
      tiltZ: 0.5,
      size: 0.95,
      band: "warm",
      turbulence: 1.1,
      shellLock: 0,
      minLevel: 1,
    });
  }

  // Level 2+: denser cyan mid band
  if (lv >= 2) {
    const pack = shellArcs(
      budget(30, lv, 100),
      budget(40, lv, 74),
      0.78,
      0.11,
      chaos * 1.4,
      21.5,
      0.75,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: 0.7,
      tiltX: 1.05,
      tiltZ: -0.6,
      size: 1.35,
      band: "cool",
      turbulence: 1.75,
      shellLock: 0.95,
      minLevel: 2,
    });
  }

  // Level 3+: more outer orange wisps
  if (lv >= 3) {
    const pack = packOuterWisps(
      budget(28, lv, 95),
      budget(38, lv, 72),
      1.28,
      chaos * 1.2,
      27.3,
    );
    layers.push({
      ...pack,
      count: pack.phases.length,
      spin: -0.55,
      tiltX: -0.9,
      tiltZ: -0.5,
      size: 1.0,
      band: "warm",
      turbulence: 1.4,
      shellLock: 0.1,
      minLevel: 3,
    });
  }

  // Level 4+: extra spark shell
  if (lv >= 4) {
    const sparks = sparkShell(budget(200, lv, 750), 1.4, 41);
    layers.push({
      ...sparks,
      count: sparks.phases.length,
      spin: -0.18,
      tiltX: 0.5,
      tiltZ: -0.4,
      size: 0.9,
      band: "warm",
      turbulence: 1.15,
      shellLock: 0,
      minLevel: 4,
    });
  }

  // Level 5+: another cyan weave + warm nest density
  if (lv >= 5) {
    const cool = shellArcs(
      budget(34, lv, 110),
      budget(42, lv, 80),
      0.68,
      0.13,
      chaos * 1.45,
      44.4,
      0.8,
    );
    layers.push({
      ...cool,
      count: cool.phases.length,
      spin: -0.75,
      tiltX: 1.2,
      tiltZ: 0.9,
      size: 1.4,
      band: "cool",
      turbulence: 1.8,
      shellLock: 0.9,
      minLevel: 5,
    });
    const warm = tangledBall(
      budget(40, lv, 120),
      budget(30, lv, 58),
      0.48,
      chaos * 1.2,
      48.1,
    );
    layers.push({
      ...warm,
      count: warm.phases.length,
      spin: 0.6,
      tiltX: -1.0,
      tiltZ: 0.45,
      size: 1.1,
      band: "warm",
      turbulence: 1.3,
      shellLock: 0,
      minLevel: 5,
    });
  }

  // Beyond 5 — keep adding alternating shells (capped tiers)
  if (lv >= 6) {
    const tiers = Math.min(10, lv - 5);
    for (let i = 0; i < tiers; i++) {
      const tier = 6 + i;
      if (lv < tier) break;
      const coolBand = i % 2 === 0;
      if (coolBand) {
        const pack = shellArcs(
          budget(14 + i * 2, lv, 70),
          budget(28, lv, 56),
          0.7 + i * 0.04,
          0.12,
          chaos * (1.2 + i * 0.05),
          55 + i * 9.1,
          0.6,
        );
        layers.push({
          ...pack,
          count: pack.phases.length,
          spin: (i % 2 === 0 ? -0.4 : 0.45) * (1 + i * 0.03),
          tiltX: 0.5 + i * 0.12,
          tiltZ: -0.4 - i * 0.08,
          size: 1.15,
          band: "cool",
          turbulence: 1.5 + i * 0.05,
          shellLock: 0.85,
          minLevel: tier,
        });
      } else {
        const pack = packOuterWisps(
          budget(14 + i * 2, lv, 60),
          budget(26, lv, 50),
          1.1 + i * 0.06,
          chaos * (1.15 + i * 0.04),
          70 + i * 8.3,
        );
        layers.push({
          ...pack,
          count: pack.phases.length,
          spin: (i % 2 === 0 ? 0.3 : -0.36) * (1 + i * 0.03),
          tiltX: 0.45 + i * 0.14,
          tiltZ: -0.35 - i * 0.1,
          size: 0.95,
          band: "warm",
          turbulence: 1.3 + i * 0.05,
          shellLock: 0.12,
          minLevel: tier,
        });
      }
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
  const uShellLock = gl.getUniformLocation(prog, "uShellLock");
  const uColor = gl.getUniformLocation(prog, "uColor");
  const uGain = gl.getUniformLocation(prog, "uGain");
  const uBandKind = gl.getUniformLocation(prog, "uBandKind");

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
    let jitter = 0.9;
    let speed = 1;
    let gain = 1.08;
    if (voice === "listening") {
      pulse = 0.75 + Math.sin(t * 3.4) * 0.45;
      jitter = 1.1;
    } else if (voice === "thinking") {
      pulse = 0.55 + Math.sin(t * 8.2) * 0.4;
      jitter = 1.65;
      speed = 1.75;
    } else if (voice === "speaking") {
      pulse = 0.9 + Math.sin(t * 5.5) * 0.4;
      jitter = 1.3;
      speed = 1.45;
      gain = 1.28;
    }

    const aspect = canvas.width / Math.max(1, canvas.height);
    mat4Perspective(proj, (48 * Math.PI) / 180, aspect, 0.1, 20);
    mat4LookAt(view, [0, 0.05, 3.9], [0, 0, 0], [0, 1, 0]);
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
    gl!.uniform1f(uPointScale, (canvas.height / 400) * 1.9);
    gl!.uniform1f(uGain, gain);

    for (const layer of gpu) {
      mat4FromEuler(
        model,
        layer.tiltX * 0.42 + Math.sin(t * 0.2) * 0.12,
        t * layer.spin * speed,
        layer.tiltZ * 0.42 + Math.cos(t * 0.13) * 0.08,
      );
      // Leave margin for soft irregular silhouette inside the canvas
      const sc = 0.8;
      model[0] *= sc;
      model[1] *= sc;
      model[2] *= sc;
      model[4] *= sc;
      model[5] *= sc;
      model[6] *= sc;
      model[8] *= sc;
      model[9] *= sc;
      model[10] *= sc;
      gl!.uniformMatrix4fv(uModel, false, model);
      gl!.uniform1f(uTurbulence, layer.turbulence);
      gl!.uniform1f(uShellLock, layer.shellLock);
      const rgb =
        layer.band === "cool"
          ? palette.cool
          : layer.band === "warm"
            ? palette.warm
            : palette.glow;
      gl!.uniform3f(uColor, rgb[0], rgb[1], rgb[2]);
      gl!.uniform1f(
        uBandKind,
        layer.band === "cool" ? 1 : layer.band === "glow" ? 2 : 0,
      );
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
  return [0.2, 0.9, 0.88];
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

/**
 * Cool/warm plasma bands anchored to the holographic reference
 * (cyan mid-shell + amber nest), lightly tinted by theme tokens.
 */
export function paletteFromElement(el: Element): CorePalette {
  const cs = getComputedStyle(el);
  const accent = parseCssRgb(cs.getPropertyValue("--accent") || "#3af0e0");
  const success = parseCssRgb(cs.getPropertyValue("--success") || "#5dffb1");
  const warning = parseCssRgb(cs.getPropertyValue("--warning") || "#ff9a3c");

  // Reference anchors
  const refCyan: [number, number, number] = [0.18, 0.92, 0.88];
  const refAmber: [number, number, number] = [1.0, 0.55, 0.18];
  const refHot: [number, number, number] = [1.0, 0.96, 0.72];

  const coolTheme = lift(mixRgb(accent, success, 0.3), 0.08);
  const warmTheme = lift(mixRgb(warning, accent, 0.18), 0.05);

  // Strong ref bias so structure reads orange/cyan even under theme tint
  const cool = mixRgb(refCyan, coolTheme, 0.28);
  const warm = mixRgb(refAmber, warmTheme, 0.28);
  const glow = mixRgb(refHot, lift(mixRgb(warm, cool, 0.25), 0.65), 0.2);

  return { cool, warm, glow };
}
