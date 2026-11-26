/** Arc candidates offered while drawing. */
import { lattice } from '../src/geometry/lattice';
import { defaultGrid, toPlane, type GridDef } from '../src/grids';
import { arcCandidates } from '../src/ui/arcs';

const sq = (w: number, sub: 1 | 2): GridDef => ({ ...defaultGrid('square'), width: w, height: w, subdivision: sub } as GridDef);

describe('arc candidates', () => {
  it('a half circle between (0, 2) and (4, 2) has its tightest centre at (2, 2)', () => {
    const c = arcCandidates(sq(4, 1), lattice(0, 2), lattice(4, 2));
    expect(c[0]!.centre).toEqual(lattice(2, 2));
    expect(c[0]!.r).toBeCloseTo(2, 12);
    expect(c[0]!.turn).toBeCloseTo(Math.PI, 12);
  });

  it('a quarter turn offers both corner centres, short arcs first', () => {
    const c = arcCandidates(sq(4, 1), lattice(0, 1), lattice(1, 0));
    const short = c.filter((x) => Math.abs(x.turn - Math.PI / 2) < 1e-9);
    expect(short.map((x) => [x.centre.u, x.centre.v]).sort()).toEqual([[0, 0], [1, 1]]);
    expect(c[0]!.turn).toBeLessThan(Math.PI); // short before long at the same radius
  });

  it('every candidate is exactly equidistant from both ends', () => {
    const g = sq(6, 2);
    const from = lattice(1, 3), to = lattice(7, 5);
    for (const c of arcCandidates(g, from, to, 100)) {
      const p = toPlane(c.centre, g), a = toPlane(from, g), b = toPlane(to, g);
      expect(Math.hypot(a.x - p.x, a.y - p.y)).toBeCloseTo(Math.hypot(b.x - p.x, b.y - p.y), 12);
    }
  });

  it('offers nothing between a point and itself', () => {
    expect(arcCandidates(sq(4, 1), lattice(1, 1), lattice(1, 1))).toEqual([]);
  });
});
