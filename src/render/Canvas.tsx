/**
 * The canvas (SPEC.md §4.1, §7; DESIGN.md §2.2, §4, §6.1): one SVG drawn in cells. Snapping is instant
 * (no easing) with a small hysteresis so the preview doesn't flicker on cell boundaries. Strokes are
 * non-scaling; marker sizes are DESIGN.md screen pixels converted to cells.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import { latticeEq, type Lattice } from '../geometry/lattice';
import type { Vec2 } from '../geometry/num';
import { gridSize, latticePoints, nearest, toPlane } from '../grids';
import { writePath } from '../export/write-path';
import type { Mark } from '../pipeline/evaluate';
import type { ShapeConstruction } from '../pipeline/resolve';
import type { Action, UiState } from '../ui/state';

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
  | { kind: 'box'; from: Vec2; to: Vec2; additive: boolean };

export function Canvas({ state, dispatch, mark, construction }: Props) {
  const doc = state.history.present.doc;
  const g = doc.grid;
  const { width: W, height: H } = gridSize(g);
  const svg = useRef<SVGSVGElement>(null);
  const [pxPerCell, setPx] = useState(48);
  const [snap, setSnap] = useState<Lattice | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPx(Math.min(r.width / (W + 2 * MARGIN), r.height / (H + 2 * MARGIN)) || 48);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

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

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const q = toCells(e);
    const at = snapTo(q, e.ctrlKey);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (state.mode === 'place') {
      if (placingShape) {
        const first = placingShape.path.vertices[0]!;
        const min = placingShape.paint.kind === 'fill' ? 3 : 2;
        if (latticeEq(first.at, at) && placingShape.path.vertices.length >= min) {
          dispatch({ type: 'command', command: { type: 'closeShape', shapeId: placingShape.id }, label: 'Close shape' });
          dispatch({ type: 'placing', shapeId: null });
          return;
        }
        dispatch({ type: 'command', command: { type: 'appendPoint', shapeId: placingShape.id, at }, label: 'Place point', select: 'last-vertex' });
      } else {
        dispatch({ type: 'command', command: { type: 'addShape', at }, label: 'Start shape', startPlacing: true, select: 'last-vertex' });
      }
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
  const lines: preact.JSX.Element[] = [];
  for (let i = 0; i <= W * sub; i++) {
    const x = i / sub, major = i % sub === 0;
    lines.push(<line key={`x${i}`} x1={x} y1={0} x2={x} y2={H} stroke={major ? 'var(--canvas-grid-major)' : 'var(--canvas-grid-minor)'} stroke-width={1} {...ve} />);
  }
  for (let j = 0; j <= H * sub; j++) {
    const y = j / sub, major = j % sub === 0;
    lines.push(<line key={`y${j}`} x1={0} y1={y} x2={W} y2={y} stroke={major ? 'var(--canvas-grid-major)' : 'var(--canvas-grid-minor)'} stroke-width={1} {...ve} />);
  }
  const crosses = latticePoints(g).map((l) => {
    const p = P(l), whole = l.u % sub === 0 && l.v % sub === 0, k = px(whole ? 5 : 3);
    return <path key={`c${l.u},${l.v}`} d={`M${p.x - k} ${p.y}H${p.x + k}M${p.x} ${p.y - k}V${p.y + k}`} stroke="var(--canvas-lattice)" stroke-width={1} opacity={whole ? 1 : 0.5} {...ve} />;
  });
  const ruler: preact.JSX.Element[] = [];
  for (let i = 0; i <= W; i++) ruler.push(<text key={`rx${i}`} x={i} y={-px(10)} font-size={px(11)} text-anchor="middle" fill="var(--canvas-ruler)" font-family="var(--font-mono)">{i}</text>);
  for (let j = 0; j <= H; j++) ruler.push(<text key={`ry${j}`} x={-px(10)} y={j + px(4)} font-size={px(11)} text-anchor="end" fill="var(--canvas-ruler)" font-family="var(--font-mono)">{j}</text>);

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
  const placingPath = placingShape && placingShape.path.vertices.length > 0 ? (() => {
    const pts = placingShape.path.vertices.map((v) => P(v.at));
    const last = pts[pts.length - 1]!;
    return (
      <g>
        {pts.length > 1 ? <path d={`M${pts.map((p) => `${p.x} ${p.y}`).join('L')}`} fill="none" stroke="var(--canvas-active)" stroke-width={1.25} {...ve} /> : null}
        {snap && state.mode === 'place' ? <line x1={last.x} y1={last.y} x2={P(snap).x} y2={P(snap).y} stroke="var(--canvas-active)" stroke-width={1.25} {...ve} /> : null}
      </g>
    );
  })() : null;

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
      class={`canvas mode-${state.mode}`}
      viewBox={`${-MARGIN} ${-MARGIN} ${W + 2 * MARGIN} ${H + 2 * MARGIN}`}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label={`Construction canvas, ${g.preset} grid ${W} by ${H} cells`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => !drag && setSnap(null)}
    >
      <rect x={-MARGIN} y={-MARGIN} width={W + 2 * MARGIN} height={H + 2 * MARGIN} fill={paper ? 'var(--paper-bg)' : 'var(--canvas-bg)'} />
      {paper ? null : <g>{lines}{crosses}{ruler}</g>}
      {paper ? null : <g>{cutOutlines}</g>}
      <path d={markD} fill={paper ? doc.export.colour : 'var(--canvas-mark)'} />
      {paper ? null : <g>{invalid}{circles}{placingPath}</g>}
      <g>{points}</g>
      {box}
      {snapMark}
    </svg>
  );
}
