/**
 * Exact scalars for comparing squared distances on a lattice (ARCHITECTURE.md §4.1).
 *
 * A value is an integer combination of the basis [1, √2, √3, √6, t, t²], where t is the tangent
 * of a square grid's slant. Every grid in v1 gives squared distances in this form (scaled by a
 * constant per grid), so "is this arc's end the same distance from its centre?" is decided with
 * integer equality, not a float tolerance.
 *
 * The single exception is a polar grid whose ray count does not divide 24: cos(2πk/n) is then
 * outside the basis, and the value is carried as an approximate float.
 */
export type ExactScalar =
  | { readonly exact: true; readonly c: readonly [number, number, number, number, number, number] }
  | { readonly exact: false; readonly value: number };

export const BASIS_VALUES = (t: number): readonly number[] => [1, Math.SQRT2, Math.sqrt(3), Math.sqrt(6), t, t * t];

export function exact(c: [number, number, number, number, number, number]): ExactScalar {
  for (const x of c) {
    if (!Number.isSafeInteger(x)) throw new RangeError(`exact coefficient must be a safe integer, got ${x}`);
  }
  return { exact: true, c };
}

export const approx = (value: number): ExactScalar => ({ exact: false, value });

/** Numeric value; `t` is the slant tangent the scalar was built with. */
export function valueOf(s: ExactScalar, t = 0): number {
  if (!s.exact) return s.value;
  const b = BASIS_VALUES(t);
  return s.c.reduce((sum, ci, i) => sum + ci * (b[i] as number), 0);
}

/** Relative tolerance used only for approximate (non-exact) polar scalars. */
export const APPROX_REL_TOL = 1e-12;

/**
 * Equality. Exact scalars compare coefficient by coefficient. This is conservative: if two
 * different combinations happen to be equal for a particular t, they are reported unequal, which
 * can only refuse an arc, never accept a wrong one.
 */
export function exactEq(a: ExactScalar, b: ExactScalar, t = 0): boolean {
  if (a.exact && b.exact) return a.c.every((x, i) => x === b.c[i]);
  const x = valueOf(a, t), y = valueOf(b, t);
  return Math.abs(x - y) <= APPROX_REL_TOL * Math.max(1, Math.abs(x), Math.abs(y));
}
