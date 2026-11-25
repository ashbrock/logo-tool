import { assertInt, type Int } from './num';

/**
 * A lattice point in sub-step units of the document's grid (ARCHITECTURE.md §3).
 * (27, 8) with subdivision 8 means (3⅜, 1) in cells. Points are exact by construction.
 */
export interface Lattice {
  readonly u: Int;
  readonly v: Int;
}

export function lattice(u: number, v: number): Lattice {
  return { u: assertInt(u, 'u'), v: assertInt(v, 'v') };
}

export const latticeEq = (a: Lattice, b: Lattice): boolean => a.u === b.u && a.v === b.v;

export const latticeKey = (p: Lattice): string => `${p.u},${p.v}`;
