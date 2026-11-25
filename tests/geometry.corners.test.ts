/**
 * Corner geometry: closed-form checks, plus P4 (valid arcs, tangent continuity) and P7 (clamping and
 * invalid shapes) from VERIFICATION.md §2.
 */
import fc from 'fast-check';
import { contourArea, dot, len, segStarts, segTangents, type Contour } from '../src/geometry/contour';
import { outlineClosed, type CornerSpec, type CornerType } from '../src/geometry/corners';
import { sub, vec, type Vec2 } from '../src/geometry/num';

const RUNS = Number(process.env.FC_RUNS ?? 200);
const sq = (r: number, type: CornerType = 'round'): CornerSpec[] => Array.from({ length: 4 }, () => ({ type, r }));
const UNIT = [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, 1)];

/**
 * P4 checks on one contour. Returns a reason string on failure, or null. A tangent break is only
 * allowed at a sharp input point (radius 0, or a fillet clamped to nothing), where it is a real corner.
 */
function checkContour(c: Contour, sharp: readonly Vec2[] = []): string | null {
  const starts = segStarts(c);
  const n = c.segs.length;
  if (n === 0) return 'empty contour';
  const lastTo = (c.segs[n - 1] as Contour['segs'][number]).to;
  if (len(sub(lastTo, c.start)) > 1e-9) return 'not closed';
  for (let i = 0; i < n; i++) {
    const s = c.segs[i] as Contour['segs'][number];
    const from = starts[i] as Vec2;
    if (s.kind === 'A') {
      if (!(s.r > 0)) return `arc ${i}: radius ${s.r}`;
      if (len(sub(s.to, from)) < 1e-9) return `arc ${i}: endpoints coincide`;
      if (Math.abs(len(sub(from, s.centre)) - s.r) > 1e-9 || Math.abs(len(sub(s.to, s.centre)) - s.r) > 1e-9) return `arc ${i}: endpoint off circle`;
      if (len(sub(s.to, from)) > 2 * s.r * (1 + 1e-9)) return `arc ${i}: chord longer than diameter (λ > 1)`;
      if (!(Math.abs(s.sweep) > 0 && Math.abs(s.sweep) < 2 * Math.PI)) return `arc ${i}: sweep ${s.sweep}`;
    }
    // Tangent continuity wherever an arc meets another segment.
    const next = c.segs[(i + 1) % n] as Contour['segs'][number];
    const atSharp = sharp.some((p) => len(sub(p, s.to)) < 1e-9);
    if ((s.kind === 'A' || next.kind === 'A') && !atSharp) {
      const tEnd = segTangents(from, s).end;
      const tNext = segTangents(s.to, next).start;
      if (1 - dot(tEnd, tNext) > 1e-9) return `junction ${i}: tangent break of ${Math.acos(Math.min(1, dot(tEnd, tNext)))} rad`;
    }
  }
  return null;
}

describe('corners: closed-form checks', () => {
  it('radius 0 leaves every corner type sharp, through the points', () => {
    for (const type of ['auto', 'outer', 'round', 'inward'] as const) {
      const { contour, issues } = outlineClosed(UNIT, sq(0, type));
      expect(issues).toEqual([]);
      expect(contour?.segs.every((s) => s.kind === 'L')).toBe(true);
      expect(Math.abs(contourArea(contour as Contour))).toBeCloseTo(1, 12);
    }
  });

  it('round: a unit square with fillets r has area 1 − (4 − π)r²', () => {
    const r = 0.25;
    const { contour, issues } = outlineClosed(UNIT, sq(r));
    expect(issues).toEqual([]);
    expect(Math.abs(contourArea(contour as Contour))).toBeCloseTo(1 - (4 - Math.PI) * r * r, 12);
    expect(checkContour(contour as Contour)).toBeNull();
    expect(contour?.segs.filter((s) => s.kind === 'A')).toHaveLength(4);
  });

  it('outer: wrapping circles at every corner gives the offset square, area 1 + 4r + πr²', () => {
    const r = 0.3;
    for (const type of ['outer', 'auto'] as const) {
      const { contour } = outlineClosed(UNIT, sq(r, type));
      expect(Math.abs(contourArea(contour as Contour))).toBeCloseTo(1 + 4 * r + Math.PI * r * r, 12);
      expect(checkContour(contour as Contour)).toBeNull();
    }
  });

  it('works the same for either winding direction', () => {
    const r = 0.3;
    const rev = [...UNIT].reverse();
    const a = outlineClosed(UNIT, sq(r, 'outer')).contour as Contour;
    const b = outlineClosed(rev, sq(r, 'outer')).contour as Contour;
    expect(Math.abs(contourArea(b))).toBeCloseTo(Math.abs(contourArea(a)), 12);
    expect(checkContour(b)).toBeNull();
  });

  it('two points with outer radius r make a capsule (a stroke with round caps): area 2rL + πr²', () => {
    const r = 0.5, L = 3;
    const { contour, issues } = outlineClosed([vec(0, 0), vec(L, 0)], [{ type: 'outer', r }, { type: 'outer', r }]);
    expect(issues).toEqual([]);
    expect(Math.abs(contourArea(contour as Contour))).toBeCloseTo(2 * r * L + Math.PI * r * r, 12);
    expect(checkContour(contour as Contour)).toBeNull();
  });

  it('teardrop: a big outer circle and a sharp tip (p-logo-5)', () => {
    const R = 2, tip = vec(0, 6);
    const { contour } = outlineClosed([vec(0, 0), tip], [{ type: 'outer', r: R }, { type: 'outer', r: 0 }]);
    // Area = kite from the tip to the two tangent points + the circle's major sector.
    const d = 6, half = Math.asin(R / d), tLen = Math.sqrt(d * d - R * R);
    const kite = R * tLen;                               // two right triangles
    const sector = 0.5 * R * R * (2 * Math.PI - 2 * (Math.PI / 2 - half));
    expect(Math.abs(contourArea(contour as Contour))).toBeCloseTo(kite + sector, 10);
    expect(checkContour(contour as Contour)).toBeNull();
  });

  it('inward at a concave notch bites a concave arc (node-logo, the reference tool’s H)', () => {
    // A "V" notch at (2, 2) in a 4 × 4 square's top edge.
    const pts = [vec(0, 0), vec(2, 2), vec(4, 0), vec(4, 4), vec(0, 4)];
    const corners: CornerSpec[] = pts.map(() => ({ type: 'auto', r: 0 }));
    corners[1] = { type: 'inward', r: 0.5 };
    const { contour, issues } = outlineClosed(pts, corners);
    expect(issues).toEqual([]);
    expect(checkContour(contour as Contour)).toBeNull();
    const arc = contour?.segs.find((s) => s.kind === 'A');
    // Concave: the arc turns against the outline's overall orientation.
    expect(Math.sign((arc as { sweep: number }).sweep)).toBe(-Math.sign(contourArea(contour as Contour)));
    // auto at the same notch resolves to inward too.
    corners[1] = { type: 'auto', r: 0.5 };
    const auto = outlineClosed(pts, corners).contour as Contour;
    expect(contourArea(auto)).toBeCloseTo(contourArea(contour as Contour), 12);
  });

  it('clamps fillets that overlap and reports actual vs requested (SPEC.md §9.4)', () => {
    const { contour, issues } = outlineClosed(UNIT, sq(1));
    expect(issues).toHaveLength(4);
    for (const i of issues) {
      expect(i.kind).toBe('clamped');
      if (i.kind === 'clamped') { expect(i.requested).toBe(1); expect(i.actual).toBeCloseTo(0.5, 12); }
    }
    // Fully clamped fillets on a unit square make a circle of radius 0.5.
    expect(Math.abs(contourArea(contour as Contour))).toBeCloseTo(Math.PI / 4, 12);
    expect(checkContour(contour as Contour)).toBeNull();
  });

  it('reports a circle that swallows its neighbour, with the largest radius that works', () => {
    const pts = [vec(0, 0), vec(1, 0), vec(1, 3), vec(0, 3)];
    const corners: CornerSpec[] = [{ type: 'outer', r: 2 }, { type: 'outer', r: 0.5 }, { type: 'outer', r: 0 }, { type: 'outer', r: 0 }];
    const { contour, issues } = outlineClosed(pts, corners);
    expect(contour).toBeNull();
    const at0 = issues.find((i) => i.kind === 'no-tangent' && i.index === 0);
    // Edge 0→1 has L = 1, same side: r0 < r1 + L = 1.5. Edge 3→0 has L = 3 against a sharp point: r0 < 3.
    expect(at0).toEqual({ kind: 'no-tangent', index: 0, requested: 2, maxRadius: 1.5 });
  });

  it('reports an inward corner with no room for the cross tangent', () => {
    // An L: inward on its concave corner (1, 1), outer on the convex neighbour (2, 1), 1 apart.
    const pts = [vec(0, 0), vec(2, 0), vec(2, 1), vec(1, 1), vec(1, 2), vec(0, 2)];
    const corners: CornerSpec[] = pts.map(() => ({ type: 'round', r: 0 }));
    corners[2] = { type: 'outer', r: 0.6 };
    corners[3] = { type: 'inward', r: 0.6 };
    const { contour, issues } = outlineClosed(pts, corners);
    expect(contour).toBeNull();
    // Opposite sides on that edge (L = 1): r2 + r3 < 1, so each fits up to 0.4 given the other's 0.6.
    expect(issues).toContainEqual({ kind: 'no-tangent', index: 3, requested: 0.6, maxRadius: expect.closeTo(0.4, 12) });
    expect(issues).toContainEqual({ kind: 'no-tangent', index: 2, requested: 0.6, maxRadius: expect.closeTo(0.4, 12) });
  });

  it('inward on a convex corner makes a cove: the unit square loses a quarter disc, 1 − πr²/4', () => {
    const r = 0.4;
    const corners: CornerSpec[] = UNIT.map((_, i) => ({ type: i === 1 ? 'inward' : 'round', r: i === 1 ? r : 0 }));
    const res = outlineClosed(UNIT, corners);
    expect(res.issues).toEqual([]);
    expect(Math.abs(contourArea(res.contour as Contour))).toBeCloseTo(1 - (Math.PI * r * r) / 4, 12);
    expect(res.circles[1]?.kind).toBe('cove');
    expect(res.corners).toHaveLength(5); // three sharp corners + both ends of the cove
    expect(checkContour(res.contour as Contour, res.corners)).toBeNull();
    // Both ends of the cove sit on the square's edges, r from the corner.
    expect(res.corners).toContainEqual(vec(1 - r, 0));
    expect(res.corners).toContainEqual(vec(1, r));
  });

  it('outer on a concave corner fills it: an L gains a quarter disc, 3 + πr²/4', () => {
    const L = [vec(0, 0), vec(2, 0), vec(2, 1), vec(1, 1), vec(1, 2), vec(0, 2)];
    const r = 0.5;
    const corners: CornerSpec[] = L.map((_, i) => ({ type: i === 3 ? 'outer' : 'round', r: i === 3 ? r : 0 }));
    const res = outlineClosed(L, corners);
    expect(res.issues).toEqual([]);
    expect(res.circles[3]?.kind).toBe('fill');
    expect(Math.abs(contourArea(res.contour as Contour))).toBeCloseTo(3 + (Math.PI * r * r) / 4, 12);
    expect(checkContour(res.contour as Contour, res.corners)).toBeNull();
  });

  it('clamps a cove to the room on its edges, and reports it', () => {
    const corners: CornerSpec[] = UNIT.map((_, i) => ({ type: i === 1 ? 'inward' : 'round', r: i === 1 ? 3 : 0 }));
    const res = outlineClosed(UNIT, corners);
    expect(res.issues).toEqual([{ kind: 'clamped', index: 1, requested: 3, actual: 1 }]);
    expect(Math.abs(contourArea(res.contour as Contour))).toBeCloseTo(1 - Math.PI / 4, 12);
  });

  it('flags degenerate input instead of drawing it', () => {
    expect(outlineClosed([vec(0, 0)], [{ type: 'round', r: 0 }]).issues[0]).toEqual({ kind: 'degenerate', reason: 'too-few-points' });
    expect(outlineClosed([vec(0, 0), vec(0, 0), vec(1, 1)], sq(0).slice(0, 3)).issues[0]).toEqual({ kind: 'degenerate', reason: 'coincident-points' });
  });
});

// Random polygons on a small integer grid with random corner types and radii (multiples of 1/240 cell).
const polygonArb = fc
  .array(fc.record({ x: fc.integer({ min: 0, max: 6 }), y: fc.integer({ min: 0, max: 6 }) }), { minLength: 2, maxLength: 7 })
  .filter((pts) => pts.every((p, i) => { const q = pts[(i + 1) % pts.length] as { x: number; y: number }; return p.x !== q.x || p.y !== q.y; }));
const cornersArb = (n: number) =>
  fc.array(
    fc.record({
      type: fc.constantFrom<CornerType>('auto', 'outer', 'round', 'inward'),
      r: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 480 }).map((k) => k / 240)),
    }),
    { minLength: n, maxLength: n },
  );
const shapeArb = polygonArb.chain((pts) => fc.record({ pts: fc.constant(pts.map((p) => vec(p.x, p.y))), corners: cornersArb(pts.length) }));

describe('P4: every arc is valid and every arc joins its neighbours tangentially', () => {
  it('holds for random shapes, corner types and radii', () => {
    fc.assert(
      fc.property(shapeArb, ({ pts, corners }) => {
        const { contour, issues, corners: cornerPts } = outlineClosed(pts, corners);
        if (!contour) {
          // P7: no contour only ever comes with a reason.
          expect(issues.some((i) => i.kind === 'no-tangent' || i.kind === 'degenerate')).toBe(true);
          return;
        }
        expect(checkContour(contour, cornerPts)).toBeNull();
      }),
      { numRuns: RUNS },
    );
  });
});

describe('P7: clamping and invalid shapes', () => {
  it('fillets never run past their edge, and every reported limit is below the request', () => {
    fc.assert(
      fc.property(shapeArb, ({ pts, corners }) => {
        const { contour, issues, edges } = outlineClosed(pts, corners);
        for (const i of issues) {
          if (i.kind === 'no-tangent') { expect(i.maxRadius).toBeGreaterThanOrEqual(0); expect(i.maxRadius).toBeLessThanOrEqual(i.requested); } // exclusive limit
          if (i.kind === 'clamped') { expect(i.actual).toBeGreaterThanOrEqual(0); expect(i.actual).toBeLessThan(i.requested); }
        }
        if (!contour) return;
        // Every straight segment runs along an edge, in the edge's direction: overlapping fillets
        // that were not clamped would make a segment run backwards.
        const starts = segStarts(contour);
        contour.segs.forEach((s, k) => {
          if (s.kind !== 'L') return;
          const d = sub(s.to, starts[k] as Vec2);
          if (len(d) < 1e-9) return;
          const along = edges.some((e) => dot(d, e.dir) > 0 && Math.abs(d.x * e.dir.y - d.y * e.dir.x) < 1e-9 * Math.max(1, len(d)));
          expect(along).toBe(true);
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('a radius just under the reported limit makes that edge work', () => {
    fc.assert(
      fc.property(shapeArb, ({ pts, corners }) => {
        const first = outlineClosed(pts, corners).issues.find((i) => i.kind === 'no-tangent');
        if (!first || first.kind !== 'no-tangent') return;
        const fixed = corners.map((c, i) => (i === first.index ? { ...c, r: first.maxRadius * 0.999 } : c));
        const again = outlineClosed(pts, fixed).issues.find((i) => i.kind === 'no-tangent' && i.index === first.index);
        // The point may still clash with its other neighbour's limit, which is reported as smaller.
        if (again && again.kind === 'no-tangent') expect(again.maxRadius).toBeLessThan(first.maxRadius * 0.999);
      }),
      { numRuns: RUNS },
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(shapeArb, ({ pts, corners }) => {
        expect(outlineClosed(pts, corners)).toEqual(outlineClosed(pts, corners));
      }),
      { numRuns: RUNS },
    );
  });
});
