/**
 * First playable (SPEC.md §4.1): rail + canvas + hint line on a square grid. Place, close, select,
 * drag, box-select, corner type, radius, add/cut, undo/redo, paper preview. Autosaves to browser
 * storage when it can.
 */
import { useEffect, useMemo, useReducer, useRef } from 'preact/hooks';
import paper from 'paper/dist/paper-core';
import { defaultGrid, type GridDef, type Subdivision } from '../grids';
import { makePaperEngine } from '../boolean/paper-adapter';
import { evaluateDocument } from '../pipeline/resolve';
import { emptyDocument, LEN, type LogoDocument, type Vertex } from '../model/types';
import type { CornerType } from '../geometry/corners';
import { parseProject, serialize } from '../persist/project';
import { Canvas } from '../render/Canvas';
import { EXAMPLES } from '../examples';
import { initState, reducer, type UiState } from './state';

const engine = makePaperEngine(paper as unknown as typeof import('paper'));
const STORAGE_KEY = 'logo-tool:doc';
const CORNERS: CornerType[] = ['auto', 'outer', 'round', 'inward'];

function loadInitial(): { doc: LogoDocument; autosave: boolean } {
  const fresh = emptyDocument({ ...defaultGrid('square'), width: 8, height: 8, subdivision: 2 } as GridDef);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const r = parseProject(raw);
      if (r.ok) return { doc: r.doc, autosave: true };
    }
    localStorage.setItem(STORAGE_KEY + ':probe', '1');
    localStorage.removeItem(STORAGE_KEY + ':probe');
    return { doc: fresh, autosave: true };
  } catch {
    return { doc: fresh, autosave: false };
  }
}

const initial = loadInitial();

function selectedVertices(s: UiState): Vertex[] {
  const doc = s.history.present.doc;
  return doc.shapes.flatMap((sh) => sh.path.vertices.filter((v) => s.selection.includes(v.id)));
}
function selectedShapeIds(s: UiState): string[] {
  const doc = s.history.present.doc;
  return doc.shapes.filter((sh) => sh.path.vertices.some((v) => s.selection.includes(v.id))).map((sh) => sh.id);
}

function hintFor(s: UiState): string {
  if (s.paperPreview) return 'Paper preview · \\ to return to the canvas';
  if (s.mode === 'place') {
    if (s.placing) return 'Click to add a point · Click the first point (or C) to close as a shape · Enter keeps it as a line · Backspace removes the last point';
    return 'Click a grid point to start a line · Ctrl snaps to whole cells · V to adjust · ⌘Z undo';
  }
  if (s.selection.length === 0) return 'Click a point · Drag to box-select · Shift adds · P to place points';
  return 'Drag the handle or [ ] for radius · R corner type · Arrows nudge · 1 add · 2 cut · Delete removes · P to draw';
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initial.doc, initState);
  const doc = state.history.present.doc;
  const evaluated = useMemo(() => evaluateDocument(doc, engine), [doc]);
  // The key handler is attached once and always reads the latest state. Re-attaching it per render
  // let fast key presses act on stale state (found by driving the app: R R ] ] ] lost presses).
  const live = useRef(state);
  live.current = state;

  // Autosave on every committed change (SPEC.md §6.11).
  useEffect(() => {
    if (!initial.autosave) return;
    const t = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, serialize(doc)); } catch { /* storage became unavailable */ } }, 500);
    return () => clearTimeout(t);
  }, [doc]);

  // Keyboard (SPEC.md §8), ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = live.current;
      const doc = state.history.present.doc;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const sel = selectedVertices(state);
      const sub = doc.grid.subdivision;
      const step = e.shiftKey ? LEN : LEN / sub;
      const k = e.key;
      const run = (command: Parameters<typeof dispatch>[0]) => { e.preventDefault(); dispatch(command); };
      if (mod && k.toLowerCase() === 'z') return run({ type: e.shiftKey ? 'redo' : 'undo' });
      if (mod && k.toLowerCase() === 'y') return run({ type: 'redo' });
      if (mod && k.toLowerCase() === 'a') {
        // Select all points of the selected shape(s), or every point with Shift (SPEC.md §8).
        const shapes = e.shiftKey || selectedShapeIds(state).length === 0 ? doc.shapes : doc.shapes.filter((sh) => selectedShapeIds(state).includes(sh.id));
        return run({ type: 'select', ids: shapes.flatMap((sh) => sh.path.vertices.map((v) => v.id)) });
      }
      if (mod) return;
      if (k === 'p' || k === 'P') return run({ type: 'mode', mode: 'place' });
      if (k === 'v' || k === 'V') return run({ type: 'mode', mode: 'adjust' });
      if (k === '\\') return run({ type: 'paperPreview' });
      if (k === 'Escape') {
        if (state.placing) return run({ type: 'placing', shapeId: null });
        return run({ type: 'select', ids: [] });
      }
      if (state.mode === 'place' && state.placing) {
        if (k === 'Enter') {
          // Finish here as a line (drawing is stroke-first, SPEC.md §6.3).
          e.preventDefault();
          const sh = doc.shapes.find((x) => x.id === state.placing);
          dispatch({ type: 'finishPlacing', selectShape: !!sh && sh.path.vertices.length >= 2 });
          return;
        }
        if (k === 'Backspace') {
          const sh = doc.shapes.find((x) => x.id === state.placing);
          const last = sh?.path.vertices[sh.path.vertices.length - 1];
          if (last) return run({ type: 'command', command: { type: 'deleteVertices', vertexIds: [last.id] }, label: 'Remove last point' });
        }
        if (k === 'c' || k === 'C') {
          // C closes as a filled shape; Shift+C closes as a line (a ring).
          e.preventDefault();
          dispatch({ type: 'command', command: { type: 'closeShape', shapeId: state.placing, asFill: !e.shiftKey }, label: 'Close shape', finish: true });
          return;
        }
      }
      if (sel.length === 0) return;
      const ids = sel.map((v) => v.id);
      if (k === 'r' || k === 'R') {
        const cur = CORNERS.indexOf(sel[0]!.corner);
        const next = CORNERS[(cur + (e.shiftKey ? CORNERS.length - 1 : 1)) % CORNERS.length]!;
        return run({ type: 'command', command: { type: 'setCorner', vertexIds: ids, corner: next }, label: 'Corner type' });
      }
      if (k === ']' || k === '[' || k === '}' || k === '{') {
        const cur = typeof sel[0]!.radius === 'number' ? sel[0]!.radius : 0;
        const r = Math.max(0, cur + (k === ']' || k === '}' ? step : -step));
        return run({ type: 'command', command: { type: 'setRadius', vertexIds: ids, radius: r }, label: 'Radius', key: `radius-${ids.join()}`, at: performance.now() });
      }
      if (k === '0') return run({ type: 'command', command: { type: 'setRadius', vertexIds: ids, radius: 0 }, label: 'Remove rounding' });
      if (k === 'Delete' || k === 'Backspace') return run({ type: 'command', command: { type: 'deleteVertices', vertexIds: ids }, label: 'Delete points' });
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const a = arrows[k];
      if (a) {
        const m = e.shiftKey ? sub : 1;
        return run({ type: 'command', command: { type: 'moveVertices', vertexIds: ids, du: a[0] * m, dv: a[1] * m }, label: 'Nudge', key: `nudge-${ids.join()}`, at: performance.now() });
      }
      if (k === '1' || k === '2' || k === '3') {
        e.preventDefault();
        const role = k === '1' ? 'add' : k === '2' ? 'cut' : 'intersect';
        for (const id of selectedShapeIds(state)) dispatch({ type: 'command', command: { type: 'setRole', shapeId: id, role }, label: 'Role' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Status messages fade after 4 s (SPEC.md §4.1).
  const showStatus = state.status && Date.now() - state.status.at < 4000 ? state.status : null;
  useEffect(() => {
    if (!state.status) return;
    const t = setTimeout(() => dispatch({ type: 'select', ids: state.selection }), 4000);
    return () => clearTimeout(t);
  }, [state.status]);

  const sel = selectedVertices(state);
  const shapeIds = selectedShapeIds(state);
  const firstShape = doc.shapes.find((s) => s.id === shapeIds[0]);
  const g = doc.grid;
  const radiusOf = (v: Vertex) => (typeof v.radius === 'number' ? v.radius : 0) / LEN;
  const same = <T,>(xs: T[]) => (xs.length && xs.every((x) => x === xs[0]) ? xs[0] : undefined);
  const corner = same(sel.map((v) => v.corner));
  const radius = same(sel.map(radiusOf));

  const setGrid = (patch: Partial<{ width: number; height: number; subdivision: Subdivision }>) =>
    dispatch({ type: 'command', command: { type: 'setGrid', grid: { ...g, ...patch } as GridDef }, label: 'Grid' });

  const issues = evaluated.issues.filter((i) => i.kind === 'corner' && i.issue.kind !== 'degenerate');
  // Line width: the selected line's width, else the width new lines will use.
  const strokeShapes = doc.shapes.filter((sh) => shapeIds.includes(sh.id) && sh.paint.kind === 'stroke');
  const currentWidth = strokeShapes[0]?.paint.kind === 'stroke' ? strokeShapes[0].paint.width : state.strokeWidth;
  const setWidth = (w: number) => {
    dispatch({ type: 'strokeWidth', value: w });
    for (const sh of strokeShapes) if (sh.paint.kind === 'stroke') dispatch({ type: 'command', command: { type: 'setPaint', shapeId: sh.id, paint: { ...sh.paint, width: w } }, label: 'Line width' });
  };

  return (
    <div class="app">
      <aside class="rail" aria-label="Controls">
        <header class="rail-head">
          <input class="mark-name" id="mark-name" aria-label="Mark name" value={doc.name} onChange={(e) => dispatch({ type: 'command', command: { type: 'rename', name: (e.target as HTMLInputElement).value }, label: 'Rename' })} />
          <div class="row">
            <button type="button" class="btn" disabled={state.history.past.length === 0} onClick={() => dispatch({ type: 'undo' })} aria-label="Undo">Undo</button>
            <button type="button" class="btn" disabled={state.history.future.length === 0} onClick={() => dispatch({ type: 'redo' })} aria-label="Redo">Redo</button>
          </div>
          <label class="field">Examples
            <select id="examples" value="" onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === (e.target as HTMLSelectElement).value);
              (e.target as HTMLSelectElement).value = '';
              (e.target as HTMLSelectElement).blur();
              if (!ex) return;
              dispatch({ type: 'command', command: { type: 'replace', doc: ex.build() }, label: `Open ${ex.name}` });
              dispatch({ type: 'mode', mode: 'adjust' });
              dispatch({ type: 'status', text: `${ex.name}: ${ex.note} Undo to go back.` });
            }}>
              <option value="">Open an example…</option>
              {EXAMPLES.map((x) => <option value={x.id}>{x.name}</option>)}
            </select>
          </label>
          {!initial.autosave ? <p class="note warn">Not autosaving in this browser.</p> : null}
        </header>

        <section class="group" aria-labelledby="grid-label">
          <h2 class="label" id="grid-label">Grid</h2>
          <p class="value">Square · {g.kind === 'affine' ? `${g.width} × ${g.height}` : ''} · {g.subdivision === 1 ? 'whole cells' : `1/${g.subdivision} steps`}</p>
          <div class="row">
            <label class="field">Size
              <select id="grid-size" value={g.kind === 'affine' ? g.width : 8} onChange={(e) => { const n = Number((e.target as HTMLSelectElement).value); setGrid({ width: n, height: n }); (e.target as HTMLSelectElement).blur(); }}>
                {[4, 6, 8, 10, 12, 16].map((n) => <option value={n}>{n} × {n}</option>)}
              </select>
            </label>
            <label class="field">Steps
              <select id="grid-sub" value={g.subdivision} onChange={(e) => { setGrid({ subdivision: Number((e.target as HTMLSelectElement).value) as Subdivision }); (e.target as HTMLSelectElement).blur(); }}>
                {[1, 2, 4, 8].map((n) => <option value={n}>{n === 1 ? 'whole' : `1/${n}`}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section class="group" aria-labelledby="mode-label">
          <h2 class="label" id="mode-label">Mode</h2>
          <div class="seg" role="group" aria-labelledby="mode-label">
            <button type="button" aria-pressed={state.mode === 'place'} onClick={() => dispatch({ type: 'mode', mode: 'place' })}>Place <kbd>P</kbd></button>
            <button type="button" aria-pressed={state.mode === 'adjust'} onClick={() => dispatch({ type: 'mode', mode: 'adjust' })}>Adjust <kbd>V</kbd></button>
          </div>
        </section>

        <section class="group" aria-labelledby="point-label">
          <h2 class="label" id="point-label">Point</h2>
          {sel.length === 0 ? <p class="note">Select a point to set its corner.</p> : (
            <>
              <p class="value">{sel.length === 1 ? `(${fmtCell(sel[0]!.at.u / g.subdivision)}, ${fmtCell(sel[0]!.at.v / g.subdivision)})` : `${sel.length} points`}</p>
              <div class="seg" role="group" aria-label="Corner type">
                {CORNERS.map((c) => (
                  <button type="button" aria-pressed={corner === c} onClick={() => dispatch({ type: 'command', command: { type: 'setCorner', vertexIds: sel.map((v) => v.id), corner: c }, label: 'Corner type' })}>{c === 'inward' ? 'in' : c}</button>
                ))}
              </div>
              <div class="row radius">
                <button type="button" class="btn" aria-label="Smaller radius" onClick={() => dispatch({ type: 'command', command: { type: 'setRadius', vertexIds: sel.map((v) => v.id), radius: Math.max(0, Math.round((radius ?? 0) * LEN) - LEN / g.subdivision) }, label: 'Radius' })}>−</button>
                <span class="value" aria-live="polite">r {radius === undefined ? 'mixed' : radius.toFixed(2)}</span>
                <button type="button" class="btn" aria-label="Larger radius" onClick={() => dispatch({ type: 'command', command: { type: 'setRadius', vertexIds: sel.map((v) => v.id), radius: Math.round((radius ?? 0) * LEN) + LEN / g.subdivision }, label: 'Radius' })}>+</button>
              </div>
            </>
          )}
        </section>

        <section class="group" aria-labelledby="shape-label">
          <h2 class="label" id="shape-label">Shape</h2>
          {!firstShape ? <p class="note">Select a point to set its shape’s role.</p> : (
            <>
            <p class="value">{firstShape.paint.kind === 'stroke' ? `Line · width ${(firstShape.paint.width / LEN).toFixed(2)}` : 'Filled shape'}{shapeIds.length > 1 ? ` · ${shapeIds.length} shapes` : ''}</p>
            {firstShape.repeat.kind !== 'none' ? <p class="note">{describeRepeat(firstShape.repeat)}</p> : null}
            <div class="seg" role="group" aria-label="Role">
              {(['add', 'cut', 'intersect'] as const).map((r, i) => (
                <button type="button" aria-pressed={firstShape.role === r} aria-keyshortcuts={String(i + 1)} title={`${r} (${i + 1})`} onClick={() => shapeIds.forEach((id) => dispatch({ type: 'command', command: { type: 'setRole', shapeId: id, role: r }, label: 'Role' }))}>{r}</button>
              ))}
            </div>
            <div class="row radius">
              <button type="button" class="btn" aria-label="Smaller joint radius" onClick={() => shapeIds.forEach((id) => dispatch({ type: 'command', command: { type: 'setJointRadius', shapeId: id, value: Math.max(0, firstShape.jointRadius - 10) }, label: 'Joint radius' }))}>−</button>
              <span class="value" title="Rounds the corners this shape creates where it meets others">joint {(firstShape.jointRadius / LEN).toFixed(2)}</span>
              <button type="button" class="btn" aria-label="Larger joint radius" onClick={() => shapeIds.forEach((id) => dispatch({ type: 'command', command: { type: 'setJointRadius', shapeId: id, value: firstShape.jointRadius + 10 }, label: 'Joint radius' }))}>+</button>
            </div>
            </>
          )}
        </section>

        <section class="group" aria-labelledby="line-label">
          <h2 class="label" id="line-label">Line width</h2>
          <div class="row radius">
            <button type="button" class="btn" aria-label="Thinner line" onClick={() => setWidth(Math.max(30, currentWidth - 30))}>−</button>
            <span class="value">{(currentWidth / LEN).toFixed(2)} cell</span>
            <button type="button" class="btn" aria-label="Thicker line" onClick={() => setWidth(currentWidth + 30)}>+</button>
          </div>
          <p class="note">New paths draw as lines at this width. Closing one makes a filled shape.</p>
        </section>

        <section class="group" aria-labelledby="view-label">
          <h2 class="label" id="view-label">View</h2>
          <button type="button" class="btn" aria-pressed={state.paperPreview} onClick={() => dispatch({ type: 'paperPreview' })}>Paper preview <kbd>\</kbd></button>
          <button type="button" class="btn" onClick={() => { if (doc.shapes.length) dispatch({ type: 'command', command: { type: 'replace', doc: emptyDocument(g, doc.name) }, label: 'Clear' }); }}>Clear mark</button>
        </section>

        {issues.length > 0 ? (
          <section class="group issues" aria-label="Problems">
            {issues.slice(0, 3).map((i) => <p class={i.kind === 'corner' && i.issue.kind === 'no-tangent' ? 'note bad' : 'note warn'}>{describe(i)}</p>)}
          </section>
        ) : null}
      </aside>

      <main class="stage">
        <div class="canvas-wrap">
          <Canvas state={state} dispatch={dispatch} mark={evaluated.mark} construction={evaluated.construction} />
        </div>
        <p class={`hint ${showStatus?.tone === 'error' ? 'error' : ''}`} aria-live="polite">{showStatus ? showStatus.text : hintFor(state)}</p>
      </main>
    </div>
  );
}

function describeRepeat(r: LogoDocument['shapes'][number]['repeat']): string {
  if (r.kind === 'rotate') return `Repeats ×${r.count} around a centre${r.mirrored ? ', mirrored' : ''}`;
  if (r.kind === 'translate') return `Repeats ×${r.count} along a line`;
  if (r.kind === 'mirror') return 'Mirrored';
  return '';
}

function fmtCell(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '');
}

function describe(i: ReturnType<typeof evaluateDocument>['issues'][number]): string {
  if (i.kind !== 'corner') return i.kind;
  const c = i.issue;
  if (c.kind === 'clamped') return `A radius of ${c.requested.toFixed(2)} doesn’t fit; using ${c.actual.toFixed(2)}.`;
  if (c.kind === 'no-tangent') return `A radius of ${c.requested.toFixed(2)} swallows its neighbour. Reduce it below ${c.maxRadius.toFixed(2)}.`;
  return 'This shape can’t be drawn yet.';
}

