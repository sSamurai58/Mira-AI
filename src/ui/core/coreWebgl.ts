/** WebGL holographic core — particle shells that evolve with Mira level. */

export type CoreVoice = "idle" | "listening" | "thinking" | "speaking";

export type CorePalette = {
  accent: [number, number, number];
  success: [number, number, number];
  warning: [number, number, number];
  glow: [number, number, number];
};

type LayerKind = "shell" | "ring" | "ribbon" | "heart" | "filaments";

type Layer = {
  kind: LayerKind;
  minLevel: number;
  positions: Float32Array;
  phases: Float32Array;
  count: number;
  spin: number;
  tilt: number;
  size: number;
  color: keyof CorePalette;
};

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in float aPhase;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform float uTime;
uniform float uPulse;
uniform float uJitter;
uniform float uPointScale;
out float vAlpha;
out float vHot;
void main(){
  float t = uTime * (0.35 + aPhase * 0.55) + aPhase * 6.28318;
  vec3 p = aPos;
  // soft living drift
  p.x += sin(t * 1.7 + aPos.y * 4.0) * 0.012 * uJitter;
  p.y += cos(t * 1.3 + aPos.z * 3.0) * 0.012 * uJitter;
  p.z += sin(t * 1.1 + aPos.x * 5.0) * 0.012 * uJitter;
  p *= (1.0 + uPulse * 0.04);
  vec4 world = uModel * vec4(p, 1.0);
  gl_Position = uViewProj * world;
  float depth = clamp(0.55 + world.z * 0.35, 0.25, 1.0);
  float sz = uPointScale * mix(1.4, 3.8, aPhase) * depth;
  gl_PointSize = max(1.2, sz);
  vAlpha = mix(0.25, 0.95, aPhase) * depth;
  vHot = aPhase;
}
`;

const FRAG = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uGain;
in float vAlpha;
in float vHot;
out vec4 outColor;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  float core = smoothstep(1.0, 0.0, d);
  float bloom = pow(core, 1.6);
  float a = bloom * vAlpha * uGain;
  vec3 col = mix(uColor, vec3(1.0), vHot * 0.35);
  outColor = vec4(col * a, a);
}
`;

function clampLevel(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)));
}

function fibSphere(count: number, radius: number): Float32Array {
  const out = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out[i * 3] = Math.cos(theta) * r * radius;
    out[i * 3 + 1] = y * radius;
    out[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return out;
}

function ringPoints(
  count: number,
  radius: number,
  wobble = 0,
): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rr = radius + Math.sin(a * 5) * wobble;
    out[i * 3] = Math.cos(a) * rr;
    out[i * 3 + 1] = Math.sin(a * 2) * wobble * 0.35;
    out[i * 3 + 2] = Math.sin(a) * rr;
  }
  return out;
}

function ribbonPoints(
  count: number,
  radius: number,
  waves: number,
  amp: number,
): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const a = t * Math.PI * 2;
    const y = Math.sin(a * waves) * amp;
    const rr = radius + Math.cos(a * waves) * amp * 0.35;
    out[i * 3] = Math.cos(a) * rr;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(a) * rr;
  }
  return out;
}

function filamentPoints(count: number, radius: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.35 + Math.random() * 0.65);
    // slight clustering toward arcs
    const swirl = Math.sin(a * 3.0) * 0.08;
    out[i * 3] = Math.sin(b) * Math.cos(a) * r;
    out[i * 3 + 1] = Math.cos(b) * r + swirl;
    out[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
  }
  return out;
}

function phasesFor(count: number, bias = 0.5): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = Math.min(1, Math.max(0, bias + (Math.random() - 0.5) * 0.7));
  }
  return out;
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

function mat4FromEulerYXZ(
  out: Float32Array,
  ax: number,
  ay: number,
  az: number,
  spin: number,
): void {
  // model = Ry(ay+spin) * Rx(ax) * Rz(az)
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay + spin);
  const sy = Math.sin(ay + spin);
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

function buildLayers(level: number): Layer[] {
  const lv = clampLevel(level);
  const layers: Layer[] = [];

  // L1 — heart + sparse shell
  const heart = fibSphere(lv >= 4 ? 220 : 140, 0.18);
  layers.push({
    kind: "heart",
    minLevel: 1,
    positions: heart,
    phases: phasesFor(heart.length / 3, 0.85),
    count: heart.length / 3,
    spin: 0.55,
    tilt: 0.2,
    size: 2.4,
    color: "glow",
  });
  const shell1 = fibSphere(280, 0.55);
  layers.push({
    kind: "shell",
    minLevel: 1,
    positions: shell1,
    phases: phasesFor(shell1.length / 3, 0.45),
    count: shell1.length / 3,
    spin: 0.22,
    tilt: 0.35,
    size: 1.6,
    color: "accent",
  });
  const ring1 = ringPoints(180, 0.72, 0.02);
  layers.push({
    kind: "ring",
    minLevel: 1,
    positions: ring1,
    phases: phasesFor(ring1.length / 3, 0.55),
    count: ring1.length / 3,
    spin: -0.18,
    tilt: 1.1,
    size: 1.5,
    color: "accent",
  });

  if (lv >= 2) {
    const shell2 = fibSphere(520, 0.78);
    layers.push({
      kind: "shell",
      minLevel: 2,
      positions: shell2,
      phases: phasesFor(shell2.length / 3, 0.4),
      count: shell2.length / 3,
      spin: -0.28,
      tilt: -0.55,
      size: 1.35,
      color: "success",
    });
    const ticks = ringPoints(96, 0.92, 0);
    layers.push({
      kind: "ring",
      minLevel: 2,
      positions: ticks,
      phases: phasesFor(ticks.length / 3, 0.7),
      count: ticks.length / 3,
      spin: 0.4,
      tilt: 0.15,
      size: 1.8,
      color: "accent",
    });
  }

  if (lv >= 3) {
    const ribbon = ribbonPoints(900, 0.88, 5, 0.14);
    layers.push({
      kind: "ribbon",
      minLevel: 3,
      positions: ribbon,
      phases: phasesFor(ribbon.length / 3, 0.6),
      count: ribbon.length / 3,
      spin: 0.5,
      tilt: 0.8,
      size: 1.7,
      color: "accent",
    });
    const shell3 = fibSphere(700, 1.05);
    layers.push({
      kind: "shell",
      minLevel: 3,
      positions: shell3,
      phases: phasesFor(shell3.length / 3, 0.35),
      count: shell3.length / 3,
      spin: -0.16,
      tilt: 0.9,
      size: 1.2,
      color: "warning",
    });
  }

  if (lv >= 4) {
    const ringA = ringPoints(260, 1.18, 0.03);
    const ringB = ringPoints(220, 1.28, 0.05);
    layers.push({
      kind: "ring",
      minLevel: 4,
      positions: ringA,
      phases: phasesFor(ringA.length / 3, 0.5),
      count: ringA.length / 3,
      spin: 0.65,
      tilt: 0.4,
      size: 1.4,
      color: "warning",
    });
    layers.push({
      kind: "ring",
      minLevel: 4,
      positions: ringB,
      phases: phasesFor(ringB.length / 3, 0.45),
      count: ringB.length / 3,
      spin: -0.42,
      tilt: -0.7,
      size: 1.3,
      color: "accent",
    });
    const cloud = fibSphere(1100, 1.35);
    layers.push({
      kind: "shell",
      minLevel: 4,
      positions: cloud,
      phases: phasesFor(cloud.length / 3, 0.3),
      count: cloud.length / 3,
      spin: 0.12,
      tilt: 0.25,
      size: 1.05,
      color: "accent",
    });
  }

  if (lv >= 5) {
    const filaments = filamentPoints(1600, 1.45);
    layers.push({
      kind: "filaments",
      minLevel: 5,
      positions: filaments,
      phases: phasesFor(filaments.length / 3, 0.55),
      count: filaments.length / 3,
      spin: 0.33,
      tilt: 1.2,
      size: 1.15,
      color: "success",
    });
    const ribbon2 = ribbonPoints(1100, 1.22, 8, 0.18);
    layers.push({
      kind: "ribbon",
      minLevel: 5,
      positions: ribbon2,
      phases: phasesFor(ribbon2.length / 3, 0.65),
      count: ribbon2.length / 3,
      spin: -0.55,
      tilt: -1.0,
      size: 1.5,
      color: "warning",
    });
  }

  return layers.filter((l) => l.minLevel <= lv);
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

  let level = clampLevel(opts.level);
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
  const uColor = gl.getUniformLocation(prog, "uColor");
  const uGain = gl.getUniformLocation(prog, "uGain");

  type GpuLayer = Layer & {
    vao: WebGLVertexArrayObject;
    posBuf: WebGLBuffer;
    phaseBuf: WebGLBuffer;
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
      gl!.bindVertexArray(null);
      return { ...layer, vao, posBuf, phaseBuf };
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

    let pulse = 0.35 + Math.sin(t * 1.6) * 0.35;
    let jitter = 0.55;
    let speed = 1;
    let gain = 1;
    if (voice === "listening") {
      pulse = 0.7 + Math.sin(t * 3.2) * 0.5;
      jitter = 0.8;
    } else if (voice === "thinking") {
      pulse = 0.5 + Math.sin(t * 7.5) * 0.35;
      jitter = 1.6;
      speed = 1.8;
    } else if (voice === "speaking") {
      pulse = 0.85 + Math.sin(t * 5.2) * 0.45;
      jitter = 1.1;
      speed = 1.45;
      gain = 1.2;
    }

    const aspect = canvas.width / Math.max(1, canvas.height);
    mat4Perspective(proj, (42 * Math.PI) / 180, aspect, 0.1, 20);
    mat4LookAt(view, [0, 0.15, 3.35], [0, 0, 0], [0, 1, 0]);
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
    const pointScale = (canvas.height / 420) * 2.2;
    gl!.uniform1f(uPointScale, pointScale);
    gl!.uniform1f(uGain, gain);

    for (const layer of gpu) {
      mat4FromEulerYXZ(
        model,
        layer.tilt * 0.35,
        t * layer.spin * speed,
        layer.tilt * 0.15,
        t * layer.spin * 0.35 * speed,
      );
      gl!.uniformMatrix4fv(uModel, false, model);
      const rgb = palette[layer.color];
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
      const n = clampLevel(next);
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

export function paletteFromElement(el: Element): CorePalette {
  const cs = getComputedStyle(el);
  const accent = parseCssRgb(cs.getPropertyValue("--accent") || "#5ad0ff");
  const success = parseCssRgb(cs.getPropertyValue("--success") || "#5dffb1");
  const warning = parseCssRgb(cs.getPropertyValue("--warning") || "#ffb45c");
  return {
    accent,
    success,
    warning,
    glow: [
      Math.min(1, accent[0] * 0.45 + 0.55),
      Math.min(1, accent[1] * 0.45 + 0.55),
      Math.min(1, accent[2] * 0.45 + 0.55),
    ],
  };
}
