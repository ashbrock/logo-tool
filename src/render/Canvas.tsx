/**
 * The canvas (SPEC.md §4.1, §7; DESIGN.md §2.2, §4, §6.1): one SVG drawn in cells. Snapping is instant
 * (no easing) with a small hysteresis so the preview doesn't flicker on cell boundaries. Strokes are
 * non-scaling; marker sizes are DESIGN.md screen pixels converted to cells.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import { latticeEq, type Lattice } from '../geometry/lattice';
import type { Vec2 } from '../geometry/num';
import { gridSize, latticePoints, nearest, toPlane } from '../grids';
import { gridLines, namedRows } from '../grids/lines';
import { writePath } from '../export/write-path';
import type { Mark } from '../pipeline/evaluate';
import type { ShapeConstruction } from '../pipeline/resolve';
import type { Action, UiState } from '../ui/state';
import { arcCandidates } from '../ui/arcs';
import { radiusStep } from '../ui/steps';
import { formatCells } from '../ui/cells';

const MARGIN = 1; // cells around the grid: room for the ruler
const ve = { 'vector-effect': 'non-scaling-stroke' } as Record<string, string>;

interface Props {
  state: UiState;
  dispatch: Dispatch<Action>;
  mark: Mark;
  construction: readonly ShapeConstruction[];
}

type Drag =
  | { kind: 'move'; ids: string[]; anchor: Lattice; applied: { du: number; dv: number }; key: string }
  | { kind: 'radius'; ids: string[]; start: number; fromX: number; key: string }
  | { kind: 'box'; from: Vec2; to: Vec2; additive: boolean };

export function Canvas({ state, dispatch, mark, construction }: Props) {
  const doc = state.history.present.doc;
  const g = doc.grid;
  const { width: W, height: H } = gridSize(g);
  // Typographic grids label their rows to the right, so they get two more cells there.
  const XR = g.kind === 'affine' && g.preset === 'typographic' ? 2 : 0;
  const svg = useRef<SVGSVGElement>(null);
  const [pxPerCell, setPx] = useState(48);
  const [snap, setSnap] = useState<Lattice | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [altHeld, setAlt] = useState(false);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPx(Math.min(r.width / (W + 2 * MARGIN + XR), r.height / (H + 2 * MARGIN)) || 48);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H, XR]);

  const px = (n: number) => n / pxPerCell;
  const P = (l: Lattice) => toPlane(l, g);

  const toCells = (e: PointerEvent | MouseEvent): Vec2 => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = el.getScreenCTM();
    const q = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: q.x, y: q.y };
  };

  /** Nearest lattice point, keeping the current one unless the new one is clearly closer (SPEC.md §7.1). */
  const snapTo = (q: Vec2, wholeOnly: boolean): Lattice => {
    const n = nearest(q, g, { wholeOnly });
    if (snap && !latticeEq(n, snap)) {
      const d = (p: Lattice) => Math.hypot(P(p).x - q.x, P(p).y - q.y);
      if (d(snap) - d(n) < 0.1 / g.subdivision) return snap;
    }
    return n;
  };

  const allVertices = doc.shapes.flatMap((s) => s.path.vertices.map((v, i) => ({ shape: s, v, i })));
  const hitVertex = (q: Vec2) => {
    let best: (typeof allVertices)[number] | null = null, bd = px(10);
    for (const x of allVertices) {
      const p = P(x.v.at), d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < bd) { bd = d; best = x; }
    }
    return best;
  };
  const placingShape = doc.shapes.find((s) => s.id === state.placing) ?? null;
  // Arc candidates for the next segment, while arc mode is armed or Alt is held (SPEC.md §6.3).
  const lastPlaced = placingShape?.path.vertices[placingShape.path.vertices.length - 1] ?? null;
  const arcOn = state.mode === 'place' && !!placingShape && (state.arcArmed || altHeld);
  const candidates = useMemo(() => (arcOn && lastPlaced && snap ? arcCandidates(g, lastPlaced.at, snap) : []), [arcOn, lastPlaced, snap, g]);
  const chosenArc = candidates.length ? candidates[((state.arcIndex % candidates.length) + candidates.length) % candidates.length]! : null;
  useEffect(() => {
    dispatch({ type: 'arcPreview', value: arcOn && snap && lastPlaced && !latticeEq(snap, lastPlaced.at) ? { count: candidates.length, index: candidates.length ? ((state.arcIndex % candidates.length) + candidates.length) % candidates.length : 0 } : null });
  }, [arcOn, candidates, state.arcIndex]);
  const LEN = 240;
  // The radius handle sits on the last selected point's selection ring, at its right (DESIGN.md §6.1).
  const handleFor = (): { anchor: Vec2; at: Vec2; ids: string[]; r: number } | null => {
    if (state.mode !== 'adjust' || state.paperPreview || state.selection.length === 0) return null;
    const last = allVertices.find((x) => x.v.id === state.selection[state.selection.length - 1]);
    if (!last) return null;
    // A line's end points have no corner to round.
    const path = last.shape.path;
    if (last.shape.paint.kind === 'stroke' && !path.closed && (last.i === 0 || last.i === path.vertices.length - 1)) return null;
    const anchor = P(last.v.at);
    // On the white selection ring (12 px), at its right-hand side.
    return { anchor, at: { x: anchor.x + px(12), y: anchor.y }, ids: [...state.selection], r: typeof last.v.radius === 'number' ? last.v.radius : 0 };
  };
  const handle = handleFor();

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // Working on the canvas takes keyboard focus back from the rail, so shortcuts work again.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const q = toCells(e);
    const at = snapTo(q, e.ctrlKey);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (state.pickCentre) {
      // Set the repeat centre (rotate) or the point the mirror line passes through, keeping its direction.
      for (const id of state.pickCentre) {
        const sh = doc.shapes.find((x) => x.id === id);
        const r = sh?.repeat;
        if (!sh || !r) continue;
        let repeat = null;
        if (r.kind === 'rotate') repeat = { ...r, centre: at };
        else if (r.kind === 'mirror') {
          // Keep the mirror line's direction: find a lattice point along it from the new point.
          const a = P(r.through), b = P(r.to), o = P(at), dir = { x: b.x - a.x, y: b.y - a.y };
          for (const k of [1, 2, 3, 4, 0.5, 0.25, -1, -2]) {
            const q = { x: o.x + dir.x * k, y: o.y + dir.y * k }, n = nearest(q, g), np = P(n);
            if (Math.hypot(np.x - q.x, np.y - q.y) < 1e-9 && !latticeEq(n, at)) { repeat = { ...r, through: at, to: n }; break; }
          }
          if (!repeat) dispatch({ type: 'status', text: 'No lattice point lies along the mirror line from there.', tone: 'error' });
        }
        if (repeat) dispatch({ type: 'command', command: { type: 'setRepeat', shapeId: id, repeat }, label: 'Repeat centre' });
      }
      dispatch({ type: 'pickCentre', shapeIds: null });
      return;
    }
    if (state.mode === 'place') {
      if (placingShape) {
        const first = placingShape.path.vertices[0]!;
        const wantArc = state.arcArmed || e.altKey;
        const arc = wantArc && chosenArc ? { centre: chosenArc.centre, sweep: chosenArc.sweep } : undefined;
        if (wantArc && !chosenArc) dispatch({ type: 'status', text: 'No lattice point is the same distance from both ends. This segment is straight.' });
        if (latticeEq(first.at, at) && placingShape.path.vertices.length >= (arc ? 2 : 3)) {
          // Closing on the first point makes a filled shape, then switches to Adjust with it selected.
          dispatch({ type: 'command', command: { type: 'closeShape', shapeId: placingShape.id, asFill: true, ...(arc ? { arc } : {}) }, label: 'Close shape', finish: true });
          dispatch({ type: 'arcArm', on: false });
          return;
        }
        dispatch({ type: 'command', command: { type: 'appendPoint', shapeId: placingShape.id, at, ...(arc ? { arc } : {}) }, label: arc ? 'Place arc' : 'Place point', select: 'last-vertex' });
      } else {
        // Drawing is stroke-first: a new path is a line at the current width until it is closed.
        dispatch({ type: 'command', command: { type: 'addShape', at, paint: 'stroke', width: state.strokeWidth }, label: 'Start shape', startPlacing: true, select: 'last-vertex' });
      }
      return;
    }
    if (handle && Math.hypot(q.x - handle.at.x, q.y - handle.at.y) < px(7)) {
      setDrag({ kind: 'radius', ids: handle.ids, start: handle.r, fromX: q.x, key: `radius-drag-${Date.now()}` });
      return;
    }
    const hit = hitVertex(q);
    if (hit) {
      const ids = e.shiftKey
        ? (state.selection.includes(hit.v.id) ? state.selection.filter((x) => x !== hit.v.id) : [...state.selection, hit.v.id])
        : state.selection.includes(hit.v.id) ? [...state.selection] : [hit.v.id];
      dispatch({ type: 'select', ids });
      if (!e.shiftKey) setDrag({ kind: 'move', ids, anchor: hit.v.at, applied: { du: 0, dv: 0 }, key: `drag-${Date.now()}` });
      return;
    }
    if (!e.shiftKey && !e.altKey) dispatch({ type: 'select', ids: [] });
    setDrag({ kind: 'box', from: q, to: q, additive: e.shiftKey });
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.altKey !== altHeld) setAlt(e.altKey);
    const q = toCells(e);
    const at = snapTo(q, e.ctrlKey);
    if (!snap || !latticeEq(at, snap)) setSnap(at);
    if (drag?.kind === 'move') {
      const du = at.u - drag.anchor.u, dv = at.v - drag.anchor.v;
      const step = { du: du - drag.applied.du, dv: dv - drag.applied.dv };
      if (step.du !== 0 || step.dv !== 0) {
        dispatch({ type: 'command', command: { type: 'moveVertices', vertexIds: drag.ids, du: step.du, dv: step.dv }, label: 'Move points', key: drag.key, at: performance.now() });
        setDrag({ ...drag, applied: { du, dv } });
      }
    } else if (drag?.kind === 'radius') {
      // Drag right to increase, left to decrease: one cell of drag is one cell of radius.
      // Snaps to 1/24 cell, or to the grid's sub-step with Shift.
      const step = radiusStep(sub, e.shiftKey);
      const r = Math.max(0, Math.round((drag.start + (q.x - drag.fromX) * LEN) / step) * step);
      dispatch({ type: 'command', command: { type: 'setRadius', vertexIds: drag.ids, radius: r }, label: 'Radius', key: drag.key, at: performance.now() });
    } else if (drag?.kind === 'box') setDrag({ ...drag, to: q });
  };

  const onPointerUp = () => {
    if (drag?.kind === 'box') {
      const x0 = Math.min(drag.from.x, drag.to.x), x1 = Math.max(drag.from.x, drag.to.x);
      const y0 = Math.min(drag.from.y, drag.to.y), y1 = Math.max(drag.from.y, drag.to.y);
      if (x1 - x0 > px(3) || y1 - y0 > px(3)) {
        const inside = allVertices.filter((x) => { const p = P(x.v.at); return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1; }).map((x) => x.v.id);
        dispatch({ type: 'select', ids: drag.additive ? [...new Set([...state.selection, ...inside])] : inside });
      }
    }
    setDrag(null);
  };

  // ---- drawing ----
  const paper = state.paperPreview;
  const sub = g.subdivision;
  // Lattice lines for any grid type (minor first, then major), polar rings, and typographic rows.
  const gl = useMemo(() => gridLines(g), [g]);
  const lines: preact.JSX.Element[] = [];
  for (const major of [false, true]) {
    const stroke = major ? 'var(--canvas-grid-major)' : 'var(--canvas-grid-minor)';
    gl.lines.forEach((l, i) => { if (l.major === major) lines.push(<line key={`l${major ? 'M' : 'm'}${i}`} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={stroke} stroke-width={1} {...ve} />); });
    gl.rings.forEach((r, i) => { if (r.major === major) lines.push(<circle key={`r${major ? 'M' : 'm'}${i}`} cx={r.centre.x} cy={r.centre.y} r={r.r} fill="none" stroke={stroke} stroke-width={1} {...ve} />); });
  }
  const rows = namedRows(g).map((r) => (
    <g key={`row${r.name}`}>
      <line x1={0} y1={r.y} x2={r.width} y2={r.y} stroke="var(--canvas-lattice)" stroke-width={1} stroke-dasharray="6 4" {...ve} />
      <text x={r.width + px(6)} y={r.y + px(4)} font-size={px(11)} fill="var(--canvas-ruler)" font-family="var(--font-mono)">{r.name}</text>
    </g>
  ));
  const crosses = latticePoints(g).map((l) => {
    const p = P(l), whole = l.u % sub === 0 && l.v % sub === 0, k = px(whole ? 5 : 3);
    return <path key={`c${l.u},${l.v}`} d={`M${p.x - k} ${p.y}H${p.x + k}M${p.x} ${p.y - k}V${p.y + k}`} stroke="var(--canvas-lattice)" stroke-width={1} opacity={whole ? 1 : 0.5} {...ve} />;
  });
  const ruler: preact.JSX.Element[] = [];
  for (let i = 0; i <= W; i++) ruler.push(<text key={`rx${i}`} x={i} y={-px(10)} font-size={px(11)} class="ruler-num" text-anchor="middle" fill="var(--canvas-ruler)" font-family="var(--font-mono)">{i}</text>);
  for (let j = 0; j <= H; j++) ruler.push(<text key={`ry${j}`} x={-px(10)} y={j + px(4)} font-size={px(11)} class="ruler-num" text-anchor="end" fill="var(--canvas-ruler)" font-family="var(--font-mono)">{j}</text>);

  const markD = writePath(mark.pieces.flatMap((p) => [p.outer, ...p.holes]), { scale: 1, precision: 5 });
  const cutOutlines = doc.shapes.filter((s) => s.role !== 'add').map((s) => {
    const c = construction.find((x) => x.shapeId === s.id);
    return c && c.contours.length ? <path key={`cut${s.id}`} d={writePath([...c.contours], { scale: 1, precision: 5 })} fill="none" stroke="var(--canvas-cut)" stroke-width={1.25} stroke-dasharray="6 4" {...ve} /> : null;
  });
  const invalid = construction.filter((c) => c.invalid).map((c) => {
    const s = doc.shapes.find((x) => x.id === c.shapeId);
    if (!s || s.path.vertices.length < 2) return null;
    const pts = s.path.vertices.map((v) => P(v.at));
    return <path key={`inv${c.shapeId}`} d={`M${pts.map((p) => `${p.x} ${p.y}`).join('L')}${s.path.closed ? 'Z' : ''}`} fill="none" stroke="var(--canvas-invalid)" stroke-width={1.25} stroke-dasharray="6 4" {...ve} />;
  });
  const circles = construction.flatMap((c) => c.circles.map((k, i) => {
    if (!k) return null;
    const dashed = k.kind === 'inward' || k.kind === 'cove';
    return (
      <g key={`k${c.shapeId}-${i}`}>
        <circle cx={k.centre.x} cy={k.centre.y} r={k.r} fill="none" stroke="var(--canvas-radius)" stroke-width={1.25} stroke-dasharray={dashed ? '4 3' : undefined} {...ve} />
        {k.kind === 'fillet' ? <circle cx={k.centre.x} cy={k.centre.y} r={px(1.5)} fill="var(--canvas-radius)" /> : null}
      </g>
    );
  }));
  // While placing, the line drawn so far is part of the mark (a real stroke at its width); the next
  // segment previews at the same width so diagonals and straights read the same.
  const placingPath = placingShape && placingShape.path.vertices.length > 0 && snap && state.mode === 'place' ? (() => {
    const last = P(placingShape.path.vertices[placingShape.path.vertices.length - 1]!.at);
    const w = placingShape.paint.kind === 'stroke' ? placingShape.paint.width / LEN : 0;
    const to = P(snap);
    if (chosenArc) {
      const c = P(chosenArc.centre), r = chosenArc.r;
      const d = `M${last.x} ${last.y}A${r} ${r} 0 ${chosenArc.turn > Math.PI ? 1 : 0} ${chosenArc.sweep} ${to.x} ${to.y}`;
      const k = px(7);
      return (
        <g>
          <circle cx={c.x} cy={c.y} r={r} fill="none" stroke="var(--canvas-active)" stroke-width={1} stroke-dasharray="4 3" {...ve} />
          <path d={`M${c.x - k} ${c.y}H${c.x + k}M${c.x} ${c.y - k}V${c.y + k}`} stroke="var(--canvas-radius)" stroke-width={1.25} {...ve} />
          {w > 0 ? <path d={d} fill="none" stroke="var(--canvas-mark)" stroke-opacity={0.45} stroke-width={w} stroke-linecap="round" /> : null}
          <path d={d} fill="none" stroke="var(--canvas-active)" stroke-width={1.25} {...ve} />
        </g>
      );
    }
    const dashed = arcOn ? '6 4' : undefined; // arc wanted but impossible here: preview straight, dashed
    return (
      <g>
        {w > 0 ? <line x1={last.x} y1={last.y} x2={to.x} y2={to.y} stroke="var(--canvas-mark)" stroke-opacity={0.45} stroke-width={w} stroke-linecap="round" /> : null}
        <line x1={last.x} y1={last.y} x2={to.x} y2={to.y} stroke={arcOn ? 'var(--canvas-invalid)' : 'var(--canvas-active)'} stroke-dasharray={dashed} stroke-width={1.25} {...ve} />
      </g>
    );
  })() : null;
  // The selected shape's own outline, so it can be told apart from shapes with the same fill (cut shapes too).
  const selectedShapes = doc.shapes.filter((s) => s.path.vertices.some((v) => state.selection.includes(v.id)));
  const selectedOutlines = paper ? null : selectedShapes.map((s) => {
    const c = construction.find((x) => x.shapeId === s.id);
    if (!c || c.contours.length === 0) return null;
    const d = writePath([...c.contours], { scale: 1, precision: 5 });
    return (
      <g key={`selo${s.id}`}>
        <path d={d} fill="none" stroke="var(--canvas-halo)" stroke-width={4} {...ve} />
        <path d={d} fill="none" stroke="var(--canvas-selection)" stroke-width={1.5} {...ve} />
      </g>
    );
  });
  // Repeat guides for the selected shape (DESIGN.md §4: repeat centre or axis, dash-dot).
  const repeatGuides = paper ? null : selectedShapes.map((sh) => {
    const r = sh.repeat;
    const dash = '8 3 1 3';
    if (r.kind === 'rotate') {
      const c = P(r.centre), k = px(8);
      return (
        <g key={`rep${sh.id}`}>
          <circle cx={c.x} cy={c.y} r={px(16)} fill="none" stroke="var(--canvas-axis)" stroke-width={1} stroke-dasharray={dash} {...ve} />
          <path d={`M${c.x - k} ${c.y}H${c.x + k}M${c.x} ${c.y - k}V${c.y + k}`} stroke="var(--canvas-axis)" stroke-width={1.25} {...ve} />
        </g>
      );
    }
    if (r.kind === 'mirror') {
      const a = P(r.through), b = P(r.to);
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy), L = W + H;
      return <line key={`rep${sh.id}`} x1={a.x - (dx / l) * L} y1={a.y - (dy / l) * L} x2={a.x + (dx / l) * L} y2={a.y + (dy / l) * L} stroke="var(--canvas-axis)" stroke-width={1} stroke-dasharray={dash} {...ve} />;
    }
    if (r.kind === 'translate') {
      const o = P(sh.path.vertices[0]!.at), z = P({ u: 0, v: 0 }), st = P(r.step);
      const step = { x: st.x - z.x, y: st.y - z.y };
      const end = { x: o.x + step.x * (r.count - 1), y: o.y + step.y * (r.count - 1) };
      return <line key={`rep${sh.id}`} x1={o.x} y1={o.y} x2={end.x} y2={end.y} stroke="var(--canvas-axis)" stroke-width={1} stroke-dasharray={dash} {...ve} />;
    }
    return null;
  });
  const radiusHandle = handle ? (
    <g class="radius-handle">
      <circle cx={handle.at.x} cy={handle.at.y} r={px(6)} fill="var(--canvas-halo)" />
      <circle cx={handle.at.x} cy={handle.at.y} r={px(5)} fill={drag?.kind === 'radius' ? 'var(--canvas-selection)' : 'var(--canvas-active)'} />
      <text x={handle.at.x + px(9)} y={handle.at.y + px(4)} font-size={px(11)} fill="var(--canvas-active)" font-family="var(--font-mono)" paint-order="stroke" stroke="var(--canvas-halo)" stroke-width={px(3)}>r {formatCells(handle.r)}</text>
    </g>
  ) : null;

  const half = px(3.5);
  const points = paper ? null : allVertices.map(({ shape, v, i }) => {
    const p = P(v.at), sel = state.selection.includes(v.id);
    const closesHere = placingShape && shape.id === placingShape.id && i === 0 && snap && latticeEq(snap, v.at) && placingShape.path.vertices.length >= 3;
    return (
      <g key={v.id}>
        {sel ? <circle cx={p.x} cy={p.y} r={px(12)} fill="none" stroke="var(--canvas-halo)" stroke-width={4} {...ve} /> : null}
        {sel ? <circle cx={p.x} cy={p.y} r={px(12)} fill="none" stroke="var(--canvas-selection)" stroke-width={1.5} {...ve} /> : null}
        {closesHere ? <circle cx={p.x} cy={p.y} r={px(12)} fill="none" stroke="var(--canvas-active)" stroke-width={1.5} {...ve} /> : null}
        <rect x={p.x - half} y={p.y - half} width={2 * half} height={2 * half} fill="var(--canvas-bg)" stroke="var(--canvas-halo)" stroke-width={4} {...ve} />
        <rect x={p.x - half} y={p.y - half} width={2 * half} height={2 * half} fill={sel ? 'var(--canvas-selection)' : 'var(--canvas-bg)'} stroke={sel ? 'var(--canvas-selection)' : 'var(--canvas-point)'} stroke-width={1.5} {...ve} />
      </g>
    );
  });
  const snapMark = snap && !paper && (state.mode === 'place' || drag?.kind === 'move') ? (() => {
    const p = P(snap), k = px(9);
    return (
      <g class="snap">
        <path d={`M${p.x - k} ${p.y}H${p.x + k}M${p.x} ${p.y - k}V${p.y + k}`} stroke="var(--canvas-halo)" stroke-width={4} {...ve} />
        <path d={`M${p.x - k} ${p.y}H${p.x + k}M${p.x} ${p.y - k}V${p.y + k}`} stroke="var(--canvas-active)" stroke-width={1.5} {...ve} />
        <circle cx={p.x} cy={p.y} r={px(6)} fill="none" stroke="var(--canvas-active)" stroke-width={1} stroke-dasharray="2 2" {...ve} />
      </g>
    );
  })() : null;
  const box = drag?.kind === 'box' ? (
    <rect x={Math.min(drag.from.x, drag.to.x)} y={Math.min(drag.from.y, drag.to.y)} width={Math.abs(drag.to.x - drag.from.x)} height={Math.abs(drag.to.y - drag.from.y)}
      fill="var(--canvas-selection)" fill-opacity={0.06} stroke="var(--canvas-selection)" stroke-width={1} stroke-dasharray="3 3" {...ve} />
  ) : null;

  return (
    <svg
      ref={svg}
      class={`canvas mode-${state.mode}${drag?.kind === 'radius' ? ' dragging-radius' : ''}${state.pickCentre ? ' picking' : ''}`}
      viewBox={`${-MARGIN} ${-MARGIN} ${W + 2 * MARGIN + XR} ${H + 2 * MARGIN}`}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label={`Construction canvas, ${g.preset} grid ${W} by ${H} cells`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => !drag && setSnap(null)}
    >
      <rect x={-MARGIN} y={-MARGIN} width={W + 2 * MARGIN + XR} height={H + 2 * MARGIN} fill={paper ? 'var(--paper-bg)' : 'var(--canvas-bg)'} />
      {paper ? null : <g>{lines}{rows}{crosses}{ruler}</g>}
      {paper ? null : <g>{cutOutlines}</g>}
      <path d={markD} fill={paper ? doc.export.colour : 'var(--canvas-mark)'} />
      {paper ? null : <g>{invalid}{circles}{placingPath}</g>}
      <g>{repeatGuides}</g>
      <g>{selectedOutlines}</g>
      <g>{points}</g>
      {radiusHandle}
      {box}
      {snapMark}
    </svg>
  );
}
