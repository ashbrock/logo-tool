/**
 * Document shapes → finished mark (ARCHITECTURE.md §5): expand repeats, fold add / cut / intersect in
 * order through the boolean engine, recover exact lines and arcs, then split into pieces. Pure apart
 * from the injected engine. The canvas and the export both draw its output.
 */
import type { Contour } from '../geometry/contour';
import { expandRepeat, type PlaneRepeat } from '../geometry/repeat';
import type { BoolOp, BooleanEngine } from '../boolean/paper-adapter';
import { CRUMB, recoverContour, RecoveryError, type Circle, type Line } from '../boolean/recover';
import { segStarts } from '../geometry/contour';
import { sub } from '../geometry/num';
import { toPieces, type Piece } from './pieces';

export interface PlaneShape {
  readonly id: string;
  readonly role: BoolOp;
  /** The shape's outline (one contour for a fill, one or two for a stroke), in cells. */
  readonly contours: readonly Contour[];
  readonly repeat: PlaneRepeat;
}

export interface Mark {
  readonly pieces: readonly Piece[];
  readonly errors: readonly { readonly kind: 'recovery'; readonly message: string }[];
}

export function evaluateMark(shapes: readonly PlaneShape[], engine: BooleanEngine): Mark {
  const ops: { op: BoolOp; contours: Contour[] }[] = [];
  const circles: Circle[] = [];
  const lines: Line[] = [];
  for (const s of shapes) {
    // A shape and all its repeat copies enter the fold together, in the shape's place in the order.
    const instances = expandRepeat(s.contours, s.repeat).flat();
    ops.push({ op: s.role, contours: instances });
    for (const c of instances) {
      const starts = segStarts(c);
      c.segs.forEach((seg, i) => {
        if (seg.kind === 'A') circles.push({ centre: seg.centre, r: seg.r });
        else {
          const from = starts[i]!, d = sub(seg.to, from), l = Math.hypot(d.x, d.y);
          if (l > 1e-12) lines.push({ p: from, d: { x: d.x / l, y: d.y / l } });
        }
      });
    }
  }
  const cubic = engine.fold(ops);
  const contours: Contour[] = [];
  const errors: Mark['errors'][number][] = [];
  for (const cc of cubic) {
    // Drop slivers smaller than CRUMB across: Paper leaves them where a shape crosses itself.
    const xs = [cc.start.x, ...cc.curves.map((c) => c.to.x)], ys = [cc.start.y, ...cc.curves.map((c) => c.to.y)];
    if (Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < CRUMB) continue;
    try {
      contours.push(recoverContour(cc, circles, lines));
    } catch (e) {
      if (e instanceof RecoveryError) errors.push({ kind: 'recovery', message: `${e.message} at (${e.at.x.toFixed(3)}, ${e.at.y.toFixed(3)})` });
      else throw e;
    }
  }
  return { pieces: toPieces(contours), errors };
}
