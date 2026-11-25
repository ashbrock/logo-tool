/**
 * Document shapes → finished mark (ARCHITECTURE.md §5): expand repeats, fold add / cut / intersect in
 * order through the boolean engine, recover exact lines and arcs, fillet the corners the operations
 * created (joint radius), then split into pieces. Pure apart from the injected engine. The canvas and
 * the export both draw its output.
 */
import { segStarts, type Contour } from '../geometry/contour';
import { sub } from '../geometry/num';
import { expandRepeat, type PlaneRepeat } from '../geometry/repeat';
import type { BoolOp, BooleanEngine } from '../boolean/paper-adapter';
import { CRUMB, recoverContourTagged, RecoveryError, type Carrier, type Circle, type Line } from '../boolean/recover';
import { applyJoints, type JointIssue } from './joints';
import { toPieces, type Piece } from './pieces';

export interface PlaneShape {
  readonly id: string;
  readonly role: BoolOp;
  /** The shape's outline (one contour for a fill, one or two for a stroke), in cells. */
  readonly contours: readonly Contour[];
  readonly repeat: PlaneRepeat;
  /** Radius (cells) for corners created where this shape meets the result so far. Default 0. */
  readonly jointRadius?: number;
}

export interface Mark {
  readonly pieces: readonly Piece[];
  readonly errors: readonly { readonly kind: 'recovery'; readonly message: string }[];
  readonly issues: readonly (JointIssue & { readonly shapeId: string })[];
}

/** Instance tag: shape index × TAG + instance index. */
const TAG = 1 << 16;

export function evaluateMark(shapes: readonly PlaneShape[], engine: BooleanEngine): Mark {
  const ops: { op: BoolOp; contours: Contour[] }[] = [];
  const circles: Circle[] = [];
  const lines: Line[] = [];
  const addCircle = (c: Circle, tag: number) => {
    const same = circles.findIndex((k) => Math.abs(k.r - c.r) < 1e-9 && Math.hypot(k.centre.x - c.centre.x, k.centre.y - c.centre.y) < 1e-9);
    if (same >= 0) circles[same] = { ...circles[same]!, tags: [...(circles[same]!.tags ?? []), tag] };
    else circles.push({ ...c, tags: [tag] });
  };
  const addLine = (l: Line, tag: number) => {
    const same = lines.findIndex((k) => Math.abs(k.d.x * l.d.y - k.d.y * l.d.x) < 1e-9 && Math.abs((l.p.x - k.p.x) * k.d.y - (l.p.y - k.p.y) * k.d.x) < 1e-9);
    if (same >= 0) lines[same] = { ...lines[same]!, tags: [...(lines[same]!.tags ?? []), tag] };
    else lines.push({ ...l, tags: [tag] });
  };

  shapes.forEach((s, si) => {
    // A shape and all its repeat copies enter the fold together, in the shape's place in the order.
    const instances = expandRepeat(s.contours, s.repeat);
    ops.push({ op: s.role, contours: instances.flat() });
    instances.forEach((contours, ii) => {
      const tag = si * TAG + ii;
      for (const c of contours) {
        const starts = segStarts(c);
        c.segs.forEach((seg, i) => {
          if (seg.kind === 'A') addCircle({ centre: seg.centre, r: seg.r }, tag);
          else {
            const from = starts[i]!, d = sub(seg.to, from), l = Math.hypot(d.x, d.y);
            if (l > 1e-12) addLine({ p: from, d: { x: d.x / l, y: d.y / l } }, tag);
          }
        });
      }
    });
  });

  // A corner is a joint when its two edges share no shape instance; the later shape's radius applies.
  const anyJoints = shapes.some((s) => (s.jointRadius ?? 0) > 0);
  const tagsOf = (c: Carrier) => (c.kind === 'line' ? c.line.tags : c.circle.tags) ?? [];
  const radiusOf = (a: Carrier, b: Carrier): number => {
    const ta = tagsOf(a), tb = tagsOf(b);
    if (ta.length === 0 || tb.length === 0 || ta.some((t) => tb.includes(t))) return 0;
    const later = Math.max(...ta, ...tb);
    return shapes[Math.floor(later / TAG)]?.jointRadius ?? 0;
  };
  const shapeIdAt = (at: { x: number; y: number }, a: Carrier | null, b: Carrier | null) => {
    void at;
    const all = [...(a ? tagsOf(a) : []), ...(b ? tagsOf(b) : [])];
    return shapes[Math.floor(Math.max(...all) / TAG)]?.id ?? '';
  };

  const cubic = engine.fold(ops);
  const contours: Contour[] = [];
  const errors: Mark['errors'][number][] = [];
  const issues: Mark['issues'][number][] = [];
  for (const cc of cubic) {
    // Drop slivers smaller than CRUMB across: Paper leaves them where a shape crosses itself.
    const xs = [cc.start.x, ...cc.curves.map((c) => c.to.x)], ys = [cc.start.y, ...cc.curves.map((c) => c.to.y)];
    if (Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < CRUMB) continue;
    try {
      const { contour, carriers } = recoverContourTagged(cc, circles, lines);
      if (!anyJoints) { contours.push(contour); continue; }
      const j = applyJoints(contour, carriers, radiusOf);
      contours.push(j.contour);
      const starts = segStarts(contour);
      for (const i of j.issues) {
        const k = starts.findIndex((p) => Math.hypot(p.x - i.at.x, p.y - i.at.y) < 1e-12);
        const n = carriers.length;
        issues.push({ ...i, shapeId: k >= 0 ? shapeIdAt(i.at, carriers[(k - 1 + n) % n] ?? null, carriers[k] ?? null) : '' });
      }
    } catch (e) {
      if (e instanceof RecoveryError) errors.push({ kind: 'recovery', message: `${e.message} at (${e.at.x.toFixed(3)}, ${e.at.y.toFixed(3)})` });
      else throw e;
    }
  }
  return { pieces: toPieces(contours), errors, issues };
}
