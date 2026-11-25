/**
 * Derived outline geometry: closed contours of straight lines and circular arcs (ARCHITECTURE.md §4.2).
 * Coordinates are plane cells (y down). "Positive" rotation means positive cross product in these
 * raw coordinates (x towards y), which is exactly SVG's sweep-flag = 1 "positive-angle" direction.
 */
import { sub, type Vec2 } from './num';

export type Seg =
  | { readonly kind: 'L'; readonly to: Vec2 }
  | {
      readonly kind: 'A';
      readonly to: Vec2;
      readonly centre: Vec2;
      readonly r: number;
      /** Signed sweep in radians: > 0 is positive rotation (SVG sweep-flag 1). Never 0, |sweep| < 2π. */
      readonly sweep: number;
    };

/** A closed contour: starts at `start`; the last segment ends back at `start`. */
export interface Contour {
  readonly start: Vec2;
  readonly segs: readonly Seg[];
}

export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const unit = (a: Vec2): Vec2 => { const l = len(a); return { x: a.x / l, y: a.y / l }; };
/** Rotate by +90° (positive rotation). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

/** SVG arc flags for an arc segment (SVG 2, paths: large-arc-flag and sweep-flag). */
export function svgArcFlags(s: Extract<Seg, { kind: 'A' }>): { large: 0 | 1; sweep: 0 | 1 } {
  return { large: Math.abs(s.sweep) > Math.PI ? 1 : 0, sweep: s.sweep > 0 ? 1 : 0 };
}

/** Start point of every segment, in order. */
export function segStarts(c: Contour): Vec2[] {
  const out: Vec2[] = [];
  let p = c.start;
  for (const s of c.segs) { out.push(p); p = s.to; }
  return out;
}

/** Unit tangent at the start and end of a segment that starts at `from`. */
export function segTangents(from: Vec2, s: Seg): { start: Vec2; end: Vec2 } {
  if (s.kind === 'L') { const d = unit(sub(s.to, from)); return { start: d, end: d }; }
  const sign = Math.sign(s.sweep);
  const t = (p: Vec2) => { const r = unit(sub(p, s.centre)); return { x: -r.y * sign, y: r.x * sign }; };
  return { start: t(from), end: t(s.to) };
}

/** Signed area (positive = positive rotation). Arcs add their circular segment exactly. */
export function contourArea(c: Contour): number {
  let a = 0;
  let p = c.start;
  for (const s of c.segs) {
    a += cross(p, s.to) / 2;
    if (s.kind === 'A') a += (s.r * s.r * (s.sweep - Math.sin(s.sweep))) / 2;
    p = s.to;
  }
  return a;
}

/** The same contour traversed the other way (arcs keep centre and radius, sweeps change sign). */
export function reverseContour(c: Contour): Contour {
  const starts = segStarts(c);
  const segs: Seg[] = [];
  for (let i = c.segs.length - 1; i >= 0; i--) {
    const s = c.segs[i] as Seg, to = starts[i] as Vec2;
    segs.push(s.kind === 'L' ? { kind: 'L', to } : { kind: 'A', to, centre: s.centre, r: s.r, sweep: -s.sweep });
  }
  return { start: c.start, segs };
}

/** A polygon through the contour, arcs sampled finely. For containment tests only, never for output. */
export function flatten(c: Contour, perRadian = 24): Vec2[] {
  const pts: Vec2[] = [c.start];
  let p = c.start;
  for (const s of c.segs) {
    if (s.kind === 'A') {
      const n = Math.max(2, Math.ceil(Math.abs(s.sweep) * perRadian));
      const a0 = Math.atan2(p.y - s.centre.y, p.x - s.centre.x);
      for (let i = 1; i < n; i++) {
        const a = a0 + (s.sweep * i) / n;
        pts.push({ x: s.centre.x + s.r * Math.cos(a), y: s.centre.y + s.r * Math.sin(a) });
      }
    }
    pts.push(s.to);
    p = s.to;
  }
  return pts;
}

/** Even-odd point-in-polygon on the flattened contour. */
export function containsPoint(c: Contour, q: Vec2): boolean {
  const poly = flatten(c);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Vec2, b = poly[j] as Vec2;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
