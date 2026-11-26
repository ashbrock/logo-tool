/**
 * A tiny builder over model commands, shared by the built-in examples and the reference rebuilds
 * (VERIFICATION.md §1). Points are given in cells and converted to lattice sub-steps.
 */
import { lattice, type Lattice } from '../geometry/lattice';
import { defaultGrid, nearest, toPlane, type GridDef, type Subdivision } from '../grids';
import { apply, type Command } from '../model/commands';
import { emptyDocument, LEN, type Repeat } from '../model/types';
import type { CornerType } from '../geometry/corners';

export type PathStep = readonly [number, number] | { readonly to: readonly [number, number]; readonly c: readonly [number, number]; readonly sweep?: 0 | 1 };

export const square = (w: number, h: number, sub: Subdivision): GridDef => ({ ...defaultGrid('square'), width: w, height: h, subdivision: sub } as GridDef);

export function builder(grid: GridDef, name: string) {
  let doc = emptyDocument(grid, name);
  const sub = grid.subdivision;
  // A point in cells. On an unrotated square grid this is exact arithmetic; on any other grid it is the
  // nearest lattice point, which must coincide with the requested point (so a typo can't drift silently).
  const plainSquare = grid.kind === 'affine' && grid.preset === 'square' && grid.slantDeg === 0 && grid.rotationDeg === 0;
  const L = (x: number, y: number): Lattice => {
    if (plainSquare) return lattice(Math.round(x * sub), Math.round(y * sub));
    const p = nearest({ x, y }, grid);
    const q = toPlane(p, grid);
    if (Math.hypot(q.x - x, q.y - y) > 1e-6) throw new Error(`${name}: (${x}, ${y}) is not a lattice point (nearest is (${q.x}, ${q.y}))`);
    return p;
  };
  const run = (c: Command) => {
    const r = apply(doc, c);
    if (!r.ok) throw new Error(`${name}: ${c.type}: ${r.error}`);
    doc = r.doc;
  };
  const lastShape = () => doc.shapes[doc.shapes.length - 1]!;
  return {
    L,
    polygon(pts: (readonly [number, number] | Lattice)[], opts: { corners?: (number | [CornerType, number])[]; role?: 'add' | 'cut' | 'intersect'; repeat?: Repeat; joint?: number } = {}) {
      const at = (p: readonly [number, number] | Lattice): Lattice => ('u' in p ? p : L(p[0], p[1]));
      run({ type: 'addShape', at: at(pts[0]!) });
      const id = lastShape().id;
      for (const p of pts.slice(1)) run({ type: 'appendPoint', shapeId: id, at: at(p) });
      run({ type: 'closeShape', shapeId: id });
      const vs = lastShape().path.vertices;
      (opts.corners ?? []).forEach((c, i) => {
        const [type, r] = typeof c === 'number' ? (['round', c] as [CornerType, number]) : c;
        if (r > 0) run({ type: 'setRadius', vertexIds: [vs[i]!.id], radius: Math.round(r * LEN) });
        if (type !== 'round') run({ type: 'setCorner', vertexIds: [vs[i]!.id], corner: type });
      });
      if (opts.role && opts.role !== 'add') run({ type: 'setRole', shapeId: id, role: opts.role });
      if (opts.repeat) run({ type: 'setRepeat', shapeId: id, repeat: opts.repeat });
      if (opts.joint) run({ type: 'setJointRadius', shapeId: id, value: Math.round(opts.joint * LEN) });
    },
    /**
     * A path of lines and arcs. Each step is a point, or an arc to a point about a lattice centre. The
     * arc's direction follows from the geometry when it is less than a half turn; a half turn needs
     * `sweep` (1 = clockwise on screen). A closed path whose last step returns to the start closes
     * with that step.
     */
    path(steps: PathStep[], opts: { closed?: boolean; stroke?: number; cap?: 'butt' | 'round' | 'square'; role?: 'add' | 'cut' | 'intersect'; corners?: (number | [CornerType, number])[] } = {}) {
      const P = (p: readonly [number, number]) => L(p[0], p[1]);
      const first = steps[0] as readonly [number, number];
      run({ type: 'addShape', at: P(first), ...(opts.stroke ? { paint: 'stroke' as const, width: Math.round(opts.stroke * LEN) } : {}) });
      const id = lastShape().id;
      let prev = first;
      const arcOf = (st: Extract<PathStep, { to: unknown }>) => {
        const cx = st.c[0], cy = st.c[1];
        const cross = (prev[0] - cx) * (st.to[1] - cy) - (prev[1] - cy) * (st.to[0] - cx);
        const sweep = st.sweep ?? (cross > 1e-12 ? 1 : cross < -1e-12 ? 0 : undefined);
        if (sweep === undefined) throw new Error(`${name}: half-turn arc to (${st.to}) needs a sweep`);
        return { centre: P(st.c), sweep };
      };
      steps.slice(1).forEach((st, i) => {
        const isLast = i === steps.length - 2;
        const to = 'to' in st ? st.to : st;
        const arc = 'to' in st ? arcOf(st) : undefined;
        if (opts.closed && isLast && to[0] === first[0] && to[1] === first[1]) {
          run({ type: 'closeShape', shapeId: id, ...(arc ? { arc } : {}), ...(opts.stroke ? { asFill: false } : {}) });
        } else {
          run({ type: 'appendPoint', shapeId: id, at: P(to), ...(arc ? { arc } : {}) });
          if (opts.closed && isLast) run({ type: 'closeShape', shapeId: id, ...(opts.stroke ? { asFill: false } : {}) });
        }
        prev = to;
      });
      if (opts.closed && steps.length === 2) run({ type: 'closeShape', shapeId: id });
      const vs = lastShape().path.vertices;
      (opts.corners ?? []).forEach((c, i) => {
        const [type, r] = typeof c === 'number' ? (['round', c] as [CornerType, number]) : c;
        if (r > 0) run({ type: 'setRadius', vertexIds: [vs[i]!.id], radius: Math.round(r * LEN) });
        if (type !== 'round') run({ type: 'setCorner', vertexIds: [vs[i]!.id], corner: type });
      });
      if (opts.role && opts.role !== 'add') run({ type: 'setRole', shapeId: id, role: opts.role });
      const paint = lastShape().paint;
      if (opts.cap && paint.kind === 'stroke' && paint.cap !== opts.cap) run({ type: 'setPaint', shapeId: id, paint: { ...paint, cap: opts.cap } });
    },
    circle(x: number, y: number, r: number, role: 'add' | 'cut' | 'intersect' = 'add') {
      run({ type: 'addShape', at: L(x, y) });
      run({ type: 'setRadius', vertexIds: [lastShape().path.vertices[0]!.id], radius: Math.round(r * LEN) });
      if (role !== 'add') run({ type: 'setRole', shapeId: lastShape().id, role });
    },
    run,
    lastShape,
    get doc() { return doc; },
  };
}
