/** Every built-in example builds through commands, validates, and evaluates without errors. */
import { contourArea } from '../src/geometry/contour';
import { EXAMPLES } from '../src/examples';
import { PRESETS } from '../src/grids';
import { validateDocument } from '../src/model/validate';
import { evaluateDocument } from '../src/pipeline/resolve';
import { engine } from './paper-engine';

describe('examples', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.name} builds and evaluates cleanly`, () => {
      const doc = ex.build();
      expect(validateDocument(doc)).toEqual([]);
      const { mark, issues } = evaluateDocument(doc, engine);
      expect(mark.errors).toEqual([]);
      expect(issues.filter((i) => i.kind === 'corner' && i.issue.kind === 'no-tangent')).toEqual([]);
      expect(mark.pieces.length).toBeGreaterThan(0);
      expect(mark.pieces.reduce((a, p) => a + contourArea(p.outer), 0)).toBeGreaterThan(0);
    });
  }

  it('every grid type has at least two examples, each built on the grid it is listed under', () => {
    for (const preset of PRESETS) expect(EXAMPLES.filter((e) => e.grid === preset).length, preset).toBeGreaterThanOrEqual(2);
    for (const ex of EXAMPLES) expect(ex.build().grid.preset, ex.id).toBe(ex.grid);
  });

  it('example names are descriptive, never reference file names', () => {
    for (const ex of EXAMPLES) expect(`${ex.id} ${ex.name} ${ex.note}`).not.toMatch(/[a-z]-logo/i);
  });

  it('the plus example matches its closed form: 7 + 4(1 − π/4)ρ² with ρ = 0.25', () => {
    const { mark } = evaluateDocument(EXAMPLES.find((e) => e.id === 'plus')!.build(), engine);
    expect(mark.pieces.reduce((a, p) => a + contourArea(p.outer), 0)).toBeCloseTo(7 + 4 * (1 - Math.PI / 4) * 0.0625, 9);
  });
});
