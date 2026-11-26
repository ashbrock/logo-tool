/**
 * Commands (ARCHITECTURE.md §8): named, serialisable edits applied by pure reducers. Each returns a new
 * frozen document, or an error and no change. Every result is re-validated, so a reducer bug can never
 * put an invalid document into history.
 */
import { exactEq } from '../geometry/exact';
import { lattice, latticeEq, type Lattice } from '../geometry/lattice';
import { contains, dist2Exact, exactT, normalise, type GridDef } from '../grids';
import type { CornerType } from '../geometry/corners';
import { deepFreeze, type ExportSettings, type Len240, type LogoDocument, type Paint, type Repeat, type Segment, type Shape, type Vertex } from './types';
import { validateDocument } from './validate';

export type ArcSpec = { readonly centre: Lattice; readonly sweep: 0 | 1 };

export type Command =
  | { type: 'addShape'; at: Lattice; paint?: 'fill' | 'stroke'; width?: Len240 }
  | { type: 'appendPoint'; shapeId: string; at: Lattice; arc?: ArcSpec }
  | { type: 'closeShape'; shapeId: string; arc?: ArcSpec; /** Close as a filled shape (drawing is stroke-first). */ asFill?: boolean }
  | { type: 'moveVertices'; vertexIds: string[]; du: number; dv: number }
  | { type: 'deleteVertices'; vertexIds: string[] }
  | { type: 'setCorner'; vertexIds: string[]; corner: CornerType }
  | { type: 'setRadius'; vertexIds: string[]; radius: Len240 | { ref: string } }
  | { type: 'setRole'; shapeId: string; role: Shape['role'] }
  | { type: 'setPaint'; shapeId: string; paint: Paint }
  | { type: 'setRepeat'; shapeId: string; repeat: Repeat }
  | { type: 'setJointRadius'; shapeId: string; value: Len240 }
  | { type: 'deleteShape'; shapeId: string }
  | { type: 'reorderShape'; shapeId: string; delta: number }
  | { type: 'rename'; name: string }
  | { type: 'defineRadius'; name: string; value: Len240 }
  | { type: 'setNamedRadius'; id: string; value: Len240 }
  | { type: 'setGrid'; grid: GridDef }
  | { type: 'setExport'; patch: Partial<ExportSettings> }
  | { type: 'replace'; doc: LogoDocument };

export type Result = { ok: true; doc: LogoDocument } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });
const DEFAULT_STROKE: Paint = { kind: 'stroke', width: 120, cap: 'round', join: 'round', endRadius: 0 };

function withId(doc: LogoDocument, prefix: string): [string, LogoDocument] {
  return [`${prefix}${doc.nextId}`, { ...doc, nextId: doc.nextId + 1 }];
}

function arcOk(g: GridDef, a: Lattice, b: Lattice, arc: ArcSpec): boolean {
  return contains(arc.centre, g) && exactEq(dist2Exact(arc.centre, a, g), dist2Exact(arc.centre, b, g), exactT(g));
}

const mapShape = (doc: LogoDocument, id: string, f: (s: Shape) => Shape | null): LogoDocument | null => {
  const i = doc.shapes.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const next = f(doc.shapes[i]!);
  const shapes = doc.shapes.slice();
  if (next) shapes[i] = next; else shapes.splice(i, 1);
  return { ...doc, shapes };
};

const mapVertices = (doc: LogoDocument, ids: readonly string[], f: (v: Vertex) => Vertex): LogoDocument => ({
  ...doc,
  shapes: doc.shapes.map((s) => (s.path.vertices.some((v) => ids.includes(v.id))
    ? { ...s, path: { ...s.path, vertices: s.path.vertices.map((v) => (ids.includes(v.id) ? f(v) : v)) } }
    : s)),
});

/**
 * Remove vertex i from a path. Every remaining point keeps its outgoing segment, except the point just
 * before the removed one, which now joins the point after it with a straight line.
 */
function removeVertex(s: Shape, i: number): Shape | null {
  const { vertices, segments, closed } = s.path;
  const n = vertices.length;
  if (n <= 1) return null;
  const keep = vertices.map((_, k) => k).filter((k) => k !== i);
  const stillClosed = closed && keep.length >= 3;
  const segCount = stillClosed ? keep.length : keep.length - 1;
  const segs: Segment[] = [];
  for (let j = 0; j < segCount; j++) {
    const orig = keep[j]!;
    const before = (i - 1 + n) % n;
    segs.push(orig === before && (closed || i > 0) ? { kind: 'line' } : segments[orig]!);
  }
  return { ...s, path: { vertices: keep.map((k) => vertices[k]!), segments: segs, closed: stillClosed } };
}

/** Re-check arcs after points move: an arc whose ends are no longer equidistant becomes a line (SPEC.md §9.6). */
function fixArcs(s: Shape, g: GridDef): Shape {
  const { vertices, segments } = s.path, n = vertices.length;
  const segs = segments.map((seg, i) => (seg.kind === 'arc' && !arcOk(g, vertices[i]!.at, vertices[(i + 1) % n]!.at, seg) ? ({ kind: 'line' } as const) : seg));
  return { ...s, path: { ...s.path, segments: segs } };
}

function reduce(doc: LogoDocument, c: Command): LogoDocument | string {
  const g = doc.grid;
  const place = (p: Lattice) => (contains(p, g) ? normalise(lattice(p.u, p.v, p.layer), g) : null);
  switch (c.type) {
    case 'addShape': {
      const at = place(c.at);
      if (!at) return 'That point is outside the grid.';
      const [sid, d1] = withId(doc, 's'); const [vid, d2] = withId(d1, 'v');
      const shape: Shape = {
        id: sid, path: { vertices: [{ id: vid, at, corner: 'round', radius: 0 }], segments: [], closed: false },
        paint: c.paint === 'stroke' ? { ...DEFAULT_STROKE, ...(c.width ? { width: c.width } : {}) } as Paint : { kind: 'fill' }, role: 'add', repeat: { kind: 'none' }, jointRadius: 0,
      };
      return { ...d2, shapes: [...d2.shapes, shape] };
    }
    case 'appendPoint': {
      const at = place(c.at);
      if (!at) return 'That point is outside the grid.';
      const s = doc.shapes.find((x) => x.id === c.shapeId);
      if (!s) return 'No such shape.';
      if (s.path.closed) return 'This shape is closed.';
      const last = s.path.vertices[s.path.vertices.length - 1]!;
      if (latticeEq(last.at, at)) return 'There’s already a point here.';
      if (c.arc && !arcOk(g, last.at, at, c.arc)) return 'No lattice centre fits this arc.';
      const [vid, d1] = withId(doc, 'v');
      return mapShape(d1, s.id, (x) => ({ ...x, path: { ...x.path, vertices: [...x.path.vertices, { id: vid, at, corner: 'round', radius: 0 }], segments: [...x.path.segments, c.arc ? { kind: 'arc', ...c.arc } : { kind: 'line' }] } }))!;
    }
    case 'closeShape': {
      const s = doc.shapes.find((x) => x.id === c.shapeId);
      if (!s) return 'No such shape.';
      if (s.path.closed) return 'This shape is already closed.';
      const vs = s.path.vertices;
      const fill = c.asFill || s.paint.kind === 'fill';
      if (fill && vs.length < 3) return 'A filled shape needs at least 3 points.';
      if (vs.length < 2) return 'A shape needs at least 2 points to close.';
      if (latticeEq(vs[0]!.at, vs[vs.length - 1]!.at)) return 'The last point is on the first point.';
      if (c.arc && !arcOk(g, vs[vs.length - 1]!.at, vs[0]!.at, c.arc)) return 'No lattice centre fits this arc.';
      return mapShape(doc, s.id, (x) => ({ ...x, ...(c.asFill ? { paint: { kind: 'fill' } as const } : {}), path: { ...x.path, closed: true, segments: [...x.path.segments, c.arc ? { kind: 'arc', ...c.arc } : { kind: 'line' }] } }))!;
    }
    case 'moveVertices': {
      if (!Number.isInteger(c.du) || !Number.isInteger(c.dv)) return 'Moves are in whole sub-steps.';
      let out = doc;
      for (const s of doc.shapes) {
        if (!s.path.vertices.some((v) => c.vertexIds.includes(v.id))) continue;
        const vs: Vertex[] = [];
        for (const v of s.path.vertices) {
          if (!c.vertexIds.includes(v.id)) { vs.push(v); continue; }
          const at = place(lattice(v.at.u + c.du, v.at.v + c.dv, v.at.layer));
          if (!at) return 'That move would take a point off the grid.';
          vs.push({ ...v, at });
        }
        let next: Shape | null = fixArcs({ ...s, path: { ...s.path, vertices: vs } }, g);
        // A point dropped on its neighbour merges into it (SPEC.md §9.1).
        for (let guard = 0; next && guard < vs.length; guard++) {
          const p = next.path, n = p.vertices.length;
          const k = p.vertices.findIndex((v, i) => (i < n - 1 || p.closed) && n > 1 && latticeEq(v.at, p.vertices[(i + 1) % n]!.at));
          if (k < 0) break;
          const moved = c.vertexIds.includes(p.vertices[k]!.id) ? k : (k + 1) % n;
          next = removeVertex(next, moved);
        }
        out = mapShape(out, s.id, () => next)!;
      }
      return out;
    }
    case 'deleteVertices': {
      let out = doc;
      for (const s of doc.shapes) {
        let next: Shape | null = s;
        for (const id of c.vertexIds) {
          if (!next) break;
          const i = next.path.vertices.findIndex((v) => v.id === id);
          if (i >= 0) next = removeVertex(next, i);
        }
        if (next !== s) out = mapShape(out, s.id, () => (next && next.path.vertices.length > 0 ? fixArcs(next, g) : null))!;
      }
      return out;
    }
    case 'setCorner': return mapVertices(doc, c.vertexIds, (v) => ({ ...v, corner: c.corner }));
    case 'setRadius': {
      if (typeof c.radius === 'number' && (!Number.isInteger(c.radius) || c.radius < 0)) return 'Radius must be a whole number of 1/240 cell.';
      if (typeof c.radius !== 'number' && !doc.radii.some((r) => r.id === (c.radius as { ref: string }).ref)) return 'No such named radius.';
      return mapVertices(doc, c.vertexIds, (v) => ({ ...v, radius: c.radius }));
    }
    case 'setRole': return mapShape(doc, c.shapeId, (s) => ({ ...s, role: c.role })) ?? 'No such shape.';
    case 'setPaint': return mapShape(doc, c.shapeId, (s) => ({ ...s, paint: c.paint })) ?? 'No such shape.';
    case 'setRepeat': return mapShape(doc, c.shapeId, (s) => ({ ...s, repeat: c.repeat })) ?? 'No such shape.';
    case 'setJointRadius': return mapShape(doc, c.shapeId, (s) => ({ ...s, jointRadius: c.value })) ?? 'No such shape.';
    case 'deleteShape': return mapShape(doc, c.shapeId, () => null) ?? 'No such shape.';
    case 'reorderShape': {
      const i = doc.shapes.findIndex((s) => s.id === c.shapeId);
      if (i < 0) return 'No such shape.';
      const j = Math.max(0, Math.min(doc.shapes.length - 1, i + c.delta));
      if (i === j) return doc;
      const shapes = doc.shapes.slice(); const [s] = shapes.splice(i, 1); shapes.splice(j, 0, s!);
      return { ...doc, shapes };
    }
    case 'rename': return { ...doc, name: c.name.trim() || doc.name };
    case 'defineRadius': {
      const [id, d1] = withId(doc, 'r');
      return { ...d1, radii: [...d1.radii, { id, name: c.name, value: c.value }] };
    }
    case 'setNamedRadius': {
      if (!doc.radii.some((r) => r.id === c.id)) return 'No such named radius.';
      return { ...doc, radii: doc.radii.map((r) => (r.id === c.id ? { ...r, value: c.value } : r)) };
    }
    case 'setGrid': {
      // Same kind of grid only (SPEC.md §5). Changing subdivision rescales lattice values when exact.
      if (c.grid.kind !== g.kind || c.grid.preset !== g.preset) return 'The grid type is fixed once a mark has points. Start a new mark to change it.';
      const k = c.grid.subdivision / g.subdivision;
      const scale = (p: Lattice): Lattice | null => {
        const u = p.u * k, v = g.kind === 'polar' && p.layer !== 'square' ? p.v : p.v * k;
        return Number.isInteger(u) && Number.isInteger(v) ? lattice(u, v, p.layer) : null;
      };
      let bad = 0;
      const sc = (p: Lattice) => { const q = scale(p); if (!q || !contains(q, c.grid)) { bad++; return p; } return normalise(q, c.grid); };
      const shapes = doc.shapes.map((s) => ({
        ...s,
        path: { ...s.path, vertices: s.path.vertices.map((v) => ({ ...v, at: sc(v.at) })), segments: s.path.segments.map((seg) => (seg.kind === 'arc' ? { ...seg, centre: sc(seg.centre) } : seg)) },
        repeat: s.repeat.kind === 'rotate' ? { ...s.repeat, centre: sc(s.repeat.centre), ...(s.repeat.axis ? { axis: sc(s.repeat.axis) } : {}) }
          : s.repeat.kind === 'mirror' ? { ...s.repeat, through: sc(s.repeat.through), to: sc(s.repeat.to) }
          : s.repeat.kind === 'translate' ? { ...s.repeat, step: scale(s.repeat.step) ?? (bad++, s.repeat.step) }
          : s.repeat,
      }));
      if (bad > 0) return `${bad} point${bad === 1 ? '' : 's'} wouldn’t land on the new grid.`;
      return { ...doc, grid: c.grid, shapes };
    }
    case 'setExport': return { ...doc, export: { ...doc.export, ...c.patch } };
    case 'replace': return c.doc;
  }
}

/** Apply a command. Never throws for user-level problems; returns them as errors. */
export function apply(doc: LogoDocument, c: Command): Result {
  const next = reduce(doc, c);
  if (typeof next === 'string') return fail(next);
  if (next === doc) return { ok: true, doc };
  const problems = validateDocument(next);
  if (problems.length > 0) return fail(`Refused: ${problems[0]}`);
  return { ok: true, doc: deepFreeze(next) };
}
