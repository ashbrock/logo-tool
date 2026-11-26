/**
 * First playable (SPEC.md §4.1): rail + canvas + hint line on a square grid. Place, close, select,
 * drag, box-select, corner type, radius, add/cut, undo/redo, paper preview. Autosaves to browser
 * storage when it can.
 */
import { useEffect, useMemo, useReducer, useRef } from 'preact/hooks';
import paper from 'paper/dist/paper-core';
import { defaultGrid, gridSize, nearest, SUBDIVISIONS, toPlane, type GridDef, type Subdivision } from '../grids';
import { makePaperEngine } from '../boolean/paper-adapter';
import { evaluateDocument } from '../pipeline/resolve';
import { emptyDocument, LEN, type LogoDocument, type Repeat, type Vertex } from '../model/types';
import { lattice, type Lattice } from '../geometry/lattice';
import type { CornerType } from '../geometry/corners';
import { parseProject, serialize } from '../persist/project';
import { Canvas } from '../render/Canvas';
import { EXAMPLES } from '../examples';
import { initState, reducer, type UiState } from './state';
import { ExportDialog } from './ExportDialog';
import { NewMarkDialog } from './NewMarkDialog';
import { buildSvg, exportProblems, finishSvg } from '../export/svg';
import { loadSvgo, svgoNow } from '../export/svgo-loader';
import { copySvg } from './clipboard';
import { radiusStep, stepRadius } from './steps';
import { LengthField } from './LengthField';
import { formatCells } from './cells';
import { download, fileStem } from '../export/png';

const engine = makePaperEngine(paper as unknown as typeof import('paper'));
const STORAGE_KEY = 'logo-tool:doc';
const CORNERS: CornerType[] = ['auto', 'outer', 'round', 'inward'];

function loadInitial(): { doc: LogoDocument; autosave: boolean; fresh: boolean } {
  const fresh = emptyDocument({ ...defaultGrid('square'), width: 8, height: 8, subdivision: 2 } as GridDef);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const r = parseProject(raw);
      if (r.ok) return { doc: r.doc, autosave: true, fresh: false };
    }
    localStorage.setItem(STORAGE_KEY + ':probe', '1');
    localStorage.removeItem(STORAGE_KEY + ':probe');
    return { doc: fresh, autosave: true, fresh: true };
  } catch {
    return { doc: fresh, autosave: false, fresh: true };
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
  if (s.pickCentre) return 'Click a grid point for the repeat centre · Esc cancels';
  if (s.paperPreview) return 'Paper preview · \\ to return to the canvas';
  if (s.mode === 'place') {
    if (s.placing && s.arcPreview) {
      return s.arcPreview.count === 0
        ? 'Arc: no lattice point is the same distance from both ends, so this segment would be straight · A for lines'
        : `Arc: centre ${s.arcPreview.index + 1} of ${s.arcPreview.count} · Tab next, Shift+Tab previous · click to place · A for lines`;
    }
    if (s.placing) return 'Click to add a point · A for arcs (or Alt-click) · Click the first point (or C) to close as a shape · Enter keeps it as a line';
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
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // Dialogs handle their own keys while focus is inside them; Esc closes one wherever focus is.
      if (state.dialog) { if (e.key === 'Escape') { e.preventDefault(); dispatch({ type: 'dialog', value: null }); } return; }
      const mod = e.metaKey || e.ctrlKey;
      const sel = selectedVertices(state);
      const sub = doc.grid.subdivision;
      const step = radiusStep(sub, e.shiftKey);
      const k = e.key;
      const run = (command: Parameters<typeof dispatch>[0]) => { e.preventDefault(); dispatch(command); };
      if (mod && k.toLowerCase() === 'z') return run({ type: e.shiftKey ? 'redo' : 'undo' });
      if (mod && k.toLowerCase() === 'y') return run({ type: 'redo' });
      if (mod && k.toLowerCase() === 'a') {
        // Select all points of the selected shape(s), or every point with Shift (SPEC.md §8).
        const shapes = e.shiftKey || selectedShapeIds(state).length === 0 ? doc.shapes : doc.shapes.filter((sh) => selectedShapeIds(state).includes(sh.id));
        return run({ type: 'select', ids: shapes.flatMap((sh) => sh.path.vertices.map((v) => v.id)) });
      }
      if (mod && k.toLowerCase() === 'e') return run({ type: 'dialog', value: 'export' });
      if (mod && k.toLowerCase() === 's') { e.preventDefault(); saveProject(doc); return; }
      if (mod && k.toLowerCase() === 'o') { e.preventDefault(); fileInput.current?.click(); return; }
      if (mod && e.shiftKey && k.toLowerCase() === 'c') { e.preventDefault(); void quickCopy(); return; }
      if (mod) return;
      if (k === 'p' || k === 'P') return run({ type: 'mode', mode: 'place' });
      if (k === 'v' || k === 'V') return run({ type: 'mode', mode: 'adjust' });
      if (k === '\\') return run({ type: 'paperPreview' });
      if (k === 'Escape') {
        if (state.pickCentre) return run({ type: 'pickCentre', shapeIds: null });
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
        if (k === 'a' || k === 'A') return run({ type: 'arcArm' });
        if (k === 'Tab' && state.arcPreview) return run({ type: 'arcCycle', delta: e.shiftKey ? -1 : 1 });
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
      if (e.altKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        // Joint radius (matched by key position: Alt+[ types another character on a Mac).
        e.preventDefault();
        for (const id of selectedShapeIds(state)) {
          const sh = doc.shapes.find((x) => x.id === id)!;
          dispatch({ type: 'command', command: { type: 'setJointRadius', shapeId: id, value: stepRadius(sh.jointRadius, e.code === 'BracketRight' ? 1 : -1, step) }, label: 'Joint radius', key: `joint-${id}`, at: performance.now() });
        }
        return;
      }
      if (k === ']' || k === '[' || k === '}' || k === '{') {
        const cur = typeof sel[0]!.radius === 'number' ? sel[0]!.radius : 0;
        const r = stepRadius(cur, k === ']' || k === '}' ? 1 : -1, step);
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

  // Project files (SPEC.md §6.11): Save downloads <name>.logo.json; Open replaces the mark, undoably.
  const fileInput = useRef<HTMLInputElement>(null);
  const openProject = async (file: File) => {
    const r = parseProject(await file.text());
    if (!r.ok) { dispatch({ type: 'status', text: `Couldn’t open ${file.name}: ${r.error}`, tone: 'error' }); return; }
    dispatch({ type: 'command', command: { type: 'replace', doc: r.doc }, label: `Open ${file.name}` });
    dispatch({ type: 'dialog', value: null });
    dispatch({ type: 'mode', mode: 'adjust' });
    dispatch({ type: 'status', text: `Opened ${file.name}. Undo to go back.` });
  };

  // First visit: start by choosing a grid (SPEC.md §4.2).
  useEffect(() => { if (initial.fresh) dispatch({ type: 'dialog', value: 'new' }); }, []);
  const firstVisit = useRef(initial.fresh);

  const createMark = (grid: GridDef) => {
    firstVisit.current = false;
    dispatch({ type: 'command', command: { type: 'replace', doc: emptyDocument(grid, 'Untitled mark') }, label: 'New mark' });
    dispatch({ type: 'dialog', value: null });
    dispatch({ type: 'mode', mode: 'place' });
  };
  const openExample = (id: string) => {
    const ex = EXAMPLES.find((x) => x.id === id);
    if (!ex) return;
    firstVisit.current = false;
    dispatch({ type: 'command', command: { type: 'replace', doc: ex.build() }, label: `Open ${ex.name}` });
    dispatch({ type: 'dialog', value: null });
    dispatch({ type: 'mode', mode: 'adjust' });
    dispatch({ type: 'status', text: `${ex.name}: ${ex.note} Undo to go back.` });
  };

  // Load SVGO once the app is idle, so Copy SVG can write to the clipboard inside the click.
  useEffect(() => {
    const start = () => void loadSvgo();
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(start); else setTimeout(start, 1500);
  }, []);

  /** Copy SVG from the canvas with the current export settings (SPEC.md §6.10 step 3). */
  const quickCopy = async () => {
    const st = live.current, d = st.history.present.doc;
    const ev = evaluateDocument(d, engine);
    const problems = exportProblems(d, ev);
    if (problems.length) { dispatch({ type: 'status', text: problems[0]!.text, tone: 'error' }); return; }
    const optimize = svgoNow() ?? (await loadSvgo());
    const ok = await copySvg(finishSvg(buildSvg(d, ev).svg, optimize));
    if (ok) dispatch({ type: 'status', text: 'SVG copied to the clipboard.' });
    else dispatch({ type: 'dialog', value: 'export' });
  };

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
  const same = <T,>(xs: T[]) => (xs.length && xs.every((x) => x === xs[0]) ? xs[0] : undefined);
  const corner = same(sel.map((v) => v.corner));
  const radius240 = same(sel.map((v) => (typeof v.radius === 'number' ? v.radius : 0)));
  const shapes = doc.shapes.filter((sh) => shapeIds.includes(sh.id));

  const setGrid = (patch: Partial<{ width: number; height: number; subdivision: Subdivision; rings: number }>) =>
    dispatch({ type: 'command', command: { type: 'setGrid', grid: { ...g, ...patch } as GridDef }, label: 'Grid' });

  const blocked = exportProblems(doc, evaluated);
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
            <button type="button" class="btn" onClick={() => dispatch({ type: 'dialog', value: 'new' })} title="Start a new mark on any grid type">New…</button>
            <button type="button" class="btn" onClick={() => fileInput.current?.click()} title="Open a .logo.json project file (⌘O)">Open…</button>
            <button type="button" class="btn" onClick={() => saveProject(doc)} title="Save this mark as a .logo.json project file (⌘S)">Save</button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void openProject(f); }} />
          </div>
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
          <p class="value">{gridLabel(g)}</p>
          <div class="row">
            {g.kind === 'affine' && g.preset !== 'typographic' ? (
              <label class="field">Size
                <select id="grid-size" value={g.width === g.height ? g.width : ''} onChange={(e) => { const n = Number((e.target as HTMLSelectElement).value); setGrid({ width: n, height: n }); (e.target as HTMLSelectElement).blur(); }}>
                  {g.width !== g.height ? <option value="">{g.width} × {g.height}</option> : null}
                  {[4, 6, 8, 10, 12, 16, 20, 24].map((n) => <option value={n}>{n} × {n}</option>)}
                </select>
              </label>
            ) : null}
            {g.kind === 'polar' ? (
              <label class="field">Rings
                <select id="grid-rings" value={g.rings} onChange={(e) => { setGrid({ rings: Number((e.target as HTMLSelectElement).value) }); (e.target as HTMLSelectElement).blur(); }}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option value={n}>{n}</option>)}
                </select>
              </label>
            ) : null}
            <label class="field">Steps
              <select id="grid-sub" value={g.subdivision} onChange={(e) => { setGrid({ subdivision: Number((e.target as HTMLSelectElement).value) as Subdivision }); (e.target as HTMLSelectElement).blur(); }}>
                {SUBDIVISIONS.map((n) => <option value={n}>{n === 1 ? 'whole' : `1/${n}`}</option>)}
              </select>
            </label>
          </div>
          {doc.shapes.length === 0 ? <button type="button" class="link" onClick={() => dispatch({ type: 'dialog', value: 'new' })}>Change grid type…</button> : null}
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
              <LengthField id="point-radius" label="radius" value={radius240} subdivision={g.subdivision} unitsPerCell={doc.export.unitsPerCell}
                onChange={(r) => dispatch({ type: 'command', command: { type: 'setRadius', vertexIds: sel.map((v) => v.id), radius: r }, label: 'Radius' })} />
            </>
          )}
        </section>

        <section class="group" aria-labelledby="shape-label">
          <h2 class="label" id="shape-label">Shape</h2>
          {!firstShape ? <p class="note">Select a point to set its shape’s role.</p> : (
            <>
            <p class="value">{firstShape.paint.kind === 'stroke' ? `Line · width ${formatCells(firstShape.paint.width)} cell` : 'Filled shape'}{shapeIds.length > 1 ? ` · ${shapeIds.length} shapes` : ''}</p>
            <div class="seg" role="group" aria-label="Role">
              {(['add', 'cut', 'intersect'] as const).map((r, i) => (
                <button type="button" aria-pressed={firstShape.role === r} aria-keyshortcuts={String(i + 1)} title={`${r} (${i + 1})`} onClick={() => shapeIds.forEach((id) => dispatch({ type: 'command', command: { type: 'setRole', shapeId: id, role: r }, label: 'Role' }))}>{r}</button>
              ))}
            </div>
            <RepeatControls repeat={firstShape.repeat} grid={g} centre={gridCentre(g)} picking={!!state.pickCentre} onPick={() => dispatch({ type: 'pickCentre', shapeIds: state.pickCentre ? null : shapeIds })} onChange={(repeat) => shapeIds.forEach((id) => dispatch({ type: 'command', command: { type: 'setRepeat', shapeId: id, repeat }, label: 'Repeat' }))} />
            <LengthField id="joint-radius" label="joint radius" value={same(shapes.map((sh) => sh.jointRadius))} subdivision={g.subdivision} unitsPerCell={doc.export.unitsPerCell}
              onChange={(v) => shapeIds.forEach((id) => dispatch({ type: 'command', command: { type: 'setJointRadius', shapeId: id, value: v }, label: 'Joint radius' }))} />
            <p class="note">Rounds the corners this shape makes where it meets the shapes before it.</p>
            </>
          )}
        </section>

        <section class="group" aria-labelledby="line-label">
          <h2 class="label" id="line-label">Lines</h2>
          <LengthField id="line-width" label="width" value={currentWidth} min={30} subdivision={g.subdivision} unitsPerCell={doc.export.unitsPerCell} onChange={setWidth} />
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
        <section class="group export-actions" aria-label="Export">
          <button type="button" class="btn primary" title="Export SVG or PNG (⌘E)" aria-keyshortcuts="Meta+E" onClick={() => dispatch({ type: 'dialog', value: 'export' })}>Export…</button>
          <button type="button" class="btn" disabled={blocked.length > 0} title={blocked[0]?.text ?? 'Copy the SVG with the current export settings (⌘⇧C)'} aria-keyshortcuts="Meta+Shift+C" onClick={() => void quickCopy()}>Copy SVG</button>
        </section>
      </aside>

      <main class="stage">
        <div class="canvas-wrap">
          <Canvas state={state} dispatch={dispatch} mark={evaluated.mark} construction={evaluated.construction} />
        </div>
        {state.dialog === 'new' ? (
          <NewMarkDialog firstVisit={firstVisit.current} onCreate={createMark} onExample={openExample}
            onClose={() => { firstVisit.current = false; dispatch({ type: 'dialog', value: null }); }} />
        ) : null}
        {state.dialog === 'export' ? (
          <ExportDialog doc={doc} evaluated={evaluated} dispatch={dispatch}
            onClose={() => dispatch({ type: 'dialog', value: null })}
            onShow={(id) => {
              const sh = doc.shapes.find((x) => x.id === id);
              dispatch({ type: 'dialog', value: null });
              dispatch({ type: 'mode', mode: 'adjust' });
              dispatch({ type: 'select', ids: sh ? sh.path.vertices.map((v) => v.id) : [] });
            }} />
        ) : null}
        <p class={`hint ${showStatus?.tone === 'error' ? 'error' : ''}`} aria-live="polite">{showStatus ? showStatus.text : hintFor(state)}</p>
      </main>
    </div>
  );
}

/** The lattice point nearest the grid's centre: the default repeat centre and mirror axis. */
function gridCentre(g: GridDef) {
  if (g.kind === 'polar') return lattice(0, 0);
  const { width, height } = gridSize(g);
  return nearest({ x: width / 2, y: height / 2 }, g);
}

function gridLabel(g: GridDef): string {
  const steps = g.subdivision === 1 ? 'whole cells' : `1/${g.subdivision} steps`;
  switch (g.preset) {
    case 'square': return `Square · ${g.width} × ${g.height}${g.slantDeg ? ` · slant ${g.slantDeg}°` : ''}${g.rotationDeg ? ` · ${g.rotationDeg}°` : ''} · ${steps}`;
    case 'triangular': return `Triangular · ${g.width} × ${g.height}${g.rotationDeg ? ` · ${g.rotationDeg}°` : ''} · ${steps}`;
    case 'isometric': return `Isometric ${g.ratio === 'true30' ? 'true 30°' : g.ratio} · ${g.width} × ${g.height} · ${steps}`;
    case 'typographic': return `Typographic · ${g.width} × ${g.height} · ${steps}`;
    case 'polar': return `Polar · ${g.rings} rings × ${g.rays} rays${g.companionSquare ? ' + square' : ''} · ${steps}`;
  }
}

/** A lattice point exactly below (vertical) or beside (horizontal) `p`, so a mirror line can pass through both, on any grid. */
function axisPoint(g: GridDef, p: Lattice, vertical: boolean): Lattice | null {
  const a = toPlane(p, g);
  for (const d of [1, 2, 3, 4, -1, -2, -3, -4]) {
    for (const k of [1 / g.subdivision, 1]) {
      const q = vertical ? { x: a.x, y: a.y + d * k } : { x: a.x + d * k, y: a.y };
      const n = nearest(q, g), b = toPlane(n, g);
      if (Math.hypot(b.x - q.x, b.y - q.y) < 1e-9 && !(n.u === p.u && n.v === p.v && n.layer === p.layer)) return n;
    }
  }
  return null;
}

function RepeatControls({ repeat, grid, centre, picking, onPick, onChange }: { repeat: Repeat; grid: GridDef; centre: Lattice; picking: boolean; onPick: () => void; onChange: (r: Repeat) => void }) {
  const sub = grid.subdivision;
  const mirror = (through: Lattice, vertical: boolean): Repeat | null => { const to = axisPoint(grid, through, vertical); return to ? { kind: 'mirror', through, to } : null; };
  const pick = <button type="button" class="btn" aria-pressed={picking} onClick={onPick} title="Then click a grid point on the canvas">{picking ? 'Click a point…' : repeat.kind === 'mirror' ? 'Set axis point' : 'Set centre'}</button>;
  const kinds = [['none', 'Off'], ['rotate', 'Rotate'], ['mirror', 'Mirror'], ['translate', 'Line']] as const;
  const start = (k: Repeat['kind']): Repeat =>
    k === 'rotate' ? { kind: 'rotate', centre, count: 4, mirrored: false }
      : k === 'mirror' ? (mirror(centre, true) ?? { kind: 'none' })
        : k === 'translate' ? { kind: 'translate', step: lattice(sub, 0), count: 3 }
          : { kind: 'none' };
  const count = (n: number) => Math.max(2, Math.min(360, n));
  return (
    <div class="repeat">
      <span class="label">Repeat</span>
      <div class="seg" role="group" aria-label="Repeat">
        {kinds.map(([k, label]) => <button type="button" aria-pressed={repeat.kind === k} onClick={() => repeat.kind !== k && onChange(start(k))}>{label}</button>)}
      </div>
      {repeat.kind === 'rotate' ? (
        <div class="row radius">
          <button type="button" class="btn" aria-label="Fewer copies" onClick={() => onChange({ ...repeat, count: count(repeat.count - 1) })}>−</button>
          <span class="value">×{repeat.count}</span>
          <button type="button" class="btn" aria-label="More copies" onClick={() => onChange({ ...repeat, count: count(repeat.count + 1) })}>+</button>
          <button type="button" class="btn" aria-pressed={repeat.mirrored} onClick={() => onChange({ ...repeat, mirrored: !repeat.mirrored })}>Mirror</button>
        </div>
      ) : null}
      {repeat.kind === 'rotate' || repeat.kind === 'mirror' ? pick : null}
      {repeat.kind === 'mirror' ? (
        <div class="seg" role="group" aria-label="Mirror axis">
          {([true, false] as const).map((vertical) => {
            const a = toPlane(repeat.through, grid), b = toPlane(repeat.to, grid);
            const on = vertical ? Math.abs(a.x - b.x) < 1e-9 : Math.abs(a.y - b.y) < 1e-9;
            const next = mirror(repeat.through, vertical);
            return <button type="button" aria-pressed={on} disabled={!next} onClick={() => next && onChange(next)}>{vertical ? 'Vertical' : 'Horizontal'}</button>;
          })}
        </div>
      ) : null}
      {repeat.kind === 'translate' ? (
        <>
          <div class="row radius">
            <button type="button" class="btn" aria-label="Fewer copies" onClick={() => onChange({ ...repeat, count: count(repeat.count - 1) })}>−</button>
            <span class="value">×{repeat.count}</span>
            <button type="button" class="btn" aria-label="More copies" onClick={() => onChange({ ...repeat, count: count(repeat.count + 1) })}>+</button>
          </div>
          {(['u', 'v'] as const).map((axis) => (
            <div class="row radius">
              <button type="button" class="btn" aria-label={`Step ${axis === 'u' ? 'left' : 'up'}`} onClick={() => { const s = { ...repeat.step, [axis]: repeat.step[axis] - 1 }; if (s.u !== 0 || s.v !== 0) onChange({ ...repeat, step: lattice(s.u, s.v) }); }}>−</button>
              <span class="value">{axis === 'u' ? 'step x' : 'step y'} {formatCells((repeat.step[axis] / sub) * LEN)}</span>
              <button type="button" class="btn" aria-label={`Step ${axis === 'u' ? 'right' : 'down'}`} onClick={() => { const s = { ...repeat.step, [axis]: repeat.step[axis] + 1 }; if (s.u !== 0 || s.v !== 0) onChange({ ...repeat, step: lattice(s.u, s.v) }); }}>+</button>
            </div>
          ))}
        </>
      ) : null}
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
  if (c.kind === 'clamped') return `A radius of ${formatCells(c.requested * LEN)} doesn’t fit; using ${formatCells(c.actual * LEN)}.`;
  if (c.kind === 'no-tangent') return `A radius of ${formatCells(c.requested * LEN)} swallows its neighbour. Reduce it below ${formatCells(c.maxRadius * LEN)}.`;
  return 'This shape can’t be drawn yet.';
}

function saveProject(doc: LogoDocument) {
  download(new Blob([serialize(doc)], { type: 'application/json' }), `${fileStem(doc.name)}.logo.json`);
}
