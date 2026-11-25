/**
 * Joint radius (SPEC.md §6.7 step 5, ARCHITECTURE.md §5): fillet the corners that merge / cut /
 * intersect create, where two edges from different shape instances meet.
 *
 * One construction covers line–line, line–arc and arc–arc: offset both edges by the fillet radius ρ
 * towards the side the outline turns (lines move parallel, circles change radius around the same
 * centre); where the offsets cross is the fillet centre F, and the tangent points are F projected back
 * onto each edge. A fillet that does not fit its edges (each edge shares its length with a joint at its
 * other end) is shrunk by bisection to the largest radius that fits, and reported.
 */
import { cross, dot, len, perp, segStarts, segTangents, unit, type Contour, type Seg } from '../geometry/contour';
import { add, scale, sub, type Vec2 } from '../geometry/num';
import { crossing, type Carrier } from '../boolean/recover';

export interface JointIssue {
  readonly kind: 'joint-clamped';
  readonly at: Vec2;
  readonly requested: number;
  readonly actual: number;
}

export interface JointResult {
  readonly contour: Contour;
  readonly issues: readonly JointIssue[];
  /** Each fillet's ends, for tests and drawing its circle. */
  readonly fillets: readonly { readonly start: Vec2; readonly end: Vec2; readonly centre: Vec2; readonly r: number }[];
}

const TAU = 2 * Math.PI;
const signedAngle = (a: Vec2, b: Vec2) => Math.atan2(cross(a, b), dot(a, b));
const ang = (p: Vec2, c: Vec2) => Math.atan2(p.y - c.y, p.x - c.x);

/** Offset a carrier by ρ in direction n (as seen at point v). */
function offsetCarrier(c: Carrier, n: Vec2, v: Vec2, rho: number): Carrier | null {
  if (c.kind === 'line') return { kind: 'line', line: { p: add(c.line.p, scale(n, rho)), d: c.line.d } };
  const away = Math.sign(dot(n, sub(v, c.circle.centre))) || 1;
  const r = c.circle.r + away * rho;
  return r > 1e-12 ? { kind: 'circle', circle: { centre: c.circle.centre, r } } : null;
}

function project(c: Carrier, f: Vec2): Vec2 {
  if (c.kind === 'line') return add(c.line.p, scale(c.line.d, dot(sub(f, c.line.p), c.line.d)));
  const d = sub(f, c.circle.centre), l = len(d);
  return add(c.circle.centre, scale(d, c.circle.r / l));
}

/** How far `t` is from the corner `v`, measured back along a segment (length for lines, angle for arcs), or −1 if not on it. */
function distBack(seg: Seg, segStart: Vec2, v: Vec2, t: Vec2, atEnd: boolean): number {
  if (seg.kind === 'L') {
    const d = unit(sub(seg.to, segStart));
    const along = dot(sub(t, v), atEnd ? scale(d, -1) : d);
    return along >= -1e-9 ? Math.max(0, along) : -1;
  }
  const s = Math.sign(seg.sweep);
  // Angle travelled from t to v (if v is the end) or from v to t (if v is the start), in the arc's direction.
  const raw = atEnd ? ang(v, seg.centre) - ang(t, seg.centre) : ang(t, seg.centre) - ang(v, seg.centre);
  let a = (((s * raw) % TAU) + TAU) % TAU;
  if (a > TAU - 1e-9) a = 0;
  return a <= Math.abs(seg.sweep) + 1e-9 ? a : -1;
}

const segMeasure = (seg: Seg, start: Vec2) => (seg.kind === 'L' ? len(sub(seg.to, start)) : Math.abs(seg.sweep));

export function applyJoints(
  contour: Contour,
  carriers: readonly (Carrier | null)[],
  radiusOf: (a: Carrier, b: Carrier) => number,
): JointResult {
  const segs = contour.segs, n = segs.length;
  if (n < 2) return { contour, issues: [], fillets: [] };
  const starts = segStarts(contour);
  const at = (k: number) => ((k % n) + n) % n;

  // Which corners are joints, with their requested radius and turn.
  const want = starts.map((v, k) => {
    const a = carriers[at(k - 1)], b = carriers[k];
    if (!a || !b) return null;
    const r = radiusOf(a, b);
    if (!(r > 0)) return null;
    const tin = segTangents(starts[at(k - 1)]!, segs[at(k - 1)]!).end;
    const tout = segTangents(v, segs[k]!).start;
    const turn = signedAngle(tin, tout);
    if (Math.abs(turn) < 1e-9 || Math.abs(turn) > Math.PI - 1e-9) return null;
    return { r, a, b, tin, tout, turn };
  });

  // Each segment's length (or angle) is shared between joints at its two ends.
  const avail = (k: number, atEnd: boolean) => {
    const seg = segs[k]!, m = segMeasure(seg, starts[k]!);
    const other = atEnd ? want[k] : want[at(k + 1)];
    return other ? m / 2 : m;
  };

  type Fillet = { ta: Vec2; tb: Vec2; centre: Vec2; r: number; sweep: number };
  const tryFillet = (k: number, rho: number): Fillet | null => {
    const w = want[k]!, v = starts[k]!, side = Math.sign(w.turn);
    const na = scale(perp(w.tin), side), nb = scale(perp(w.tout), side);
    const oa = offsetCarrier(w.a, na, v, rho), ob = offsetCarrier(w.b, nb, v, rho);
    if (!oa || !ob) return null;
    const f = crossing(oa, ob, add(v, scale(unit(add(na, nb)), rho)));
    if (!f) return null;
    // crossing() returns the nearest touching point when the offsets don't really cross; a true
    // fillet centre is exactly ρ from both edges, so anything else is rejected.
    const gap = (c: Carrier) => (c.kind === 'line' ? Math.abs(cross(sub(f, c.line.p), c.line.d)) : Math.abs(len(sub(f, c.circle.centre)) - c.circle.r));
    const tol = 1e-10 * Math.max(1, rho); // an order tighter than the 1e-9 the output promises
    if (Math.abs(gap(w.a) - rho) > tol || Math.abs(gap(w.b) - rho) > tol) return null;
    const ta = project(w.a, f), tb = project(w.b, f);
    const da = distBack(segs[at(k - 1)]!, starts[at(k - 1)]!, v, ta, true);
    const db = distBack(segs[k]!, v, v, tb, false);
    if (da < 0 || db < 0 || da > avail(at(k - 1), true) + 1e-12 || db > avail(k, false) + 1e-12) return null;
    const sweep = signedAngle(sub(ta, f), sub(tb, f));
    if (Math.sign(sweep) !== side || len(sub(tb, ta)) < 1e-9) return null;
    return { ta, tb, centre: f, r: rho, sweep };
  };

  const issues: JointIssue[] = [];
  const fillet: (Fillet | null)[] = want.map((w, k) => {
    if (!w) return null;
    let f = tryFillet(k, w.r);
    if (!f) {
      let lo = 0, hi = w.r, best: Fillet | null = null;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2, t = tryFillet(k, mid);
        if (t) { best = t; lo = mid; } else hi = mid;
      }
      f = best && best.r > 1e-9 ? best : null;
      issues.push({ kind: 'joint-clamped', at: starts[k]!, requested: w.r, actual: f ? f.r : 0 });
    }
    return f;
  });
  if (fillet.every((f) => !f)) return { contour, issues, fillets: [] };

  // Rebuild: every segment trimmed to its fillets, with each fillet arc after the segment it ends.
  const out: Seg[] = [];
  const start = fillet[0] ? fillet[0].tb : starts[0]!;
  for (let k = 0; k < n; k++) {
    const seg = segs[k]!;
    const from = fillet[k] ? fillet[k]!.tb : starts[k]!;
    const nextF = fillet[at(k + 1)];
    const to = nextF ? nextF.ta : seg.to;
    if (seg.kind === 'L') { if (len(sub(to, from)) > 1e-12) out.push({ kind: 'L', to }); }
    else {
      const s = Math.sign(seg.sweep);
      let mag = (((s * (ang(to, seg.centre) - ang(from, seg.centre))) % TAU) + TAU) % TAU;
      if (mag > Math.abs(seg.sweep) + 1e-9) mag = 0;
      if (mag > 1e-12) out.push({ kind: 'A', to, centre: seg.centre, r: seg.r, sweep: s * mag });
    }
    if (nextF) out.push({ kind: 'A', to: nextF.tb, centre: nextF.centre, r: nextF.r, sweep: nextF.sweep });
  }
  const last = out[out.length - 1];
  if (last) out[out.length - 1] = { ...last, to: start };
  return {
    contour: { start, segs: out },
    issues,
    fillets: fillet.filter((f): f is Fillet => !!f).map((f) => ({ start: f.ta, end: f.tb, centre: f.centre, r: f.r })),
  };
}
