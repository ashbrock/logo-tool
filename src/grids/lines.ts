/**
 * The lattice's own lines, for drawing (canvas and export overlay, DESIGN.md §2.2, §8). Pure: derived
 * from the lattice points, so every grid type gets lines without its own drawing code.
 */
import { lattice, type Lattice } from '../geometry/lattice';
import type { Vec2 } from '../geometry/num';
import { latticePoints, toPlane } from './index';
import type { GridDef } from './types';

/** A straight grid line in cells. */
export interface GridLine { readonly a: Vec2; readonly b: Vec2; readonly major: boolean }

/**
 * The lattice's own lines: for affine grids, every line through lattice points along each lattice
 * direction (two for square and typographic, three for triangular and isometric); for polar grids, the
 * rays. Rings are returned separately.
 */
export function gridLines(g: GridDef): { lines: GridLine[]; rings: { centre: Vec2; r: number; major: boolean }[] } {
  const sub = g.subdivision;
  if (g.kind === 'polar') {
    const centre = toPlane(lattice(0, 0), g);
    const maxU = g.rings * sub;
    const rings = Array.from({ length: maxU }, (_, i) => ({ centre, r: (i + 1) / sub, major: (i + 1) % sub === 0 }));
    const lines = Array.from({ length: g.rays }, (_, k) => ({ a: centre, b: toPlane(lattice(maxU, k), g), major: true }));
    return { lines, rings };
  }
  const pts = latticePoints(g);
  const dirs: [number, number][] = [[1, 0], [0, 1]];
  if (g.preset === 'triangular' || g.preset === 'isometric') {
    // The third family is whichever diagonal has the same plane length as the basis steps.
    const o = toPlane(lattice(0, 0), g), e = toPlane(lattice(1, 0), g);
    const base = Math.hypot(e.x - o.x, e.y - o.y);
    for (const d of [[1, -1], [1, 1]] as [number, number][]) {
      const q = toPlane(lattice(d[0], d[1]), g);
      if (Math.abs(Math.hypot(q.x - o.x, q.y - o.y) - base) < 1e-9) { dirs.push(d); break; }
    }
  }
  const lines: GridLine[] = [];
  for (const [du, dv] of dirs) {
    // Points on one line share u·dv − v·du; order along the line by u·du + v·dv.
    const byLine = new Map<number, { lo: Lattice; hi: Lattice; loT: number; hiT: number }>();
    for (const p of pts) {
      if (p.layer) continue;
      const key = p.u * dv - p.v * du, t = p.u * du + p.v * dv;
      const e = byLine.get(key);
      if (!e) byLine.set(key, { lo: p, hi: p, loT: t, hiT: t });
      else { if (t < e.loT) { e.lo = p; e.loT = t; } if (t > e.hiT) { e.hi = p; e.hiT = t; } }
    }
    for (const [key, e] of [...byLine].sort((x, y) => x[0] - y[0])) {
      if (e.loT === e.hiT) continue;
      lines.push({ a: toPlane(e.lo, g), b: toPlane(e.hi, g), major: ((key % sub) + sub) % sub === 0 });
    }
  }
  return { lines, rings: [] };
}


/** Named typographic rows as horizontal lines in cells (empty for other grids). */
export function namedRows(g: GridDef): { name: string; y: number; width: number }[] {
  if (g.kind !== 'affine' || g.preset !== 'typographic') return [];
  return g.rows.map((r) => ({ name: r.name, y: r.at / g.subdivision, width: g.width }));
}
