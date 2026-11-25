/** Integer and vector helpers shared by the geometry core. No DOM, no pixels. */

export type Int = number;

export function isInt(n: number): boolean {
  return Number.isSafeInteger(n);
}

export function assertInt(n: number, what = 'value'): Int {
  if (!isInt(n)) throw new RangeError(`${what} must be a safe integer, got ${n}`);
  return n;
}

/** Mathematical modulo: always in [0, m). */
export function mod(n: Int, m: Int): Int {
  return ((n % m) + m) % m;
}

/** A position in the plane, in cells, y pointing down. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const dist = (a: Vec2, b: Vec2): number => Math.sqrt(dist2(a, b));

/** Rotate `p` about `c` by `rad` (positive = clockwise on screen, since y points down). */
export function rotateAbout(p: Vec2, c: Vec2, rad: number): Vec2 {
  if (rad === 0) return p;
  const s = Math.sin(rad), k = Math.cos(rad);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k };
}

export const degToRad = (d: number): number => (d * Math.PI) / 180;
