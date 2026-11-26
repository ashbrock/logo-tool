/**
 * One rule for every radius control (SPEC.md §6.6): the drag handle, `[ ]`, the rail's − / + and the
 * joint radius all step by 1/24 cell, or by one grid sub-step with Shift. Values snap to the step, so
 * stepping from an odd value lands on a clean one.
 */
import { LEN } from '../model/types';

/** 1/24 cell, in 1/240 cell. */
export const FINE_STEP = 10;

export const radiusStep = (subdivision: number, shift: boolean): number => (shift ? LEN / subdivision : FINE_STEP);

/** The next value up (dir 1) or down (dir −1) on the step's grid, never below 0. */
export function stepRadius(current: number, dir: 1 | -1, step: number): number {
  const k = current / step;
  const next = dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  return Math.max(0, Math.round(next * step));
}
