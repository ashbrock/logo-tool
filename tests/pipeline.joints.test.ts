/** Joint radius: fillets on corners created by merge / cut / intersect (SPEC.md §6.7 step 5). */
import fc from 'fast-check';
import { contourArea, dot, len, segStarts, segTangents, type Contour } from '../src/geometry/contour';
import { outlineClosed, type CornerSpec, type CornerType } from '../src/geometry/corners';
import { sub, vec, type Vec2 } from '../src/geometry/num';
import { evaluateMark, type PlaneShape } from '../src/pipeline/evaluate';
import type { Piece } from '../src/pipeline/pieces';
import { engine } from './paper-engine';

const RUNS = Number(process.env.FC_RUNS ?? 100);
const none = { kind: 'none' } as const;
const sharp = (n: number): CornerSpec[] => Array.from({ length: n }, () => ({ type: 'round', r: 0 }));
const poly = (pts: [number, number][]): Contour => outlineClosed(pts.map(([x, y]) => vec(x, y)), sharp(pts.length)).contour!;
const circle = (x: number, y: number, r: number): Contour => outlineClosed([vec(x, y)], [{ type: 'outer', r }]).contour!;
const shape = (id: string, role: PlaneShape['role'], contours: Contour[], jointRadius = 0, repeat: PlaneShape['repeat'] = none): PlaneShape => ({ id, role, contours, repeat, jointRadius });
const totalArea = (ps: readonly Piece[]) => ps.reduce((a, p) => a + contourArea(p.outer) + p.holes.reduce((b, h) => b + contourArea(h), 0), 0);
const contoursOf = (ps: readonly Piece[]) => ps.flatMap((p) => [p.outer, ...p.holes]);
const filletArcs = (ps: readonly Piece[], r: number) => contoursOf(ps).flatMap((c) => c.segs.filter((s) => s.kind === 'A' && Math.abs(s.r - r) < 1e-12)) as Extract<Contour['segs'][number], { kind: 'A' }>[];

/** Every arc valid and consistent; every junction touching an arc of radius r is smooth. */
function check(ps: readonly Piece[], r: number): string | null {
  for (const c of contoursOf(ps)) {
    const starts = segStarts(c), n = c.segs.length;
    for (let i = 0; i < n; i++) {
      const s = c.segs[i]!, from = starts[i]!;
      if (s.kind === 'A') {
        if (!(s.r > 0) || len(sub(s.to, from)) < 1e-12) return 'bad arc';
        const a = Math.atan2(from.y - s.centre.y, from.x - s.centre.x) + s.sweep;
        if (len(sub({ x: s.centre.x + s.r * Math.cos(a), y: s.centre.y + s.r * Math.sin(a) }, s.to)) > 1e-9 * Math.max(1, s.r)) return 'sweep disagrees with ends';
      }
      const next = c.segs[(i + 1) % n]!;
      const isFillet = (q: typeof s) => q.kind === 'A' && Math.abs(q.r - r) < 1e-12;
      if (isFillet(s) || isFillet(next)) {
        const t1 = segTangents(from, s).end, t2 = segTangents(s.to, next).start;
        if (1 - dot(t1, t2) > 1e-9) return `fillet junction not smooth (${(1 - dot(t1, t2)).toExponential(1)})`;
      }
    }
  }
  return null;
}

describe('joint radius', () => {
  it('line–line, concave: two overlapping squares gain two quarter-fillets, 7 + 2(1 − π/4)ρ²', () => {
    const rho = 0.25;
    const m = evaluateMark([shape('a', 'add', [poly([[0, 0], [2, 0], [2, 2], [0, 2]])]), shape('b', 'add', [poly([[1, 1], [3, 1], [3, 3], [1, 3]])], rho)], engine);
    expect(m.errors).toEqual([]);
    expect(m.issues).toEqual([]);
    expect(totalArea(m.pieces)).toBeCloseTo(7 + 2 * (1 - Math.PI / 4) * rho * rho, 9);
    expect(filletArcs(m.pieces, rho)).toHaveLength(2);
    expect(check(m.pieces, rho)).toBeNull();
  });

  it('only corners the operation created are filleted: the squares’ own corners stay sharp', () => {
    const m = evaluateMark([shape('a', 'add', [poly([[0, 0], [2, 0], [2, 2], [0, 2]])]), shape('b', 'add', [poly([[1, 1], [3, 1], [3, 3], [1, 3]])], 0.25)], engine);
    const lines = contoursOf(m.pieces).flatMap((c) => c.segs.filter((s) => s.kind === 'L'));
    expect(lines).toHaveLength(8); // 8 straight edges between 6 sharp corners and 2 fillets
  });

  it('line–line, convex: a wedge clipped by a frame loses r²(cot(θ/2) − (π − θ)/2) at each clip corner', () => {
    const rho = 0.1;
    const m = evaluateMark([shape('w', 'add', [poly([[0, 0], [10, -1], [10, 1]])]), shape('f', 'intersect', [poly([[-5, -5], [5, -5], [5, 5], [-5, 5]])], rho)], engine);
    expect(m.issues).toEqual([]);
    // Interior angle at (5, −0.5) between the edge back to the origin and the frame edge.
    const u1 = { x: -5, y: 0.5 }, u2 = { x: 0, y: 1 };
    const theta = Math.acos(dot(u1, u2) / (len(u1) * len(u2)));
    const removed = rho * rho * (1 / Math.tan(theta / 2) - (Math.PI - theta) / 2);
    expect(totalArea(m.pieces)).toBeCloseTo(2.5 - 2 * removed, 9);
    expect(check(m.pieces, rho)).toBeNull();
  });

  it('line–arc: a circle on a square’s edge gets fillets tangent to both the line and the circle', () => {
    const rho = 0.2, R = 0.6;
    const m = evaluateMark([shape('sq', 'add', [poly([[0, 0], [2, 0], [2, 2], [0, 2]])]), shape('c', 'add', [circle(1, 0, R)], rho)], engine);
    expect(m.issues).toEqual([]);
    const fillets = filletArcs(m.pieces, rho);
    expect(fillets).toHaveLength(2);
    for (const f of fillets) {
      expect(Math.abs(f.centre.y)).toBeCloseTo(rho, 12);                        // ρ from the line y = 0
      expect(len(sub(f.centre, vec(1, 0)))).toBeCloseTo(R + rho, 12);            // externally tangent to the circle
    }
    expect(check(m.pieces, rho)).toBeNull();
  });

  it('arc–arc: two merged circles get fillets tangent to both', () => {
    const rho = 0.15;
    const m = evaluateMark([shape('a', 'add', [circle(0, 0, 1)]), shape('b', 'add', [circle(1.5, 0, 1)], rho)], engine);
    expect(m.issues).toEqual([]);
    const fillets = filletArcs(m.pieces, rho);
    expect(fillets).toHaveLength(2);
    for (const f of fillets) {
      expect(len(sub(f.centre, vec(0, 0)))).toBeCloseTo(1 + rho, 12);
      expect(len(sub(f.centre, vec(1.5, 0)))).toBeCloseTo(1 + rho, 12);
    }
    expect(check(m.pieces, rho)).toBeNull();
  });

  it('repeat copies meeting each other are filleted with the shape’s own joint radius: a plus sign', () => {
    const rho = 0.1;
    const bar = poly([[-1, -0.25], [1, -0.25], [1, 0.25], [-1, 0.25]]);
    const m = evaluateMark([shape('bar', 'add', [bar], rho, { kind: 'rotate', centre: vec(0, 0), count: 2, mirrored: false })], engine);
    // Two copies 180° apart coincide; use count 4 for a plus (0°, 90°, 180°, 270°).
    const plus = evaluateMark([shape('bar', 'add', [bar], rho, { kind: 'rotate', centre: vec(0, 0), count: 4, mirrored: false })], engine);
    expect(m.pieces).toHaveLength(1);
    expect(totalArea(plus.pieces)).toBeCloseTo(1.75 + 4 * (1 - Math.PI / 4) * rho * rho, 9);
    expect(filletArcs(plus.pieces, rho)).toHaveLength(4);
    expect(check(plus.pieces, rho)).toBeNull();
  });

  it('a joint radius that does not fit is clamped and reported, and the result stays valid', () => {
    const m = evaluateMark([shape('a', 'add', [poly([[0, 0], [2, 0], [2, 2], [0, 2]])]), shape('b', 'add', [poly([[1, 1], [3, 1], [3, 3], [1, 3]])], 5)], engine);
    expect(m.issues.length).toBeGreaterThan(0);
    for (const i of m.issues) { expect(i.actual).toBeLessThan(i.requested); expect(i.shapeId).toBe('b'); }
    expect(m.errors).toEqual([]);
  });
});

describe('P4 / P7 for joints on random shapes', () => {
  const shapeArb = fc
    .array(fc.record({ x: fc.integer({ min: 0, max: 6 }), y: fc.integer({ min: 0, max: 6 }) }), { minLength: 3, maxLength: 5 })
    .chain((pts) =>
      fc.record({
        pts: fc.constant(pts),
        corners: fc.array(fc.record({ type: fc.constantFrom<CornerType>('auto', 'outer', 'round', 'inward'), r: fc.integer({ min: 0, max: 120 }).map((k) => k / 240) }), { minLength: pts.length, maxLength: pts.length }),
        role: fc.constantFrom<PlaneShape['role']>('add', 'add', 'cut', 'intersect'),
      }),
    );

  it('fillet arcs are valid and meet their neighbours smoothly; clamps are reported', () => {
    fc.assert(
      fc.property(fc.array(shapeArb, { minLength: 2, maxLength: 3 }), fc.integer({ min: 1, max: 120 }), (specs, k) => {
        const rho = k / 240 + 1e-7; // distinct from every corner radius, so fillet arcs are identifiable
        const shapes: PlaneShape[] = [];
        specs.forEach((sp, i) => {
          const c = outlineClosed(sp.pts.map((p) => vec(p.x, p.y)), sp.corners).contour;
          if (c) shapes.push(shape(`s${i}`, i === 0 ? 'add' : sp.role, [c], rho));
        });
        const m = evaluateMark(shapes, engine);
        expect(m.errors).toEqual([]);
        for (const i of m.issues) expect(i.actual).toBeLessThan(i.requested);
        expect(check(m.pieces, rho)).toBeNull();
      }),
      { numRuns: RUNS },
    );
  });
});
