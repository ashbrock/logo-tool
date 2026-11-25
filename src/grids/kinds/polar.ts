/**
 * Polar lattice: rings × rays about a single centre (SPEC.md §5, DECISIONS.md).
 * Primary points: u = ring in sub-steps (0 … rings·subdivision), v = ray index (0 … rays − 1).
 * Companion square points (optional, `layer: 'square'`): (u, v) = offset from the centre in
 * sub-steps, axis-aligned, |u|, |v| ≤ rings·subdivision. They let frames be built around rays (m-logo-1).
 * The drawing area is the square [0, 2R] × [0, 2R] with the centre at (R, R), R = rings.
 */
import { approx, exact, type ExactScalar } from '../../geometry/exact';
import { lattice, type Lattice } from '../../geometry/lattice';
import { degToRad, mod, vec, type Vec2 } from '../../geometry/num';
import type { GridDef, GridKind, SymmetryOp } from '../types';

export type PolarGrid = Extract<GridDef, { kind: 'polar' }>;

/** 4·cos(m·15°) for m = 0…6 in the basis [1, √2, √3, √6]. */
const COS4_0_TO_6: readonly (readonly [number, number, number, number])[] = [
  [4, 0, 0, 0],   // 0°
  [0, 1, 0, 1],   // 15°: (√6 + √2)/4
  [0, 0, 2, 0],   // 30°: √3/2
  [0, 2, 0, 0],   // 45°: √2/2
  [2, 0, 0, 0],   // 60°: 1/2
  [0, -1, 0, 1],  // 75°: (√6 − √2)/4
  [0, 0, 0, 0],   // 90°
];

type Q4 = readonly [number, number, number, number];

/** 4·cos(m·15°) for any integer m, exactly. */
export function cos4(m: number): Q4 {
  const k = mod(m, 24);
  const r = k <= 12 ? k : 24 - k;                 // cos(360° − x) = cos x
  if (r <= 6) return COS4_0_TO_6[r] as Q4;
  const [a, b, c, d] = COS4_0_TO_6[12 - r] as Q4; // cos(180° − x) = −cos x
  return [-a, -b, -c, -d];
}

/** 4·sin(m·15°) = 4·cos((m − 6)·15°). */
export const sin4 = (m: number): Q4 => cos4(m - 6);

const centre = (g: PolarGrid): Vec2 => vec(g.rings, g.rings);
const step = (g: PolarGrid): number => (2 * Math.PI) / g.rays;
const maxU = (g: PolarGrid): number => g.rings * g.subdivision;
const isSquare = (p: Lattice): boolean => p.layer === 'square';

/** Ray index (possibly fractional) of a direction given in degrees. */
const rayOfDeg = (deg: number, g: PolarGrid): number => ((deg - g.rotationDeg) * g.rays) / 360;

/**
 * Canonical form. Ring 0 is the centre. A square point that coincides with a primary point (on an
 * axis that is also a ray) is stored as the primary point, so each position has one representation.
 */
function normalise(p: Lattice, g: PolarGrid): Lattice {
  if (!isSquare(p)) return p.u === 0 ? lattice(0, 0) : lattice(p.u, mod(p.v, g.rays));
  if (p.u === 0 && p.v === 0) return lattice(0, 0);
  if (p.u !== 0 && p.v !== 0) return p;
  // On an axis: angle 0°, 90°, 180° or 270° (y down, so +v is 90°).
  const deg = p.v === 0 ? (p.u > 0 ? 0 : 180) : p.v > 0 ? 90 : 270;
  const ray = rayOfDeg(deg, g);
  if (!Number.isInteger(ray)) return p;
  return lattice(Math.abs(p.u + p.v), mod(ray, g.rays));
}

function toPlane(p: Lattice, g: PolarGrid): Vec2 {
  const c = centre(g);
  if (isSquare(p)) return vec(c.x + p.u / g.subdivision, c.y + p.v / g.subdivision);
  const r = p.u / g.subdivision;
  const a = degToRad(g.rotationDeg) + p.v * step(g);
  return vec(c.x + r * Math.cos(a), c.y + r * Math.sin(a));
}

function contains(p: Lattice, g: PolarGrid): boolean {
  if (isSquare(p)) return g.companionSquare && Math.abs(p.u) <= maxU(g) && Math.abs(p.v) <= maxU(g);
  return p.u >= 0 && p.u <= maxU(g) && p.v >= 0 && p.v < g.rays;
}

function points(g: PolarGrid, opts?: { wholeOnly?: boolean }): Lattice[] {
  const out: Lattice[] = [lattice(0, 0)];
  const ringStep = opts?.wholeOnly ? g.subdivision : 1;
  for (let u = ringStep; u <= maxU(g); u += ringStep) {
    for (let v = 0; v < g.rays; v++) out.push(lattice(u, v));
  }
  if (g.companionSquare) {
    const seen = new Set(out.map((p) => `${p.u},${p.v}`));
    for (let v = -maxU(g); v <= maxU(g); v += ringStep) {
      for (let u = -maxU(g); u <= maxU(g); u += ringStep) {
        const p = normalise(lattice(u, v, 'square'), g);
        if (!isSquare(p) && seen.has(`${p.u},${p.v}`)) continue; // already listed as a primary point
        out.push(p);
      }
    }
  }
  return out;
}

function nearestPrimary(q: Vec2, g: PolarGrid, ringStep: number): { p: Lattice; d: number } {
  const c = centre(g);
  const dx = q.x - c.x, dy = q.y - c.y;
  const r = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx) - degToRad(g.rotationDeg);
  const ray0 = Math.round(a / step(g));
  // The centre is always a candidate.
  let best = lattice(0, 0);
  let bestD = r * r;
  // For each nearby ray, the best ring is the pointer's projection onto that ray, rounded.
  // Checking only neighbouring rings is not enough: with few rays, an inner ring can be nearer.
  const span = Math.min(2, Math.floor(g.rays / 2));
  for (let dv = -span; dv <= span; dv++) {
    const ray = ray0 + dv;
    const along = r * Math.cos(a - ray * step(g)) * g.subdivision; // projection, in sub-steps
    const base = Math.floor(Math.max(along, 0) / ringStep) * ringStep;
    for (const u0 of [base, base + ringStep]) {
      const u = Math.min(Math.max(u0, 0), maxU(g));
      const p = normalise(lattice(u, ray), g);
      const pt = toPlane(p, g);
      const d = (pt.x - q.x) ** 2 + (pt.y - q.y) ** 2;
      if (d < bestD - 1e-12) { bestD = d; best = p; }
    }
  }
  return { p: best, d: bestD };
}

function nearest(q: Vec2, g: PolarGrid, opts?: { wholeOnly?: boolean }): Lattice {
  const ringStep = opts?.wholeOnly ? g.subdivision : 1;
  const primary = nearestPrimary(q, g, ringStep);
  if (!g.companionSquare) return primary.p;
  const c = centre(g);
  const clampRound = (x: number) => Math.min(Math.max(Math.round(x / ringStep) * ringStep, -maxU(g)), maxU(g));
  const sq = normalise(lattice(clampRound((q.x - c.x) * g.subdivision), clampRound((q.y - c.y) * g.subdivision), 'square'), g);
  const pt = toPlane(sq, g);
  const d = (pt.x - q.x) ** 2 + (pt.y - q.y) ** 2;
  return d < primary.d - 1e-12 ? sq : primary.p;
}

/**
 * Squared distance scaled by 4·subdivision², in the exact basis [1, √2, √3, √6]:
 * - primary–primary: law of cosines, exact when the ray count divides 24 (rotation cancels out);
 * - square–square: integers;
 * - primary–square: exact when, in addition, the rotation is a multiple of 15°.
 */
function dist2Exact(p: Lattice, q: Lattice, g: PolarGrid): ExactScalar {
  if (isSquare(p) && isSquare(q)) {
    const du = p.u - q.u, dv = p.v - q.v;
    return exact([4 * (du * du + dv * dv), 0, 0, 0, 0, 0]);
  }
  if (isSquare(p) || isSquare(q)) {
    const s = isSquare(p) ? p : q;
    const r = isSquare(p) ? q : p;
    const a = r.u, j = s.u, k = s.v;
    const per = 24 / g.rays;
    const m = g.rotationDeg / 15 + r.v * per;
    if (Number.isInteger(per) && Number.isInteger(m)) {
      const c = cos4(m), sn = sin4(m);
      const lin = [0, 1, 2, 3].map((i) => j * (c[i] as number) + k * (sn[i] as number));
      return exact([
        4 * (a * a + j * j + k * k) - 2 * a * (lin[0] as number),
        -2 * a * (lin[1] as number), -2 * a * (lin[2] as number), -2 * a * (lin[3] as number), 0, 0,
      ]);
    }
    const P = toPlane(r, g), S = toPlane(s, g);
    return approx(4 * g.subdivision ** 2 * ((P.x - S.x) ** 2 + (P.y - S.y) ** 2));
  }
  const a = p.u, b = q.u;
  if (24 % g.rays === 0) {
    const [c1, c2, c3, c6] = cos4((p.v - q.v) * (24 / g.rays));
    return exact([4 * a * a + 4 * b * b - 2 * a * b * c1, -2 * a * b * c2, -2 * a * b * c3, -2 * a * b * c6, 0, 0]);
  }
  const delta = (p.v - q.v) * step(g);
  return approx(4 * (a * a + b * b - 2 * a * b * Math.cos(delta)));
}

/**
 * Symmetries about the centre. Each op knows its plane transform so it can also map companion
 * square points; with the companion lattice on, only ops that keep square points integral are
 * offered (rotations by multiples of 90°, mirrors on axes at multiples of 45°).
 */
function symmetries(g: PolarGrid): SymmetryOp[] {
  type Spec = { id: string; kind: 'mirror' | 'rotate'; order: number; primary: (p: Lattice) => Lattice; deg: number };
  const specs: Spec[] = [];
  for (let n = 2; n <= g.rays; n++) {
    if (g.rays % n !== 0) continue;
    const k = g.rays / n;
    specs.push({ id: `rot-${n}`, kind: 'rotate', order: n, primary: (p) => lattice(p.u, p.v + k), deg: 360 / n });
  }
  // Mirrors in the line of ray 0, and halfway between ray 0 and ray 1. Other axes are these composed with rotations.
  specs.push({ id: 'mirror-ray-0', kind: 'mirror', order: 2, primary: (p) => lattice(p.u, -p.v), deg: g.rotationDeg });
  specs.push({ id: 'mirror-ray-0.5', kind: 'mirror', order: 2, primary: (p) => lattice(p.u, 1 - p.v), deg: g.rotationDeg + 180 / g.rays });

  const ops: SymmetryOp[] = [];
  for (const sp of specs) {
    let square: ((p: Lattice) => Lattice) | null = null;
    if (sp.kind === 'rotate' && sp.deg % 90 === 0) {
      const turns = mod(sp.deg / 90, 4);
      square = (p) => {
        let u = p.u, v = p.v;
        for (let t = 0; t < turns; t++) [u, v] = [-v, u]; // +90° in screen coordinates (x → y)
        return lattice(u, v, 'square');
      };
    } else if (sp.kind === 'mirror' && mod(sp.deg, 45) === 0) {
      const c2 = Math.round(Math.cos(degToRad(2 * sp.deg))), s2 = Math.round(Math.sin(degToRad(2 * sp.deg)));
      square = (p) => lattice(p.u * c2 + p.v * s2, p.u * s2 - p.v * c2, 'square');
    }
    if (g.companionSquare && !square) continue; // would move square points off their lattice
    const sq = square;
    ops.push({
      id: sp.id, kind: sp.kind, order: sp.order,
      apply: (p) => normalise(isSquare(p) && sq ? sq(p) : sp.primary(p), g),
    });
  }
  return ops;
}

export const polarKind: GridKind<PolarGrid> = {
  toPlane,
  nearest,
  contains,
  points,
  normalise,
  dist2Exact,
  exactT: () => 0,
  symmetries,
  size: (g) => ({ width: 2 * g.rings, height: 2 * g.rings }),
};
