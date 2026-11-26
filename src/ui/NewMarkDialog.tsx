/**
 * New-mark dialog (SPEC.md §4.2, §5): pick a grid type from a list with a live mini-preview of each
 * lattice, set its parameters (defaults from SPEC.md §5), or open an example. Creating replaces the
 * document in one undoable step.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { defaultGrid, gridSize, latticePoints, PRESETS, SUBDIVISIONS, toPlane, type GridDef } from '../grids';
import type { Preset } from '../grids/presets';
import { gridLines, namedRows } from '../grids/lines';
import { EXAMPLES } from '../examples';

const NAMES: Record<Preset, string> = { square: 'Square', triangular: 'Triangular', isometric: 'Isometric', polar: 'Polar', typographic: 'Typographic' };
const NOTES: Record<Preset, string> = {
  square: 'Cells, optional slant and rotation.',
  triangular: 'Equilateral triangles, 60° directions.',
  isometric: 'Two slopes: true 30°, 2:3 or 1:2.',
  polar: 'Rings and rays from one centre.',
  typographic: 'Square cells with named rows.',
};

interface Props {
  firstVisit: boolean;
  onCreate: (grid: GridDef) => void;
  onExample: (id: string) => void;
  onClose: () => void;
}

/** A small drawing of a grid: its lines, rings and lattice crosses, scaled to fit. */
export function GridPreview({ grid, size }: { grid: GridDef; size: number }) {
  const { width: W, height: H } = gridSize(grid);
  const gl = useMemo(() => gridLines(grid), [grid]);
  const pts = useMemo(() => latticePoints(grid, { wholeOnly: true }).map((l) => toPlane(l, grid)), [grid]);
  const k = Math.max(W, H) / size; // cells per pixel
  const pad = 4 * k;
  return (
    <svg class="grid-preview" viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`} width={size} height={size} aria-hidden="true">
      {gl.lines.map((l) => <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={l.major ? 'var(--canvas-grid-major)' : 'var(--canvas-grid-minor)'} stroke-width={k} />)}
      {gl.rings.map((r) => <circle cx={r.centre.x} cy={r.centre.y} r={r.r} fill="none" stroke={r.major ? 'var(--canvas-grid-major)' : 'var(--canvas-grid-minor)'} stroke-width={k} />)}
      {namedRows(grid).map((r) => <line x1={0} y1={r.y} x2={r.width} y2={r.y} stroke="var(--canvas-lattice)" stroke-width={k} stroke-dasharray={`${4 * k} ${3 * k}`} />)}
      {pts.length <= 1200 ? pts.map((p) => <circle cx={p.x} cy={p.y} r={1.1 * k} fill="var(--canvas-lattice)" />) : null}
    </svg>
  );
}

export function NewMarkDialog({ firstVisit, onCreate, onExample, onClose }: Props) {
  const [preset, setPreset] = useState<Preset>('square');
  const [grids, setGrids] = useState<Record<Preset, GridDef>>(() => Object.fromEntries(PRESETS.map((p) => [p, defaultGrid(p)])) as Record<Preset, GridDef>);
  const g = grids[preset];
  const set = (patch: Partial<Record<string, unknown>>) => setGrids({ ...grids, [preset]: { ...g, ...patch } as GridDef });
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('.grid-types button[aria-pressed="true"]')?.focus();
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    const t = e.target as HTMLElement;
    // Arrows move through the type list (SPEC.md §6.1).
    if (t.closest('.grid-types') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const i = PRESETS.indexOf(preset), n = PRESETS[(i + (e.key === 'ArrowDown' ? 1 : PRESETS.length - 1)) % PRESETS.length]!;
      setPreset(n);
      requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`.grid-types button[data-preset="${n}"]`)?.focus());
      return;
    }
    if (e.key === 'Enter' && t.tagName !== 'BUTTON') { e.preventDefault(); onCreate(g); return; }
    if (e.key !== 'Tab' || !dialog.current) return;
    const els = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')];
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };

  const num = (label: string, value: number, min: number, max: number, step: number, apply: (n: number) => void, unit = '') => (
    <label class="field">{label}
      <span class="row">
        <input type="number" value={value} min={min} max={max} step={step}
          onChange={(e) => { const n = Number((e.target as HTMLInputElement).value); if (Number.isFinite(n)) apply(Math.max(min, Math.min(max, n))); }} />
        {unit ? <span class="note">{unit}</span> : null}
      </span>
    </label>
  );
  const sizes = Array.from({ length: 23 }, (_, i) => i + 2);

  return (
    <div class="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !firstVisit) onClose(); }}>
      <div class="dialog new-mark" role="dialog" aria-modal="true" aria-labelledby="new-title" ref={dialog} onKeyDown={onKey}>
        <h2 class="dialog-title" id="new-title">New mark</h2>
        <div class="new-body">
          <div class="grid-types" role="group" aria-label="Grid type">
            {PRESETS.map((p) => (
              <button type="button" data-preset={p} aria-pressed={preset === p} onClick={() => setPreset(p)}>
                <GridPreview grid={grids[p]} size={44} />
                <span class="type-text"><span class="type-name">{NAMES[p]}</span><span class="note">{NOTES[p]}</span></span>
              </button>
            ))}
          </div>

          <div class="grid-params">
            <div class="big-preview"><GridPreview grid={g} size={220} /></div>
            <div class="param-grid">
              {g.kind === 'affine' ? (
                <>
                  <label class="field">Columns
                    <select value={g.width} onChange={(e) => set({ width: Number((e.target as HTMLSelectElement).value) })}>{sizes.map((n) => <option value={n}>{n}</option>)}</select>
                  </label>
                  <label class="field">Rows
                    <select value={g.height} onChange={(e) => set({ height: Number((e.target as HTMLSelectElement).value) })}>{sizes.map((n) => <option value={n}>{n}</option>)}</select>
                  </label>
                </>
              ) : (
                <>
                  <label class="field">Rings
                    <select value={g.rings} onChange={(e) => set({ rings: Number((e.target as HTMLSelectElement).value) })}>{Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option value={n}>{n}</option>)}</select>
                  </label>
                  {num('Rays', g.rays, 3, 360, 1, (n) => set({ rays: Math.round(n) }))}
                </>
              )}
              <label class="field">Steps
                <select value={g.subdivision} onChange={(e) => set({ subdivision: Number((e.target as HTMLSelectElement).value) })}>
                  {SUBDIVISIONS.map((n) => <option value={n}>{n === 1 ? 'whole' : `1/${n}`}</option>)}
                </select>
              </label>
              {g.kind === 'affine' && g.preset === 'square' ? num('Slant', g.slantDeg, -45, 45, 0.5, (n) => set({ slantDeg: n }), '°') : null}
              {'rotationDeg' in g ? num('Rotation', g.rotationDeg, -180, 180, 0.5, (n) => set({ rotationDeg: n }), '°') : null}
            </div>
            {g.kind === 'affine' && g.preset === 'isometric' ? (
              <div class="group">
                <span class="label" id="ratio-label">Ratio</span>
                <div class="seg" role="group" aria-labelledby="ratio-label">
                  {(['true30', '2:3', '1:2'] as const).map((r) => <button type="button" aria-pressed={g.ratio === r} onClick={() => set({ ratio: r })}>{r === 'true30' ? 'true 30°' : r}</button>)}
                </div>
              </div>
            ) : null}
            {g.kind === 'polar' ? (
              <button type="button" class="btn" aria-pressed={g.companionSquare} onClick={() => set({ companionSquare: !g.companionSquare })} title="An axis-aligned square lattice with the same unit and centre, for frames around rays">Companion square lattice</button>
            ) : null}
            {g.kind === 'affine' && g.preset === 'typographic' ? <p class="note">Rows: {g.rows.map((r) => r.name).join(' · ')}.</p> : null}
            <div class="row actions">
              <button type="button" class="btn primary" onClick={() => onCreate(g)}>Create <kbd>↵</kbd></button>
              <button type="button" class="btn" onClick={onClose}>{firstVisit ? 'Keep the current mark' : 'Cancel'} <kbd>Esc</kbd></button>
            </div>
          </div>
        </div>

        <div class="group">
          <span class="label">Or open an example</span>
          <div class="examples">
            {EXAMPLES.map((x) => <button type="button" class="btn" title={x.note} onClick={() => onExample(x.id)}>{x.name}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}
