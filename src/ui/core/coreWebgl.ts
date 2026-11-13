/**
 * Holographic Mira core — WebGL2 line shells + MAX blend + bloom.
 * Algorithm ported from docs/mira-holo-core-ref.html (user reference).
 * Mira XP level maps onto continuous visibility 0…4 via miraLevelToHoloScale.
 */

import { miraLevelToHoloScale, normalizeCoreLevel } from "../coreLevel";
import { buildHoloLayer, HOLO_LAYERS, type HoloLayerDef } from "./holoGeometry";
import { HOLO_BF, HOLO_CF, HOLO_FS, HOLO_QV, HOLO_VS } from "./holoShaders";

export type CoreVoice = "idle" | "listening" | "thinking" | "speaking";

export type CorePalette = {
  cool: [number, number, number];
  warm: [number, number, number];
  glow: [number, number, number];
};

type ProgWithUniforms = WebGLProgram & {
  u: Record<string, WebGLUniformLocation | null>;
};

type Fbo = { f: WebGLFramebuffer; t: WebGLTexture; w: number; h: number };

type GpuLayer = {
  L: HoloLayerDef;
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  n: number;
  seed: number;
  breath: number;
};

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "shader compile failed";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function prog(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): ProgWithUniforms {
  const p = gl.createProgram() as ProgWithUniforms;
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "program link failed";
    gl.deleteProgram(p);
    throw new Error(log);
  }
  p.u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    if (!info) continue;
    p.u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return p;
}

function cross(a: number[], b: number[]): number[] {
  return [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
}

function norm3(a: number[]): number[] {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
}

function persp(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const t = 1 / Math.tan(fovy / 2);
  return new Float32Array([
    t / aspect,
    0,
    0,
    0,
    0,
    t,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ]);
}

function lookAt(eye: number[]): Float32Array {
  const z = norm3(eye);
  const x = norm3(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([
    x[0]!,
    y[0]!,
    z[0]!,
    0,
    x[1]!,
    y[1]!,
    z[1]!,
    0,
    x[2]!,
    y[2]!,
    z[2]!,
    0,
    -(x[0]! * eye[0]! + x[1]! * eye[1]! + x[2]! * eye[2]!),
    -(y[0]! * eye[0]! + y[1]! * eye[1]! + y[2]! * eye[2]!),
    -(z[0]! * eye[0]! + z[1]! * eye[1]! + z[2]! * eye[2]!),
    1,
  ]);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Tint warm holographic base toward the active Mira theme. */
function layerColor(
  base: [number, number, number],
  palette: CorePalette,
  index: number,
): [number, number, number] {
  const theme =
    index === 0
      ? palette.glow
      : index === 1
        ? mix3(palette.warm, palette.glow, 0.35)
        : index === 2
          ? mix3(palette.warm, palette.cool, 0.15)
          : palette.warm;
  return mix3(base, theme, 0.45);
}

function mix3(
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

export type CoreHandle = {
  setLevel: (level: number) => void;
  setVoice: (voice: CoreVoice) => void;
  setPalette: (palette: CorePalette) => void;
  /** Trigger a short holographic flash (e.g. on level-up). */
  flash: () => void;
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
  const glMaybe = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  if (!glMaybe) return null;
  const gl: WebGL2RenderingContext = glMaybe;

  let pS: ProgWithUniforms;
  let pB: ProgWithUniforms;
  let pC: ProgWithUniforms;
  try {
    pS = prog(gl, HOLO_VS, HOLO_FS);
    pB = prog(gl, HOLO_QV, HOLO_BF);
    pC = prog(gl, HOLO_QV, HOLO_CF);
  } catch {
    return null;
  }

  let miraLevel = normalizeCoreLevel(opts.level);
  let targetVis = miraLevelToHoloScale(miraLevel);
  let levelVis = targetVis;
  let voice: CoreVoice = opts.voice;
  let palette = opts.palette;
  let flashAmt = 0;
  let lastFloor = Math.floor(levelVis);
  let reduced = prefersReducedMotion();
  let raf = 0;
  let running = true;
  let contextLost = false;
  let time = 0;
  let prev = performance.now();
  let PR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 1;
  let H = 1;
  let fs: Fbo;
  let fb1: Fbo;
  let fb2: Fbo;
  let fc1: Fbo;
  let fc2: Fbo;
  /** Global layer spin boost so mid-level shells stay visibly alive. */
  const SPEED_BOOST = 1.35;

  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  function uploadLayers(): GpuLayer[] {
    return HOLO_LAYERS.map((L, i) => {
      const g = buildHoloLayer(L);
      const vao = gl!.createVertexArray()!;
      gl!.bindVertexArray(vao);
      const buffers: WebGLBuffer[] = [];

      const at = (
        name: string,
        data: Float32Array | null,
        size: number,
        div: number,
      ) => {
        const loc = gl!.getAttribLocation(pS, name);
        if (loc < 0) return;
        const b = gl!.createBuffer()!;
        buffers.push(b);
        gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
        if (data) gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
        gl!.enableVertexAttribArray(loc);
        gl!.vertexAttribPointer(loc, size, gl!.FLOAT, false, 0, 0);
        gl!.vertexAttribDivisor(loc, div);
      };

      gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
      const lq = gl!.getAttribLocation(pS, "aQ");
      gl!.enableVertexAttribArray(lq);
      gl!.vertexAttribPointer(lq, 2, gl!.FLOAT, false, 0, 0);
      gl!.vertexAttribDivisor(lq, 0);

      at("aA", new Float32Array(g.A), 3, 1);
      at("aB", new Float32Array(g.B), 3, 1);
      at("aS", new Float32Array(g.S), 4, 1);
      at("aW", new Float32Array(g.W), 2, 1);
      gl!.bindVertexArray(null);

      return {
        L,
        vao,
        buffers,
        n: g.W.length / 2,
        seed: i * 1.7 + 0.3,
        /** Slightly faster breath rates so shells pulse at a readable cadence. */
        breath: 0.85 + i * 0.28,
      };
    });
  }

  let layers = uploadLayers();

  function makeTex(w: number, h: number): WebGLTexture {
    const t = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, t);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA8,
      w,
      h,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      null,
    );
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return t;
  }

  function makeFbo(w: number, h: number): Fbo {
    const t = makeTex(Math.max(1, w), Math.max(1, h));
    const f = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      t,
      0,
    );
    return { f, t, w: Math.max(1, w), h: Math.max(1, h) };
  }

  function disposeFbo(fbo: Fbo | undefined) {
    if (!fbo) return;
    gl.deleteFramebuffer(fbo.f);
    gl.deleteTexture(fbo.t);
  }

  function resize() {
    PR = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.floor(canvas.clientWidth * PR));
    const ch = Math.max(1, Math.floor(canvas.clientHeight * PR));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    W = cw;
    H = ch;
    disposeFbo(fs);
    disposeFbo(fb1);
    disposeFbo(fb2);
    disposeFbo(fc1);
    disposeFbo(fc2);
    fs = makeFbo(W, H);
    fb1 = makeFbo(W >> 2, H >> 2);
    fb2 = makeFbo(W >> 2, H >> 2);
    fc1 = makeFbo(W >> 3, H >> 3);
    fc2 = makeFbo(W >> 3, H >> 3);
  }

  function pass(
    p: ProgWithUniforms,
    fbo: Fbo | null,
    w: number,
    h: number,
  ) {
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? fbo.f : null);
    gl.viewport(0, 0, w, h);
  }

  function bindTex(
    loc: WebGLUniformLocation | null,
    tex: WebGLTexture,
    unit: number,
  ) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (loc) gl.uniform1i(loc, unit);
  }

  function frame(now: number) {
    if (!running) return;
    if (contextLost || gl.isContextLost()) {
      contextLost = true;
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);

    // Cap dt; also treat huge gaps (tab background / sleep) as a soft resume
    // so we never freeze with dt≈0 or jump with a multi-second step.
    let rawDt = (now - prev) / 1000;
    if (!Number.isFinite(rawDt) || rawDt < 0) rawDt = 1 / 60;
    if (rawDt > 0.25) {
      // Resume after throttle: keep continuity without a giant step.
      prev = now;
      rawDt = 1 / 60;
      if (W <= 1 || H <= 1) resize();
    }
    const dt = Math.min(0.05, Math.max(1 / 240, rawDt));
    prev = now;
    reduced = prefersReducedMotion();
    // Reduced motion: very slow drift, never a still frame.
    const motion = reduced ? 0.22 : 1;
    time += dt * motion;

    // Smooth toward Mira-mapped visibility (auto-grow when XP/level rises).
    levelVis += (targetVis - levelVis) * Math.min(1, dt * 2.2);
    const fl = Math.floor(levelVis);
    if (fl > lastFloor) flashAmt = 1;
    lastFloor = fl;
    flashAmt = Math.max(0, flashAmt - dt * 1.1);

    let speedMul = SPEED_BOOST;
    let breathMul = 1.15;
    let alphaMul = 1;
    if (voice === "idle") {
      // Ambient idle: soft luminance pulse so the core never reads as a still.
      flashAmt = Math.max(
        flashAmt,
        0.04 + Math.sin(time * 1.35) * 0.035 + Math.sin(time * 0.47) * 0.02,
      );
    } else if (voice === "listening") {
      speedMul = SPEED_BOOST * 1.2;
      breathMul = 1.35;
    } else if (voice === "thinking") {
      speedMul = SPEED_BOOST * 1.55;
      breathMul = 1.55;
    } else if (voice === "speaking") {
      speedMul = SPEED_BOOST * 1.4;
      breathMul = 1.4;
      alphaMul = 1.1;
      flashAmt = Math.max(flashAmt, 0.14 + Math.sin(time * 5.5) * 0.1);
    }
    if (reduced) {
      speedMul *= 0.35;
      breathMul *= 0.4;
    }

    const asp = W / Math.max(1, H);
    const d = Math.max(4.3, 4.6 / asp);
    // Orbit ~1.8× reference so mid-level shells visibly turn on Home.
    const a = reduced ? time * 0.04 : time * 0.11;
    const eye = [
      Math.sin(a) * d * 0.9,
      Math.sin(time * (reduced ? 0.03 : 0.09)) * 0.9 * (reduced ? 0.35 : 1),
      Math.cos(a) * d * 0.9,
    ];
    const P = persp(0.7854, asp, 0.1, 50);
    const Vm = lookAt(eye);

    // Scene → FBO with MAX blend (brightness does not stack).
    pass(pS, fs, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);

    const u = pS.u;
    gl.uniformMatrix4fv(u.uP!, false, P);
    gl.uniformMatrix4fv(u.uV!, false, Vm);
    gl.uniform2f(u.uRes!, W, H);
    gl.uniform1f(u.uCamD!, Math.hypot(eye[0]!, eye[1]!, eye[2]!));
    gl.uniform1f(u.uTime!, time);
    gl.uniform1f(u.uPR!, PR);
    gl.uniform1f(u.uFlash!, flashAmt);

    layers.forEach((l, i) => {
      const L = l.L;
      const vis =
        i === 0
          ? Math.min(1, Math.max(0.15, levelVis - i))
          : Math.min(1, Math.max(0, levelVis - i));
      const col = layerColor(L.col, palette, i);
      gl.uniform1f(u.uRadius!, L.r);
      gl.uniform1f(u.uSpeed!, L.sp * speedMul);
      gl.uniform1f(u.uVis!, vis);
      gl.uniform1f(u.uSeed!, l.seed);
      gl.uniform1f(u.uBreath!, l.breath * breathMul);
      gl.uniform1f(u.uDir!, L.dir);
      gl.uniform1f(u.uAlpha!, L.a * alphaMul);
      gl.uniform1f(u.uSpark!, L.sparks ? 1 : 0);
      gl.uniform3f(u.uColor!, col[0], col[1], col[2]);
      gl.bindVertexArray(l.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, l.n);
    });
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.blendEquation(gl.FUNC_ADD);

    const blur = (
      src: Fbo,
      dst: Fbo,
      dx: number,
      dy: number,
      th: number,
    ) => {
      pass(pB, dst, dst.w, dst.h);
      bindTex(pB.u.t!, src.t, 0);
      gl.uniform2f(pB.u.d!, dx / dst.w, dy / dst.h);
      gl.uniform1f(pB.u.th!, th);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    blur(fs, fb1, 1, 0, 0.32);
    blur(fb1, fb2, 0, 1, 0);
    blur(fb2, fb1, 1, 0, 0);
    blur(fb1, fb2, 0, 1, 0);
    blur(fb2, fc1, 1, 0, 0);
    blur(fc1, fc2, 0, 1, 0);
    blur(fc2, fc1, 1, 0, 0);
    blur(fc1, fc2, 0, 1, 0);

    // Composite to canvas (transparent around core).
    pass(pC, null, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    bindTex(pC.u.s!, fs.t, 0);
    bindTex(pC.u.b!, fb2.t, 1);
    bindTex(pC.u.b2!, fc2.t, 2);
    gl.uniform1f(pC.u.k!, 0.9 + flashAmt * 0.8);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  function onContextLost(ev: Event) {
    ev.preventDefault();
    contextLost = true;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function onContextRestored() {
    try {
      pS = prog(gl, HOLO_VS, HOLO_FS);
      pB = prog(gl, HOLO_QV, HOLO_BF);
      pC = prog(gl, HOLO_QV, HOLO_CF);
      layers = uploadLayers();
      // Force FBO rebuild even if canvas pixel size is unchanged.
      W = 0;
      H = 0;
      resize();
      contextLost = false;
      prev = performance.now();
      if (running && !raf) raf = requestAnimationFrame(frame);
    } catch {
      // If restore fails, keep contextLost so we stop drawing.
      contextLost = true;
    }
  }

  function onVisibility() {
    if (document.visibilityState === "visible") {
      prev = performance.now();
      if (!contextLost) resize();
      if (running && !raf && !contextLost) {
        raf = requestAnimationFrame(frame);
      }
    }
  }

  canvas.addEventListener("webglcontextlost", onContextLost, false);
  canvas.addEventListener("webglcontextrestored", onContextRestored, false);
  document.addEventListener("visibilitychange", onVisibility);

  resize();
  raf = requestAnimationFrame(frame);

  return {
    setLevel(next) {
      const n = normalizeCoreLevel(next);
      const grew = n > miraLevel;
      miraLevel = n;
      targetVis = miraLevelToHoloScale(n);
      if (grew) flashAmt = 1;
    },
    setVoice(next) {
      voice = next;
    },
    setPalette(next) {
      palette = next;
    },
    flash() {
      flashAmt = 1;
    },
    resize,
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      canvas.removeEventListener("webglcontextlost", onContextLost, false);
      canvas.removeEventListener(
        "webglcontextrestored",
        onContextRestored,
        false,
      );
      document.removeEventListener("visibilitychange", onVisibility);
      if (contextLost) return;
      for (const layer of layers) {
        for (const b of layer.buffers) gl.deleteBuffer(b);
        gl.deleteVertexArray(layer.vao);
      }
      gl.deleteBuffer(quad);
      disposeFbo(fs);
      disposeFbo(fb1);
      disposeFbo(fb2);
      disposeFbo(fc1);
      disposeFbo(fc2);
      gl.deleteProgram(pS);
      gl.deleteProgram(pB);
      gl.deleteProgram(pC);
    },
  };
}

export function parseCssRgb(
  raw: string,
  fallback: [number, number, number] = [0.9, 0.76, 0.2],
): [number, number, number] {
  const s = raw.trim();
  if (!s) return fallback;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1]!;
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
  return fallback;
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

function lift(
  rgb: [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    Math.min(1, rgb[0] * (1 - amount) + amount),
    Math.min(1, rgb[1] * (1 - amount) + amount),
    Math.min(1, rgb[2] * (1 - amount) + amount),
  ];
}

/**
 * Cool/warm/nucleus bands from the active Mira theme.
 * Holographic layers tint toward these while keeping the warm line aesthetic.
 */
export function paletteFromElement(el: Element): CorePalette {
  const cs = getComputedStyle(el);
  const coreCool = cs.getPropertyValue("--core-cool").trim();
  const coreWarm = cs.getPropertyValue("--core-warm").trim();
  const coreGlow = cs.getPropertyValue("--core-glow").trim();

  if (coreCool && coreWarm && coreGlow) {
    return {
      cool: parseCssRgb(coreCool),
      warm: parseCssRgb(coreWarm),
      glow: parseCssRgb(coreGlow),
    };
  }

  const accent = parseCssRgb(cs.getPropertyValue("--accent"), [1, 0.76, 0]);
  const success = parseCssRgb(
    cs.getPropertyValue("--success"),
    [0.2, 0.83, 0.6],
  );
  const warning = parseCssRgb(
    cs.getPropertyValue("--warning"),
    [0.98, 0.75, 0.14],
  );
  const border = parseCssRgb(cs.getPropertyValue("--border"), accent);
  const cool = lift(mixRgb(mixRgb(accent, success, 0.35), border, 0.12), 0.12);
  const warm = lift(mixRgb(warning, accent, 0.25), 0.08);
  const glow = lift(mixRgb(mixRgb(warm, cool, 0.35), accent, 0.2), 0.55);
  return { cool, warm, glow };
}
