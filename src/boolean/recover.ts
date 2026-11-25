/**
 * Arc recovery (ARCHITECTURE.md §5.2): turn the boolean result's cubics back into exact lines and
 * circular arcs, with exact corner points.
 *
 * Paper.js approximates circles with cubics (up to ~0.027% of r off the true circle) and computes
 * crossings between those approximations, so its corner points are slightly off the true geometry.
 * Recovery therefore works in three steps:
 *   1. Classify each cubic: a line (control points on the chord), matched to the source line it lies on;
 *      or an arc, matched to a source circle (tolerance below).
 *   2. Merge runs: collinear lines, and arcs on the same circle turning the same way.
 *   3. Recompute every corner as the exact crossing of its two neighbours' carriers (line–line,
 *      line–circle, circle–circle), taking the solution nearest Paper's approximate point.
 * Anything neither straight nor on a source circle is an error: the model cannot create it, so it is
 * never exported.
 */
import { cross, dot, len, unit, type Contour, type Seg } from '../geometry/contour';
import { add, scale, sub, type Vec2 } from '../geometry/num';
import type { Cubic, CubicContour } from './paper-adapter';

export interface Circle {
  readonly centre: Vec2;
  readonly r: number;
  /** Which shape instances this circle came from (for joint radii). */
  readonly tags?: readonly number[];
}

/** An infinite source line: a point on it and a unit direction. */
export interface Line {
  readonly p: Vec2;
  readonly d: Vec2;
  /** Which shape instances this line came from (for joint radii). */
  readonly tags?: readonly number[];
}

export class RecoveryError extends Error {
  constructor(message: string, readonly at: Vec2) {
    super(message);
  }
}

/**
 * Matching tolerance, for classification only (the output arc is rebuilt from the source circle and
 * corners are recomputed exactly): ends and ¼, ½, ¾ points within max(1e-5, 1e-3·r) of the circle;
 * the closest circle by end error wins. Paper's arc cubics sit ~2.7e-4·r off the true circle, so 1e-3·r
 * is about 4× that. Measured on 5,445 random shapes: 0 failures at this setting; tighter relative limits
 * (1e-4·r) failed ~3%. 1e-5 cells is 0.001 units at 100 units per cell, below export precision.
 * Contours smaller than CRUMB across are dropped as slivers; unmatched curves shorter than CRUMB are lines.
 */
export const CRUMB = 1e-5;
const endTol = (r: number) => Math.max(CRUMB, 1e-3 * r);
const midTol = (r: number) => Math.max(CRUMB, 1e-3 * r);
const TAU = 2 * Math.PI;

function bez(p0: Vec2, c: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return { x: a * p0.x + b * c.c1.x + d * c.c2.x + e * c.to.x, y: a * p0.y + b * c.c1.y + d * c.c2.y + e * c.to.y };
}

function isStraight(p0: Vec2, c: Cubic): boolean {
  const ch = sub(c.to, p0), L = len(ch);
  if (L < 1e-12) return len(sub(c.c1, p0)) < 1e-12 && len(sub(c.c2, p0)) < 1e-12;
  const d = unit(ch);
  const off = (q: Vec2) => Math.abs(cross(sub(q, p0), d));
  return off(c.c1) < 1e-9 * Math.max(1, L) && off(c.c2) < 1e-9 * Math.max(1, L);
}

function matchCircle(p0: Vec2, c: Cubic, circles: readonly Circle[]): Circle | null {
  let best: Circle | null = null, bestEnd = Infinity;
  for (const k of circles) {
    const off = (q: Vec2) => Math.abs(len(sub(q, k.centre)) - k.r);
    const end = Math.max(off(p0), off(c.to));
    if (end > endTol(k.r)) continue;
    const mid = Math.max(...[0.25, 0.5, 0.75].map((t) => off(bez(p0, c, t))));
    if (mid > midTol(k.r)) continue;
    if (end < bestEnd) { best = k; bestEnd = end; }
  }
  return best;
}

const distToLine = (q: Vec2, l: Line) => Math.abs(cross(sub(q, l.p), l.d));

function matchLine(a: Vec2, b: Vec2, lines: readonly Line[]): Line | null {
  let best: Line | null = null, bestDev = Infinity;
  const scaleOf = Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y));
  for (const l of lines) {
    if (Math.abs(cross(unit(sub(b, a)), l.d)) > 1e-9) continue;
    const dev = Math.max(distToLine(a, l), distToLine(b, l));
    if (dev <= 1e-9 * scaleOf && dev < bestDev) { best = l; bestDev = dev; }
  }
  return best;
}

export type Carrier = { kind: 'line'; line: Line } | { kind: 'circle'; circle: Circle };

/** Exact crossing of two carriers nearest the approximate point, or null if they don't cross. */
export function crossing(a: Carrier, b: Carrier, near: Vec2): Vec2 | null {
  const nearest = (cands: Vec2[]) => cands.reduce<Vec2 | null>((best, q) => (!best || len(sub(q, near)) < len(sub(best, near)) ? q : best), null);
  if (a.kind === 'line' && b.kind === 'line') {
    const den = cross(a.line.d, b.line.d);
    if (Math.abs(den) < 1e-12) return null; // parallel or the same line: keep the point
    const t = cross(sub(b.line.p, a.line.p), b.line.d) / den;
    return add(a.line.p, scale(a.line.d, t));
  }
  if (a.kind === 'circle' && b.kind === 'circle') {
    const c0 = a.circle, c1 = b.circle;
    const D = sub(c1.centre, c0.centre), d = len(D);
    if (d < 1e-12) return null; // concentric (or the same circle)
    const x = (d * d + c0.r * c0.r - c1.r * c1.r) / (2 * d);
    const h2 = c0.r * c0.r - x * x;
    const u = { x: D.x / d, y: D.y / d };
    const base = add(c0.centre, scale(u, x));
    const h = Math.sqrt(Math.max(0, h2)); // tangent circles: h ≈ 0
    const n = { x: -u.y, y: u.x };
    return nearest([add(base, scale(n, h)), sub(base, scale(n, h))]);
  }
  const line = (a.kind === 'line' ? a.line : (b as { line: Line }).line);
  const circ = (a.kind === 'circle' ? a.circle : (b as { circle: Circle }).circle);
  const t0 = dot(sub(circ.centre, line.p), line.d);
  const foot = add(line.p, scale(line.d, t0));
  const h2 = circ.r * circ.r - len(sub(foot, circ.centre)) ** 2;
  const h = Math.sqrt(Math.max(0, h2)); // a tangent line: h ≈ 0
  return nearest([add(foot, scale(line.d, h)), sub(foot, scale(line.d, h))]);
}

const sameCircle = (a: Circle, b: Circle) => Math.abs(a.r - b.r) < 1e-9 * Math.max(1, a.r) && len(sub(a.centre, b.centre)) < 1e-9 * Math.max(1, a.r);
const sameLine = (a: Line, b: Line) => Math.abs(cross(a.d, b.d)) < 1e-9 && distToLine(b.p, a) < 1e-9;

export function recoverContour(cc: CubicContour, circles: readonly Circle[], lines: readonly Line[] = []): Contour {
  return recoverContourTagged(cc, circles, lines).contour;
}

/** Recovery that also reports, for each output segment, the source line or circle it lies on. */
export function recoverContourTagged(
  cc: CubicContour, circles: readonly Circle[], lines: readonly Line[] = [],
): { contour: Contour; carriers: (Carrier | null)[] } {
  // 1. Classify.
  type Piece = { from: Vec2; to: Vec2; carrier: Carrier | null; sign: 1 | -1; approxSweep: number };
  const pieces: Piece[] = [];
  let p = cc.start;
  for (const c of cc.curves) {
    if (len(sub(c.to, p)) < 1e-12) { p = c.to; continue; }
    if (isStraight(p, c)) {
      const l = matchLine(p, c.to, lines);
      pieces.push({ from: p, to: c.to, carrier: l ? { kind: 'line', line: l } : null, sign: 1, approxSweep: 0 });
    } else {
      const k = matchCircle(p, c, circles);
      if (!k) {
        // A crumb shorter than CRUMB differs from its chord by less than that. Treat it as a line.
        if (len(sub(c.to, p)) < CRUMB) { pieces.push({ from: p, to: c.to, carrier: null, sign: 1, approxSweep: 0 }); p = c.to; continue; }
        throw new RecoveryError('curve is neither straight nor on a source circle', p);
      }
      const mid = bez(p, c, 0.5);
      const sign: 1 | -1 = cross(sub(p, k.centre), sub(mid, p)) >= 0 ? 1 : -1;
      const a0 = Math.atan2(p.y - k.centre.y, p.x - k.centre.x), a1 = Math.atan2(c.to.y - k.centre.y, c.to.x - k.centre.x);
      pieces.push({ from: p, to: c.to, carrier: { kind: 'circle', circle: k }, sign, approxSweep: sign * ((((sign * (a1 - a0)) % TAU) + TAU) % TAU) });
    }
    p = c.to;
  }
  if (pieces.length === 0) return { contour: { start: cc.start, segs: [] }, carriers: [] };

  // 2. Merge runs.
  const sameCarrier = (a: Piece, b: Piece): boolean => {
    if (!a.carrier || !b.carrier || a.carrier.kind !== b.carrier.kind) {
      if (!a.carrier && !b.carrier) {
        const d1 = unit(sub(a.to, a.from)), d2 = unit(sub(b.to, b.from));
        return Math.abs(cross(d1, d2)) < 1e-9 && dot(d1, d2) > 0;
      }
      return false;
    }
    if (a.carrier.kind === 'line' && b.carrier.kind === 'line') return sameLine(a.carrier.line, b.carrier.line) && dot(sub(a.to, a.from), sub(b.to, b.from)) > 0;
    if (a.carrier.kind === 'circle' && b.carrier.kind === 'circle') return sameCircle(a.carrier.circle, b.carrier.circle) && a.sign === b.sign;
    return false;
  };
  const merged: Piece[] = [];
  for (const q of pieces) {
    const last = merged[merged.length - 1];
    if (last && sameCarrier(last, q)) merged[merged.length - 1] = { ...last, to: q.to, approxSweep: last.approxSweep + q.approxSweep };
    else merged.push({ ...q });
  }
  if (merged.length > 1 && sameCarrier(merged[merged.length - 1]!, merged[0]!)) {
    const last = merged.pop()!;
    merged[0] = { ...merged[0]!, from: last.from, approxSweep: merged[0]!.approxSweep + last.approxSweep };
  }

  // 3. Exact corners: vertex i sits between merged[i − 1] and merged[i].
  const n = merged.length;
  /** Without an exact crossing, put the point exactly on a neighbouring circle (arcs need ends on their circle). */
  const onCircle = (q: Vec2, ...cs: (Carrier | null)[]): Vec2 => {
    const c = cs.find((x): x is { kind: 'circle'; circle: Circle } => x?.kind === 'circle');
    if (!c) return q;
    const d = sub(q, c.circle.centre), l = len(d);
    return l < 1e-12 ? q : add(c.circle.centre, scale(d, c.circle.r / l));
  };
  const vertex: Vec2[] = merged.map((m, i) => {
    const prev = merged[(i - 1 + n) % n]!;
    if (n === 1 || !prev.carrier || !m.carrier) return onCircle(m.from, m.carrier, prev.carrier);
    const exact = crossing(prev.carrier, m.carrier, m.from);
    // Sanity: an exact crossing must be near Paper's point (well within its approximation error).
    const scaleOf = m.carrier.kind === 'circle' ? m.carrier.circle.r : prev.carrier.kind === 'circle' ? prev.carrier.circle.r : 1;
    if (exact && len(sub(exact, m.from)) <= 2e-3 * Math.max(1, scaleOf)) return exact;
    // Same or concentric circles, or parallel lines: no single crossing.
    return onCircle(m.from, m.carrier, prev.carrier);
  });

  // 4. Emit, splitting a whole circle (or more) into halves so no arc ends where it starts.
  const segs: Seg[] = [];
  const carriers: (Carrier | null)[] = [];
  for (let i = 0; i < n; i++) {
    const m = merged[i]!, from = vertex[i]!, to = vertex[(i + 1) % n]!;
    if (!m.carrier || m.carrier.kind === 'line') { segs.push({ kind: 'L', to }); carriers.push(m.carrier); continue; }
    const k = m.carrier.circle;
    const a0 = Math.atan2(from.y - k.centre.y, from.x - k.centre.x), a1 = Math.atan2(to.y - k.centre.y, to.x - k.centre.x);
    let mag = ((((m.sign * (a1 - a0)) % TAU) + TAU) % TAU);
    // Use Paper's sweep to resolve the full-turn ambiguity (a whole circle, or a near-zero remainder).
    while (mag + Math.PI < Math.abs(m.approxSweep)) mag += TAU;
    const sweep = m.sign * mag;
    if (mag < 1e-12) continue;
    const parts = mag >= TAU - 1e-9 ? 2 : 1;
    let cur = from;
    for (let j = 1; j <= parts; j++) {
      const a = Math.atan2(cur.y - k.centre.y, cur.x - k.centre.x) + sweep / parts;
      const end = j === parts ? to : { x: k.centre.x + k.r * Math.cos(a), y: k.centre.y + k.r * Math.sin(a) };
      segs.push({ kind: 'A', to: end, centre: k.centre, r: k.r, sweep: sweep / parts });
      carriers.push(m.carrier);
      cur = end;
    }
  }
  return { contour: { start: vertex[0]!, segs }, carriers };
}
