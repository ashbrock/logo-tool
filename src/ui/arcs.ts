/**
 * Arc candidates while drawing (SPEC.md §6.3): every lattice point exactly equidistant from both ends
 * (decided with exact squared distances, not floats), each with both directions around it. Ordered by
 * radius, then by how far the arc turns, so the first candidate is the tightest short arc.
 */
import { exactEq } from '../geometry/exact';
import { latticeEq, type Lattice } from '../geometry/lattice';
import { dist2Exact, exactT, latticePoints, toPlane, type GridDef } from '../grids';

export interface ArcCandidate {
  readonly centre: Lattice;
  readonly sweep: 0 | 1;
  /** Radius in cells. */
  readonly r: number;
  /** How far the arc turns, in radians (0, 2π). */
  readonly turn: number;
}

const TAU = 2 * Math.PI;

export function arcCandidates(g: GridDef, from: Lattice, to: Lattice, limit = 16): ArcCandidate[] {
  if (latticeEq(from, to)) return [];
  const a = toPlane(from, g), b = toPlane(to, g);
  const out: ArcCandidate[] = [];
  for (const c of latticePoints(g)) {
    if (!exactEq(dist2Exact(c, from, g), dist2Exact(c, to, g), exactT(g))) continue;
    const p = toPlane(c, g);
    const r = Math.hypot(a.x - p.x, a.y - p.y);
    if (r < 1e-9) continue;
    const a0 = Math.atan2(a.y - p.y, a.x - p.x), a1 = Math.atan2(b.y - p.y, b.x - p.x);
    for (const sweep of [1, 0] as const) {
      const s = sweep === 1 ? 1 : -1;
      const turn = (((s * (a1 - a0)) % TAU) + TAU) % TAU;
      if (turn > 1e-9) out.push({ centre: c, sweep, r, turn });
    }
  }
  out.sort((x, y) => (Math.abs(x.r - y.r) > 1e-9 ? x.r - y.r : x.turn - y.turn));
  return out.slice(0, limit);
}
