import { assertInt, type Int } from './num';

/**
 * A lattice point in sub-step units of the document's grid (ARCHITECTURE.md §3).
 * (27, 8) with subdivision 8 means (3⅜, 1) in cells. Points are exact by construction.
 */
export interface Lattice {
  readonly u: Int;
  readonly v: Int;
  /**
   * Polar grids only: 'square' marks a point on the companion square lattice (same unit and
   * centre as the polar grid), with (u, v) = offset from the centre in sub-steps. Absent = primary.
   */
  readonly layer?: 'square';
}

export function lattice(u: number, v: number, layer?: 'square'): Lattice {
  // `+ 0` turns −0 (from rounding small negatives) into 0, so equality and JSON round trips agree.
  const p = { u: assertInt(u, 'u') + 0, v: assertInt(v, 'v') + 0 };
  return layer ? { ...p, layer } : p;
}

export const latticeEq = (a: Lattice, b: Lattice): boolean => a.u === b.u && a.v === b.v && a.layer === b.layer;

export const latticeKey = (p: Lattice): string => `${p.layer === 'square' ? 's' : ''}${p.u},${p.v}`;
