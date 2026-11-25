import type { ExactScalar } from '../geometry/exact';
import type { Lattice } from '../geometry/lattice';
import type { Int, Vec2 } from '../geometry/num';

export type Subdivision = 1 | 2 | 3 | 4 | 6 | 8;
export const SUBDIVISIONS: readonly Subdivision[] = [1, 2, 3, 4, 6, 8];

export type IsoRatio = 'true30' | '2:3' | '1:2';

/** Grid definitions are plain data (ARCHITECTURE.md §3). Sizes are in whole cells. */
export type GridDef =
  | {
      readonly kind: 'affine';
      readonly preset: 'square';
      readonly subdivision: Subdivision;
      readonly width: Int;
      readonly height: Int;
      readonly slantDeg: number;      // −45…45; shear of vertical lines
      readonly rotationDeg: number;
    }
  | {
      readonly kind: 'affine';
      readonly preset: 'triangular';
      readonly subdivision: Subdivision;
      readonly width: Int;
      readonly height: Int;
      readonly rotationDeg: number;
    }
  | {
      readonly kind: 'affine';
      readonly preset: 'isometric';
      readonly subdivision: Subdivision;
      readonly width: Int;
      readonly height: Int;
      readonly ratio: IsoRatio;
      readonly rotationDeg: number;
    }
  | {
      readonly kind: 'affine';
      readonly preset: 'typographic';
      readonly subdivision: Subdivision;
      readonly width: Int;
      readonly height: Int;
      /** Named horizontal lines, in sub-steps from the top. The lattice itself is square. */
      readonly rows: readonly { readonly name: string; readonly at: Int }[];
    }
  | {
      readonly kind: 'polar';
      readonly preset: 'polar';
      readonly subdivision: Subdivision; // applies to rings
      readonly rings: Int;
      readonly rays: Int;
      readonly rotationDeg: number;
    };

/** A symmetry of the lattice: maps lattice points to lattice points exactly, and is a Euclidean isometry. */
export interface SymmetryOp {
  readonly id: string;               // e.g. "mirror-v", "rot-90", "rot-6"
  readonly kind: 'mirror' | 'rotate';
  /** For rotations: applying it `order` times is the identity. Mirrors have order 2. */
  readonly order: Int;
  apply(p: Lattice): Lattice;
}

/** What the geometry core needs from a grid. Implemented once per mapping kind. */
export interface GridKind<G extends GridDef = GridDef> {
  /** Lattice → plane position in cells (y down). */
  toPlane(p: Lattice, g: G): Vec2;
  /** Nearest lattice point to a plane position, restricted to the grid's extent. */
  nearest(q: Vec2, g: G, opts?: { wholeOnly?: boolean }): Lattice;
  /** True if the lattice point lies inside the grid's extent. */
  contains(p: Lattice, g: G): boolean;
  /** Every lattice point in the extent (sub-steps included), in a stable order. */
  points(g: G, opts?: { wholeOnly?: boolean }): Lattice[];
  /** Canonical form (e.g. every polar point at ring 0 becomes (0, 0)). */
  normalise(p: Lattice, g: G): Lattice;
  /** Squared distance as an exact scalar, for the arc equidistance invariant. */
  dist2Exact(a: Lattice, b: Lattice, g: G): ExactScalar;
  /** The slant tangent `t` that `dist2Exact` values are expressed in (0 unless slanted). */
  exactT(g: G): number;
  /** The grid's native symmetry operations (SPEC.md §5). */
  symmetries(g: G): SymmetryOp[];
  /** Size of the drawing area in cells. */
  size(g: G): { width: number; height: number };
}
