/**
 * SVG export (VERIFICATION.md §3.1 E1–E7, §2 P2). Run on every example and on random documents built
 * through commands, with and without the construction overlay. SVGO is the Node build with the
 * project config.
 */
import fc from 'fast-check';
import { createRequire } from 'node:module';
import { optimize } from 'svgo';
import { readFileSync } from 'node:fs';
import { EXAMPLES } from '../src/examples';
import { lattice } from '../src/geometry/lattice';
import { defaultGrid, type GridDef } from '../src/grids';
import { apply, type Command } from '../src/model/commands';
import { emptyDocument, type ExportSettings, type LogoDocument } from '../src/model/types';
import { evaluateDocument } from '../src/pipeline/resolve';
import { contourBounds } from '../src/export/bounds';
import { OVERLAY_PALETTE, OVERLAY_TOKENS } from '../src/export/palette';
import { buildSvg, exportProblems, finishSvg, type Optimize } from '../src/export/svg';
import { engine } from './paper-engine';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as { JSDOM: new (html?: string, opts?: object) => { window: { DOMParser: typeof DOMParser } } };
const parser = new new JSDOM('').window.DOMParser();
const opt = optimize as unknown as Optimize;

function exportDoc(doc: LogoDocument, settings: Partial<ExportSettings> = {}) {
  const ev = evaluateDocument(doc, engine);
  const s = { ...doc.export, ...settings };
  const raw = buildSvg(doc, ev, s);
  return { ev, raw: raw.svg, svg: finishSvg(raw.svg, opt) };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** E1–E5 and E7 on one exported file. Returns the root for further checks. */
function checkFile(svg: string, pieces: number, overlay: boolean) {
  // E1 Valid XML, root <svg> in the SVG namespace with width, height and viewBox.
  const xml = parser.parseFromString(svg, 'image/svg+xml');
  expect(xml.getElementsByTagName('parsererror').length).toBe(0);
  const root = xml.documentElement;
  expect(root.localName).toBe('svg');
  expect(root.namespaceURI).toBe(SVG_NS);
  for (const a of ['width', 'height', 'viewBox']) expect(root.getAttribute(a)).toBeTruthy();
  // E2 Allowed elements.
  const kids = [...root.children];
  if (overlay) {
    expect(kids[0]!.localName).toBe('g');
    expect(kids[0]!.getAttribute('id')).toBe('construction');
    expect(kids.filter((k) => k.localName === 'g')).toHaveLength(1);
    for (const el of kids[0]!.querySelectorAll('*')) expect(['path', 'line', 'circle']).toContain(el.localName);
    for (const el of kids.slice(1)) expect(el.localName).toBe('path');
  } else {
    for (const el of kids) expect(el.localName).toBe('path');
  }
  // E3 No transforms, styles, classes, or ids other than construction.
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of ['transform', 'style', 'class']) expect(el.hasAttribute(a)).toBe(false);
    if (el.hasAttribute('id')) expect(el.getAttribute('id')).toBe('construction');
  }
  // E4 Path commands: M L H V A Z only (any case after SVGO).
  const markPaths = kids.filter((k) => k.localName === 'path');
  for (const p of root.querySelectorAll('path')) expect(p.getAttribute('d')).toMatch(/^[MLHVAZmlhvaz0-9.\s,\-e]*$/);
  for (const p of root.querySelectorAll('path')) expect(p.getAttribute('d')).not.toMatch(/[CSQTcsqt]/);
  // E5 No number has more than 3 decimal places.
  expect(svg).not.toMatch(/\d\.\d{4,}/);
  // E7 One mark path per piece.
  expect(markPaths).toHaveLength(pieces);
  return root;
}

describe('SVG export: examples', () => {
  for (const ex of EXAMPLES) {
    for (const overlay of ['off', 'dark', 'light'] as const) {
      it(`${ex.name}, overlay ${overlay}: valid, clean, SVGO-stable (E1–E7)`, () => {
        const doc = ex.build();
        const { ev, svg } = exportDoc(doc, { overlay, edgeGuides: overlay === 'light' });
        expect(exportProblems(doc, ev)).toEqual([]);
        checkFile(svg, ev.mark.pieces.length, overlay !== 'off');
        // E6 SVGO applied and stable.
        expect(finishSvg(svg, opt)).toBe(svg);
      });
    }
  }

  it('E5: a lattice-only mark on a square grid exports integers only (Block P, sharp corners)', () => {
    const { svg } = exportDoc(EXAMPLES.find((e) => e.id === 'block-p')!.build());
    const numbers = svg.match(/-?\d*\.?\d+/g) ?? [];
    expect(numbers.filter((n) => n.includes('.'))).toEqual([]);
  });

  it('the dark overlay draws the mark in --canvas-mark; otherwise the export colour is used', () => {
    const doc = EXAMPLES[0]!.build();
    expect(exportDoc(doc, { overlay: 'dark' }).raw).toContain(`fill="${OVERLAY_PALETTE.dark.mark}"`);
    expect(exportDoc(doc, { colour: '#123456' }).raw).toContain('fill="#123456"');
  });

  it('padding grows the frame by the padding on every side', () => {
    const doc = EXAMPLES[0]!.build();
    const ev = evaluateDocument(doc, engine);
    const a = buildSvg(doc, ev, { ...doc.export, paddingCells: 0 }), b = buildSvg(doc, ev, { ...doc.export, paddingCells: 1 });
    expect(b.width - a.width).toBeCloseTo(2 * doc.export.unitsPerCell, 9);
    expect(b.height - a.height).toBeCloseTo(2 * doc.export.unitsPerCell, 9);
  });
});

describe('SVG export: problems block export (SPEC.md §9)', () => {
  const g = { ...defaultGrid('square'), width: 6, height: 6, subdivision: 1 } as GridDef;
  it('an empty document has nothing to export', () => {
    const doc = emptyDocument(g);
    expect(exportProblems(doc, evaluateDocument(doc, engine))[0]!.text).toBe('Nothing to export yet.');
  });
  it('a mark cut away entirely says so', () => {
    let doc = emptyDocument(g);
    const run = (c: Command) => { const r = apply(doc, c); if (!r.ok) throw new Error(r.error); doc = r.doc; };
    for (const role of ['add', 'cut'] as const) {
      run({ type: 'addShape', at: lattice(role === 'add' ? 1 : 0, role === 'add' ? 1 : 0) });
      const id = doc.shapes[doc.shapes.length - 1]!.id, o = role === 'add' ? 1 : 0, e = role === 'add' ? 3 : 4;
      run({ type: 'appendPoint', shapeId: id, at: lattice(e, o) });
      run({ type: 'appendPoint', shapeId: id, at: lattice(e, e) });
      run({ type: 'appendPoint', shapeId: id, at: lattice(o, e) });
      run({ type: 'closeShape', shapeId: id });
      if (role === 'cut') run({ type: 'setRole', shapeId: id, role: 'cut' });
    }
    expect(exportProblems(doc, evaluateDocument(doc, engine))[0]!.text).toBe('The cut shapes remove the whole mark.');
  });
});

/** Random documents through commands: rectangles with roles and radii, and lines. */
const docArb = fc
  .array(
    fc.record({
      x: fc.integer({ min: 0, max: 10 }), y: fc.integer({ min: 0, max: 10 }),
      w: fc.integer({ min: 2, max: 6 }), h: fc.integer({ min: 2, max: 6 }),
      role: fc.constantFrom('add', 'add', 'cut', 'intersect'),
      radius: fc.constantFrom(0, 0, 30, 60, 120),
      corner: fc.constantFrom('round', 'inward', 'auto', 'outer'),
      stroke: fc.boolean(),
      width: fc.constantFrom(30, 60, 120),
    }),
    { minLength: 1, maxLength: 4 },
  )
  .map((rects) => {
    const g = { ...defaultGrid('square'), width: 8, height: 8, subdivision: 2 } as GridDef;
    let doc = emptyDocument(g);
    const run = (c: Command) => { const r = apply(doc, c); if (r.ok) doc = r.doc; return r.ok; };
    for (const r of rects) {
      const x1 = Math.min(16, r.x + r.w), y1 = Math.min(16, r.y + r.h);
      if (r.stroke) {
        if (!run({ type: 'addShape', at: lattice(r.x, r.y), paint: 'stroke', width: r.width })) continue;
        const id = doc.shapes[doc.shapes.length - 1]!.id;
        run({ type: 'appendPoint', shapeId: id, at: lattice(x1, r.y) });
        run({ type: 'appendPoint', shapeId: id, at: lattice(x1, y1) });
        continue;
      }
      if (!run({ type: 'addShape', at: lattice(r.x, r.y) })) continue;
      const id = doc.shapes[doc.shapes.length - 1]!.id;
      run({ type: 'appendPoint', shapeId: id, at: lattice(x1, r.y) });
      run({ type: 'appendPoint', shapeId: id, at: lattice(x1, y1) });
      run({ type: 'appendPoint', shapeId: id, at: lattice(r.x, y1) });
      run({ type: 'closeShape', shapeId: id });
      const vs = doc.shapes[doc.shapes.length - 1]!.path.vertices.map((v) => v.id);
      if (r.radius) run({ type: 'setRadius', vertexIds: vs, radius: r.radius });
      if (r.corner !== 'round') run({ type: 'setCorner', vertexIds: vs, corner: r.corner as 'inward' });
      if (r.role !== 'add') run({ type: 'setRole', shapeId: id, role: r.role as 'cut' });
    }
    return doc;
  });

describe('SVG export: random documents', () => {
  it('E1–E7 hold, with and without the overlay', () => {
    fc.assert(
      fc.property(docArb, fc.constantFrom('off', 'dark', 'light'), fc.boolean(), (doc, overlay, edgeGuides) => {
        const ev = evaluateDocument(doc, engine);
        if (exportProblems(doc, ev).length) return; // blocked documents are never exported
        const { svg } = exportDoc(doc, { overlay, edgeGuides });
        checkFile(svg, ev.mark.pieces.length, overlay !== 'off');
        expect(finishSvg(svg, opt)).toBe(svg);
      }),
      { numRuns: 60 },
    );
  }, 120_000);

  it('P2: export is byte-identical across calls and across a JSON round trip', () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const ev = evaluateDocument(doc, engine);
        if (exportProblems(doc, ev).length) return;
        const a = exportDoc(doc, { overlay: 'dark' }).svg;
        const b = exportDoc(doc, { overlay: 'dark' }).svg;
        const c = exportDoc(JSON.parse(JSON.stringify(doc)) as LogoDocument, { overlay: 'dark' }).svg;
        expect(b).toBe(a);
        expect(c).toBe(a);
      }),
      { numRuns: 40 },
    );
  }, 120_000);
});

describe('export bounds', () => {
  it('a circle of radius 2 at (3, 3) spans exactly 1…5', () => {
    const doc = (() => {
      const g = { ...defaultGrid('square'), width: 6, height: 6, subdivision: 1 } as GridDef;
      let d = emptyDocument(g);
      const r1 = apply(d, { type: 'addShape', at: lattice(3, 3) }); if (!r1.ok) throw new Error(r1.error); d = r1.doc;
      const r2 = apply(d, { type: 'setRadius', vertexIds: [d.shapes[0]!.path.vertices[0]!.id], radius: 480 }); if (!r2.ok) throw new Error(r2.error);
      return r2.doc;
    })();
    const { mark } = evaluateDocument(doc, engine);
    expect(contourBounds(mark.pieces.map((p) => p.outer))).toEqual({ minX: 1, minY: 1, maxX: 5, maxY: 5 });
  });

  it('a quarter arc only reaches the extremes it passes through', () => {
    // From (1, 0) to (0, 1) about the origin, sweeping +90°: bounds 0…1 both ways, not −1…1.
    const b = contourBounds([{ start: { x: 1, y: 0 }, segs: [{ kind: 'A', to: { x: 0, y: 1 }, centre: { x: 0, y: 0 }, r: 1, sweep: Math.PI / 2 }, { kind: 'L', to: { x: 1, y: 0 } }] }]);
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  });
});

describe('overlay colours', () => {
  it('match the DESIGN.md tokens in src/ui/tokens.css', () => {
    const css = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
    for (const style of ['dark', 'light'] as const) {
      for (const [k, token] of Object.entries(OVERLAY_TOKENS[style])) {
        if (!token) continue;
        const m = css.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
        expect(m?.[1], `${style}.${k} (${token})`).toBe(OVERLAY_PALETTE[style][k as keyof typeof OVERLAY_PALETTE.dark]);
      }
    }
  });
});
