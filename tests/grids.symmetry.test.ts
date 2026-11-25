/**
 * P5 — symmetry closure (VERIFICATION.md §2), plus the exact-distance scalars that the arc
 * equidistance invariant relies on (ARCHITECTURE.md §3, invariant 2).
 */
import fc from 'fast-check';
import { exactEq, valueOf } from '../src/geometry/exact';
import { dist, dist2 } from '../src/geometry/num';
import type { Lattice } from '../src/geometry/lattice';
import { defaultGrid, dist2Exact, exactT, latticePoints, normalise, symmetries, toPlane, type GridDef } from '../src/grids';
import { gridArb } from './arbitraries';

const RUNS = Number(process.env.FC_RUNS ?? 200);

/** A grid with two of its lattice points (grids always have at least one point). */
const gridWithPoints = gridArb.chain((g) => {
  const pts = latticePoints(g);
  const pick = fc.integer({ min: 0, max: pts.length - 1 }).map((i) => pts[i] as Lattice);
  return fc.record({ g: fc.constant(g), a: pick, b: pick });
});

const applyN = (f: (p: Lattice) => Lattice, n: number, p: Lattice) => {
  let q = p;
  for (let i = 0; i < n; i++) q = f(q);
  return q;
};

describe('P5: symmetry operations', () => {
  it('map lattice points to integral lattice points', () => {
    fc.assert(
      fc.property(gridWithPoints, ({ g, a }) => {
        for (const op of symmetries(g)) {
          const q = op.apply(a);
          expect(Number.isSafeInteger(q.u) && Number.isSafeInteger(q.v)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('are Euclidean isometries in the plane (distances are preserved)', () => {
    fc.assert(
      fc.property(gridWithPoints, ({ g, a, b }) => {
        const d = dist(toPlane(a, g), toPlane(b, g));
        for (const op of symmetries(g)) {
          expect(dist(toPlane(op.apply(a), g), toPlane(op.apply(b), g))).toBeCloseTo(d, 9);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('applying an operation `order` times is the identity', () => {
    fc.assert(
      fc.property(gridWithPoints, ({ g, a }) => {
        for (const op of symmetries(g)) {
          expect(applyN(op.apply, op.order, a)).toEqual(normalise(a, g));
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('offers the native groups from SPEC.md §5', () => {
    const ids = (g: GridDef) => symmetries(g).map((o) => o.id).sort();
    expect(ids(defaultGrid('square'))).toEqual(['mirror-d', 'mirror-d2', 'mirror-h', 'mirror-v', 'rot-180', 'rot-90'].sort());
    expect(ids({ ...defaultGrid('square'), slantDeg: 20 } as GridDef)).toEqual(['rot-180']);
    expect(ids(defaultGrid('triangular'))).toContain('rot-60');
    expect(ids({ ...defaultGrid('isometric'), ratio: '2:3' } as GridDef)).not.toContain('rot-60');
    expect(ids(defaultGrid('typographic'))).toEqual(['mirror-v']);
    expect(ids(defaultGrid('polar'))).toContain('rot-6'); // node-logo's 6-fold
    expect(ids(defaultGrid('polar'))).toContain('rot-3'); // p-logo-5 / p-logo-7's 3-fold
  });
});

describe('exact squared distances', () => {
  it('agree numerically with the plane distance (up to the grid’s constant scale)', () => {
    fc.assert(
      fc.property(gridWithPoints, ({ g, a, b }) => {
        const pts = latticePoints(g);
        const ref = pts.find((p) => dist2(toPlane(p, g), toPlane(pts[0] as Lattice, g)) > 0.5);
        if (!ref) return; // single-point grid
        // The ratio exact/plane must be the same constant for every pair on a grid.
        const k = valueOf(dist2Exact(ref, pts[0] as Lattice, g), exactT(g)) / dist2(toPlane(ref, g), toPlane(pts[0] as Lattice, g));
        const e = valueOf(dist2Exact(a, b, g), exactT(g));
        expect(e).toBeCloseTo(k * dist2(toPlane(a, g), toPlane(b, g)), 6);
      }),
      { numRuns: RUNS },
    );
  });

  it('are exactly equal for equidistant points (no float tolerance)', () => {
    const sq = defaultGrid('square');
    // (3, 4) and (5, 0) are both 5 from the origin: exactness must not depend on the decomposition.
    expect(exactEq(dist2Exact({ u: 3, v: 4 }, { u: 0, v: 0 }, sq), dist2Exact({ u: 5, v: 0 }, { u: 0, v: 0 }, sq))).toBe(true);

    const polar = defaultGrid('polar');
    // On a 24-ray polar grid, ring 3 at rays 0 and 5 are both 3 from the centre, and the chord
    // ray 0 → ray 5 equals ray 7 → ray 12 by rotation: exact in the basis [1, √2, √3, √6].
    const chordA = dist2Exact({ u: 3, v: 0 }, { u: 3, v: 5 }, polar);
    const chordB = dist2Exact({ u: 3, v: 7 }, { u: 3, v: 12 }, polar);
    expect(chordA.exact && chordB.exact).toBe(true);
    expect(exactEq(chordA, chordB)).toBe(true);
    expect(exactEq(chordA, dist2Exact({ u: 3, v: 0 }, { u: 3, v: 4 }, polar))).toBe(false);
  });

  it('are exact on every grid except polar grids whose ray count does not divide 24', () => {
    fc.assert(
      fc.property(gridWithPoints, ({ g, a, b }) => {
        const s = dist2Exact(a, b, g);
        const expectExact = !(g.kind === 'polar' && 24 % g.rays !== 0);
        expect(s.exact).toBe(expectExact);
      }),
      { numRuns: RUNS },
    );
  });
});
