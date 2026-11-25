/**
 * Polar lattice: rings × rays about a single centre (SPEC.md §5, DECISIONS.md).
 * u = ring in sub-steps (0 … rings·subdivision), v = ray index (0 … rays − 1).
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

/** 4·cos(m·15°) for any integer m, exactly. */
export function cos4(m: number): readonly [number, number, number, number] {
  const k = mod(m, 24);
  const r = k <= 12 ? k : 24 - k;                 // cos(360° − x) = cos x
  if (r <= 6) return COS4_0_TO_6[r] as readonly [number, number, number, number];
  const [a, b, c, d] = COS4_0_TO_6[12 - r] as readonly [number, number, number, number]; // cos(180° − x) = −cos x
  return [-a, -b, -c, -d];
}

const centre = (g: PolarGrid): Vec2 => vec(g.rings, g.rings);
const step = (g: PolarGrid): number => (2 * Math.PI) / g.rays;

function normalise(p: Lattice, g: PolarGrid): Lattice {
  return p.u === 0 ? lattice(0, 0) : lattice(p.u, mod(p.v, g.rays));
}

function toPlane(p: Lattice, g: PolarGrid): Vec2 {
  const r = p.u / g.subdivision;
  const a = degToRad(g.rotationDeg) + p.v * step(g);
  const c = centre(g);
  return vec(c.x + r * Math.cos(a), c.y + r * Math.sin(a));
}

function contains(p: Lattice, g: PolarGrid): boolean {
  return p.u >= 0 && p.u <= g.rings * g.subdivision && p.v >= 0 && p.v < g.rays;
}

function points(g: PolarGrid, opts?: { wholeOnly?: boolean }): Lattice[] {
  const out: Lattice[] = [lattice(0, 0)];
  const ringStep = opts?.wholeOnly ? g.subdivision : 1;
  for (let u = ringStep; u <= g.rings * g.subdivision; u += ringStep) {
    for (let v = 0; v < g.rays; v++) out.push(lattice(u, v));
  }
  return out;
}

function nearest(q: Vec2, g: PolarGrid, opts?: { wholeOnly?: boolean }): Lattice {
  const c = centre(g);
  const ringStep = opts?.wholeOnly ? g.subdivision : 1;
  const maxRing = g.rings * g.subdivision;
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
      const u = Math.min(Math.max(u0, 0), maxRing);
      const p = normalise(lattice(u, ray), g);
      const pt = toPlane(p, g);
      const d = (pt.x - q.x) ** 2 + (pt.y - q.y) ** 2;
      if (d < bestD - 1e-12) { bestD = d; best = p; }
    }
  }
  return best;
}

/**
 * Squared distance by the law of cosines, scaled by 4·subdivision²:
 * 4|d|² = 4a² + 4b² − 2ab·(4 cos Δ). Exact when the ray count divides 24 (Δ is a multiple of 15°).
 */
function dist2Exact(p: Lattice, q: Lattice, g: PolarGrid): ExactScalar {
  const a = p.u, b = q.u;
  if (24 % g.rays === 0) {
    const [c1, c2, c3, c6] = cos4((p.v - q.v) * (24 / g.rays));
    return exact([4 * a * a + 4 * b * b - 2 * a * b * c1, -2 * a * b * c2, -2 * a * b * c3, -2 * a * b * c6, 0, 0]);
  }
  const delta = (p.v - q.v) * step(g);
  return approx(4 * (a * a + b * b - 2 * a * b * Math.cos(delta)));
}

function symmetries(g: PolarGrid): SymmetryOp[] {
  const ops: SymmetryOp[] = [];
  // n-fold rotation for every n > 1 dividing the ray count (SPEC.md §5).
  for (let n = 2; n <= g.rays; n++) {
    if (g.rays % n !== 0) continue;
    const k = g.rays / n;
    ops.push({ id: `rot-${n}`, kind: 'rotate', order: n, apply: (p) => normalise(lattice(p.u, p.v + k), g) });
  }
  // Mirror in the line of ray 0 (other mirror axes are this composed with rotations).
  ops.push({ id: 'mirror-ray-0', kind: 'mirror', order: 2, apply: (p) => normalise(lattice(p.u, -p.v), g) });
  // Mirror in the line halfway between ray 0 and ray 1.
  ops.push({ id: 'mirror-ray-0.5', kind: 'mirror', order: 2, apply: (p) => normalise(lattice(p.u, 1 - p.v), g) });
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
