/**
 * Grid dispatch. The geometry core and everything above it go through these functions, so adding
 * a grid preset of an existing kind is data only (ARCHITECTURE.md §2).
 */
import type { ExactScalar } from '../geometry/exact';
import type { Lattice } from '../geometry/lattice';
import type { Vec2 } from '../geometry/num';
import { affineKind, type AffineGrid } from './kinds/affine';
import { polarKind, type PolarGrid } from './kinds/polar';
import type { GridDef, SymmetryOp } from './types';

export type { GridDef, SymmetryOp, Subdivision, IsoRatio } from './types';
export { SUBDIVISIONS } from './types';
export { defaultGrid, PRESETS } from './presets';

type Opts = { wholeOnly?: boolean };

export function toPlane(p: Lattice, g: GridDef): Vec2 {
  return g.kind === 'polar' ? polarKind.toPlane(p, g as PolarGrid) : affineKind.toPlane(p, g as AffineGrid);
}
export function nearest(q: Vec2, g: GridDef, opts?: Opts): Lattice {
  return g.kind === 'polar' ? polarKind.nearest(q, g as PolarGrid, opts) : affineKind.nearest(q, g as AffineGrid, opts);
}
export function contains(p: Lattice, g: GridDef): boolean {
  return g.kind === 'polar' ? polarKind.contains(p, g as PolarGrid) : affineKind.contains(p, g as AffineGrid);
}
export function latticePoints(g: GridDef, opts?: Opts): Lattice[] {
  return g.kind === 'polar' ? polarKind.points(g as PolarGrid, opts) : affineKind.points(g as AffineGrid, opts);
}
export function normalise(p: Lattice, g: GridDef): Lattice {
  return g.kind === 'polar' ? polarKind.normalise(p, g as PolarGrid) : affineKind.normalise(p, g as AffineGrid);
}
export function dist2Exact(a: Lattice, b: Lattice, g: GridDef): ExactScalar {
  return g.kind === 'polar' ? polarKind.dist2Exact(a, b, g as PolarGrid) : affineKind.dist2Exact(a, b, g as AffineGrid);
}
export function exactT(g: GridDef): number {
  return g.kind === 'polar' ? polarKind.exactT(g as PolarGrid) : affineKind.exactT(g as AffineGrid);
}
export function symmetries(g: GridDef): SymmetryOp[] {
  return g.kind === 'polar' ? polarKind.symmetries(g as PolarGrid) : affineKind.symmetries(g as AffineGrid);
}
export function gridSize(g: GridDef): { width: number; height: number } {
  return g.kind === 'polar' ? polarKind.size(g as PolarGrid) : affineKind.size(g as AffineGrid);
}
