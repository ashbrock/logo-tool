import { FINE_STEP, radiusStep, stepRadius } from '../src/ui/steps';

describe('radius steps (one rule for handle, keys, rail and joint)', () => {
  it('steps by 1/24 cell, or a grid sub-step with Shift', () => {
    expect(radiusStep(4, false)).toBe(FINE_STEP);
    expect(radiusStep(4, true)).toBe(60);
  });
  it('snaps to the step grid from an odd value, and never goes below 0', () => {
    expect(stepRadius(0, 1, 10)).toBe(10);
    expect(stepRadius(14, 1, 10)).toBe(20);
    expect(stepRadius(14, -1, 10)).toBe(10);
    expect(stepRadius(20, -1, 10)).toBe(10);
    expect(stepRadius(5, -1, 10)).toBe(0);
    expect(stepRadius(0, -1, 10)).toBe(0);
    expect(stepRadius(70, 1, 60)).toBe(120);
  });
});
