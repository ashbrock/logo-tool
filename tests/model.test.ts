/** Document model: commands, invariants, P3 (exact undo/redo), P8 (project round trip), and a first rebuild. */
import fc from 'fast-check';
import { contourArea } from '../src/geometry/contour';
import { lattice } from '../src/geometry/lattice';
import { defaultGrid, type GridDef } from '../src/grids';
import { apply, type Command } from '../src/model/commands';
import { dispatch, initHistory, redo, undo, type History } from '../src/model/history';
import { emptyDocument, type LogoDocument } from '../src/model/types';
import { validateDocument } from '../src/model/validate';
import { parseProject, serialize } from '../src/persist/project';
import { evaluateDocument } from '../src/pipeline/resolve';
import { writePath } from '../src/export/write-path';
import { engine } from './paper-engine';

const RUNS = Number(process.env.FC_RUNS ?? 200);
const sq = (w: number, h: number, sub: 1 | 2 = 1): GridDef => ({ ...defaultGrid('square'), width: w, height: h, subdivision: sub } as GridDef);
const L = (u: number, v: number) => lattice(u, v);

function run(doc: LogoDocument, cmds: Command[]): LogoDocument {
  for (const c of cmds) {
    const r = apply(doc, c);
    if (!r.ok) throw new Error(`${c.type}: ${r.error}`);
    doc = r.doc;
  }
  return doc;
}

/** Build a closed polygon shape from lattice points; returns the doc and the new shape's id. */
function polygon(doc: LogoDocument, pts: [number, number][], role: 'add' | 'cut' = 'add'): LogoDocument {
  doc = run(doc, [{ type: 'addShape', at: L(...pts[0]!) }]);
  const id = doc.shapes[doc.shapes.length - 1]!.id;
  doc = run(doc, [...pts.slice(1).map((p) => ({ type: 'appendPoint', shapeId: id, at: L(...p) }) as Command), { type: 'closeShape', shapeId: id }]);
  return role === 'cut' ? run(doc, [{ type: 'setRole', shapeId: id, role: 'cut' }]) : doc;
}

describe('a first rebuild through the model: p-logo-1', () => {
  // The original: M125 500H0V375H125V500Z M375 125V250L250 375H125V250H0V125L125 0H250L375 125Z M125 250H250V125H125V250Z
  const shoelace = (pts: [number, number][]) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const originalArea = shoelace([[125, 500], [0, 500], [0, 375], [125, 375]])
    + shoelace([[375, 125], [375, 250], [250, 375], [125, 375], [125, 250], [0, 250], [0, 125], [125, 0], [250, 0]])
    - shoelace([[125, 250], [250, 250], [250, 125], [125, 125]]);
  const originalNodes = 20;

  let doc = emptyDocument(sq(3, 4));
  doc = polygon(doc, [[0, 3], [1, 3], [1, 4], [0, 4]]);
  doc = polygon(doc, [[3, 1], [3, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 0], [2, 0]]);
  doc = polygon(doc, [[1, 1], [2, 1], [2, 2], [1, 2]], 'cut');

  it('builds a valid document', () => expect(validateDocument(doc)).toEqual([]));

  it('matches the original’s area exactly and uses no more nodes', () => {
    const { mark, issues } = evaluateDocument(doc, engine);
    expect(issues).toEqual([]);
    expect(mark.errors).toEqual([]);
    const area = mark.pieces.reduce((a, p) => a + contourArea(p.outer) + p.holes.reduce((b, h) => b + contourArea(h), 0), 0);
    expect(area * 125 * 125).toBeCloseTo(originalArea, 6);
    const d = writePath(mark.pieces.flatMap((p) => [p.outer, ...p.holes]), { scale: 125, precision: 3 });
    const nodes = (d.match(/[MLHVA]/g) ?? []).length;
    expect(nodes).toBeLessThanOrEqual(originalNodes);
    expect(d).toMatch(/^[MHVLZ0-9 ]+$/); // whole numbers only, like the original
  });
});

describe('commands', () => {
  it('refuses invalid edits without changing the document', () => {
    const doc = run(emptyDocument(sq(4, 4)), [{ type: 'addShape', at: L(1, 1) }]);
    const id = doc.shapes[0]!.id;
    expect(apply(doc, { type: 'appendPoint', shapeId: id, at: L(1, 1) })).toEqual({ ok: false, error: 'There’s already a point here.' });
    expect(apply(doc, { type: 'addShape', at: L(9, 9) })).toEqual({ ok: false, error: 'That point is outside the grid.' });
    expect(apply(doc, { type: 'closeShape', shapeId: id }).ok).toBe(false);
  });

  it('only accepts arcs whose ends are equidistant from a lattice centre', () => {
    const doc = run(emptyDocument(sq(4, 4)), [{ type: 'addShape', at: L(0, 2) }]);
    const id = doc.shapes[0]!.id;
    expect(apply(doc, { type: 'appendPoint', shapeId: id, at: L(4, 2), arc: { centre: L(2, 2), sweep: 1 } }).ok).toBe(true);
    expect(apply(doc, { type: 'appendPoint', shapeId: id, at: L(4, 2), arc: { centre: L(1, 2), sweep: 1 } })).toEqual({ ok: false, error: 'No lattice centre fits this arc.' });
  });

  it('turns an arc straight when a move breaks its equidistance (SPEC.md §9.6)', () => {
    let doc = run(emptyDocument(sq(4, 4)), [{ type: 'addShape', at: L(0, 2) }]);
    const id = doc.shapes[0]!.id;
    doc = run(doc, [{ type: 'appendPoint', shapeId: id, at: L(4, 2), arc: { centre: L(2, 2), sweep: 1 } }]);
    const v = doc.shapes[0]!.path.vertices[1]!.id;
    doc = run(doc, [{ type: 'moveVertices', vertexIds: [v], du: 0, dv: 1 }]);
    expect(doc.shapes[0]!.path.segments[0]).toEqual({ kind: 'line' });
  });

  it('merges a point dropped on its neighbour (SPEC.md §9.1)', () => {
    let doc = polygon(emptyDocument(sq(4, 4)), [[0, 0], [2, 0], [3, 0], [3, 3], [0, 3]]);
    const v = doc.shapes[0]!.path.vertices[2]!.id; // (3, 0)
    doc = run(doc, [{ type: 'moveVertices', vertexIds: [v], du: -1, dv: 0 }]);
    expect(doc.shapes[0]!.path.vertices.map((x) => [x.at.u, x.at.v])).toEqual([[0, 0], [2, 0], [3, 3], [0, 3]]);
    expect(doc.shapes[0]!.path.segments).toHaveLength(4);
  });

  it('deleting a point joins its neighbours with a line; deleting all points removes the shape', () => {
    let doc = polygon(emptyDocument(sq(4, 4)), [[0, 0], [3, 0], [3, 3], [0, 3]]);
    const vs = doc.shapes[0]!.path.vertices.map((v) => v.id);
    doc = run(doc, [{ type: 'deleteVertices', vertexIds: [vs[1]!] }]);
    expect(doc.shapes[0]!.path.vertices).toHaveLength(3);
    expect(doc.shapes[0]!.path.closed).toBe(true);
    doc = run(doc, [{ type: 'deleteVertices', vertexIds: vs }]);
    expect(doc.shapes).toHaveLength(0);
  });

  it('changes subdivision only when every point stays exact', () => {
    const doc = polygon(emptyDocument(sq(4, 4)), [[0, 0], [3, 0], [3, 3]]);
    const finer = run(doc, [{ type: 'setGrid', grid: sq(4, 4, 2) }]);
    expect(finer.shapes[0]!.path.vertices.map((v) => [v.at.u, v.at.v])).toEqual([[0, 0], [6, 0], [6, 6]]);
    const odd = polygon(emptyDocument(sq(4, 4, 2)), [[0, 0], [3, 0], [3, 3]]);
    // (0, 0) still lands; (3, 0) and (3, 3) are half-cells on the coarser grid.
    expect(apply(odd, { type: 'setGrid', grid: sq(4, 4, 1) })).toEqual({ ok: false, error: '2 points wouldn’t land on the new grid.' });
    expect(apply(doc, { type: 'setGrid', grid: defaultGrid('polar') }).ok).toBe(false);
  });
});

// ---- Random command sequences ----------------------------------------------------------------------

/** Abstract steps, resolved against the current document so every generated command is plausible. */
const stepArb = fc.oneof(
  fc.record({ k: fc.constant('add' as const), u: fc.integer({ min: 0, max: 6 }), v: fc.integer({ min: 0, max: 6 }) }),
  fc.record({ k: fc.constant('append' as const), s: fc.nat(), u: fc.integer({ min: 0, max: 6 }), v: fc.integer({ min: 0, max: 6 }) }),
  fc.record({ k: fc.constant('close' as const), s: fc.nat() }),
  fc.record({ k: fc.constant('move' as const), s: fc.nat(), i: fc.nat(), du: fc.integer({ min: -2, max: 2 }), dv: fc.integer({ min: -2, max: 2 }) }),
  fc.record({ k: fc.constant('corner' as const), s: fc.nat(), i: fc.nat(), c: fc.constantFrom('auto', 'outer', 'round', 'inward') as fc.Arbitrary<'auto'> }),
  fc.record({ k: fc.constant('radius' as const), s: fc.nat(), i: fc.nat(), r: fc.integer({ min: 0, max: 240 }) }),
  fc.record({ k: fc.constant('role' as const), s: fc.nat(), r: fc.constantFrom('add', 'cut', 'intersect') as fc.Arbitrary<'add'> }),
  fc.record({ k: fc.constant('delete' as const), s: fc.nat(), i: fc.nat() }),
  fc.record({ k: fc.constant('repeat' as const), s: fc.nat(), n: fc.integer({ min: 2, max: 8 }) }),
);
type Step = typeof stepArb extends fc.Arbitrary<infer T> ? T : never;

function toCommand(doc: LogoDocument, st: Step): Command | null {
  const pick = <T,>(xs: readonly T[], i: number) => (xs.length ? xs[i % xs.length]! : null);
  if (st.k === 'add') return { type: 'addShape', at: L(st.u, st.v) };
  const s = pick(doc.shapes, st.s);
  if (!s) return null;
  const v = 'i' in st ? pick(s.path.vertices, st.i) : null;
  switch (st.k) {
    case 'append': return { type: 'appendPoint', shapeId: s.id, at: L(st.u, st.v) };
    case 'close': return { type: 'closeShape', shapeId: s.id };
    case 'move': return v && { type: 'moveVertices', vertexIds: [v.id], du: st.du, dv: st.dv };
    case 'corner': return v && { type: 'setCorner', vertexIds: [v.id], corner: st.c };
    case 'radius': return v && { type: 'setRadius', vertexIds: [v.id], radius: st.r };
    case 'role': return { type: 'setRole', shapeId: s.id, role: st.r };
    case 'delete': return v && { type: 'deleteVertices', vertexIds: [v.id] };
    case 'repeat': return { type: 'setRepeat', shapeId: s.id, repeat: { kind: 'rotate', centre: L(3, 3), count: st.n, mirrored: false } };
  }
}

function runSteps(steps: Step[]): History {
  let h = initHistory(emptyDocument(sq(6, 6)));
  for (const st of steps) {
    const c = toCommand(h.present.doc, st);
    if (!c) continue;
    h = dispatch(h, c).history;
    expect(validateDocument(h.present.doc)).toEqual([]); // invariants hold after every command
  }
  return h;
}

describe('P3: exact undo and redo', () => {
  it('undo k then redo k returns the identical document; undo all returns the start', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 30 }), fc.nat(), (steps, kRaw) => {
        const h = runSteps(steps);
        const n = h.past.length, k = n === 0 ? 0 : kRaw % (n + 1);
        let x = h;
        for (let i = 0; i < k; i++) x = undo(x);
        for (let i = 0; i < k; i++) x = redo(x);
        expect(x.present.doc).toBe(h.present.doc);
        expect(JSON.stringify(x.present.doc)).toBe(JSON.stringify(h.present.doc));
        let y = h;
        for (let i = 0; i < n; i++) y = undo(y);
        const start = n > 0 ? h.past[0]!.doc : h.present.doc;
        expect(y.present.doc).toBe(start); // the identical starting object, not just an equal one
        expect(y.past).toHaveLength(0);
        expect(y.present.doc.shapes).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it('a new command after undo clears redo', () => {
    let h = runSteps([{ k: 'add', u: 1, v: 1 }, { k: 'add', u: 2, v: 2 }]);
    h = undo(h);
    expect(h.future).toHaveLength(1);
    h = dispatch(h, { type: 'addShape', at: L(3, 3) }).history;
    expect(h.future).toHaveLength(0);
  });

  it('a drag coalesces into one history entry', () => {
    let h = runSteps([{ k: 'add', u: 1, v: 1 }]);
    const v = h.present.doc.shapes[0]!.path.vertices[0]!.id;
    const before = h.past.length;
    for (let t = 0; t < 5; t++) h = dispatch(h, { type: 'moveVertices', vertexIds: [v], du: 1, dv: 0 }, { key: 'drag-1', at: t * 16 }).history;
    expect(h.past.length).toBe(before + 1);
    expect(undo(h).present.doc.shapes[0]!.path.vertices[0]!.at).toEqual(L(1, 1));
  });
});

describe('P8: project files round-trip', () => {
  it('save then open gives a deep-equal document', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 30 }), (steps) => {
        const doc = runSteps(steps).present.doc;
        const back = parseProject(serialize(doc));
        expect(back.ok).toBe(true);
        if (back.ok) expect(back.doc).toEqual(doc);
      }),
      { numRuns: RUNS },
    );
  });

  it('refuses files that are not ours, are newer, or are invalid', () => {
    expect(parseProject('nope')).toEqual({ ok: false, error: 'This file isn’t valid JSON.' });
    expect(parseProject('{"app":"other"}').ok).toBe(false);
    expect(parseProject(JSON.stringify({ app: 'logo-tool', schema: 99, doc: {} }))).toEqual({ ok: false, error: 'This file was made by a newer version of the tool.' });
    const bad = { ...emptyDocument(sq(2, 2)), shapes: [{ id: 's1', path: { vertices: [{ id: 'v2', at: { u: 9, v: 9 }, corner: 'round', radius: 0 }], segments: [], closed: false }, paint: { kind: 'fill' }, role: 'add', repeat: { kind: 'none' }, jointRadius: 0 }] };
    expect(parseProject(JSON.stringify({ app: 'logo-tool', schema: 1, doc: bad })).ok).toBe(false);
  });
});
