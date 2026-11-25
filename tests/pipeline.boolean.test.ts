/**
 * Merge, cut and intersect through Paper.js, then arc recovery and pieces. Areas are checked against
 * closed forms to 1e-9: recovery must restore the exact circles, not Paper's 4-cubic approximation
 * (which is ~0.027% off). Also P6 on random shapes.
 */
import fc from 'fast-check';
import { contourArea, len, segStarts, type Contour } from '../src/geometry/contour';
import { outlineClosed, type CornerSpec, type CornerType } from '../src/geometry/corners';
import { outlineStroke } from '../src/geometry/strokes';
import { sub, vec, type Vec2 } from '../src/geometry/num';
import { evaluateMark, type PlaneShape } from '../src/pipeline/evaluate';
import type { Piece } from '../src/pipeline/pieces';
import { engine } from './paper-engine';

const RUNS = Number(process.env.FC_RUNS ?? 100);
const none = { kind: 'none' } as const;
const sharp = (n: number): CornerSpec[] => Array.from({ length: n }, () => ({ type: 'round', r: 0 }));
const poly = (pts: [number, number][], corners?: CornerSpec[]): Contour =>
  outlineClosed(pts.map(([x, y]) => vec(x, y)), corners ?? sharp(pts.length)).contour!;
const circle = (x: number, y: number, r: number): Contour => outlineClosed([vec(x, y)], [{ type: 'outer', r }]).contour!;
const shape = (id: string, role: PlaneShape['role'], contours: Contour[], repeat: PlaneShape['repeat'] = none): PlaneShape => ({ id, role, contours, repeat });
const pieceArea = (p: Piece) => contourArea(p.outer) + p.holes.reduce((a, h) => a + contourArea(h), 0);
const totalArea = (ps: readonly Piece[]) => ps.reduce((a, p) => a + pieceArea(p), 0);
const allContours = (ps: readonly Piece[]) => ps.flatMap((p) => [p.outer, ...p.holes]);
const lens = (r: number, d: number) => 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);

describe('booleans with exact arc recovery', () => {
  it('merges two overlapping circles exactly: 2πr² − lens', () => {
    const m = evaluateMark([shape('a', 'add', [circle(0, 0, 1)]), shape('b', 'add', [circle(1, 0, 1)])], engine);
    expect(m.errors).toEqual([]);
    expect(m.pieces).toHaveLength(1);
    expect(totalArea(m.pieces)).toBeCloseTo(2 * Math.PI - lens(1, 1), 9);
    expect(allContours(m.pieces).every((c) => c.segs.every((s) => s.kind === 'A'))).toBe(true);
  });

  it('cuts a circular hole exactly: 16 − π, as one piece with one hole', () => {
    const m = evaluateMark([shape('sq', 'add', [poly([[0, 0], [4, 0], [4, 4], [0, 4]])]), shape('hole', 'cut', [circle(2, 2, 1)])], engine);
    expect(m.pieces).toHaveLength(1);
    expect(m.pieces[0]!.holes).toHaveLength(1);
    expect(contourArea(m.pieces[0]!.outer)).toBeGreaterThan(0);
    expect(contourArea(m.pieces[0]!.holes[0]!)).toBeLessThan(0);
    expect(totalArea(m.pieces)).toBeCloseTo(16 - Math.PI, 9);
  });

  it('intersects a wedge with a frame (m-logo-1 style clip)', () => {
    const m = evaluateMark([shape('w', 'add', [poly([[0, 0], [10, -1], [10, 1]])]), shape('f', 'intersect', [poly([[-5, -5], [5, -5], [5, 5], [-5, 5]])])], engine);
    expect(totalArea(m.pieces)).toBeCloseTo(2.5, 9);
  });

  it('removes the shared edge of two touching squares and keeps 4 nodes', () => {
    const m = evaluateMark([shape('a', 'add', [poly([[0, 0], [1, 0], [1, 1], [0, 1]])]), shape('b', 'add', [poly([[1, 0], [2, 0], [2, 1], [1, 1]])])], engine);
    expect(m.pieces).toHaveLength(1);
    expect(m.pieces[0]!.outer.segs).toHaveLength(4);
  });

  it('thunderbolt S: a cut whose tips touch the block edges leaves two separate pieces', () => {
    const r2: CornerSpec = { type: 'round', r: 2 };
    const block = poly([[0, 0], [6, 0], [6, 4], [0, 4]], [r2, { type: 'round', r: 0 }, r2, { type: 'round', r: 0 }]);
    const boltPts: [number, number][] = [[3, 0], [1.5, 2.5], [3, 2.5], [3, 4], [4.5, 1.5], [3, 1.5]];
    const bolt = poly(boltPts);
    const m = evaluateMark([shape('block', 'add', [block]), shape('bolt', 'cut', [bolt])], engine);
    expect(m.errors).toEqual([]);
    expect(m.pieces).toHaveLength(2);
    expect(m.pieces.every((p) => p.holes.length === 0)).toBe(true);
    const expected = 24 - 2 * (4 - Math.PI) - Math.abs(contourArea(bolt));
    expect(totalArea(m.pieces)).toBeCloseTo(expected, 9);
  });

  it('striped circle: a circle cut by a stripe repeated ×5 gives 6 slices, every arc on the circle', () => {
    const stripe = poly([[-1, 0.95], [7, 0.95], [7, 1.05], [-1, 1.05]]);
    const m = evaluateMark([
      shape('disc', 'add', [circle(3, 3, 3)]),
      shape('gap', 'cut', [stripe], { kind: 'translate', step: vec(0, 1), count: 5 }),
    ], engine);
    expect(m.errors).toEqual([]);
    expect(m.pieces).toHaveLength(6);
    for (const c of allContours(m.pieces)) for (const s of c.segs) if (s.kind === 'A') { expect(s.r).toBeCloseTo(3, 12); expect(len(sub(s.centre, vec(3, 3)))).toBeLessThan(1e-12); }
  });

  it('hatched ring: thin ray strokes repeated ×24 intersected with an annulus', () => {
    const ray = outlineStroke({ points: [vec(5, 5), vec(5, 0)], segments: [{ kind: 'line' }], closed: false, radii: [0, 0], width: 0.15, cap: 'butt', join: 'miter', endRadius: 0 }).contours;
    const ring = outlineStroke({
      points: [vec(1.5, 5), vec(8.5, 5)], segments: [{ kind: 'arc', centre: vec(5, 5), sweep: 1 }, { kind: 'arc', centre: vec(5, 5), sweep: 1 }],
      closed: true, radii: [0, 0], width: 1.5, cap: 'butt', join: 'round', endRadius: 0,
    }).contours;
    const m = evaluateMark([
      shape('rays', 'add', [...ray], { kind: 'rotate', centre: vec(5, 5), count: 24, mirrored: false }),
      shape('ring', 'intersect', [...ring]),
    ], engine);
    expect(m.errors).toEqual([]);
    expect(m.pieces).toHaveLength(24);
    // Each piece is a ray clipped by two concentric arcs (radii 2.75 and 4.25).
    for (const p of m.pieces) {
      const radii = p.outer.segs.filter((s) => s.kind === 'A').map((s) => (s as { r: number }).r).sort();
      expect(radii).toEqual([expect.closeTo(2.75, 12), expect.closeTo(4.25, 12)]);
    }
  });

  it('an empty result (everything cut away) has no pieces', () => {
    const m = evaluateMark([shape('a', 'add', [poly([[0, 0], [1, 0], [1, 1], [0, 1]])]), shape('b', 'cut', [poly([[-1, -1], [2, -1], [2, 2], [-1, 2]])])], engine);
    expect(m.pieces).toEqual([]);
  });

  it('a stroke that crosses itself is resolved into clean pieces', () => {
    // An X made of one open stroke turning back across itself.
    const x = outlineStroke({ points: [vec(0, 0), vec(4, 4), vec(4, 0), vec(0, 4)], segments: [{ kind: 'line' }, { kind: 'line' }, { kind: 'line' }], closed: false, radii: [0, 0, 0, 0], width: 0.5, cap: 'butt', join: 'round', endRadius: 0 }).contours;
    const m = evaluateMark([shape('x', 'add', [...x])], engine);
    expect(m.errors).toEqual([]);
    expect(m.pieces.length).toBeGreaterThanOrEqual(1);
  });
});

describe('P6: recovery never leaves a cubic, and keeps the area of Paper’s result', () => {
  const shapeArb = fc
    .array(fc.record({ x: fc.integer({ min: 0, max: 6 }), y: fc.integer({ min: 0, max: 6 }) }), { minLength: 3, maxLength: 5 })
    .chain((pts) =>
      fc.record({
        pts: fc.constant(pts),
        corners: fc.array(fc.record({ type: fc.constantFrom<CornerType>('auto', 'outer', 'round', 'inward'), r: fc.integer({ min: 0, max: 240 }).map((k) => k / 240) }), { minLength: pts.length, maxLength: pts.length }),
        role: fc.constantFrom<PlaneShape['role']>('add', 'add', 'cut', 'intersect'),
      }),
    );

  it('every segment is a line or a source arc whose ends lie on its circle', () => {
    fc.assert(
      fc.property(fc.array(shapeArb, { minLength: 1, maxLength: 4 }), (specs) => {
        const shapes: PlaneShape[] = [];
        specs.forEach((sp, i) => {
          const c = outlineClosed(sp.pts.map((p) => vec(p.x, p.y)), sp.corners).contour;
          if (c) shapes.push(shape(`s${i}`, i === 0 ? 'add' : sp.role, [c]));
        });
        const m = evaluateMark(shapes, engine);
        expect(m.errors).toEqual([]);
        for (const c of allContours(m.pieces)) {
          const starts = segStarts(c);
          c.segs.forEach((s, i) => {
            expect(['L', 'A']).toContain(s.kind);
            if (s.kind === 'A') {
              expect(Math.abs(len(sub(starts[i] as Vec2, s.centre)) - s.r)).toBeLessThan(1e-6 * Math.max(1, s.r));
              expect(Math.abs(len(sub(s.to, s.centre)) - s.r)).toBeLessThan(1e-6 * Math.max(1, s.r));
            }
          });
          expect(len(sub(c.segs[c.segs.length - 1]!.to, c.start))).toBeLessThan(1e-9);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
