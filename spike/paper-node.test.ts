/**
 * Spike: prove Paper.js boolean operations work headless in Node via paper-jsdom
 * (ARCHITECTURE.md §5.1). Areas are compared with closed-form geometry.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// paper-jsdom is CommonJS and exports the paper namespace.
const paper = require('paper-jsdom') as typeof import('paper');

const scope = new paper.PaperScope();
scope.setup(new scope.Size(1, 1));

const insert = { insert: false } as const;
const circle = (x: number, y: number, r: number) =>
  new scope.Path.Circle({ center: [x, y], radius: r, insert: false });
const rect = (x: number, y: number, w: number, h: number) =>
  new scope.Path.Rectangle({ point: [x, y], size: [w, h], insert: false });

/**
 * Paper.js draws a circle as 4 cubics (kappa approximation). Its area is about 0.027% larger than
 * the true circle, so curved results are compared with a relative bound. This error is the reason
 * export recovers exact arcs (ARCHITECTURE.md §5.2); it is not a boolean error.
 */
const KAPPA_AREA_ERROR = 3e-4;
const closeRel = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThan(KAPPA_AREA_ERROR);

/** Area of the intersection of two equal circles of radius r whose centres are d apart. */
const lens = (r: number, d: number) => 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);

describe('Paper.js booleans in Node (paper-jsdom)', () => {
  it('unites two overlapping circles', () => {
    const r = 1, d = 1;
    const out = circle(0, 0, r).unite(circle(d, 0, r), insert) as paper.PathItem;
    const expected = 2 * Math.PI * r * r - lens(r, d);
    closeRel(Math.abs(out.area), expected);
  });

  it('subtracts a circle from a square (cutout) and keeps it as a hole', () => {
    const out = rect(0, 0, 4, 4).subtract(circle(2, 2, 1), insert) as paper.PathItem;
    closeRel(Math.abs(out.area), 16 - Math.PI);
    expect(out.className).toBe('CompoundPath');
  });

  it('intersects a wedge with a frame (m-logo-1 style clip)', () => {
    const wedge = new scope.Path({ segments: [[0, 0], [10, -1], [10, 1]], closed: true, insert: false });
    const out = wedge.intersect(rect(-5, -5, 10, 10), insert) as paper.PathItem;
    // wedge clipped at x = 5: triangle with base 1 (from y = -0.5..0.5) and height 5
    expect(Math.abs(out.area)).toBeCloseTo(2.5, 6);
  });

  it('handles shapes that share an edge exactly (the common lattice case)', () => {
    const out = rect(0, 0, 1, 1).unite(rect(1, 0, 1, 1), insert) as paper.PathItem;
    expect(Math.abs(out.area)).toBeCloseTo(2, 9);
    // the shared edge must disappear: a single 2x1 rectangle has 4 corners
    const segs = (out as paper.Path).segments ?? (out as paper.CompoundPath).children.flatMap((c) => (c as paper.Path).segments);
    expect(segs.length).toBe(4);
  });

  it('handles a circle tangent to a line (the other common lattice case)', () => {
    const out = rect(0, 0, 2, 2).unite(circle(1, 3, 1), insert) as paper.PathItem;
    closeRel(Math.abs(out.area), 4 + Math.PI);
  });

  it('stores arcs as cubic Béziers (so export needs arc recovery)', () => {
    const c = circle(0, 0, 1);
    expect(c.segments.length).toBe(4);
    expect(c.curves.every((cv) => cv.hasHandles())).toBe(true);
  });
});
