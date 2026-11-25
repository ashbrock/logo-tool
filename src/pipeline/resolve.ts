/**
 * Document → plane shapes (ARCHITECTURE.md §5, "resolve" and "outline"): lattice points through the
 * grid to cells, radii from 1/240 cell to cells, each shape outlined by the corner or stroke geometry,
 * repeats resolved to plane transforms. Then evaluateDocument runs the boolean pipeline.
 */
import { sub, type Vec2 } from '../geometry/num';
import type { Contour, Seg } from '../geometry/contour';
import { outlineClosed, type CornerIssue } from '../geometry/corners';
import { outlineStroke, type StrokeIssue } from '../geometry/strokes';
import type { PlaneRepeat } from '../geometry/repeat';
import type { Lattice } from '../geometry/lattice';
import { toPlane } from '../grids';
import type { BooleanEngine } from '../boolean/paper-adapter';
import { LEN, type LogoDocument, type Shape, type Vertex } from '../model/types';
import { evaluateMark, type Mark, type PlaneShape } from './evaluate';

export type ShapeIssue =
  | { readonly shapeId: string; readonly kind: 'corner'; readonly issue: CornerIssue }
  | { readonly shapeId: string; readonly kind: 'stroke'; readonly issue: StrokeIssue }
  | { readonly shapeId: string; readonly kind: 'radius-not-applied'; readonly vertexId: string };

const TAU = 2 * Math.PI;

export function radiusCells(doc: LogoDocument, v: Vertex): number {
  const r = typeof v.radius === 'number' ? v.radius : doc.radii.find((x) => x.id === (v.radius as { ref: string }).ref)?.value ?? 0;
  return r / LEN;
}

function planeRepeat(doc: LogoDocument, s: Shape): PlaneRepeat {
  const P = (p: Lattice) => toPlane(p, doc.grid);
  const r = s.repeat;
  switch (r.kind) {
    case 'none': return r;
    case 'rotate': return { kind: 'rotate', centre: P(r.centre), count: r.count, mirrored: r.mirrored, ...(r.axis ? { axisPoint: P(r.axis) } : {}) };
    case 'mirror': return { kind: 'mirror', through: P(r.through), to: P(r.to) };
    case 'translate': return { kind: 'translate', step: sub(P(r.step), P({ u: 0, v: 0, ...(r.step.layer ? { layer: r.step.layer } : {}) })), count: r.count };
  }
}

/** A fill with arc segments: lines and arcs straight through the points (corners next to arcs come later). */
function fillWithArcs(doc: LogoDocument, s: Shape, pts: Vec2[]): Contour {
  const n = pts.length;
  const segs: Seg[] = s.path.segments.map((seg, i) => {
    const to = pts[(i + 1) % n]!;
    if (seg.kind === 'line') return { kind: 'L', to };
    const c = toPlane(seg.centre, doc.grid), from = pts[i]!;
    const sign = seg.sweep === 1 ? 1 : -1;
    const a0 = Math.atan2(from.y - c.y, from.x - c.x), a1 = Math.atan2(to.y - c.y, to.x - c.x);
    let mag = (((sign * (a1 - a0)) % TAU) + TAU) % TAU;
    if (mag < 1e-12) mag = TAU;
    return { kind: 'A', to, centre: c, r: Math.hypot(from.x - c.x, from.y - c.y), sweep: sign * mag };
  });
  return { start: pts[0]!, segs };
}

export function resolveShapes(doc: LogoDocument): { shapes: PlaneShape[]; issues: ShapeIssue[] } {
  const shapes: PlaneShape[] = [];
  const issues: ShapeIssue[] = [];
  for (const s of doc.shapes) {
    const vs = s.path.vertices;
    const pts = vs.map((v) => toPlane(v.at, doc.grid));
    let contours: Contour[] = [];
    if (s.paint.kind === 'fill') {
      const isCircle = vs.length === 1 && radiusCells(doc, vs[0]!) > 0;
      if (!s.path.closed && !isCircle) continue; // still being placed: draws nothing yet
      if (s.path.segments.some((g) => g.kind === 'arc')) {
        contours = [fillWithArcs(doc, s, pts)];
        for (const v of vs) if (radiusCells(doc, v) > 0) issues.push({ shapeId: s.id, kind: 'radius-not-applied', vertexId: v.id });
      } else {
        const res = outlineClosed(pts, vs.map((v) => ({ type: v.corner, r: radiusCells(doc, v) })));
        for (const issue of res.issues) issues.push({ shapeId: s.id, kind: 'corner', issue });
        if (res.contour) contours = [res.contour];
      }
    } else {
      if (vs.length < 2) continue;
      const res = outlineStroke({
        points: pts,
        segments: s.path.segments.map((g) => (g.kind === 'line' ? g : { kind: 'arc', centre: toPlane(g.centre, doc.grid), sweep: g.sweep })),
        closed: s.path.closed,
        radii: vs.map((v) => radiusCells(doc, v)),
        width: s.paint.width / LEN, cap: s.paint.cap, join: s.paint.join, endRadius: s.paint.endRadius / LEN,
      });
      for (const issue of res.issues) issues.push({ shapeId: s.id, kind: 'stroke', issue });
      contours = [...res.contours];
    }
    if (contours.length === 0) continue;
    shapes.push({ id: s.id, role: s.role, contours, repeat: planeRepeat(doc, s), jointRadius: s.jointRadius / LEN });
  }
  return { shapes, issues };
}

export function evaluateDocument(doc: LogoDocument, engine: BooleanEngine): { mark: Mark; issues: ShapeIssue[] } {
  const { shapes, issues } = resolveShapes(doc);
  return { mark: evaluateMark(shapes, engine), issues };
}
