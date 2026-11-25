/**
 * The only module that touches Paper.js (ARCHITECTURE.md §2, §5.1).
 *
 * Paper.js does the boolean operations: "unite … returns the result as a new path item", "subtract …"
 * and "intersect …", with `insert: false` so nothing enters a scene graph (src/path/PathItem.Boolean.js).
 * It works on cubic Béziers (its own arcTo approximates with cubics of at most 90°, src/path/Path.js,
 * addArc), so arcs are handed over as cubics and its output goes through arc recovery (recover.ts)
 * before anything is drawn or exported.
 *
 * The engine is created around a Paper namespace so the browser can pass the core build and Node tests
 * can pass `paper-jsdom`.
 */
import type { Contour } from '../geometry/contour';
import type { Vec2 } from '../geometry/num';

type PaperNS = typeof import('paper');

/** One cubic piece of a boolean result: from the previous point via c1, c2 to `to`. */
export interface Cubic {
  readonly c1: Vec2;
  readonly c2: Vec2;
  readonly to: Vec2;
}

export interface CubicContour {
  readonly start: Vec2;
  readonly curves: readonly Cubic[];
}

export type BoolOp = 'add' | 'cut' | 'intersect';

export interface BooleanEngine {
  /** Fold shapes in order: the mark starts empty; add = unite, cut = subtract, intersect = intersect. */
  fold(ops: readonly { op: BoolOp; contours: readonly Contour[] }[]): CubicContour[];
}

export function makePaperEngine(paper: PaperNS): BooleanEngine {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(1, 1));
  const opts = { insert: false };

  const toPaper = (contours: readonly Contour[]): paper.PathItem => {
    const children = contours.map((c) => {
      const p = new scope.Path({ insert: false });
      const S = (v: Vec2) => new scope.Point(v.x, v.y);
      p.moveTo(S(c.start));
      let cur = c.start;
      for (const s of c.segs) {
        if (s.kind === 'L') p.lineTo(S(s.to));
        else {
          // Arcs go in as our own cubics (≤ 90° each, control length 4/3·tan(θ/4)·r), not via
          // Paper's arcTo, which throws on tiny arcs whose points are nearly collinear. Recovery maps
          // them back to the exact source circle afterwards.
          const parts = Math.max(1, Math.ceil(Math.abs(s.sweep) / (Math.PI / 2) - 1e-9));
          const th = s.sweep / parts;
          const k = (4 / 3) * Math.tan(th / 4) * s.r;
          let a0 = Math.atan2(cur.y - s.centre.y, cur.x - s.centre.x);
          for (let i = 1; i <= parts; i++) {
            const a1 = a0 + th;
            const p0 = { x: s.centre.x + s.r * Math.cos(a0), y: s.centre.y + s.r * Math.sin(a0) };
            const p1 = i === parts ? s.to : { x: s.centre.x + s.r * Math.cos(a1), y: s.centre.y + s.r * Math.sin(a1) };
            // Tangent at angle a for positive rotation is (−sin a, cos a); k carries the direction's sign.
            const c1 = S({ x: p0.x - k * Math.sin(a0), y: p0.y + k * Math.cos(a0) });
            const c2 = S({ x: p1.x + k * Math.sin(a1), y: p1.y - k * Math.cos(a1) });
            p.cubicCurveTo(c1, c2, S(p1));
            a0 = a1;
          }
        }
        cur = s.to;
      }
      p.closePath();
      return p;
    });
    return new scope.CompoundPath({ children, fillRule: 'nonzero', insert: false });
  };

  const fromPaper = (item: paper.PathItem): CubicContour[] => {
    const paths: paper.Path[] = item instanceof scope.CompoundPath ? (item.children as paper.Path[]) : [item as paper.Path];
    const out: CubicContour[] = [];
    for (const path of paths) {
      const segs = path.segments;
      if (segs.length < 2) continue;
      const pt = (s: paper.Segment) => ({ x: s.point.x, y: s.point.y });
      const curves: Cubic[] = [];
      for (let i = 0; i < segs.length; i++) {
        const a = segs[i] as paper.Segment, b = segs[(i + 1) % segs.length] as paper.Segment;
        curves.push({
          c1: { x: a.point.x + a.handleOut.x, y: a.point.y + a.handleOut.y },
          c2: { x: b.point.x + b.handleIn.x, y: b.point.y + b.handleIn.y },
          to: pt(b),
        });
      }
      out.push({ start: pt(segs[0] as paper.Segment), curves });
    }
    return out;
  };

  return {
    fold(ops) {
      let result: paper.PathItem | null = null;
      for (const { op, contours } of ops) {
        if (contours.length === 0) continue;
        const item = toPaper(contours);
        if (op === 'add') {
          // Uniting with an empty path resolves a shape's own self-overlaps (stroke joins, loops).
          result = (result ?? new scope.Path({ insert: false })).unite(item, opts);
        } else if (result) {
          result = op === 'cut' ? result.subtract(item, opts) : result.intersect(item, opts);
        }
      }
      return result ? fromPaper(result) : [];
    },
  };
}
