/**
 * Corner geometry for closed paths of straight segments (SPEC.md §6.6, §9.4–9.5; ARCHITECTURE.md §4.3).
 *
 * Every point is one of:
 * - sharp:  radius 0 (any corner type). The outline passes through the point.
 * - fillet: corner type 'round'. The corner stays on the point and an arc of radius r, tangent to
 *           both edges, replaces the tip. Fillets on one edge are clamped so they never overlap.
 * - wrap:   'outer', 'inward' or 'auto'. A circle of radius r is centred on the point and the
 *           outline wraps it: outer passes it on the outside (offset ρ = +r), inward on the inside
 *           (ρ = −r, a concave bite). 'auto' is outer where the outline turns convex and inward
 *           where it turns concave.
 * - disc:   a corner type against the corner (inward on convex → cove; outer on concave → filled
 *           corner). The disc of radius r centred on the point is removed or added; real corners remain
 *           where its arc meets the edges.
 *
 * Pass 1 finds each edge as the line keeping signed offset ρᵢ from circle i and ρⱼ from circle j
 * (fillet and sharp points have ρ = 0). Writing D = Cⱼ − Cᵢ, L = |D| and δ = ρᵢ − ρⱼ, the
 * edge's exterior normal m satisfies m·D = δ, which has a solution only when |δ| < L:
 *   same side      → |rᵢ − rⱼ| < L   (otherwise one circle swallows the other)
 *   opposite sides → rᵢ + rⱼ < L     (otherwise there is no room for the cross tangent)
 * Pass 2 cuts fillets at round points between the edges from pass 1.
 *
 * The output never contains a zero-radius arc, an arc whose ends coincide, or an arc whose chord
 * exceeds its diameter. SVG would silently "correct" those (SVG 2, Paths, out-of-range elliptical
 * arc parameters), which would hide bugs.
 */
import { add, scale, sub, type Vec2 } from './num';
import { cross, dot, len, perp, unit, type Contour, type Seg } from './contour';

export type CornerType = 'auto' | 'outer' | 'round' | 'inward';

export interface CornerSpec {
  readonly type: CornerType;
  /** Radius in cells. */
  readonly r: number;
}

export type CornerIssue =
  | { readonly kind: 'degenerate'; readonly reason: 'too-few-points' | 'coincident-points' }
  /** No tangent exists at this point: its circle swallows a neighbour, or there is no room to cross.
   *  `maxRadius` is an exclusive limit: the radius must be below it (at the limit the edge has zero length). */
  | { readonly kind: 'no-tangent'; readonly index: number; readonly requested: number; readonly maxRadius: number }
  /** A fillet was shrunk to fit its edges. */
  | { readonly kind: 'clamped'; readonly index: number; readonly requested: number; readonly actual: number };

/** A straight edge of the outline before fillets are cut (exposed for tests and drawing guides). */
export interface Edge {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly dir: Vec2;
}

export interface OutlineResult {
  readonly contour: Contour | null;
  readonly issues: readonly CornerIssue[];
  readonly edges: readonly Edge[];
  /** For drawing radius circles: the circle actually used at each point, or null if sharp. */
  readonly circles: readonly ({ centre: Vec2; r: number; kind: 'fillet' | 'outer' | 'inward' | 'cove' | 'fill' } | null)[];
  /** Positions where the outline deliberately has a corner (sharp points, and both ends of coves and filled corners). */
  readonly corners: readonly Vec2[];
}

const EPS = 1e-12;
const TAU = 2 * Math.PI;

const angle = (v: Vec2): number => Math.atan2(v.y, v.x);
const signedTurn = (a: Vec2, b: Vec2): number => Math.atan2(cross(a, b), dot(a, b));
const mod2pi = (x: number): number => ((x % TAU) + TAU) % TAU;

function signedArea(pts: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) a += cross(pts[i] as Vec2, pts[(i + 1) % pts.length] as Vec2) / 2;
  return a;
}

export function outlineClosed(points: readonly Vec2[], corners: readonly CornerSpec[]): OutlineResult {
  const n = points.length;
  const empty = (issue: CornerIssue): OutlineResult => ({ contour: null, issues: [issue], edges: [], circles: [], corners: [] });
  if (n < 2) return empty({ kind: 'degenerate', reason: 'too-few-points' });
  for (let i = 0; i < n; i++) {
    if (len(sub(points[(i + 1) % n] as Vec2, points[i] as Vec2)) < EPS) return empty({ kind: 'degenerate', reason: 'coincident-points' });
  }

  const P = (i: number): Vec2 => points[((i % n) + n) % n] as Vec2;
  // Orientation: +1 if the polygon turns positively overall. A shape with no area (e.g. two points)
  // is treated as positive, so a two-point "capsule" wraps consistently.
  const area = signedArea(points);
  const o = area < -EPS ? -1 : 1;

  /** How the polygon turns at point i, relative to its orientation. */
  const shapeAt = (i: number): 'convex' | 'concave' | 'straight' | 'reversal' => {
    const din = sub(P(i), P(i - 1)), dout = sub(P(i + 1), P(i));
    const t = cross(din, dout) * o;
    if (Math.abs(t) < EPS * len(din) * len(dout)) return dot(din, dout) > 0 ? 'straight' : 'reversal';
    return t > 0 ? 'convex' : 'concave';
  };

  // Resolve each point's role and signed offset ρ.
  // A corner type that goes against the corner (inward on a convex corner, outer on a concave one)
  // becomes a disc centred on the point: removed (a cove) or added (a filled corner). The point stays a
  // corner of the edges, and the arc meets each edge r from the point (SPEC.md §6.6).
  type Role =
    | { kind: 'sharp' }
    | { kind: 'fillet'; r: number }
    | { kind: 'wrap'; r: number; s: 1 | -1 }
    | { kind: 'disc'; r: number; s: 1 | -1 };
  const roles: Role[] = points.map((_, i) => {
    const c = corners[i] as CornerSpec;
    if (!(c.r > 0)) return { kind: 'sharp' };
    if (c.type === 'round') return { kind: 'fillet', r: c.r };
    const at = shapeAt(i);
    if (c.type === 'outer') return at === 'concave' ? { kind: 'disc', r: c.r, s: 1 } : { kind: 'wrap', r: c.r, s: 1 };
    if (c.type === 'inward') {
      if (at === 'convex') return { kind: 'disc', r: c.r, s: -1 };
      if (at === 'reversal') return { kind: 'sharp' }; // a cove in a zero-width hairpin removes nothing
      return { kind: 'wrap', r: c.r, s: -1 };
    }
    // auto: convex → outer, concave → inward. Straight-through points stay sharp; reversals wrap outside.
    if (at === 'straight') return { kind: 'sharp' };
    return { kind: 'wrap', r: c.r, s: at === 'concave' ? -1 : 1 };
  });
  const rho = (i: number): number => { const r = roles[((i % n) + n) % n] as Role; return r.kind === 'wrap' ? r.s * r.r : 0; };

  // Pass 1: edges as offset tangent lines.
  const edges: Edge[] = [];
  const noTangent = new Map<number, number>(); // index → max radius that would work
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const D = sub(P(j), P(i));
    const L = len(D);
    const delta = rho(i) - rho(j);
    if (Math.abs(delta) >= L - 1e-9) {
      for (const [k, other] of [[i, j], [j, i]] as const) {
        const role = roles[k] as Role;
        if (role.kind !== 'wrap') continue;
        // |s·r − ρ_other| < L  ⇔  s·ρ_other − L < r < s·ρ_other + L. Only a point above its upper
        // limit is at fault: when a big circle swallows a small one on the same side, the small
        // one is merely below its lower limit, and the fix is to shrink the big one.
        const max = Math.max(0, L + role.s * rho(other));
        if (role.r < max - 1e-9) continue; // same tolerance as the edge test above
        // Within the tolerance the computed limit can exceed the request by float noise; it never really does.
        noTangent.set(k, Math.min(noTangent.get(k) ?? Infinity, max, role.r));
      }
      edges.push({ from: P(i), to: P(j), dir: { x: D.x / L, y: D.y / L } });
      continue;
    }
    const u = { x: D.x / L, y: D.y / L };
    const w = { x: o * u.y, y: -o * u.x }; // exterior normal of the direction u
    const a = delta / L, b = Math.sqrt(1 - a * a);
    const m = { x: a * u.x + b * w.x, y: a * u.y + b * w.y };
    const dir = { x: -o * m.y, y: o * m.x };
    edges.push({ from: add(P(i), scale(m, rho(i))), to: add(P(j), scale(m, rho(j))), dir });
  }
  if (noTangent.size > 0) {
    const issues: CornerIssue[] = [...noTangent].sort((x, y) => x[0] - y[0]).map(([index, maxRadius]) => ({
      kind: 'no-tangent', index, requested: (corners[index] as CornerSpec).r, maxRadius,
    }));
    return { contour: null, issues, edges, circles: [], corners: [] };
  }

  const E = (i: number): Edge => edges[((i % n) + n) % n] as Edge;

  // Pass 2: fillets and discs. A fillet wants a tangent length t = r·tan(|turn|/2) along both of its
  // edges; a disc wants r along both (its arc meets each edge r from the point).
  const turns = points.map((_, i) => signedTurn(E(i - 1).dir, E(i).dir));
  const want = roles.map((role, i) => {
    if (role.kind === 'disc') return role.r;
    if (role.kind !== 'fillet') return 0;
    const tn = Math.abs(turns[i] as number);
    if (tn < 1e-12) return 0;
    return role.r * Math.tan(Math.min(tn, Math.PI - 1e-9) / 2);
  });
  // Edge i is shared by the fillet at its start (i) and at its end (i + 1): scale both down if they overlap.
  const allowStart: number[] = new Array(n).fill(Infinity);
  const allowEnd: number[] = new Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const l = len(sub(E(i).to, E(i).from));
    const a = want[i] as number, b = want[j] as number;
    const k = a + b > l ? l / (a + b) : 1;
    allowStart[i] = a * k;
    allowEnd[j] = b * k;
  }

  const issues: CornerIssue[] = [];
  const cornerPts: Vec2[] = [];
  type Piece = { entry: Vec2; exit: Vec2; arc: Seg | null; circle: OutlineResult['circles'][number] };
  const pieces: Piece[] = roles.map((role, i) => {
    const ein = E(i - 1), eout = E(i);
    if (role.kind === 'sharp') { cornerPts.push(P(i)); return { entry: P(i), exit: P(i), arc: null, circle: null }; }
    if (role.kind === 'disc') {
      // Cove (s = −1) or filled corner (s = +1): an arc centred on the point spanning the corner's
      // own opening, π − |turn|, meeting both edges at distance d from the point.
      const d = Math.min(allowStart[i] as number, allowEnd[i] as number, role.r);
      const mag = Math.PI - Math.abs(turns[i] as number);
      const a = sub(P(i), scale(ein.dir, d)), b = add(P(i), scale(eout.dir, d));
      const none = d < 1e-12 || mag < 1e-9 || len(sub(b, a)) < 1e-9;
      if (d < role.r - 1e-9 || none) issues.push({ kind: 'clamped', index: i, requested: role.r, actual: none ? 0 : d });
      if (none) { cornerPts.push(P(i)); return { entry: P(i), exit: P(i), arc: null, circle: null }; }
      cornerPts.push(a, b);
      return {
        entry: a, exit: b,
        arc: { kind: 'A', to: b, centre: P(i), r: d, sweep: o * role.s * mag },
        circle: { centre: P(i), r: d, kind: role.s > 0 ? 'fill' : 'cove' },
      };
    }
    if (role.kind === 'fillet') {
      const turn = turns[i] as number;
      const t = Math.min(allowStart[i] as number, allowEnd[i] as number, want[i] as number);
      const tn = Math.abs(turn);
      const rActual = tn < 1e-12 ? 0 : t / Math.tan(Math.min(tn, Math.PI - 1e-9) / 2);
      const fin = sub(P(i), scale(ein.dir, t));
      const fout = add(P(i), scale(eout.dir, t));
      // A hairpin (turn ≈ 180°) leaves no width for a fillet: its ends would coincide. Keep it sharp.
      const none = !(rActual > 1e-12) || t < 1e-12 || len(sub(fout, fin)) < 1e-9;
      if (rActual < role.r - 1e-9 || none) issues.push({ kind: 'clamped', index: i, requested: role.r, actual: none ? 0 : rActual });
      if (none) { cornerPts.push(P(i)); return { entry: P(i), exit: P(i), arc: null, circle: null }; }
      const centre = add(fin, scale(perp(ein.dir), Math.sign(turn) * rActual));
      return { entry: fin, exit: fout, arc: { kind: 'A', to: fout, centre, r: rActual, sweep: turn }, circle: { centre, r: rActual, kind: 'fillet' } };
    }
    // Wrap: arc around the circle centred on the point, from the incoming to the outgoing tangent point.
    const entry = ein.to, exit = eout.from;
    const circle = { centre: P(i), r: role.r, kind: role.s > 0 ? 'outer' as const : 'inward' as const };
    if (len(sub(exit, entry)) < 1e-9) return { entry, exit: entry, arc: null, circle };
    const sense = o * role.s;
    const mag = mod2pi(sense * (angle(sub(exit, P(i))) - angle(sub(entry, P(i)))));
    return { entry, exit, arc: { kind: 'A', to: exit, centre: P(i), r: role.r, sweep: sense * mag }, circle };
  });

  const segs: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const pc = pieces[i] as Piece;
    if (pc.arc) segs.push(pc.arc);
    const next = (pieces[(i + 1) % n] as Piece).entry;
    // Skip slivers: a fillet clamped to its whole edge ends on the next point, and a leftover
    // line of ~1e-11 would carry a meaningless direction into the output.
    if (len(sub(next, pc.exit)) > 1e-9) segs.push({ kind: 'L', to: next });
  }
  // Close exactly on the start point (remove floating drift on the final segment's end).
  const start = (pieces[0] as Piece).entry;
  const last = segs[segs.length - 1];
  if (last) segs[segs.length - 1] = { ...last, to: start };

  return { contour: { start, segs }, issues, edges, circles: pieces.map((p) => p.circle), corners: cornerPts };
}
