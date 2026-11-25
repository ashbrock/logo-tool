/**
 * P1 — every placed point lies exactly on the lattice (VERIFICATION.md §2).
 * Placement always goes through `nearest`, so these properties cover every point the UI can create.
 */
import fc from 'fast-check';
import { dist2 } from '../src/geometry/num';
import { latticeEq } from '../src/geometry/lattice';
import { contains, defaultGrid, latticePoints, nearest, normalise, toPlane, type GridDef } from '../src/grids';
import { gridAndPointArb } from './arbitraries';

const RUNS = Number(process.env.FC_RUNS ?? 200);

describe('P1: snapping lands exactly on the lattice', () => {
  it('nearest() returns integral coordinates inside the extent', () => {
    fc.assert(
      fc.property(gridAndPointArb, ({ g, x, y }) => {
        const p = nearest({ x, y }, g);
        expect(Number.isSafeInteger(p.u) && Number.isSafeInteger(p.v)).toBe(true);
        expect(contains(p, g)).toBe(true);
        expect(latticeEq(p, normalise(p, g))).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it('nearest() is idempotent: snapping a lattice point returns the same point', () => {
    fc.assert(
      fc.property(gridAndPointArb, ({ g, x, y }) => {
        const p = nearest({ x, y }, g);
        expect(nearest(toPlane(p, g), g)).toEqual(p);
      }),
      { numRuns: RUNS },
    );
  });

  it('nearest() really is nearest: matches a brute-force scan of every lattice point', () => {
    fc.assert(
      fc.property(gridAndPointArb, ({ g, x, y }) => {
        const q = { x, y };
        const best = Math.min(...latticePoints(g).map((p) => dist2(toPlane(p, g), q)));
        expect(dist2(toPlane(nearest(q, g), g), q)).toBeLessThanOrEqual(best + 1e-9);
      }),
      { numRuns: RUNS },
    );
  });

  it('whole-cell snapping only returns whole-cell points, and is nearest among them', () => {
    fc.assert(
      fc.property(gridAndPointArb, ({ g, x, y }) => {
        const q = { x, y };
        const p = nearest(q, g, { wholeOnly: true });
        const s = g.subdivision;
        // `=== 0` rather than toBe(0): companion square points can be negative, and −1 % 1 is −0.
        const whole = g.kind === 'polar' && p.layer !== 'square' ? p.u % s === 0 : p.u % s === 0 && p.v % s === 0;
        expect(whole).toBe(true);
        const best = Math.min(...latticePoints(g, { wholeOnly: true }).map((w) => dist2(toPlane(w, g), q)));
        expect(dist2(toPlane(p, g), q)).toBeLessThanOrEqual(best + 1e-9);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('lattice positions: known values', () => {
  const close = (a: { x: number; y: number }, x: number, y: number) => {
    expect(a.x).toBeCloseTo(x, 12);
    expect(a.y).toBeCloseTo(y, 12);
  };

  it('square: (3, 1) is 3 cells right, 1 down; sub-steps divide the cell', () => {
    const g = defaultGrid('square');
    close(toPlane({ u: 3, v: 1 }, g), 3, 1);
    const g8: GridDef = { ...g, subdivision: 8 } as GridDef;
    close(toPlane({ u: 27, v: 8 }, g8), 3.375, 1); // motion-logo's 0.375-cell spacing
  });

  it('square with slant 21.24°: vertical lines lean by tan(slant) (p-logo-4)', () => {
    const g = { ...defaultGrid('square'), slantDeg: 21.24 } as GridDef;
    close(toPlane({ u: 0, v: 5 }, g), 5 * Math.tan((21.24 * Math.PI) / 180), 5);
  });

  it('isometric 2:3 gives whole-number slopes (e-logo-4)', () => {
    const g = { ...defaultGrid('isometric'), ratio: '2:3' } as GridDef;
    close(toPlane({ u: 3, v: 0 }, g), 3, 2);
  });

  it('polar: every point at ring 0 is the centre', () => {
    const g = defaultGrid('polar');
    expect(normalise({ u: 0, v: 7 }, g)).toEqual({ u: 0, v: 0 });
    close(toPlane({ u: 0, v: 0 }, g), 6, 6);
    close(toPlane({ u: 2, v: 6 }, g), 6, 8); // ray 6 of 24 = 90°, which points down (y down)
  });

  it('snapping clamps to the grid edge for points outside it', () => {
    const g = defaultGrid('square');
    expect(nearest({ x: -3, y: 2.2 }, g)).toEqual({ u: 0, v: 2 });
  });
});
