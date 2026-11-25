/**
 * Stroke outlines: closed-form areas (a stroke with no self-overlap has area = width × centre-line
 * length, plus cap and join terms) and the P4 arc-validity checks on random strokes.
 */
import fc from 'fast-check';
import { contourArea, len, segStarts, type Contour } from '../src/geometry/contour';
import { outlineStroke, type Cap, type Join, type StrokeInput } from '../src/geometry/strokes';
import { sub, vec, type Vec2 } from '../src/geometry/num';

const RUNS = Number(process.env.FC_RUNS ?? 200);
const area = (cs: readonly Contour[]) => cs.reduce((a, c) => a + contourArea(c), 0);
const line = { kind: 'line' as const };

function stroke(pts: Vec2[], over: Partial<StrokeInput> = {}): StrokeInput {
  return {
    points: pts, segments: pts.slice(0, over.closed ? pts.length : -1).map(() => line), closed: false,
    radii: pts.map(() => 0), width: 1, cap: 'butt', join: 'miter', endRadius: 0, ...over,
  };
}

/** Arcs valid (r > 0, ends on circle, distinct ends, chord ≤ diameter) and every contour closed. */
function validArcs(cs: readonly Contour[]): string | null {
  for (const c of cs) {
    const starts = segStarts(c);
    if (c.segs.length === 0) return 'empty';
    if (len(sub((c.segs[c.segs.length - 1] as Contour['segs'][number]).to, c.start)) > 1e-9) return 'not closed';
    for (let i = 0; i < c.segs.length; i++) {
      const s = c.segs[i] as Contour['segs'][number];
      if (s.kind !== 'A') continue;
      const from = starts[i] as Vec2;
      if (!(s.r > 0)) return `r ${s.r}`;
      if (len(sub(s.to, from)) < 1e-9) return 'arc ends coincide';
      if (Math.abs(len(sub(from, s.centre)) - s.r) > 1e-9 || Math.abs(len(sub(s.to, s.centre)) - s.r) > 1e-9) return 'arc end off circle';
      if (len(sub(s.to, from)) > 2 * s.r * (1 + 1e-9)) return 'chord > diameter';
      {
        // The sweep must agree with the endpoints: rotating the start by the sweep lands on the end.
        const a0 = Math.atan2(from.y - s.centre.y, from.x - s.centre.x) + s.sweep;
        const land = { x: s.centre.x + s.r * Math.cos(a0), y: s.centre.y + s.r * Math.sin(a0) };
        if (len(sub(land, s.to)) > 1e-9 * Math.max(1, s.r)) return `arc ${typeof i === 'number' ? i : ''}: sweep disagrees with endpoints`;
      }
    }
  }
  return null;
}

describe('strokes: closed-form areas', () => {
  const L4 = [vec(0, 0), vec(4, 0)];

  it('butt cap: a straight stroke is a w × L rectangle', () => {
    const r = outlineStroke(stroke(L4));
    expect(Math.abs(area(r.contours))).toBeCloseTo(4, 12);
    expect(validArcs(r.contours)).toBeNull();
  });

  it('round caps add a full circle of radius w/2: wL + π(w/2)²', () => {
    const r = outlineStroke(stroke(L4, { cap: 'round' }));
    expect(Math.abs(area(r.contours))).toBeCloseTo(4 + Math.PI / 4, 12);
    expect(validArcs(r.contours)).toBeNull();
  });

  it('square caps extend by w/2 at each end: (L + w)·w', () => {
    expect(Math.abs(area(outlineStroke(stroke(L4, { cap: 'square' })).contours))).toBeCloseTo(5, 12);
  });

  it('end radius softens all four butt corners: wL − 4(1 − π/4)e²', () => {
    const e = 0.2;
    const r = outlineStroke(stroke(L4, { endRadius: e }));
    expect(r.issues).toEqual([]);
    expect(Math.abs(area(r.contours))).toBeCloseTo(4 - 4 * (1 - Math.PI / 4) * e * e, 12);
    expect(validArcs(r.contours)).toBeNull();
  });

  it('end radius on square caps softens the extended corners', () => {
    const e = 0.25;
    const r = outlineStroke(stroke(L4, { cap: 'square', endRadius: e }));
    expect(Math.abs(area(r.contours))).toBeCloseTo(5 - 4 * (1 - Math.PI / 4) * e * e, 12);
  });

  it('end radius is clamped to half the width, and reported', () => {
    const r = outlineStroke(stroke(L4, { endRadius: 2 }));
    expect(r.issues).toContainEqual({ kind: 'end-radius-clamped', requested: 2, actual: 0.5 });
    expect(Math.abs(area(r.contours))).toBeCloseTo(4 - 4 * (1 - Math.PI / 4) * 0.25, 12); // fully round ends
  });

  // An L: (0,0) → (4,0) → (4,3), width 1. Centre-line length 7.
  const EL = [vec(0, 0), vec(4, 0), vec(4, 3)];

  it('miter join at a right angle: area = w × centre-line length = 7', () => {
    const r = outlineStroke(stroke(EL, { join: 'miter' }));
    expect(Math.abs(area(r.contours))).toBeCloseTo(7, 12);
  });

  it('round join replaces the outer corner square with a quarter circle: 7 − ¼ + π/16', () => {
    const r = outlineStroke(stroke(EL, { join: 'round' }));
    expect(Math.abs(area(r.contours))).toBeCloseTo(7 - 0.25 + Math.PI / 16, 12);
    expect(validArcs(r.contours)).toBeNull();
  });

  it('bevel join cuts the outer corner square in half: 7 − ⅛', () => {
    expect(Math.abs(area(outlineStroke(stroke(EL, { join: 'bevel' })).contours))).toBeCloseTo(7 - 0.125, 12);
  });

  it('miter beyond the limit falls back to bevel', () => {
    // A 20° hairpin-ish turn: miter ratio 1/sin(10°) ≈ 5.8 > 4.
    const pts = [vec(0, 0), vec(4, 0), vec(4 - 4 * Math.cos((20 * Math.PI) / 180), 4 * Math.sin((20 * Math.PI) / 180))];
    const miter = outlineStroke(stroke(pts, { join: 'miter' }));
    const bevel = outlineStroke(stroke(pts, { join: 'bevel' }));
    expect(area(miter.contours)).toBeCloseTo(area(bevel.contours), 12);
  });

  it('a rounded centre-line corner gives concentric arcs: area = w × (3 + π/2 + 2)', () => {
    // Radius 1 on the L's corner shortens each leg by 1 and adds a quarter arc of length π/2.
    const r = outlineStroke(stroke(EL, { radii: [0, 1, 0] }));
    expect(r.issues).toEqual([]);
    expect(Math.abs(area(r.contours))).toBeCloseTo(5 + Math.PI / 2, 12);
    const arcs = r.contours[0]!.segs.filter((s) => s.kind === 'A').map((s) => (s as { r: number }).r).sort();
    expect(arcs).toEqual([0.5, 1.5]); // inner R − w/2 and outer R + w/2 (the asterisk's corners)
  });

  it('an arc segment strokes to a half annulus: w × πR', () => {
    const r = outlineStroke({
      points: [vec(0, 0), vec(4, 0)], segments: [{ kind: 'arc', centre: vec(2, 0), sweep: 1 }], closed: false,
      radii: [0, 0], width: 1, cap: 'butt', join: 'miter', endRadius: 0,
    });
    expect(r.issues).toEqual([]);
    expect(Math.abs(area(r.contours))).toBeCloseTo(2 * Math.PI, 12);
    expect(validArcs(r.contours)).toBeNull();
  });

  it('m-logo-2 style: a round-capped arch is w × πR + π(w/2)²', () => {
    const r = outlineStroke({
      points: [vec(0, 0), vec(4, 0)], segments: [{ kind: 'arc', centre: vec(2, 0), sweep: 0 }], closed: false,
      radii: [0, 0], width: 0.5, cap: 'round', join: 'round', endRadius: 0,
    });
    expect(Math.abs(area(r.contours))).toBeCloseTo(0.5 * 2 * Math.PI + Math.PI * 0.0625, 12);
  });

  it('a closed square ring: outer² − inner² = w × perimeter', () => {
    const sq = [vec(0, 0), vec(2, 0), vec(2, 2), vec(0, 2)];
    const r = outlineStroke(stroke(sq, { closed: true, width: 0.5, segments: sq.map(() => line) }));
    expect(r.contours).toHaveLength(2);
    expect(Math.abs(area(r.contours))).toBeCloseTo(2.5 * 2.5 - 1.5 * 1.5, 12);
  });

  it('a closed ring with rounded centre-line corners keeps w × length', () => {
    const sq = [vec(0, 0), vec(4, 0), vec(4, 4), vec(0, 4)];
    const r = outlineStroke(stroke(sq, { closed: true, width: 0.5, radii: [1, 1, 1, 1], segments: sq.map(() => line) }));
    // Centre line: 4 legs of 2 + 4 quarter arcs of radius 1 = 8 + 2π.
    expect(Math.abs(area(r.contours))).toBeCloseTo(0.5 * (8 + 2 * Math.PI), 12);
    expect(validArcs(r.contours)).toBeNull();
  });

  it('flags an arc tighter than half the stroke width instead of turning it inside out', () => {
    const r = outlineStroke({
      points: [vec(0, 0), vec(0.6, 0)], segments: [{ kind: 'arc', centre: vec(0.3, 0), sweep: 1 }], closed: false,
      radii: [0, 0], width: 1, cap: 'butt', join: 'miter', endRadius: 0,
    });
    expect(r.contours).toEqual([]);
    expect(r.issues).toEqual([{ kind: 'too-wide', segment: 0, maxWidth: 0.6 }]);
  });

  it('flags an arc whose ends are not the same distance from its centre', () => {
    const r = outlineStroke({
      points: [vec(0, 0), vec(3, 0)], segments: [{ kind: 'arc', centre: vec(1, 0), sweep: 1 }], closed: false,
      radii: [0, 0], width: 0.2, cap: 'butt', join: 'miter', endRadius: 0,
    });
    expect(r.issues).toEqual([{ kind: 'arc-not-equidistant', segment: 0 }]);
  });
});

describe('P4 for strokes: every output arc is valid', () => {
  const strokeArb = fc
    .array(fc.record({ x: fc.integer({ min: 0, max: 8 }), y: fc.integer({ min: 0, max: 8 }) }), { minLength: 2, maxLength: 6 })
    .filter((pts) => pts.every((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y))
    .chain((pts) =>
      fc.record({
        pts: fc.constant(pts.map((p) => vec(p.x, p.y))),
        width: fc.integer({ min: 1, max: 240 }).map((k) => k / 240),
        cap: fc.constantFrom<Cap>('butt', 'square', 'round'),
        join: fc.constantFrom<Join>('miter', 'round', 'bevel'),
        endRadius: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 120 }).map((k) => k / 240)),
        radii: fc.array(fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 480 }).map((k) => k / 240)), { minLength: pts.length, maxLength: pts.length }),
      }),
    );

  it('holds for random open strokes, caps, joins, widths, end radii and corner radii', () => {
    fc.assert(
      fc.property(strokeArb, ({ pts, width, cap, join, endRadius, radii }) => {
        const r = outlineStroke({ points: pts, segments: pts.slice(1).map(() => line), closed: false, radii, width, cap, join, endRadius });
        if (r.contours.length === 0) {
          expect(r.issues.length).toBeGreaterThan(0);
          return;
        }
        expect(validArcs(r.contours)).toBeNull();
        expect(outlineStroke({ points: pts, segments: pts.slice(1).map(() => line), closed: false, radii, width, cap, join, endRadius })).toEqual(r);
      }),
      { numRuns: RUNS },
    );
  });

  it('a straight single-segment stroke always has area w × L plus its cap terms', () => {
    fc.assert(
      fc.property(strokeArb, ({ pts, width, cap, endRadius }) => {
        const two = pts.slice(0, 2);
        const L = len(sub(two[1]!, two[0]!));
        const r = outlineStroke({ points: two, segments: [line], closed: false, radii: [0, 0], width, cap, join: 'miter', endRadius });
        const h = width / 2;
        const e = cap === 'round' ? 0 : Math.min(endRadius, h, cap === 'butt' ? L / 2 : h);
        const base = cap === 'butt' ? width * L : cap === 'square' ? width * (L + width) : width * L + Math.PI * h * h;
        expect(Math.abs(area(r.contours))).toBeCloseTo(base - 4 * (1 - Math.PI / 4) * e * e, 9);
      }),
      { numRuns: RUNS },
    );
  });
});
