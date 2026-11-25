/** fast-check generators shared by the property suites (VERIFICATION.md §2). */
import fc from 'fast-check';
import type { GridDef, Subdivision } from '../src/grids';
import { SUBDIVISIONS } from '../src/grids';

const subdivision = fc.constantFrom<Subdivision>(...SUBDIVISIONS);
const size = fc.integer({ min: 1, max: 10 });
const rotation = fc.oneof(fc.constant(0), fc.constantFrom(15, 30, 45), fc.integer({ min: -180, max: 180 }));

export const gridArb: fc.Arbitrary<GridDef> = fc.oneof(
  fc.record({
    kind: fc.constant('affine' as const), preset: fc.constant('square' as const), subdivision, width: size, height: size,
    slantDeg: fc.oneof(fc.constant(0), fc.constant(21.24), fc.integer({ min: -45, max: 45 })), rotationDeg: rotation,
  }),
  fc.record({ kind: fc.constant('affine' as const), preset: fc.constant('triangular' as const), subdivision, width: size, height: size, rotationDeg: rotation }),
  fc.record({
    kind: fc.constant('affine' as const), preset: fc.constant('isometric' as const), subdivision, width: size, height: size,
    ratio: fc.constantFrom('true30' as const, '2:3' as const, '1:2' as const), rotationDeg: rotation,
  }),
  fc.record({
    kind: fc.constant('affine' as const), preset: fc.constant('typographic' as const), subdivision, width: size, height: size,
    rows: fc.constant([{ name: 'baseline', at: 0 }]),
  }),
  fc.record({
    kind: fc.constant('polar' as const), preset: fc.constant('polar' as const), subdivision,
    rings: fc.integer({ min: 1, max: 6 }), rays: fc.oneof(fc.constantFrom(4, 6, 8, 12, 24), fc.integer({ min: 3, max: 36 })),
    rotationDeg: rotation,
  }),
);

/** A grid together with a plane point somewhere over (and a little beyond) its drawing area. */
export const gridAndPointArb = gridArb.chain((g) => {
  const w = g.kind === 'polar' ? 2 * g.rings : g.width;
  const h = g.kind === 'polar' ? 2 * g.rings : g.height;
  return fc.record({
    g: fc.constant(g),
    x: fc.double({ min: -0.5, max: w + 0.5, noNaN: true }),
    y: fc.double({ min: -0.5, max: h + 0.5, noNaN: true }),
  });
});
