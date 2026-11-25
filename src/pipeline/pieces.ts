/**
 * Split a boolean result into pieces (ARCHITECTURE.md §5.3): each piece is an outer contour plus the
 * holes directly inside it, exported as one <path>. Outers turn positively and holes negatively, so the
 * default nonzero fill rule draws them correctly. Contours that touch themselves at a single point
 * (a cut whose tip meets an edge) are split there, so no piece has a zero-width connection.
 */
import { containsPoint, contourArea, flatten, len, reverseContour, segStarts, type Contour, type Seg } from '../geometry/contour';
import { sub, type Vec2 } from '../geometry/num';

export interface Piece {
  readonly outer: Contour;
  readonly holes: readonly Contour[];
}

const same = (a: Vec2, b: Vec2) => len(sub(a, b)) < 1e-9;

/** Split a contour wherever it passes through the same point twice. */
export function splitAtTouchPoints(c: Contour): Contour[] {
  const starts = segStarts(c);
  const n = c.segs.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!same(starts[i] as Vec2, starts[j] as Vec2)) continue;
      // Loop A: segments i … j−1 (from point i back to it). Loop B: segments j … n−1, 0 … i−1.
      const a: Seg[] = c.segs.slice(i, j) as Seg[];
      const b: Seg[] = [...c.segs.slice(j), ...c.segs.slice(0, i)] as Seg[];
      const fix = (segs: Seg[], at: Vec2): Contour => {
        const out = segs.slice();
        const last = out[out.length - 1];
        if (last) out[out.length - 1] = { ...last, to: at };
        return { start: at, segs: out };
      };
      const loops = [fix(a, starts[i] as Vec2), fix(b, starts[j] as Vec2)].filter((l) => l.segs.length >= 2 || l.segs.some((s) => s.kind === 'A'));
      return loops.flatMap(splitAtTouchPoints);
    }
  }
  return [c];
}

function bbox(c: Contour) {
  const pts = flatten(c, 8);
  return { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)) };
}

/** A point on the contour that is not shared with other contours: the middle of its longest-sampled stretch. */
function probe(c: Contour): Vec2 {
  const pts = flatten(c, 24);
  let best = pts[0] as Vec2, bestL = -1;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as Vec2, b = pts[i + 1] as Vec2, l = len(sub(b, a));
    if (l > bestL) { bestL = l; best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  }
  return best;
}

export function toPieces(contours: readonly Contour[]): Piece[] {
  const all = contours.flatMap(splitAtTouchPoints).filter((c) => Math.abs(contourArea(c)) > 1e-12);
  const probes = all.map(probe);
  // Containment depth: how many other contours contain this one.
  const depth = all.map((_, i) => all.reduce((d, other, j) => (i !== j && containsPoint(other, probes[i] as Vec2) ? d + 1 : d), 0));
  const outers = all.map((_, i) => i).filter((i) => (depth[i] as number) % 2 === 0);
  const pieces = outers.map((i) => {
    let outer = all[i] as Contour;
    if (contourArea(outer) < 0) outer = reverseContour(outer);
    const holes = all
      .map((c, k) => ({ c, k }))
      .filter(({ c, k }) => (depth[k] as number) === (depth[i] as number) + 1 && containsPoint(all[i] as Contour, probes[k] as Vec2) && c !== all[i])
      .map(({ c }) => (contourArea(c) > 0 ? reverseContour(c) : c));
    return { outer, holes };
  });
  // Deterministic order: top to bottom, then left to right.
  return pieces.sort((a, b) => {
    const A = bbox(a.outer), B = bbox(b.outer);
    return Math.abs(A.minY - B.minY) > 1e-9 ? A.minY - B.minY : A.minX - B.minX;
  });
}
