/**
 * Affine lattices: square (optionally slanted), triangular, isometric and typographic.
 * Position = rotate_about_centre( (u·e1 + v·e2) / subdivision ). The extent is the rectangle
 * [0, width] × [0, height] in cells; lattice points are every (u, v) whose position lies inside it.
 */
import { exact, type ExactScalar } from '../../geometry/exact';
import { lattice, type Lattice } from '../../geometry/lattice';
import { degToRad, rotateAbout, vec, type Vec2 } from '../../geometry/num';
import type { GridDef, GridKind, IsoRatio, SymmetryOp } from '../types';

export type AffineGrid = Extract<GridDef, { kind: 'affine' }>;

const EPS = 1e-9;

/** k² as a fraction p/q for each isometric ratio (k = slope of the lattice directions). */
const ISO_K2: Record<IsoRatio, { p: number; q: number }> = {
  true30: { p: 1, q: 3 },  // k = tan 30° = 1/√3
  '2:3': { p: 4, q: 9 },   // k = 2/3
  '1:2': { p: 1, q: 4 },   // k = 1/2
};

function slantT(g: AffineGrid): number {
  return g.preset === 'square' ? Math.tan(degToRad(g.slantDeg)) : 0;
}

function rotationRad(g: AffineGrid): number {
  return g.preset === 'typographic' ? 0 : degToRad(g.rotationDeg);
}

/** Basis vectors in cells. */
function basis(g: AffineGrid): [Vec2, Vec2] {
  switch (g.preset) {
    case 'square':
      return [vec(1, 0), vec(slantT(g), 1)];
    case 'typographic':
      return [vec(1, 0), vec(0, 1)];
    case 'triangular':
      return [vec(1, 0), vec(0.5, Math.sqrt(3) / 2)];
    case 'isometric': {
      const { p, q } = ISO_K2[g.ratio];
      const k = Math.sqrt(p / q);
      return [vec(1, k), vec(1, -k)];
    }
  }
}

const centre = (g: AffineGrid): Vec2 => vec(g.width / 2, g.height / 2);

/** Unrotated position of a lattice point. */
function rawPlane(p: Lattice, g: AffineGrid): Vec2 {
  const [e1, e2] = basis(g);
  const s = g.subdivision;
  return vec((p.u * e1.x + p.v * e2.x) / s, (p.u * e1.y + p.v * e2.y) / s);
}

/**
 * Rotation pivot: the whole-cell lattice point nearest the rectangle's centre (unrotated).
 * Rotating about a lattice point keeps that point fixed and inside the extent, so a rotated grid
 * is never empty. Rotating about the rectangle's centre could rotate every point out of a small grid.
 */
function pivot(g: AffineGrid): Vec2 {
  const [e1, e2] = basis(g);
  const c = centre(g);
  const det = e1.x * e2.y - e2.x * e1.y;
  const fu = (c.x * e2.y - e2.x * c.y) / det, fv = (e1.x * c.y - c.x * e1.y) / det;
  const s = g.subdivision;
  let best = c, bestD = Infinity;
  for (let dv = -1; dv <= 1; dv++) {
    for (let du = -1; du <= 1; du++) {
      const pt = rawPlane(lattice((Math.round(fu) + du) * s, (Math.round(fv) + dv) * s), g);
      if (!inRect(pt, g)) continue;
      const d = (pt.x - c.x) ** 2 + (pt.y - c.y) ** 2;
      if (d < bestD) { bestD = d; best = pt; }
    }
  }
  return best;
}

function toPlane(p: Lattice, g: AffineGrid): Vec2 {
  const rad = rotationRad(g);
  return rad === 0 ? rawPlane(p, g) : rotateAbout(rawPlane(p, g), pivot(g), rad);
}

/** Continuous lattice coordinates (in sub-steps) of a plane point. */
function toLatticeFloat(q: Vec2, g: AffineGrid): { u: number; v: number } {
  const [e1, e2] = basis(g);
  const rad = rotationRad(g);
  const r = rad === 0 ? q : rotateAbout(q, pivot(g), -rad);
  const det = e1.x * e2.y - e2.x * e1.y;
  const s = g.subdivision;
  return {
    u: ((r.x * e2.y - e2.x * r.y) / det) * s,
    v: ((e1.x * r.y - r.x * e1.y) / det) * s,
  };
}

function inRect(pt: Vec2, g: AffineGrid): boolean {
  return pt.x >= -EPS && pt.y >= -EPS && pt.x <= g.width + EPS && pt.y <= g.height + EPS;
}

function contains(p: Lattice, g: AffineGrid): boolean {
  return inRect(toPlane(p, g), g);
}

function isWhole(p: Lattice, g: AffineGrid): boolean {
  return p.u % g.subdivision === 0 && p.v % g.subdivision === 0;
}

function points(g: AffineGrid, opts?: { wholeOnly?: boolean }): Lattice[] {
  const corners = [vec(0, 0), vec(g.width, 0), vec(0, g.height), vec(g.width, g.height)].map((c) => toLatticeFloat(c, g));
  const uMin = Math.floor(Math.min(...corners.map((c) => c.u))) - 1;
  const uMax = Math.ceil(Math.max(...corners.map((c) => c.u))) + 1;
  const vMin = Math.floor(Math.min(...corners.map((c) => c.v))) - 1;
  const vMax = Math.ceil(Math.max(...corners.map((c) => c.v))) + 1;
  const out: Lattice[] = [];
  for (let v = vMin; v <= vMax; v++) {
    for (let u = uMin; u <= uMax; u++) {
      const p = lattice(u, v);
      if (opts?.wholeOnly && !isWhole(p, g)) continue;
      if (contains(p, g)) out.push(p);
    }
  }
  return out;
}

function nearest(q: Vec2, g: AffineGrid, opts?: { wholeOnly?: boolean }): Lattice {
  const step = opts?.wholeOnly ? g.subdivision : 1;
  const f = toLatticeFloat(q, g);
  const cu = Math.round(f.u / step), cv = Math.round(f.v / step);
  // 1. Nearest lattice point ignoring the extent. Rounding in a skewed basis can be off by one
  //    in each direction, so search a neighbourhood.
  let best: Lattice | null = null;
  let bestD = Infinity;
  for (let dv = -2; dv <= 2; dv++) {
    for (let du = -2; du <= 2; du++) {
      const p = lattice((cu + du) * step, (cv + dv) * step);
      const pt = toPlane(p, g);
      const d = (pt.x - q.x) ** 2 + (pt.y - q.y) ** 2;
      if (d < bestD - 1e-12) { bestD = d; best = p; }
    }
  }
  if (best && contains(best, g)) return best;
  // 2. The pointer is off the grid: the nearest point inside the extent can be several
  //    lattice steps away along a (possibly rotated) edge, so scan the extent.
  best = null;
  bestD = Infinity;
  for (const p of points(g, opts)) {
    const pt = toPlane(p, g);
    const d = (pt.x - q.x) ** 2 + (pt.y - q.y) ** 2;
    if (d < bestD - 1e-12) { bestD = d; best = p; }
  }
  if (!best) throw new Error('grid has no lattice points');
  return best;
}

/**
 * Squared distance, scaled by subdivision² (and by q for isometric grids) so every coefficient
 * is an integer. The constant scale is the same for every pair on a grid, so equality is exact.
 */
function dist2Exact(a: Lattice, b: Lattice, g: AffineGrid): ExactScalar {
  const du = a.u - b.u, dv = a.v - b.v;
  switch (g.preset) {
    case 'square':
      // e1 = (1, 0), e2 = (t, 1): |d|² = du² + 2t·du·dv + (1 + t²)·dv².
      // Without slant t = 0 and the t terms must be dropped, or equal distances such as
      // (3, 4) and (5, 0) would compare unequal coefficient by coefficient.
      if (g.slantDeg === 0) return exact([du * du + dv * dv, 0, 0, 0, 0, 0]);
      return exact([du * du + dv * dv, 0, 0, 0, 2 * du * dv, dv * dv]);
    case 'typographic':
      return exact([du * du + dv * dv, 0, 0, 0, 0, 0]);
    case 'triangular':
      // e1 = (1, 0), e2 = (½, √3/2): |d|² = du² + du·dv + dv²
      return exact([du * du + du * dv + dv * dv, 0, 0, 0, 0, 0]);
    case 'isometric': {
      // e1 = (1, k), e2 = (1, −k), k² = p/q: q·|d|² = (q + p)(du² + dv²) + 2(q − p)·du·dv
      const { p, q } = ISO_K2[g.ratio];
      return exact([(q + p) * (du * du + dv * dv) + 2 * (q - p) * du * dv, 0, 0, 0, 0, 0]);
    }
  }
}

/** Symmetries in lattice coordinates, about a centre given doubled (2c) so it can be a half-step. */
function symmetries(g: AffineGrid): SymmetryOp[] {
  const s = g.subdivision;
  const ops: SymmetryOp[] = [];

  if (g.preset === 'square' || g.preset === 'typographic') {
    // Centre of the rectangle, doubled: always an integer in sub-steps.
    const cu2 = g.width * s, cv2 = g.height * s;
    const slanted = g.preset === 'square' && g.slantDeg !== 0;
    if (slanted) {
      // Shearing breaks the mirrors and quarter turns; only the half turn survives.
      ops.push({ id: 'rot-180', kind: 'rotate', order: 2, apply: (p) => lattice(cu2 - p.u, cv2 - p.v) });
      return ops;
    }
    ops.push({ id: 'mirror-v', kind: 'mirror', order: 2, apply: (p) => lattice(cu2 - p.u, p.v) });
    if (g.preset === 'typographic') return ops; // flipping top-bottom would break baseline and x-height
    ops.push({ id: 'mirror-h', kind: 'mirror', order: 2, apply: (p) => lattice(p.u, cv2 - p.v) });
    ops.push({ id: 'rot-180', kind: 'rotate', order: 2, apply: (p) => lattice(cu2 - p.u, cv2 - p.v) });
    if (g.width === g.height) {
      const c2 = cu2;
      // About (c, c): quarter turn (u, v) → (2c − v, u); diagonal mirrors swap axes.
      ops.push({ id: 'rot-90', kind: 'rotate', order: 4, apply: (p) => lattice(c2 - p.v, p.u) });
      ops.push({ id: 'mirror-d', kind: 'mirror', order: 2, apply: (p) => lattice(p.v, p.u) });
      ops.push({ id: 'mirror-d2', kind: 'mirror', order: 2, apply: (p) => lattice(c2 - p.v, c2 - p.u) });
    }
    return ops;
  }

  // Triangular and isometric: symmetries about the lattice point nearest the rectangle's centre.
  const c = nearest(centre(g), g);
  const about = (f: (du: number, dv: number) => [number, number]) => (p: Lattice): Lattice => {
    const [du, dv] = f(p.u - c.u, p.v - c.v);
    return lattice(c.u + du, c.v + dv);
  };

  if (g.preset === 'triangular') {
    // e1 → e2, e2 → e2 − e1 under a 60° turn; mirror in the e1 axis: e2 → e1 − e2.
    const rot60 = about((du, dv) => [-dv, du + dv]);
    const mirror = about((du, dv) => [du + dv, -dv]);
    ops.push({ id: 'rot-60', kind: 'rotate', order: 6, apply: rot60 });
    ops.push({ id: 'rot-120', kind: 'rotate', order: 3, apply: (p) => rot60(rot60(p)) });
    ops.push({ id: 'rot-180', kind: 'rotate', order: 2, apply: (p) => rot60(rot60(rot60(p))) });
    ops.push({ id: 'mirror-h', kind: 'mirror', order: 2, apply: mirror });
    ops.push({ id: 'mirror-v', kind: 'mirror', order: 2, apply: (p) => mirror(rot60(rot60(rot60(p)))) });
    return ops;
  }

  // Isometric, e1 = (1, k), e2 = (1, −k).
  ops.push({ id: 'mirror-v', kind: 'mirror', order: 2, apply: about((du, dv) => [-dv, -du]) });
  ops.push({ id: 'mirror-h', kind: 'mirror', order: 2, apply: about((du, dv) => [dv, du]) });
  ops.push({ id: 'rot-180', kind: 'rotate', order: 2, apply: about((du, dv) => [-du, -dv]) });
  if (g.ratio === 'true30') {
    // Equilateral case: e1 → e1 − e2, e2 → e1 under a 60° turn.
    const rot60 = about((du, dv) => [du + dv, -du]);
    ops.push({ id: 'rot-60', kind: 'rotate', order: 6, apply: rot60 });
    ops.push({ id: 'rot-120', kind: 'rotate', order: 3, apply: (p) => rot60(rot60(p)) });
  }
  return ops;
}

export const affineKind: GridKind<AffineGrid> = {
  toPlane,
  nearest,
  contains,
  points,
  normalise: (p) => p,
  dist2Exact,
  exactT: slantT,
  symmetries,
  size: (g) => ({ width: g.width, height: g.height }),
};
