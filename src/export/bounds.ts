/**
 * Exact bounds of contours in cells (ARCHITECTURE.md §7 step 1). Arcs contribute their end points and
 * every axis extreme (0°, 90°, 180°, 270°) they actually pass through, so a bound never relies on
 * flattening.
 */
import type { Contour } from '../geometry/contour';
import type { Vec2 } from '../geometry/num';

export interface Box { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }

const TAU = 2 * Math.PI;

export function contourBounds(contours: readonly Contour[]): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (p: Vec2) => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  };
  for (const c of contours) {
    let from = c.start;
    add(from);
    for (const s of c.segs) {
      if (s.kind === 'A') {
        const a0 = Math.atan2(from.y - s.centre.y, from.x - s.centre.x);
        // Quarter angles k·π/2 strictly inside the swept range [a0, a0 + sweep].
        const lo = Math.min(a0, a0 + s.sweep), hi = Math.max(a0, a0 + s.sweep);
        for (let k = Math.ceil(lo / (Math.PI / 2)); k * (Math.PI / 2) <= hi; k++) {
          // Snap cos/sin of quarter angles exactly, so bounds of grid-aligned arcs are exact.
          const q = ((k % 4) + 4) % 4;
          const cx = q === 0 ? 1 : q === 2 ? -1 : 0, sy = q === 1 ? 1 : q === 3 ? -1 : 0;
          add({ x: s.centre.x + s.r * cx, y: s.centre.y + s.r * sy });
        }
        if (Math.abs(s.sweep) >= TAU - 1e-12) {
          add({ x: s.centre.x - s.r, y: s.centre.y }); add({ x: s.centre.x + s.r, y: s.centre.y });
          add({ x: s.centre.x, y: s.centre.y - s.r }); add({ x: s.centre.x, y: s.centre.y + s.r });
        }
      }
      add(s.to);
      from = s.to;
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** Clip the segment a→b to a box (Liang–Barsky). Null if it misses. */
export function clipSegment(a: Vec2, b: Vec2, box: Box): [Vec2, Vec2] | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const edges: [number, number][] = [[-dx, a.x - box.minX], [dx, box.maxX - a.x], [-dy, a.y - box.minY], [dy, box.maxY - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  if (t1 - t0 < 1e-12) return null;
  return [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
}
