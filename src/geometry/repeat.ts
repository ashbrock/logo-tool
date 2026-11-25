/**
 * Per-shape repeats (SPEC.md §6.9, ARCHITECTURE.md §4.5): exact plane transforms applied to a shape's
 * outline contours. Copies are derived geometry, like boolean crossings, so they need not land on
 * lattice points; the lattice invariant is about stored points only.
 */
import { add, scale, sub, type Vec2 } from './num';
import { unit, type Contour, type Seg } from './contour';

/** An isometry x ↦ M·x + t with M orthogonal (det ±1). */
export interface Isometry {
  readonly m: readonly [number, number, number, number]; // [a b; c d]
  readonly t: Vec2;
}

export const IDENTITY: Isometry = { m: [1, 0, 0, 1], t: { x: 0, y: 0 } };

export function apply(T: Isometry, p: Vec2): Vec2 {
  const [a, b, c, d] = T.m;
  return { x: a * p.x + b * p.y + T.t.x, y: c * p.x + d * p.y + T.t.y };
}

export const det = (T: Isometry): number => T.m[0] * T.m[3] - T.m[1] * T.m[2];

/** Rotation by `rad` (positive rotation) about `c`. */
export function rotation(c: Vec2, rad: number): Isometry {
  const k = Math.cos(rad), s = Math.sin(rad);
  const m: [number, number, number, number] = [k, -s, s, k];
  return { m, t: sub(c, { x: k * c.x - s * c.y, y: s * c.x + k * c.y }) };
}

/** Reflection in the line through p and q. */
export function reflection(p: Vec2, q: Vec2): Isometry {
  const u = unit(sub(q, p));
  const c2 = u.x * u.x - u.y * u.y, s2 = 2 * u.x * u.y;
  const m: [number, number, number, number] = [c2, s2, s2, -c2];
  return { m, t: sub(p, { x: c2 * p.x + s2 * p.y, y: s2 * p.x - c2 * p.y }) };
}

export const translation = (v: Vec2): Isometry => ({ m: [1, 0, 0, 1], t: v });

export function compose(A: Isometry, B: Isometry): Isometry {
  // (A∘B)(x) = A(B(x))
  const [a, b, c, d] = A.m, [e, f, g, h] = B.m;
  return { m: [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h], t: apply(A, B.t) };
}

/** Transform a contour exactly. Reflections reverse rotation, so arc sweeps change sign. */
export function transformContour(c: Contour, T: Isometry): Contour {
  const flip = det(T) < 0 ? -1 : 1;
  const segs: Seg[] = c.segs.map((s) =>
    s.kind === 'L'
      ? { kind: 'L', to: apply(T, s.to) }
      : { kind: 'A', to: apply(T, s.to), centre: apply(T, s.centre), r: s.r, sweep: flip * s.sweep },
  );
  return { start: apply(T, c.start), segs };
}

/** A repeat resolved to plane coordinates (the pipeline maps lattice values through the grid). */
export type PlaneRepeat =
  | { readonly kind: 'none' }
  | { readonly kind: 'rotate'; readonly centre: Vec2; readonly count: number; readonly mirrored: boolean; readonly axisPoint?: Vec2 }
  | { readonly kind: 'mirror'; readonly through: Vec2; readonly to: Vec2 }
  | { readonly kind: 'translate'; readonly step: Vec2; readonly count: number };

/** Every instance's transform, the identity (the source itself) first. `count` is the total number of instances. */
export function repeatTransforms(r: PlaneRepeat): Isometry[] {
  switch (r.kind) {
    case 'none':
      return [IDENTITY];
    case 'rotate': {
      const n = Math.max(1, Math.floor(r.count));
      const rots = Array.from({ length: n }, (_, k) => (k === 0 ? IDENTITY : rotation(r.centre, (2 * Math.PI * k) / n)));
      if (!r.mirrored) return rots;
      const axis = reflection(r.centre, r.axisPoint ?? add(r.centre, { x: 1, y: 0 }));
      return [...rots, ...rots.map((R) => compose(R, axis))];
    }
    case 'mirror':
      return [IDENTITY, reflection(r.through, r.to)];
    case 'translate': {
      const n = Math.max(1, Math.floor(r.count));
      return Array.from({ length: n }, (_, k) => (k === 0 ? IDENTITY : translation(scale(r.step, k))));
    }
  }
}

/** All instances of a shape's contours, source first. */
export function expandRepeat(contours: readonly Contour[], r: PlaneRepeat): Contour[][] {
  return repeatTransforms(r).map((T) => contours.map((c) => (T === IDENTITY ? c : transformContour(c, T))));
}
