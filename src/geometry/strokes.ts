/**
 * Stroke outlines (SPEC.md §6.3, §9.7; ARCHITECTURE.md §4.4).
 *
 * A stroke is a centre line of straight and arc segments with a width, a cap, a join and an end
 * radius. It is turned into filled contours exactly:
 * 1. Centre-line corners between two straight segments are rounded with a fillet of the point's
 *    radius (every corner type rounds the centre line; wraps and coves are for fills).
 * 2. Each centre-line piece is offset by ±w/2. A line offsets to a parallel line; an arc offsets to a
 *    concentric arc with radius R ± w/2, still an exact circular arc.
 * 3. Sharp centre-line corners get a join on the outer side (miter, falling back to bevel beyond the
 *    miter limit; round; or bevel). On the inner side two straight offsets are trimmed to where
 *    they cross; otherwise the side passes through the corner point and the overlap is resolved later
 *    by the boolean pass.
 * 4. Open strokes get caps (butt, square, round). The end radius softens the two corners of butt and
 *    square caps with small fillets.
 *
 * Output arcs always have r > 0 and distinct endpoints (see corners.ts on SVG's silent corrections).
 */
import { add, scale, sub, type Vec2 } from './num';
import { cross, dot, len, perp, unit, type Contour, type Seg } from './contour';

export type Cap = 'butt' | 'square' | 'round';
export type Join = 'miter' | 'round' | 'bevel';

export type CentreSegment = { readonly kind: 'line' } | { readonly kind: 'arc'; readonly centre: Vec2; readonly sweep: 0 | 1 };

export interface StrokeInput {
  readonly points: readonly Vec2[];
  /** segments[i] joins points[i] → points[i + 1] (wrapping to points[0] when closed). */
  readonly segments: readonly CentreSegment[];
  readonly closed: boolean;
  /** Centre-line corner radius per point, in cells (0 = sharp, joined with `join`). */
  readonly radii: readonly number[];
  readonly width: number;
  readonly cap: Cap;
  readonly join: Join;
  /** Radius softening the corners of butt and square caps, in cells. */
  readonly endRadius: number;
  /** SVG-style miter limit: miter length / width. Default 4, as SVG's default. */
  readonly miterLimit?: number;
}

export type StrokeIssue =
  | { readonly kind: 'degenerate'; readonly reason: 'too-few-points' | 'coincident-points' | 'bad-width' }
  | { readonly kind: 'arc-not-equidistant'; readonly segment: number }
  | { readonly kind: 'too-wide'; readonly segment: number; readonly maxWidth: number }
  | { readonly kind: 'clamped'; readonly index: number; readonly requested: number; readonly actual: number }
  | { readonly kind: 'end-radius-clamped'; readonly requested: number; readonly actual: number }
  | { readonly kind: 'end-radius-on-arc' };

export interface StrokeResult {
  readonly contours: readonly Contour[];
  readonly issues: readonly StrokeIssue[];
}

/** A centre-line piece with explicit endpoints. Arcs carry a signed sweep (radians). */
type Prim =
  | { kind: 'L'; from: Vec2; to: Vec2 }
  | { kind: 'A'; from: Vec2; to: Vec2; centre: Vec2; r: number; sweep: number };

const TAU = 2 * Math.PI;
const signedTurn = (a: Vec2, b: Vec2): number => Math.atan2(cross(a, b), dot(a, b));
const angle = (v: Vec2): number => Math.atan2(v.y, v.x);
const close = (a: Vec2, b: Vec2, eps = 1e-9): boolean => len(sub(a, b)) < eps;

function tangents(p: Prim): { start: Vec2; end: Vec2 } {
  if (p.kind === 'L') { const d = unit(sub(p.to, p.from)); return { start: d, end: d }; }
  const s = Math.sign(p.sweep);
  const t = (q: Vec2) => scale(perp(unit(sub(q, p.centre))), s);
  return { start: t(p.from), end: t(p.to) };
}

/** Rotate `p` about `c` by `rad` (positive rotation). */
function rot(p: Vec2, c: Vec2, rad: number): Vec2 {
  const s = Math.sin(rad), k = Math.cos(rad), d = sub(p, c);
  return { x: c.x + d.x * k - d.y * s, y: c.y + d.x * s + d.y * k };
}

/** A fillet of radius e at corner C between incoming direction din and outgoing dout. */
function fillet(C: Vec2, din: Vec2, dout: Vec2, e: number): { start: Vec2; end: Vec2; arc: Seg } | null {
  const turn = signedTurn(din, dout);
  if (Math.abs(turn) < 1e-12 || Math.abs(turn) > Math.PI - 1e-9 || !(e > 1e-12)) return null;
  const t = e * Math.tan(Math.abs(turn) / 2);
  const start = sub(C, scale(din, t)), end = add(C, scale(dout, t));
  const centre = add(start, scale(perp(din), Math.sign(turn) * e));
  return { start, end, arc: { kind: 'A', to: end, centre, r: e, sweep: turn } };
}

/** A path under construction: a start point and segments; consecutive points are kept continuous. */
class PathBuilder {
  segs: Seg[] = [];
  constructor(public start: Vec2, private cur: Vec2 = start) {}
  get at(): Vec2 { return this.cur; }
  line(to: Vec2): void { if (!close(to, this.cur)) { this.segs.push({ kind: 'L', to }); this.cur = to; } }
  arc(to: Vec2, centre: Vec2, r: number, sweep: number): void {
    if (close(to, this.cur) || !(r > 1e-12) || Math.abs(sweep) < 1e-12) { this.line(to); return; }
    this.segs.push({ kind: 'A', to, centre, r, sweep });
    this.cur = to;
  }
  seg(s: Seg): void { if (s.kind === 'L') this.line(s.to); else this.arc(s.to, s.centre, s.r, s.sweep); }
}

export function outlineStroke(input: StrokeInput): StrokeResult {
  const { points: P, segments, closed, width } = input;
  const h = width / 2;
  const issues: StrokeIssue[] = [];
  const fail = (i: StrokeIssue): StrokeResult => ({ contours: [], issues: [i] });
  const n = P.length;
  if (!(width > 0)) return fail({ kind: 'degenerate', reason: 'bad-width' });
  if (n < 2) return fail({ kind: 'degenerate', reason: 'too-few-points' });
  const segCount = closed ? n : n - 1;
  for (let k = 0; k < segCount; k++) {
    if (close(P[k] as Vec2, P[(k + 1) % n] as Vec2, 1e-12)) return fail({ kind: 'degenerate', reason: 'coincident-points' });
  }

  // --- 1. Centre line: segments, with fillets at line–line corners -------------------------------
  const pt = (i: number): Vec2 => P[((i % n) + n) % n] as Vec2;
  const seg = (k: number): CentreSegment => segments[((k % segCount) + segCount) % segCount] as CentreSegment;
  const dirOf = (k: number): Vec2 => unit(sub(pt(k + 1), pt(k))); // lines only

  // Arc segments: validate equidistance and compute their signed sweep.
  const arcInfo: ({ r: number; sweep: number } | null)[] = [];
  for (let k = 0; k < segCount; k++) {
    const s = seg(k);
    if (s.kind !== 'arc') { arcInfo.push(null); continue; }
    const ra = len(sub(pt(k), s.centre)), rb = len(sub(pt(k + 1), s.centre));
    if (Math.abs(ra - rb) > 1e-9 * Math.max(1, ra) || ra < 1e-12) return fail({ kind: 'arc-not-equidistant', segment: k });
    const sign = s.sweep === 1 ? 1 : -1;
    const mag = (((sign * (angle(sub(pt(k + 1), s.centre)) - angle(sub(pt(k), s.centre)))) % TAU) + TAU) % TAU;
    arcInfo.push({ r: ra, sweep: sign * (mag < 1e-12 ? TAU : mag) });
  }

  // Which points get a centre-line fillet: interior points (all points when closed) between two lines.
  const isInterior = (i: number) => closed || (i > 0 && i < n - 1);
  const want: number[] = P.map((_, i) => {
    const r = input.radii[i] ?? 0;
    if (!(r > 0) || !isInterior(i) || seg(i - 1).kind !== 'line' || seg(i).kind !== 'line') return 0;
    const turn = Math.abs(signedTurn(dirOf(i - 1), dirOf(i)));
    if (turn < 1e-12) return 0;
    return r * Math.tan(Math.min(turn, Math.PI - 1e-9) / 2);
  });
  const tAt: number[] = want.slice();
  for (let k = 0; k < segCount; k++) {
    if (seg(k).kind !== 'line') continue;
    const a = want[k] as number, b = want[(k + 1) % n] as number, l = len(sub(pt(k + 1), pt(k)));
    if (a + b > l) {
      const f = l / (a + b);
      tAt[k] = Math.min(tAt[k] as number, a * f);
      tAt[(k + 1) % n] = Math.min(tAt[(k + 1) % n] as number, b * f);
    }
  }
  const prims: Prim[] = [];
  const pushFillet = (i: number) => {
    if (!(want[i]! > 0)) return;
    const din = dirOf(i - 1), dout = dirOf(i);
    const turn = Math.abs(signedTurn(din, dout));
    const rReq = input.radii[i] as number;
    const rAct = (tAt[i] as number) / Math.tan(Math.min(turn, Math.PI - 1e-9) / 2);
    const f = fillet(pt(i), din, dout, rAct);
    if (!f || rAct < rReq - 1e-9) issues.push({ kind: 'clamped', index: i, requested: rReq, actual: f ? rAct : 0 });
    if (f && f.arc.kind === 'A') prims.push({ kind: 'A', from: f.start, to: f.end, centre: f.arc.centre, r: f.arc.r, sweep: f.arc.sweep });
  };
  for (let k = 0; k < segCount; k++) {
    const s = seg(k);
    if (s.kind === 'line') {
      const d = dirOf(k);
      const from = add(pt(k), scale(d, want[k]! > 0 ? (tAt[k] as number) : 0));
      const to = sub(pt(k + 1), scale(d, want[(k + 1) % n]! > 0 ? (tAt[(k + 1) % n] as number) : 0));
      if (!close(from, to)) prims.push({ kind: 'L', from, to });
    } else {
      const a = arcInfo[k] as { r: number; sweep: number };
      prims.push({ kind: 'A', from: pt(k), to: pt(k + 1), centre: s.centre, r: a.r, sweep: a.sweep });
    }
    if (closed || k < segCount - 1) pushFillet((k + 1) % n);
  }
  if (prims.length === 0) return fail({ kind: 'degenerate', reason: 'coincident-points' });

  // --- 2. Offsets --------------------------------------------------------------------------------
  // Side s = +1 is the left of travel (perp of the tangent), s = −1 the right.
  for (let k = 0; k < segCount; k++) {
    const a = arcInfo[k];
    if (a && a.r - h <= 1e-12) return fail({ kind: 'too-wide', segment: k, maxWidth: 2 * a.r });
  }
  for (const p of prims) {
    if (p.kind === 'A' && p.r - h <= 1e-12) {
      // A clamped centre-line fillet tighter than half the width (SPEC.md §9.7).
      return fail({ kind: 'too-wide', segment: -1, maxWidth: 2 * p.r });
    }
  }
  type Off = { from: Vec2; to: Vec2; seg: Prim };
  const offset = (p: Prim, s: 1 | -1): Off => {
    if (p.kind === 'L') {
      const nrm = scale(perp(unit(sub(p.to, p.from))), s * h);
      return { from: add(p.from, nrm), to: add(p.to, nrm), seg: { kind: 'L', from: add(p.from, nrm), to: add(p.to, nrm) } };
    }
    const sigma = Math.sign(p.sweep);
    const r = p.r - s * sigma * h; // left of a positive arc is towards its centre
    const at = (q: Vec2) => add(p.centre, scale(unit(sub(q, p.centre)), r));
    const from = at(p.from), to = at(p.to);
    return { from, to, seg: { kind: 'A', from, to, centre: p.centre, r, sweep: p.sweep } };
  };

  const miterLimit = input.miterLimit ?? 4;
  const m = prims.length;
  const junctions = closed ? m : m - 1;

  /** One side of the stroke as a path from its first offset point to its last. */
  const side = (s: 1 | -1): PathBuilder => {
    const offs = prims.map((p) => offset(p, s));
    // Inner-side trims: two straight offsets that cross are cut at the crossing.
    const trimmed: boolean[] = new Array(m).fill(false);
    for (let j = 0; j < junctions; j++) {
      const a = prims[j] as Prim, b = prims[(j + 1) % m] as Prim;
      const ta = tangents(a).end, tb = tangents(b).start;
      const turn = signedTurn(ta, tb);
      if (Math.abs(turn) < 1e-9 || s * turn < 0) continue; // continuous, or this is the outer side
      const oa = offs[j] as Off, ob = offs[(j + 1) % m] as Off;
      if (a.kind !== 'L' || b.kind !== 'L') continue;
      const den = cross(ta, tb);
      if (Math.abs(den) < 1e-12) continue;
      const lam = cross(sub(ob.from, oa.from), tb) / den;
      const X = add(oa.from, scale(ta, lam));
      const la = len(sub(oa.to, oa.from)), lb = len(sub(ob.to, ob.from));
      const mu = dot(sub(X, ob.from), tb);
      if (lam >= -1e-9 && lam <= la + 1e-9 && mu >= -1e-9 && mu <= lb + 1e-9) {
        oa.to = X; ob.from = X; trimmed[j] = true;
      }
    }
    const b = new PathBuilder((offs[0] as Off).from);
    for (let k = 0; k < m; k++) {
      const o = offs[k] as Off;
      b.line(o.from); // only adds something when the previous junction passed through the corner point
      if (o.seg.kind === 'L') b.line(o.to);
      else b.arc(o.to, o.seg.centre, o.seg.r, o.seg.sweep);
      if (!closed && k === m - 1) continue; // an open stroke has no junction after its last piece
      const j = k;
      const pa = prims[j] as Prim, pb = prims[(j + 1) % m] as Prim;
      const ta = tangents(pa).end, tb = tangents(pb).start;
      const turn = signedTurn(ta, tb);
      const next = (offs[(j + 1) % m] as Off).from;
      if (Math.abs(turn) < 1e-9 || trimmed[j]) continue; // continuous, or already meeting at the trim point
      const J = pa.to;
      if (s * turn > 0) { b.line(J); b.line(next); continue; } // inner side, not trimmable: through the corner
      // Outer side: the join.
      if (input.join === 'round') { b.arc(next, J, h, turn); continue; }
      if (input.join === 'miter') {
        const interior = Math.PI - Math.abs(turn);
        const ratio = 1 / Math.sin(interior / 2); // SVG: miter length / stroke width
        const den = cross(ta, tb);
        if (ratio <= miterLimit && Math.abs(den) > 1e-12) {
          const lam = cross(sub(next, b.at), tb) / den;
          b.line(add(b.at, scale(ta, lam)));
        }
      }
      b.line(next); // bevel, or the final leg of a miter
    }
    return b;
  };

  const left = side(1), right = side(-1);

  // Reverse a side path: same points, opposite direction.
  const reversed = (pb: PathBuilder): PathBuilder => {
    const pts = [pb.start, ...pb.segs.map((s) => s.to)];
    const out = new PathBuilder(pts[pts.length - 1] as Vec2);
    for (let i = pb.segs.length - 1; i >= 0; i--) {
      const s = pb.segs[i] as Seg, to = pts[i] as Vec2;
      if (s.kind === 'L') out.line(to); else out.arc(to, s.centre, s.r, -s.sweep);
    }
    return out;
  };

  if (closed) {
    const toContour = (pb: PathBuilder): Contour => {
      pb.line(pb.start);
      const segs = pb.segs.slice();
      const last = segs[segs.length - 1];
      if (last) segs[segs.length - 1] = { ...last, to: pb.start };
      return { start: pb.start, segs };
    };
    return { contours: [toContour(left), toContour(reversed(right))], issues };
  }

  // --- 4. Caps -----------------------------------------------------------------------------------
  const first = prims[0] as Prim, last = prims[m - 1] as Prim;
  const t0 = tangents(first).start, t1 = tangents(last).end;
  let e = Math.max(0, input.endRadius);
  if (e > 0 && input.cap !== 'round') {
    if (first.kind !== 'L' || last.kind !== 'L') { issues.push({ kind: 'end-radius-on-arc' }); e = 0; }
    else {
      const room = input.cap === 'square' ? h : Math.min(h, len(sub(first.to, first.from)) / 2, len(sub(last.to, last.from)) / 2);
      if (e > room + 1e-12) { issues.push({ kind: 'end-radius-clamped', requested: e, actual: room }); e = room; }
    }
  } else e = 0;

  const out = new PathBuilder(left.start);
  // Left side forward. With a butt cap and an end radius, its last line stops e short of the end.
  const leftSegs = left.segs.slice();
  /** Shorten the last (straight) segment of a side by `by`, for an end-cap fillet. */
  const shorten = (segs: Seg[], from: Vec2, by: number): { segs: Seg[] } => {
    if (by <= 0) return { segs };
    const lastSeg = segs[segs.length - 1] as Seg;
    const prev = segs.length > 1 ? (segs[segs.length - 2] as Seg).to : from;
    const d = unit(sub(lastSeg.to, prev));
    return { segs: [...segs.slice(0, -1), { kind: 'L', to: sub(lastSeg.to, scale(d, by)) }] };
  };

  const capAt = (pb: PathBuilder, E: Vec2, t: Vec2, fromPt: Vec2, toPt: Vec2) => {
    // Cap from the side ending at fromPt to the side starting at toPt, around endpoint E with outward tangent t.
    if (input.cap === 'round') { pb.arc(toPt, E, h, -Math.PI * Math.sign(cross(t, sub(fromPt, E))) ); return; }
    const across = unit(sub(toPt, fromPt));
    const ext = input.cap === 'square' ? h : 0;
    const c1 = add(fromPt, scale(t, ext)), c2 = add(toPt, scale(t, ext));
    if (e > 0) {
      const f1 = fillet(c1, t, across, e), f2 = fillet(c2, across, scale(t, -1), e);
      if (f1) { pb.line(f1.start); pb.seg(f1.arc); } else pb.line(c1);
      if (f2) { pb.line(f2.start); pb.seg(f2.arc); } else pb.line(c2);
      pb.line(toPt);
      return;
    }
    pb.line(c1); pb.line(c2); pb.line(toPt);
  };

  const butt = input.cap === 'butt' && e > 0;
  const L = shorten(leftSegs, left.start, butt ? e : 0);
  const R = reversed(right);
  for (const s of L.segs) out.seg(s);
  const leftEnd = (left.segs[left.segs.length - 1] as Seg | undefined)?.to ?? left.start;
  const E1 = last.to, E0 = first.from;
  if (butt) {
    // Butt cap with softened corners: the fillets sit on the cap's own corners.
    const across = unit(sub(R.start, leftEnd));
    const f1 = fillet(leftEnd, t1, across, e), f2 = fillet(R.start, across, scale(t1, -1), e);
    if (f1) { out.line(f1.start); out.seg(f1.arc); }
    if (f2) { out.line(f2.start); out.seg(f2.arc); }
    // Then the right side, minus its first e (shortened via the fillet end point).
    const rsegs = R.segs;
    for (let i = 0; i < rsegs.length; i++) {
      const s = rsegs[i] as Seg;
      if (i === rsegs.length - 1) {
        // Stop e short of the start cap.
        const prev = i > 0 ? (rsegs[i - 1] as Seg).to : R.start;
        const d = unit(sub(s.to, prev));
        out.line(sub(s.to, scale(d, e)));
      } else out.seg(s);
    }
    const rightEnd = (rsegs[rsegs.length - 1] as Seg | undefined)?.to ?? R.start;
    const across0 = unit(sub(left.start, rightEnd));
    const g1 = fillet(rightEnd, scale(t0, -1), across0, e), g2 = fillet(left.start, across0, t0, e);
    if (g1) { out.line(g1.start); out.seg(g1.arc); }
    if (g2) { out.line(g2.start); out.seg(g2.arc); }
    // Close back onto the (shortened) start of the left side.
    const startPt = g2 ? g2.end : left.start;
    out.line(startPt);
    const segs = out.segs.slice();
    const lastSeg = segs[segs.length - 1];
    if (lastSeg) segs[segs.length - 1] = { ...lastSeg, to: startPt };
    // The contour starts where the start-cap fillet ends, a point on the left side's first line, so its
    // first segment still runs to the same point along that line.
    return { contours: [{ start: startPt, segs }], issues };
  }
  capAt(out, E1, t1, leftEnd, R.start);
  for (const s of R.segs) out.seg(s);
  const rightEnd = (R.segs[R.segs.length - 1] as Seg | undefined)?.to ?? R.start;
  capAt(out, E0, scale(t0, -1), rightEnd, left.start);
  const segs = out.segs.slice();
  const lastSeg = segs[segs.length - 1];
  if (lastSeg) segs[segs.length - 1] = { ...lastSeg, to: left.start };
  return { contours: [{ start: left.start, segs }], issues };
}
