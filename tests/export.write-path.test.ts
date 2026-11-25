/** SVG path writer: output format rules (VERIFICATION.md §3, E4–E5) and determinism. */
import fc from 'fast-check';
import { outlineClosed, type CornerType } from '../src/geometry/corners';
import { vec } from '../src/geometry/num';
import { fmt, writePath } from '../src/export/write-path';

const RUNS = Number(process.env.FC_RUNS ?? 200);
const UNIT = [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, 1)];

describe('fmt', () => {
  it('trims trailing zeros and never writes -0', () => {
    expect(fmt(1.5, 3)).toBe('1.5');
    expect(fmt(2, 3)).toBe('2');
    expect(fmt(0.12345, 3)).toBe('0.123');
    expect(fmt(-0.0001, 3)).toBe('0');
    expect(fmt(-0, 3)).toBe('0');
  });
});

describe('writePath', () => {
  it('writes a sharp square with H/V shorthands and Z (like p-logo-1)', () => {
    const c = outlineClosed(UNIT, UNIT.map(() => ({ type: 'round' as const, r: 0 }))).contour!;
    expect(writePath([c], { scale: 125, precision: 3 })).toBe('M0 0H125V125H0Z');
  });

  it('writes fillets as A commands with spaced flags', () => {
    const c = outlineClosed(UNIT, UNIT.map(() => ({ type: 'round' as const, r: 0.25 }))).contour!;
    const d = writePath([c], { scale: 100, precision: 3 });
    expect(d).toMatch(/^M/);
    expect(d.match(/A25 25 0 0 1 /g)).toHaveLength(4);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('applies the origin offset', () => {
    const c = outlineClosed(UNIT, UNIT.map(() => ({ type: 'round' as const, r: 0 }))).contour!;
    expect(writePath([c], { scale: 1, precision: 3, origin: { x: -2, y: -2 } })).toBe('M2 2H3V3H2Z');
  });

  it('only uses absolute M L H V A Z, numbers within precision, and is deterministic', () => {
    const shapeArb = fc
      .array(fc.record({ x: fc.integer({ min: 0, max: 6 }), y: fc.integer({ min: 0, max: 6 }) }), { minLength: 3, maxLength: 6 })
      .chain((pts) =>
        fc.record({
          pts: fc.constant(pts.map((p) => vec(p.x, p.y))),
          corners: fc.array(
            fc.record({ type: fc.constantFrom<CornerType>('auto', 'outer', 'round', 'inward'), r: fc.integer({ min: 0, max: 240 }).map((k) => k / 240) }),
            { minLength: pts.length, maxLength: pts.length },
          ),
        }),
      );
    fc.assert(
      fc.property(shapeArb, ({ pts, corners }) => {
        const { contour } = outlineClosed(pts, corners);
        if (!contour) return;
        const d = writePath([contour], { scale: 100, precision: 3 });
        expect(d).toMatch(/^[MLHVAZ0-9 .-]+$/);
        for (const num of d.match(/-?\d+(\.\d+)?/g) ?? []) {
          expect((num.split('.')[1] ?? '').length).toBeLessThanOrEqual(3);
          expect(num).not.toBe('-0');
        }
        expect(writePath([contour], { scale: 100, precision: 3 })).toBe(d);
      }),
      { numRuns: RUNS },
    );
  });
});
