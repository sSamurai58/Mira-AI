/**
 * Layer defs + line-segment geometry for the holographic Mira core.
 * Ported from docs/mira-holo-core-ref.html (LAYERS / build).
 */

export type HoloLayerDef = {
  nm: string;
  r: number;
  col: [number, number, number];
  sp: number;
  dir: number;
  tr: number;
  bl: number;
  rg: number;
  rd?: number;
  jit: number;
  th: [number, number];
  a: number;
  core?: number;
  sparks?: number;
};

export type HoloGeom = {
  A: number[];
  B: number[];
  S: number[];
  W: number[];
};

/** Four growth shells: nucleus → inner contour → mid schema → outer shell. */
export const HOLO_LAYERS: HoloLayerDef[] = [
  {
    nm: "ядро",
    r: 0.2,
    col: [1, 0.72, 0.25],
    /** Speeds tuned so mid levels still read as continuous motion (0.1.10). */
    sp: 1.55,
    dir: 1,
    tr: 0,
    bl: 8,
    rg: 0,
    jit: 0,
    th: [1, 2],
    a: 0.9,
    core: 1,
  },
  {
    nm: "внутренний контур",
    r: 0.42,
    col: [1, 0.7, 0.2],
    sp: 0.78,
    dir: -1,
    tr: 40,
    bl: 10,
    rg: 2,
    jit: 0.05,
    th: [0.8, 1.5],
    a: 0.8,
  },
  {
    nm: "средняя схема",
    r: 0.7,
    col: [1, 0.66, 0.17],
    sp: 0.55,
    dir: 1,
    tr: 90,
    bl: 25,
    rg: 4,
    rd: 60,
    jit: 0.05,
    th: [0.8, 1.6],
    a: 0.8,
  },
  {
    nm: "внешняя оболочка",
    r: 1.0,
    col: [1, 0.62, 0.14],
    sp: 0.38,
    dir: -1,
    tr: 300,
    bl: 60,
    rg: 10,
    rd: 300,
    jit: 0.04,
    th: [0.9, 1.8],
    a: 0.9,
  },
];

function cross(a: number[], b: number[]): number[] {
  return [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
}

function norm(a: number[]): number[] {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
}

function rv(): number[] {
  const z = Math.random() * 2 - 1;
  const a = Math.random() * 6.2832;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), s * Math.sin(a), z];
}

function sph(lon: number, lat: number, r: number): number[] {
  return [
    Math.cos(lat) * Math.cos(lon) * r,
    Math.sin(lat) * r,
    Math.cos(lat) * Math.sin(lon) * r,
  ];
}

export function buildHoloLayer(L: HoloLayerDef): HoloGeom {
  const A: number[] = [];
  const B: number[] = [];
  const S: number[] = [];
  const W: number[] = [];

  const add = (
    a: number[],
    b: number[],
    th: number,
    d: number,
    m: number[],
  ) => {
    A.push(a[0]!, a[1]!, a[2]!);
    B.push(b[0]!, b[1]!, b[2]!);
    S.push(m[0]!, m[1]!, m[2]!, m[3]!);
    W.push(th, d);
  };

  function block(q: number[], p: number[]) {
    let d = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!];
    d = norm(d);
    const s = 0.008 + Math.random() * 0.02;
    add(
      [q[0]! - d[0]! * s, q[1]! - d[1]! * s, q[2]! - d[2]! * s],
      [q[0]! + d[0]! * s, q[1]! + d[1]! * s, q[2]! + d[2]! * s],
      2.5 + Math.random() * 3,
      Math.random() * 6,
      [Math.random(), Math.random(), 1.8, 2 + Math.random() * 3],
    );
  }

  function trace() {
    let lon = Math.random() * 6.2832;
    let lat = Math.asin(Math.random() * 2 - 1) * 0.95;
    const r = L.r * (1 + (Math.random() - 0.5) * 2 * L.jit);
    let cum = 0;
    let al = Math.random() < 0.5;
    let sg = Math.random() < 0.5 ? 1 : -1;
    const m = [
      Math.random(),
      Math.random(),
      0.6 + Math.random() * 0.6,
      1.5 + Math.random() * 3,
    ];
    const th = L.th[0] + Math.random() * (L.th[1] - L.th[0]);
    let prev = sph(lon, lat, r);
    const legs = 3 + ((Math.random() * 5) | 0);
    for (let i = 0; i < legs; i++) {
      const len = 0.06 + Math.pow(Math.random(), 2.5) * 0.5;
      const st = Math.ceil(len / 0.18);
      const d = len / st;
      for (let k = 0; k < st; k++) {
        if (al) lon += (sg * d) / Math.max(0.25, Math.cos(lat));
        else {
          lat += sg * d;
          if (Math.abs(lat) > 1.3) {
            lat = Math.sign(lat) * 1.3;
            sg = -sg;
          }
        }
        const q = sph(lon, lat, r);
        add(prev, q, th, cum, m);
        if (Math.random() < 0.1) block(q, prev);
        cum += d;
        prev = q;
      }
      al = !al;
      sg = Math.random() < 0.5 ? 1 : -1;
    }
  }

  function arc(
    n: number[],
    h: number,
    RR: number,
    a0: number,
    len: number,
    th: number,
    m: number[],
  ) {
    const u = norm(cross(n, rv()));
    const v = cross(n, u);
    const rad = Math.sqrt(Math.max(1e-4, RR * RR - h * h));
    const st = Math.ceil(len / 0.08);
    let prev: number[] | null = null;
    for (let k = 0; k <= st; k++) {
      const a = a0 + (len * k) / st;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const q = [
        n[0]! * h + (u[0]! * c + v[0]! * s) * rad,
        n[1]! * h + (u[1]! * c + v[1]! * s) * rad,
        n[2]! * h + (u[2]! * c + v[2]! * s) * rad,
      ];
      if (prev) add(prev, q, th, (len * k) / st, m);
      prev = q;
    }
  }

  for (let i = 0; i < L.tr; i++) trace();

  for (let i = 0; i < L.bl; i++) {
    const lon = Math.random() * 6.2832;
    const lat = Math.asin(Math.random() * 2 - 1);
    const r = L.r * (1 + (Math.random() - 0.5) * 2 * L.jit);
    const p = sph(lon, lat, r);
    const s = 0.01 + Math.random() * 0.04;
    const t =
      Math.random() < 0.5
        ? [-Math.sin(lon), 0, Math.cos(lon)]
        : [
            -Math.sin(lat) * Math.cos(lon),
            Math.cos(lat),
            -Math.sin(lat) * Math.sin(lon),
          ];
    add(
      [p[0]! - t[0]! * s, p[1]! - t[1]! * s, p[2]! - t[2]! * s],
      [p[0]! + t[0]! * s, p[1]! + t[1]! * s, p[2]! + t[2]! * s],
      2 + Math.random() * 3,
      Math.random() * 6,
      [Math.random(), Math.random(), 1.6, 2 + Math.random() * 3],
    );
  }

  for (let i = 0; i < L.rg; i++) {
    const n = rv();
    const h = (Math.random() * 2 - 1) * L.r * 0.6;
    const a0 = Math.random() * 6.2832;
    const len = 1.2 + Math.random() * 4;
    const m = [Math.random(), Math.random(), 2.6, 1 + Math.random() * 2];
    arc(n, h, L.r, a0, len, 3 + Math.random() * 2.5, m);
    arc(n, h, L.r * 1.02, a0 + 0.1, len * 0.8, 1, m);
  }

  if (L.core) {
    for (let i = 0; i < 3; i++) {
      arc(rv(), 0, L.r * (0.6 + i * 0.22), 0, 6.3, 2.5, [
        Math.random() * 0.5,
        Math.random(),
        1.5,
        1 + i,
      ]);
    }
    add([0, 0, 0], [0, 0, 0], 14, 0, [0.05, 0.3, 1.2, 0]);
  }

  for (let i = 0; i < (L.rd || 0); i++) {
    const p = rv();
    const r = L.r * (1 + (Math.random() - 0.5) * 2 * L.jit);
    const s = 1 + 0.02 + Math.random() * 0.05;
    add(
      [p[0]! * r * 0.97, p[1]! * r * 0.97, p[2]! * r * 0.97],
      [p[0]! * r * s, p[1]! * r * s, p[2]! * r * s],
      1 + Math.random(),
      Math.random() * 6,
      [Math.random(), Math.random(), 1.5, 2 + Math.random() * 3],
    );
  }

  for (let i = 0; i < (L.sparks || 0); i++) {
    const d = rv();
    const a = [d[0]! * L.r, d[1]! * L.r, d[2]! * L.r];
    add(a, a, L.th[0] + Math.random(), 0, [
      Math.random(),
      Math.random(),
      1,
      0.6 + Math.random() * 2.2,
    ]);
  }

  return { A, B, S, W };
}
