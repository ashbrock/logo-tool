/** Circles and per-shape repeats: P5 repeat closure (VERIFICATION.md §2) and closed-form checks. */
import fc from 'fast-check';
import { contourArea, len, segStarts, type Contour } from '../src/geometry/contour';
import { outlineClosed, type CornerType } from '../src/geometry/corners';
import { sub, vec, type Vec2 } from '../src/geometry/num';
import { apply, expandRepeat, reflection, repeatTransforms, rotation, transformContour, type PlaneRepeat } from '../src/geometry/repeat';

const RUNS = Number(process.env.FC_RUNS ?? 200);

function close(a: Contour, b: Contour, eps = 1e-9): boolean {
  if (len(sub(a.start, b.start)) > eps || a.segs.length !== b.segs.length) return false;
  return a.segs.every((s, i) => {
    const t = b.segs[i]!;
    if (s.kind !== t.kind || len(sub(s.to, t.to)) > eps) return false;
    if (s.kind === 'A' && t.kind === 'A') return Math.abs(s.r - t.r) < eps && Math.abs(s.sweep - t.sweep) < eps && len(sub(s.centre, t.centre)) < eps;
    return true;
  });
}

describe('circles', () => {
  it('a one-point shape with a radius is a circle of area πr², written as two half arcs', () => {
    const r = outlineClosed([vec(2, 3)], [{ type: 'outer', r: 1.5 }]);
    expect(r.issues).toEqual([]);
    expect(r.contour!.segs).toHaveLength(2);
    expect(r.contour!.segs.every((s) => s.kind === 'A' && Math.abs(s.sweep) === Math.PI)).toBe(true);
    expect(contourArea(r.contour!)).toBeCloseTo(Math.PI * 2.25, 12);
  });

  it('a one-point shape without a radius is degenerate, not drawn', () => {
    expect(outlineClosed([vec(0, 0)], [{ type: 'outer', r: 0 }]).contour).toBeNull();
  });
});

// Random outlines from the corner geometry, to transform.
const contourArb = fc
  .array(fc.record({ x: fc.integer({ min: 0, max: 6 }), y: fc.integer({ min: 0, max: 6 }) }), { minLength: 3, maxLength: 6 })
  .chain((pts) =>
    fc.record({
      pts: fc.constant(pts.map((p) => vec(p.x, p.y))),
      corners: fc.array(fc.record({ type: fc.constantFrom<CornerType>('auto', 'outer', 'round', 'inward'), r: fc.integer({ min: 0, max: 120 }).map((k) => k / 240) }), { minLength: pts.length, maxLength: pts.length }),
    }),
  )
  .map(({ pts, corners }) => outlineClosed(pts, corners).contour)
  .filter((c): c is Contour => c !== null);
const pointArb = fc.record({ x: fc.double({ min: -5, max: 10, noNaN: true }), y: fc.double({ min: -5, max: 10, noNaN: true }) });

describe('P5: repeat closure', () => {
  it('rotating by 360°/n, n times, is the identity', () => {
    fc.assert(
      fc.property(contourArb, pointArb, fc.integer({ min: 2, max: 360 }), (c, centre, n) => {
        const R = rotation(centre, (2 * Math.PI) / n);
        let x = c;
        for (let i = 0; i < n; i++) x = transformContour(x, R);
        expect(close(x, c, 1e-7)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it('mirroring twice is the identity, and a mirror reverses area sign but keeps its size', () => {
    fc.assert(
      fc.property(contourArb, pointArb, pointArb, (c, p, q) => {
        fc.pre(len(sub(q, p)) > 1e-3);
        const M = reflection(p, q);
        const once = transformContour(c, M);
        expect(close(transformContour(once, M), c, 1e-8)).toBe(true);
        expect(contourArea(once)).toBeCloseTo(-contourArea(c), 8);
      }),
      { numRuns: RUNS },
    );
  });

  it('copies keep every length, radius and area, and every arc stays valid', () => {
    fc.assert(
      fc.property(contourArb, pointArb, fc.integer({ min: 2, max: 12 }), fc.boolean(), (c, centre, n, mirrored) => {
        const copies = expandRepeat([c], { kind: 'rotate', centre, count: n, mirrored });
        expect(copies).toHaveLength(mirrored ? 2 * n : n);
        for (const [copy] of copies) {
          expect(Math.abs(contourArea(copy!))).toBeCloseTo(Math.abs(contourArea(c)), 8);
          const starts = segStarts(copy!);
          copy!.segs.forEach((s, i) => {
            if (s.kind !== 'A') return;
            expect(len(sub(starts[i]!, s.centre))).toBeCloseTo(s.r, 9);
            expect(len(sub(s.to, s.centre))).toBeCloseTo(s.r, 9);
          });
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('the source is always the first instance, unchanged', () => {
    const c = outlineClosed([vec(0, 0), vec(1, 0), vec(1, 1)], [{ type: 'round', r: 0 }, { type: 'round', r: 0 }, { type: 'round', r: 0 }]).contour!;
    for (const r of [
      { kind: 'none' }, { kind: 'rotate', centre: vec(3, 3), count: 5, mirrored: true },
      { kind: 'mirror', through: vec(0, 0), to: vec(0, 1) }, { kind: 'translate', step: vec(0, 1), count: 4 },
    ] as PlaneRepeat[]) {
      expect(expandRepeat([c], r)[0]![0]).toBe(c);
    }
  });
});

describe('repeats: the shapes from the examples', () => {
  it('8-fold rotation on a square grid (the sun): copies at 45° are exact rotations, not lattice points', () => {
    const T = repeatTransforms({ kind: 'rotate', centre: vec(0, 0), count: 8, mirrored: false });
    expect(T).toHaveLength(8);
    const p = apply(T[1]!, vec(0, -4)); // a bar end 4 cells above the centre, turned 45°
    expect(p.x).toBeCloseTo(4 * Math.SQRT1_2, 12);
    expect(p.y).toBeCloseTo(-4 * Math.SQRT1_2, 12);
  });

  it('along a line ×12 by one cell (the striped circle): equal steps, count includes the source', () => {
    const T = repeatTransforms({ kind: 'translate', step: vec(0, 1), count: 12 });
    expect(T).toHaveLength(12);
    expect(apply(T[11]!, vec(2, 0.5))).toEqual(vec(2, 11.5));
  });
});
