/**
 * Geometry gallery: a static specimen sheet that draws real outputs of the geometry core with the
 * DESIGN.md canvas styles, so corner behaviour can be checked by eye. A development page, not product UI.
 * Built by gallery/build.mjs into artifacts/gallery/index.html.
 */
import { contourArea, type Contour } from '../src/geometry/contour';
import { outlineClosed, type CornerSpec, type CornerType, type OutlineResult } from '../src/geometry/corners';
import { lattice, type Lattice } from '../src/geometry/lattice';
import { add, scale, sub as vsub, type Vec2 } from '../src/geometry/num';
import { writePath, fmt } from '../src/export/write-path';
import { outlineStroke, type StrokeInput } from '../src/geometry/strokes';
import { createRequire } from 'node:module';
import { makePaperEngine } from '../src/boolean/paper-adapter';
import { evaluateMark, type PlaneShape } from '../src/pipeline/evaluate';
import { expandRepeat, type PlaneRepeat } from '../src/geometry/repeat';
import { defaultGrid, toPlane, type GridDef } from '../src/grids';

const PX_PER_CELL = 56;

interface Specimen {
  name: string;
  note: string;
  cells: { w: number; h: number };
  /** Points in cells (multiples of ½ on a subdivision-2 square grid). */
  pts: [number, number][];
  corners: CornerSpec[] | ((n: number) => CornerSpec[]);
  expectedArea?: number;
}

const all = (type: CornerType, r: number) => (n: number): CornerSpec[] => Array.from({ length: n }, () => ({ type, r }));
const SQ: [number, number][] = [[1, 1], [3, 1], [3, 3], [1, 3]];

const SPECIMENS: Specimen[] = [
  { name: 'Sharp', note: 'radius 0 on every corner type: the outline runs through the points', cells: { w: 4, h: 4 }, pts: SQ, corners: all('round', 0), expectedArea: 4 },
  { name: 'Round 0.50', note: 'fillets: corners stay on the points, arcs replace the tips', cells: { w: 4, h: 4 }, pts: SQ, corners: all('round', 0.5), expectedArea: 4 - (4 - Math.PI) * 0.25 },
  { name: 'Outer 0.50', note: 'circles centred on the points; the outline wraps them (offset square)', cells: { w: 4, h: 4 }, pts: SQ, corners: all('outer', 0.5), expectedArea: 4 + 4 * 2 * 0.5 + Math.PI * 0.25 },
  {
    name: 'Auto 0.50', note: 'outer at convex corners, inward at the concave one', cells: { w: 4, h: 4 },
    pts: [[0.5, 0.5], [2, 0.5], [2, 2], [3.5, 2], [3.5, 3.5], [0.5, 3.5]], corners: all('auto', 0.5),
  },
  {
    name: 'Inward notch', note: 'inward at a concave point: a round-bottomed notch (the reference tool’s H)', cells: { w: 4, h: 4 },
    pts: [[0.5, 0.5], [2, 2], [3.5, 0.5], [3.5, 3.5], [0.5, 3.5]],
    corners: (n) => Array.from({ length: n }, (_, i) => ({ type: i === 1 ? 'inward' : 'round', r: i === 1 ? 0.5 : 0 })),
  },
  {
    name: 'Capsule', note: 'two points, outer 0.5: a stroke with round caps (motion-logo)', cells: { w: 4, h: 4 },
    pts: [[1, 2], [3, 2]], corners: all('outer', 0.5), expectedArea: 2 * 0.5 * 2 + Math.PI * 0.25,
  },
  {
    name: 'Teardrop', note: 'a big outer circle and a sharp tip (p-logo-5)', cells: { w: 4, h: 4 },
    pts: [[2, 1.5], [2, 3.5]], corners: [{ type: 'outer', r: 1 }, { type: 'outer', r: 0 }],
    expectedArea: Math.sqrt(3) + 0.5 * (2 * Math.PI - (2 * Math.PI) / 3),
  },
  {
    name: 'Star, inward 0.35', note: 'concave points bite inward; tips rounded 0.10 (node-logo’s centre). At 0.50 the inward circles touch and the tips become hairlines.', cells: { w: 4, h: 4 },
    pts: [[2, 0.5], [2.5, 1.5], [3.5, 2], [2.5, 2.5], [2, 3.5], [1.5, 2.5], [0.5, 2], [1.5, 1.5]],
    corners: (n) => Array.from({ length: n }, (_, i) => (i % 2 ? { type: 'inward', r: 0.35 } : { type: 'round', r: 0.1 })),
  },
  {
    name: 'Clamped', note: 'round 1.50 asked for on a 2-cell square; clamped to 1.00. Dashed: what was asked', cells: { w: 4, h: 4 },
    pts: SQ, corners: all('round', 1.5), expectedArea: Math.PI,
  },
  {
    name: 'No tangent', note: 'outer 1.50 swallows its neighbour (outer 0.25): invalid, not drawn', cells: { w: 4, h: 4 },
    pts: [[1, 1], [2, 1], [2, 3], [1, 3]],
    corners: [{ type: 'outer', r: 1.5 }, { type: 'outer', r: 0.25 }, { type: 'round', r: 0 }, { type: 'round', r: 0 }],
  },
  {
    name: 'e-logo-3, both pieces', note: 'your 3 × 3 mark: every corner round 14/240 cell (≈ the original’s 2/35)', cells: { w: 3, h: 3 },
    pts: [[1, 2], [3, 2], [2, 3], [0, 3], [0, 2], [1, 1]], corners: all('round', 14 / 240),
  },
  {
    name: 'Cove', note: 'inward 0.75 on a convex corner: a quarter-disc scoop centred on the point, crisp where it meets the edges', cells: { w: 4, h: 4 },
    pts: SQ, corners: (n) => Array.from({ length: n }, (_, i) => ({ type: i === 0 ? 'inward' : 'round', r: i === 0 ? 0.75 : 0 })),
    expectedArea: 4 - (Math.PI * 0.75 * 0.75) / 4,
  },
  {
    name: 'Filled corner', note: 'outer 0.75 on a concave corner: the disc is added into the notch', cells: { w: 4, h: 4 },
    pts: [[0.5, 0.5], [3.5, 0.5], [3.5, 2], [2, 2], [2, 3.5], [0.5, 3.5]],
    corners: (n) => Array.from({ length: n }, (_, i) => ({ type: i === 3 ? 'outer' : 'round', r: i === 3 ? 0.75 : 0 })),
    expectedArea: 6.75 + (Math.PI * 0.75 * 0.75) / 4,
  },
];

/** The second e-logo-3 piece, drawn into the same specimen. */
const E3_SECOND: [number, number][] = [[3, 1], [2, 2], [2, 1], [0, 1], [1, 0], [3, 0]];

function gridFor(cells: { w: number; h: number }): GridDef {
  return { ...defaultGrid('square'), subdivision: 2, width: cells.w, height: cells.h } as GridDef;
}

/** Points go through the real lattice: cells → sub-step lattice ints → toPlane. */
function place(pts: [number, number][], g: GridDef): { lat: Lattice[]; plane: Vec2[] } {
  const lat = pts.map(([x, y]) => lattice(x * 2, y * 2));
  return { lat, plane: lat.map((p) => toPlane(p, g)) };
}

const px = (cells: number) => cells / PX_PER_CELL; // DESIGN.md sizes are screen px; the SVG draws in cells
const ve = 'vector-effect="non-scaling-stroke"';

function gridLayer(cells: { w: number; h: number }): string {
  let s = '';
  for (let x = 0; x <= cells.w; x += 0.5) {
    const major = Number.isInteger(x);
    s += `<line x1="${x}" y1="0" x2="${x}" y2="${cells.h}" stroke="var(--canvas-grid-${major ? 'major' : 'minor'})" stroke-width="1" ${ve}/>`;
  }
  for (let y = 0; y <= cells.h; y += 0.5) {
    const major = Number.isInteger(y);
    s += `<line x1="0" y1="${y}" x2="${cells.w}" y2="${y}" stroke="var(--canvas-grid-${major ? 'major' : 'minor'})" stroke-width="1" ${ve}/>`;
  }
  for (let x = 0; x <= cells.w; x += 0.5) {
    for (let y = 0; y <= cells.h; y += 0.5) {
      const whole = Number.isInteger(x) && Number.isInteger(y);
      const k = px(whole ? 5 : 3);
      s += `<path d="M${x - k} ${y}H${x + k}M${x} ${y - k}V${y + k}" stroke="var(--canvas-lattice)" stroke-width="1" opacity="${whole ? 1 : 0.5}" ${ve}/>`;
    }
  }
  return s;
}

function circlesLayer(res: OutlineResult, spec: Specimen, plane: Vec2[]): string {
  let s = '';
  res.circles.forEach((c, i) => {
    if (!c) return;
    const clamped = res.issues.some((x) => x.kind === 'clamped' && x.index === i);
    const colour = clamped ? 'var(--canvas-clamped)' : 'var(--canvas-radius)';
    const dash = c.kind === 'inward' || c.kind === 'cove' ? 'stroke-dasharray="4 3"' : '';
    s += `<circle cx="${c.centre.x}" cy="${c.centre.y}" r="${c.r}" fill="none" stroke="${colour}" stroke-width="1.25" ${dash} ${ve}/>`;
    if (c.kind === 'fillet') s += `<circle cx="${c.centre.x}" cy="${c.centre.y}" r="${px(1.5)}" fill="${colour}"/>`;
    if (clamped) {
      // The requested fillet: same corner, centre further along the bisector (DESIGN.md §6.1).
      const issue = res.issues.find((x) => x.kind === 'clamped' && x.index === i);
      if (issue && issue.kind === 'clamped' && issue.actual > 0) {
        const P = plane[i] as Vec2;
        const toC = vsub(c.centre, P);
        const k = issue.requested / issue.actual;
        const cr = add(P, scale(toC, k));
        s += `<circle cx="${cr.x}" cy="${cr.y}" r="${issue.requested}" fill="none" stroke="var(--canvas-clamped)" stroke-width="1.25" stroke-dasharray="4 3" opacity="0.5" ${ve}/>`;
      }
    }
  });
  void spec;
  return s;
}

function pointsLayer(plane: Vec2[], flagged: Set<number>): string {
  const h = px(7) / 2;
  let s = '';
  plane.forEach((p, i) => {
    // Halo first, then the open square (DESIGN.md §2.2 halo rule).
    s += `<rect x="${p.x - h}" y="${p.y - h}" width="${2 * h}" height="${2 * h}" fill="var(--canvas-bg)" stroke="var(--canvas-halo)" stroke-width="4" ${ve}/>`;
    s += `<rect x="${p.x - h}" y="${p.y - h}" width="${2 * h}" height="${2 * h}" fill="var(--canvas-bg)" stroke="var(--canvas-point)" stroke-width="1.5" ${ve}/>`;
    if (flagged.has(i)) s += `<circle cx="${p.x}" cy="${p.y}" r="${px(14)}" fill="none" stroke="var(--canvas-invalid)" stroke-width="1.5" ${ve}/>`;
  });
  return s;
}

function renderSpecimen(spec: Specimen): string {
  const g = gridFor(spec.cells);
  const { plane } = place(spec.pts, g);
  const corners = typeof spec.corners === 'function' ? spec.corners(spec.pts.length) : spec.corners;
  const res = outlineClosed(plane, corners);
  const contours: Contour[] = res.contour ? [res.contour] : [];
  let extraPts: Vec2[] = [];
  if (spec.name.startsWith('e-logo-3')) {
    const second = place(E3_SECOND, g);
    const r2 = outlineClosed(second.plane, all('round', 14 / 240)(E3_SECOND.length));
    if (r2.contour) contours.push(r2.contour);
    extraPts = second.plane;
  }
  const flagged = new Set(res.issues.flatMap((x) => (x.kind === 'no-tangent' ? [x.index] : [])));
  const m = 0.5;
  const vb = `${-m} ${-m} ${spec.cells.w + 2 * m} ${spec.cells.h + 2 * m}`;
  const w = (spec.cells.w + 2 * m) * PX_PER_CELL, h = (spec.cells.h + 2 * m) * PX_PER_CELL;

  let mark = '';
  if (contours.length) {
    mark = `<path d="${writePath(contours, { scale: 1, precision: 4 })}" fill="var(--canvas-mark)"/>`;
  } else {
    // Invalid: dashed outline of the points in the error colour (DESIGN.md §6, error state).
    const d = `M${plane.map((p) => `${p.x} ${p.y}`).join('L')}Z`;
    mark = `<path d="${d}" fill="none" stroke="var(--canvas-invalid)" stroke-width="1.25" stroke-dasharray="6 4" ${ve}/>`;
    corners.forEach((c, i) => {
      if (c.r > 0) {
        const p = plane[i] as Vec2;
        mark += `<circle cx="${p.x}" cy="${p.y}" r="${c.r}" fill="none" stroke="var(--canvas-invalid)" stroke-width="1" stroke-dasharray="4 3" opacity="0.6" ${ve}/>`;
      }
    });
  }

  const area = contours.reduce((a, c) => a + Math.abs(contourArea(c)), 0);
  const arcs = contours.reduce((a, c) => a + c.segs.filter((s) => s.kind === 'A').length, 0);
  const lines: string[] = [];
  if (contours.length) lines.push(`area ${fmt(area, 4)}${spec.expectedArea !== undefined ? ` · expected ${fmt(spec.expectedArea, 4)} ${Math.abs(area - spec.expectedArea) < 1e-9 ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}` : ''} · ${arcs} arcs`);
  for (const i of res.issues) {
    if (i.kind === 'clamped') lines.push(`<span class="warn">point ${i.index + 1}: radius ${fmt(i.actual, 2)} of ${fmt(i.requested, 2)}</span>`);
    if (i.kind === 'no-tangent') lines.push(`<span class="bad">point ${i.index + 1}: radius ${fmt(i.requested, 2)} swallows its neighbour. Reduce it below ${fmt(i.maxRadius, 2)}.</span>`);
  }
  const d = contours.length ? writePath(contours, { scale: 100, precision: 3 }) : '';

  return `<figure class="spec">
  <svg viewBox="${vb}" width="${w}" height="${h}" role="img" aria-label="${spec.name}">
    <rect x="${-m}" y="${-m}" width="${spec.cells.w + 2 * m}" height="${spec.cells.h + 2 * m}" fill="var(--canvas-bg)"/>
    ${gridLayer(spec.cells)}
    ${mark}
    ${circlesLayer(res, spec, plane)}
    ${pointsLayer([...plane, ...extraPts], flagged)}
  </svg>
  <figcaption>
    <h2>${spec.name}</h2>
    <p class="note">${spec.note}</p>
    ${lines.map((l) => `<p class="data">${l}</p>`).join('')}
    ${d ? `<details><summary>Path data (100 units per cell)</summary><code>${d}</code></details>` : ''}
  </figcaption>
</figure>`;
}

// ---- Strokes -------------------------------------------------------------------------------------

interface StrokeSpecimen {
  name: string;
  note: string;
  cells: { w: number; h: number };
  strokes: StrokeInput[];
  expectedArea?: number;
}

const ln = { kind: 'line' as const };
const st = (pts: [number, number][], over: Partial<StrokeInput>): StrokeInput => ({
  points: pts.map(([x, y]) => ({ x, y })), segments: pts.slice(0, over.closed ? pts.length : -1).map(() => ln), closed: false,
  radii: pts.map(() => 0), width: 0.5, cap: 'butt', join: 'miter', endRadius: 0, ...over,
});

const STROKE_SPECIMENS: StrokeSpecimen[] = [
  {
    name: 'Caps', note: 'butt, square and round ends on a 0.6-wide stroke', cells: { w: 4, h: 4 },
    strokes: [st([[1, 1], [3, 1]], { width: 0.6, cap: 'butt' }), st([[1, 2], [3, 2]], { width: 0.6, cap: 'square' }), st([[1, 3], [3, 3]], { width: 0.6, cap: 'round' })],
    expectedArea: 0.6 * 2 + 0.6 * 2.6 + (0.6 * 2 + Math.PI * 0.09),
  },
  {
    name: 'Joins', note: 'miter, round and bevel at the same 53° corner (2·atan ½)', cells: { w: 4, h: 4 },
    strokes: [
      st([[0.5, 1.5], [1, 0.5], [1.5, 1.5]], { join: 'miter', width: 0.3 }),
      st([[1.5, 3], [2, 2], [2.5, 3]], { join: 'round', width: 0.3 }),
      st([[2.5, 1.5], [3, 0.5], [3.5, 1.5]], { join: 'bevel', width: 0.3 }),
    ],
  },
  {
    name: 'Rounded stroke corner', note: 'centre-line radius 1: inner 0.75 and outer 1.25 around one centre (the isometric asterisk)', cells: { w: 4, h: 4 },
    strokes: [st([[0.5, 0.5], [3.5, 0.5], [3.5, 3.5]], { radii: [0, 1, 0] })],
    expectedArea: 0.5 * (2 + Math.PI / 2 + 2),
  },
  {
    name: 'End radius', note: 'butt and square ends softened by 0.25 on a 1-wide stroke', cells: { w: 4, h: 4 },
    strokes: [st([[1, 1.25], [3, 1.25]], { width: 1, endRadius: 0.25 }), st([[1.5, 3], [2.5, 3]], { width: 1, cap: 'square', endRadius: 0.25 })],
    expectedArea: (2 - 4 * (1 - Math.PI / 4) * 0.0625) + (2 - 4 * (1 - Math.PI / 4) * 0.0625),
  },
  {
    name: 'Arch', note: 'line, arc segment centred on a lattice point, line: round caps (m-logo-2)', cells: { w: 4, h: 4 },
    strokes: [{
      points: [{ x: 1, y: 3.5 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3.5 }],
      segments: [ln, { kind: 'arc', centre: { x: 2, y: 2 }, sweep: 1 }, ln], closed: false,
      radii: [0, 0, 0, 0], width: 0.5, cap: 'round', join: 'round', endRadius: 0,
    }],
    expectedArea: 0.5 * (1.5 + Math.PI + 1.5) + Math.PI * 0.0625,
  },
  {
    name: 'Rounded ring', note: 'a closed stroke with centre-line radius 0.75 at every corner', cells: { w: 4, h: 4 },
    strokes: [st([[0.5, 0.5], [3.5, 0.5], [3.5, 3.5], [0.5, 3.5]], { closed: true, radii: [0.75, 0.75, 0.75, 0.75] })],
    expectedArea: 0.5 * (4 * 1.5 + 2 * Math.PI * 0.75),
  },
];

function renderStrokeSpecimen(spec: StrokeSpecimen): string {
  const m = 0.5;
  const vb = `${-m} ${-m} ${spec.cells.w + 2 * m} ${spec.cells.h + 2 * m}`;
  const w = (spec.cells.w + 2 * m) * PX_PER_CELL, h = (spec.cells.h + 2 * m) * PX_PER_CELL;
  const results = spec.strokes.map((s) => outlineStroke(s));
  const contours = results.flatMap((r) => r.contours);
  // Centre lines as construction (dashed), drawn from the inputs.
  const centre = spec.strokes.map((s) => {
    let d = `M${s.points[0]!.x} ${s.points[0]!.y}`;
    const count = s.closed ? s.points.length : s.points.length - 1;
    for (let k = 0; k < count; k++) {
      const to = s.points[(k + 1) % s.points.length]!;
      const seg = s.segments[k]!;
      if (seg.kind === 'arc') { const r = Math.hypot(to.x - seg.centre.x, to.y - seg.centre.y); d += `A${r} ${r} 0 0 ${seg.sweep} ${to.x} ${to.y}`; }
      else d += `L${to.x} ${to.y}`;
    }
    if (s.closed) d += 'Z';
    return `<path d="${d}" fill="none" stroke="var(--canvas-radius)" stroke-width="1" stroke-dasharray="2 3" ${ve}/>`;
  }).join('');
  const area = contours.reduce((a, c) => a + contourArea(c), 0);
  const arcs = contours.reduce((a, c) => a + c.segs.filter((s) => s.kind === 'A').length, 0);
  const lines: string[] = [`area ${fmt(Math.abs(area), 4)}${spec.expectedArea !== undefined ? ` · expected ${fmt(spec.expectedArea, 4)} ${Math.abs(Math.abs(area) - spec.expectedArea) < 1e-9 ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}` : ''} · ${arcs} arcs`];
  for (const r of results) for (const i of r.issues) lines.push(`<span class="warn">${i.kind}</span>`);
  const pts = spec.strokes.flatMap((s) => s.points);
  return `<figure class="spec">
  <svg viewBox="${vb}" width="${w}" height="${h}" role="img" aria-label="${spec.name}">
    <rect x="${-m}" y="${-m}" width="${spec.cells.w + 2 * m}" height="${spec.cells.h + 2 * m}" fill="var(--canvas-bg)"/>
    ${gridLayer(spec.cells)}
    <path d="${writePath(contours, { scale: 1, precision: 4 })}" fill="var(--canvas-mark)"/>
    ${centre}
    ${pointsLayer(pts, new Set())}
  </svg>
  <figcaption>
    <h2>${spec.name}</h2>
    <p class="note">${spec.note}</p>
    ${lines.map((l) => `<p class="data">${l}</p>`).join('')}
    <details><summary>Path data (100 units per cell)</summary><code>${writePath(contours, { scale: 100, precision: 3 })}</code></details>
  </figcaption>
</figure>`;
}

// ---- Merge, cut and intersect --------------------------------------------------------------------

const engine = makePaperEngine(createRequire(import.meta.url)('paper-jsdom') as typeof import('paper'));

interface BoolSpecimen {
  name: string;
  note: string;
  cells: { w: number; h: number };
  shapes: PlaneShape[];
  expectedArea?: number;
}

const flat = (n: number): CornerSpec[] => Array.from({ length: n }, () => ({ type: 'round', r: 0 }));
const pg = (pts: [number, number][], corners?: CornerSpec[]): Contour =>
  outlineClosed(pts.map(([x, y]) => ({ x, y })), corners ?? flat(pts.length)).contour!;
const disc = (x: number, y: number, r: number): Contour => outlineClosed([{ x, y }], [{ type: 'outer', r }]).contour!;
const sh = (id: string, role: PlaneShape['role'], contours: Contour[], jointRadius = 0, repeat: PlaneRepeat = { kind: 'none' }): PlaneShape => ({ id, role, contours, repeat, jointRadius });
const lensArea = (r: number, d: number) => 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);

const boltPts: [number, number][] = [[3, 0.5], [1.5, 3], [3, 3], [3, 4.5], [4.5, 2], [3, 2]];
const r2: CornerSpec = { type: 'round', r: 1.5 };
const rayStroke = outlineStroke({ points: [{ x: 3, y: 3 }, { x: 3, y: 0 }], segments: [{ kind: 'line' }], closed: false, radii: [0, 0], width: 0.12, cap: 'butt', join: 'miter', endRadius: 0 }).contours;
const ringStroke = outlineStroke({
  points: [{ x: 1, y: 3 }, { x: 5, y: 3 }], segments: [{ kind: 'arc', centre: { x: 3, y: 3 }, sweep: 1 }, { kind: 'arc', centre: { x: 3, y: 3 }, sweep: 1 }],
  closed: true, radii: [0, 0], width: 1.2, cap: 'butt', join: 'round', endRadius: 0,
}).contours;

const BOOL_SPECIMENS: BoolSpecimen[] = [
  {
    name: 'Merge', note: 'two circles added: one outline, exact arcs on both circles', cells: { w: 6, h: 6 },
    shapes: [sh('a', 'add', [disc(2.25, 3, 1.5)]), sh('b', 'add', [disc(3.75, 3, 1.5)])],
    expectedArea: 2 * Math.PI * 2.25 - lensArea(1.5, 1.5),
  },
  {
    name: 'Merge, joint 0.40', note: 'the same, with the second circle’s joint radius filleting where they meet', cells: { w: 6, h: 6 },
    shapes: [sh('a', 'add', [disc(2.25, 3, 1.5)]), sh('b', 'add', [disc(3.75, 3, 1.5)], 0.4)],
  },
  {
    name: 'Thunderbolt cut', note: 'a block with two round corners, minus a bolt whose tips touch its edges: two pieces', cells: { w: 6, h: 5 },
    shapes: [sh('block', 'add', [pg([[0, 0.5], [6, 0.5], [6, 4.5], [0, 4.5]], [r2, { type: 'round', r: 0 }, r2, { type: 'round', r: 0 }])]), sh('bolt', 'cut', [pg(boltPts)])],
  },
  {
    name: 'Striped circle', note: 'a circle minus one thin stripe repeated ×5 along a line', cells: { w: 6, h: 6 },
    shapes: [sh('disc', 'add', [disc(3, 3, 2.75)]), sh('gap', 'cut', [pg([[-0.5, 0.9], [6.5, 0.9], [6.5, 1.1], [-0.5, 1.1]])], 0, { kind: 'translate', step: { x: 0, y: 1 }, count: 5 })],
  },
  {
    name: 'Sun (8-fold)', note: 'two bars with one round corner each, repeated ×8 on a square grid; copies are exact rotations', cells: { w: 6, h: 6 },
    shapes: [
      sh('upper', 'add', [pg([[2.75, 0.25], [3.25, 0.25], [3.25, 1.25], [2.75, 1.25]], [{ type: 'round', r: 0 }, { type: 'round', r: 0 }, { type: 'round', r: 0 }, { type: 'round', r: 0.2 }])], 0, { kind: 'rotate', centre: { x: 3, y: 3 }, count: 8, mirrored: false }),
      sh('lower', 'add', [pg([[3.25, 1.25], [3.75, 1.25], [3.75, 2.25], [3.25, 2.25]], [{ type: 'round', r: 0 }, { type: 'round', r: 0.2 }, { type: 'round', r: 0 }, { type: 'round', r: 0 }])], 0, { kind: 'rotate', centre: { x: 3, y: 3 }, count: 8, mirrored: false }),
    ],
  },
  {
    name: 'Hatched ring', note: 'one thin ray stroke repeated ×36, intersected with a ring', cells: { w: 6, h: 6 },
    shapes: [sh('rays', 'add', [...rayStroke], 0, { kind: 'rotate', centre: { x: 3, y: 3 }, count: 36, mirrored: false }), sh('ring', 'intersect', [...ringStroke])],
  },
  {
    name: 'Clipped fan, joint 0.15', note: 'a wedge repeated ×6, intersected with a frame whose joint radius rounds the clip corners (m-logo-1)', cells: { w: 6, h: 6 },
    shapes: [
      sh('wedge', 'add', [pg([[3, 3], [3 + 4 * Math.cos(-0.25), 3 + 4 * Math.sin(-0.25)], [3 + 4 * Math.cos(0.25), 3 + 4 * Math.sin(0.25)]])], 0, { kind: 'rotate', centre: { x: 3, y: 3 }, count: 6, mirrored: false }),
      sh('frame', 'intersect', [pg([[0.5, 1], [5.5, 1], [5.5, 5], [0.5, 5]])], 0.15),
    ],
  },
  {
    name: 'Plus, joint 0.20', note: 'one bar repeated ×4: the copies’ own crossings are filleted', cells: { w: 6, h: 6 },
    shapes: [sh('bar', 'add', [pg([[1, 2.5], [5, 2.5], [5, 3.5], [1, 3.5]])], 0.2, { kind: 'rotate', centre: { x: 3, y: 3 }, count: 4, mirrored: false })],
    expectedArea: 7 + 4 * (1 - Math.PI / 4) * 0.04,
  },
];

function renderBoolSpecimen(spec: BoolSpecimen): string {
  const m = 0.5;
  const vb = `${-m} ${-m} ${spec.cells.w + 2 * m} ${spec.cells.h + 2 * m}`;
  const w = (spec.cells.w + 2 * m) * PX_PER_CELL, h = (spec.cells.h + 2 * m) * PX_PER_CELL;
  const mark = evaluateMark(spec.shapes, engine);
  const contours = mark.pieces.flatMap((p) => [p.outer, ...p.holes]);
  const area = contours.reduce((a, c) => a + contourArea(c), 0);
  const arcs = contours.reduce((a, c) => a + c.segs.filter((s) => s.kind === 'A').length, 0);
  // Cut and intersect shapes are construction: dashed outlines (DESIGN.md §4), repeat copies included.
  const construction = spec.shapes.filter((s) => s.role !== 'add').map((s) =>
    `<path d="${writePath(expandRepeat(s.contours, s.repeat).flat(), { scale: 1, precision: 4 })}" fill="none" stroke="var(--canvas-cut)" stroke-width="1.25" stroke-dasharray="6 4" ${ve}/>`).join('');
  const lines = [`${mark.pieces.length} piece${mark.pieces.length === 1 ? '' : 's'} · area ${fmt(area, 4)}${spec.expectedArea !== undefined ? ` · expected ${fmt(spec.expectedArea, 4)} ${Math.abs(area - spec.expectedArea) < 1e-9 ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}` : ''} · ${arcs} arcs`];
  for (const e of mark.errors) lines.push(`<span class="bad">${e.message}</span>`);
  for (const i of mark.issues) lines.push(`<span class="warn">joint at (${fmt(i.at.x, 2)}, ${fmt(i.at.y, 2)}): ${fmt(i.actual, 3)} of ${fmt(i.requested, 2)}</span>`);
  return `<figure class="spec">
  <svg viewBox="${vb}" width="${w}" height="${h}" role="img" aria-label="${spec.name}">
    <rect x="${-m}" y="${-m}" width="${spec.cells.w + 2 * m}" height="${spec.cells.h + 2 * m}" fill="var(--canvas-bg)"/>
    ${gridLayer(spec.cells)}
    <path d="${writePath(contours, { scale: 1, precision: 4 })}" fill="var(--canvas-mark)"/>
    ${construction}
  </svg>
  <figcaption>
    <h2>${spec.name}</h2>
    <p class="note">${spec.note}</p>
    ${lines.map((l) => `<p class="data">${l}</p>`).join('')}
    <details><summary>Path data (100 units per cell)</summary><code>${writePath(contours, { scale: 100, precision: 3 })}</code></details>
  </figcaption>
</figure>`;
}

export function renderGalleryHtml(tokensCss: string, meta: { commit: string }): string {
  return `<title>Geometry Gallery</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${tokensCss}
html, body { background: var(--color-bg); color: var(--color-text); }
body { margin: 0; font-family: var(--font-mono); font-size: var(--type-body-size); line-height: var(--type-body-lh);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: var(--space-6) var(--space-8); }
main { max-width: 1240px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-4); }
header { display: flex; flex-direction: column; gap: var(--space-1); max-width: 72ch; }
h1 { font-family: var(--font-serif); font-style: italic; font-weight: 400; font-size: var(--type-title-size); line-height: var(--type-title-lh); margin: 0; }
header p { margin: 0; color: var(--color-text-muted); }
.legend { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); font-size: var(--type-micro-size); line-height: var(--type-micro-lh); color: var(--color-text-muted); }
.legend i { display: inline-block; width: 16px; height: 0; border-top: 1.25px solid var(--canvas-radius); vertical-align: middle; margin-right: var(--space-0-5); }
.legend i.dash { border-top-style: dashed; }
.legend i.clamp { border-top-color: var(--canvas-clamped); }
.legend i.bad { border-top-color: var(--canvas-invalid); border-top-style: dashed; }
.sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: var(--space-3); }
.spec { margin: 0; display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.spec svg { display: block; width: 100%; height: auto; max-width: 100%; border: var(--border-width) solid var(--color-border); }
figcaption { display: flex; flex-direction: column; gap: var(--space-0-5); min-width: 0; }
figcaption h2 { margin: 0; font-family: var(--font-serif); font-style: italic; font-weight: 400; font-size: var(--type-heading-size); line-height: var(--type-heading-lh); }
.note { margin: 0; color: var(--color-text-muted); font-size: var(--type-micro-size); line-height: var(--type-micro-lh); }
.data { margin: 0; font-size: var(--type-micro-size); line-height: var(--type-micro-lh); font-variant-numeric: tabular-nums; }
.ok { color: var(--color-accent); } .warn { color: var(--color-warning); } .bad { color: var(--color-danger); }
details { font-size: var(--type-micro-size); line-height: var(--type-micro-lh); color: var(--color-text-muted); }
summary { cursor: pointer; min-height: 24px; display: flex; align-items: center; }
summary:focus-visible { outline: var(--focus-width) solid var(--color-accent); outline-offset: 2px; }
code { display: block; overflow-wrap: anywhere; color: var(--color-text); padding-top: var(--space-0-5); }
.section { margin: var(--space-3) 0 0; font-family: var(--font-serif); font-style: italic; font-weight: 400; font-size: var(--type-title-size); line-height: var(--type-title-lh); }
.intro { margin: 0; color: var(--color-text-muted); max-width: 72ch; }
footer { color: var(--color-text-muted); font-size: var(--type-micro-size); border-top: var(--border-width) solid var(--color-border); padding-top: var(--space-2); }
</style>
<main>
  <header>
    <h1>Geometry gallery</h1>
    <p>Real output of the corner geometry, drawn with the Drafting film canvas styles. Every point is a lattice point on a square grid with half-cell steps, every outline is lines and exact circular arcs, and the path data is what the export writer produces. Areas are checked against closed-form answers where one exists.</p>
    <div class="legend"><span><i></i>outer or fillet circle (dot = fillet centre)</span><span><i class="dash"></i>inward or cove circle</span><span><i class="clamp"></i>clamped fillet</span><span><i class="bad"></i>invalid</span></div>
  </header>
  <h2 class="section">Fills and corners</h2>
  <section class="sheet">
${SPECIMENS.map(renderSpecimen).join('\n')}
  </section>
  <h2 class="section">Strokes</h2>
  <p class="intro">Strokes are outlined exactly: lines offset to parallel lines, arcs to arcs around the same centre. The dashed line is the centre line. A stroke with no overlaps has area = width × centre-line length, plus its caps.</p>
  <section class="sheet">
${STROKE_SPECIMENS.map(renderStrokeSpecimen).join('\n')}
  </section>
  <h2 class="section">Merge, cut and intersect</h2>
  <p class="intro">Shapes fold in order through Paper.js, then every curve is recovered as an exact line or source arc and every corner is recomputed as an exact crossing. Dashed outlines are cut and intersect shapes. A joint radius fillets the corners an operation creates.</p>
  <section class="sheet">
${BOOL_SPECIMENS.map(renderBoolSpecimen).join('\n')}
  </section>
  <footer>Built from commit ${meta.commit}. IBM Plex isn't bundled yet, so the type uses its fallback stack.</footer>
</main>`;
}
