/**
 * The construction overlay for export (DESIGN.md §8): one `<g id="construction">` placed before the
 * mark, containing only path, line and circle (VERIFICATION.md E2). Everything is clipped to the
 * export bounds, so the overlay never enlarges them. Pure: it returns markup strings.
 */
import type { Contour } from '../geometry/contour';
import type { Vec2 } from '../geometry/num';
import { latticePoints, toPlane } from '../grids';
import { gridLines } from '../grids/lines';
import type { GridDef } from '../grids/types';
import type { LogoDocument } from '../model/types';
import type { Mark } from '../pipeline/evaluate';
import { radiusCells, type ShapeConstruction } from '../pipeline/resolve';
import { clipSegment, type Box } from './bounds';
import { OVERLAY_PALETTE, type OverlayStyle } from './palette';
import { fmt, writePath } from './write-path';

export interface Frame {
  /** Export bounds in cells (mark bounds plus padding). */
  readonly box: Box;
  /** Export units per cell. */
  readonly scale: number;
  /** Export units per canvas pixel at 1024 px on the long side (DESIGN.md §8). */
  readonly pxUnit: number;
}

const P3 = 3;

/** Every straight edge of the mark, extended across the frame (DESIGN.md §8, edge guides). */
export function edgeGuides(mark: Mark, box: Box): [Vec2, Vec2][] {
  const seen = new Set<string>();
  const out: [Vec2, Vec2][] = [];
  const L = 4 * (box.maxX - box.minX + box.maxY - box.minY) + 1;
  for (const piece of mark.pieces) {
    for (const c of [piece.outer, ...piece.holes]) {
      let from = c.start;
      for (const s of c.segs) {
        if (s.kind === 'L') {
          const dx = s.to.x - from.x, dy = s.to.y - from.y, l = Math.hypot(dx, dy);
          if (l > 1e-9) {
            // Canonical line: unit direction with a positive first non-zero component, and offset.
            let ux = dx / l, uy = dy / l;
            if (ux < -1e-12 || (Math.abs(ux) <= 1e-12 && uy < 0)) { ux = -ux; uy = -uy; }
            const off = from.x * uy - from.y * ux;
            const key = `${ux.toFixed(6)},${uy.toFixed(6)},${off.toFixed(6)}`;
            if (!seen.has(key)) {
              seen.add(key);
              const seg = clipSegment({ x: from.x - ux * L, y: from.y - uy * L }, { x: from.x + ux * L, y: from.y + uy * L }, box);
              if (seg) out.push(seg);
            }
          }
        }
        from = s.to;
      }
    }
  }
  return out;
}

export function buildOverlay(doc: LogoDocument, mark: Mark, construction: readonly ShapeConstruction[], frame: Frame, style: OverlayStyle, withEdgeGuides: boolean): string {
  const col = OVERLAY_PALETTE[style];
  const { box, scale, pxUnit } = frame;
  const g = doc.grid;
  const X = (x: number) => fmt((x - box.minX) * scale, P3);
  const Y = (y: number) => fmt((y - box.minY) * scale, P3);
  const U = (n: number) => fmt(n, P3);
  const w1 = U(pxUnit), w125 = U(1.25 * pxUnit);
  const dash = (...a: number[]) => a.map((n) => U(n * pxUnit)).join(' ');
  const out: string[] = [];
  const W = (box.maxX - box.minX) * scale, H = (box.maxY - box.minY) * scale;

  // Background: a path, since the overlay group allows only path, line and circle (VERIFICATION.md E2).
  out.push(`<path d="M0 0H${U(W)}V${U(H)}H0Z" fill="${col.bg}"/>`);

  // Grid lines, clipped to the frame. Minor first, so majors draw on top.
  const { lines, rings } = gridLines(g);
  for (const major of [false, true]) {
    const stroke = major ? col.gridMajor : col.gridMinor;
    for (const ln of lines) {
      if (ln.major !== major) continue;
      const seg = clipSegment(ln.a, ln.b, box);
      if (seg) out.push(`<line x1="${X(seg[0].x)}" y1="${Y(seg[0].y)}" x2="${X(seg[1].x)}" y2="${Y(seg[1].y)}" stroke="${stroke}" stroke-width="${w1}"/>`);
    }
    for (const r of rings) {
      if (r.major !== major) continue;
      out.push(`<circle cx="${X(r.centre.x)}" cy="${Y(r.centre.y)}" r="${U(r.r * scale)}" fill="none" stroke="${stroke}" stroke-width="${w1}"/>`);
    }
  }

  // Lattice crosses inside the frame: 5 px arms at whole cells, 3 px (half opacity) at sub-steps.
  const crosses: [string, string][] = [['', ''], ['', '']];
  for (const l of latticePoints(g)) {
    const p = toPlane(l, g);
    if (p.x < box.minX - 1e-9 || p.x > box.maxX + 1e-9 || p.y < box.minY - 1e-9 || p.y > box.maxY + 1e-9) continue;
    const whole = l.u % g.subdivision === 0 && l.v % g.subdivision === 0;
    const k = (whole ? 5 : 3) * pxUnit, x = (p.x - box.minX) * scale, y = (p.y - box.minY) * scale;
    const d = `M${U(x - k)} ${U(y)}H${U(x + k)}M${U(x)} ${U(y - k)}V${U(y + k)}`;
    crosses[whole ? 0 : 1]![0] += d;
  }
  if (crosses[1]![0]) out.push(`<path d="${crosses[1]![0]}" fill="none" stroke="${col.lattice}" stroke-width="${w1}" opacity="0.5"/>`);
  if (crosses[0]![0]) out.push(`<path d="${crosses[0]![0]}" fill="none" stroke="${col.lattice}" stroke-width="${w1}"/>`);

  // Edge guides (optional).
  if (withEdgeGuides) {
    for (const [a, b] of edgeGuides(mark, box)) {
      out.push(`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="${col.gridMajor}" stroke-width="${w1}"/>`);
    }
  }

  // Cut and intersect outlines, dashed 6 4.
  for (const s of doc.shapes) {
    if (s.role === 'add') continue;
    const c = construction.find((k) => k.shapeId === s.id);
    if (!c || c.contours.length === 0) continue;
    out.push(`<path d="${writePath(c.contours as Contour[], { scale, precision: P3, origin: { x: box.minX, y: box.minY } })}" fill="none" stroke="${col.cut}" stroke-width="${w125}" stroke-dasharray="${dash(6, 4)}"/>`);
  }

  // Radius, fillet and arc-centre circles. Inward corners and coves are dashed 4 3 (DESIGN.md §4).
  const circle = (c: Vec2, r: number, dashed: boolean) =>
    `<circle cx="${X(c.x)}" cy="${Y(c.y)}" r="${U(r * scale)}" fill="none" stroke="${col.radius}" stroke-width="${w125}"${dashed ? ` stroke-dasharray="${dash(4, 3)}"` : ''}/>`;
  for (const c of construction) {
    for (const k of c.circles) {
      if (!k || k.r <= 0) continue;
      out.push(circle(k.centre, k.r, k.kind === 'inward' || k.kind === 'cove'));
    }
  }
  for (const s of doc.shapes) {
    const vs = s.path.vertices;
    // A circle (a one-point fill): its radius around the point.
    if (s.paint.kind === 'fill' && vs.length === 1) {
      const r = radiusCells(doc, vs[0]!);
      if (r > 0) out.push(circle(toPlane(vs[0]!.at, g), r, false));
    }
    s.path.segments.forEach((seg, i) => {
      if (seg.kind !== 'arc') return;
      const from = toPlane(vs[i]!.at, g), c = toPlane(seg.centre, g);
      out.push(circle(c, Math.hypot(from.x - c.x, from.y - c.y), false));
    });
  }

  // Repeat centres and axes (dash-dot 8 3 1 3), clipped to the frame.
  const dd = dash(8, 3, 1, 3);
  for (const s of doc.shapes) {
    const r = s.repeat;
    if (r.kind === 'rotate') {
      const c = toPlane(r.centre, g), k = 8 * pxUnit, x = (c.x - box.minX) * scale, y = (c.y - box.minY) * scale;
      out.push(`<path d="M${U(x - k)} ${U(y)}H${U(x + k)}M${U(x)} ${U(y - k)}V${U(y + k)}" fill="none" stroke="${col.axis}" stroke-width="${w125}"/>`);
      out.push(`<circle cx="${U(x)}" cy="${U(y)}" r="${U(16 * pxUnit)}" fill="none" stroke="${col.axis}" stroke-width="${w1}" stroke-dasharray="${dd}"/>`);
    } else if (r.kind === 'mirror') {
      const a = toPlane(r.through, g), b = toPlane(r.to, g);
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy), L = 4 * (box.maxX - box.minX + box.maxY - box.minY) + 1;
      const seg = l > 0 ? clipSegment({ x: a.x - (dx / l) * L, y: a.y - (dy / l) * L }, { x: a.x + (dx / l) * L, y: a.y + (dy / l) * L }, box) : null;
      if (seg) out.push(`<line x1="${X(seg[0].x)}" y1="${Y(seg[0].y)}" x2="${X(seg[1].x)}" y2="${Y(seg[1].y)}" stroke="${col.axis}" stroke-width="${w1}" stroke-dasharray="${dd}"/>`);
    } else if (r.kind === 'translate') {
      const o = toPlane(s.path.vertices[0]!.at, g), z = toPlane({ u: 0, v: 0, ...(r.step.layer ? { layer: r.step.layer } : {}) }, g), st = toPlane(r.step, g);
      const end = { x: o.x + (st.x - z.x) * (r.count - 1), y: o.y + (st.y - z.y) * (r.count - 1) };
      const seg = clipSegment(o, end, box);
      if (seg) out.push(`<line x1="${X(seg[0].x)}" y1="${Y(seg[0].y)}" x2="${X(seg[1].x)}" y2="${Y(seg[1].y)}" stroke="${col.axis}" stroke-width="${w1}" stroke-dasharray="${dd}"/>`);
    }
  }
  return `<g id="construction">${out.join('')}</g>`;
}
