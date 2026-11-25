/**
 * Contour → SVG path data (ARCHITECTURE.md §7). The canvas and the export use this same writer,
 * so what is drawn is what is exported.
 *
 * Output rules (VERIFICATION.md §3, E4–E5): absolute commands only (M L H V A Z), arcs as
 * `A r r 0 large sweep x y` with spaces between flags, a fixed number of decimal places with
 * trailing zeros trimmed, never "-0", and a closing Z instead of a final line back to the start.
 */
import { svgArcFlags, type Contour } from '../geometry/contour';

export interface WriteOptions {
  /** Units per cell (export) or 1 (canvas, which draws in cells). */
  readonly scale: number;
  /** Decimal places. Export uses 3 (VERIFICATION.md E5). */
  readonly precision: number;
  /** Offset subtracted before scaling, e.g. the export bounds' top-left in cells. */
  readonly origin?: { readonly x: number; readonly y: number };
}

/** Fixed precision, trailing zeros trimmed, no negative zero. */
export function fmt(n: number, precision: number): string {
  const s = n.toFixed(precision);
  const t = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return t === '-0' ? '0' : t;
}

export function writePath(contours: readonly Contour[], opts: WriteOptions): string {
  const { scale, precision } = opts;
  const ox = opts.origin?.x ?? 0, oy = opts.origin?.y ?? 0;
  const X = (x: number) => fmt((x - ox) * scale, precision);
  const Y = (y: number) => fmt((y - oy) * scale, precision);
  const parts: string[] = [];
  for (const c of contours) {
    let cx = X(c.start.x), cy = Y(c.start.y);
    parts.push(`M${cx} ${cy}`);
    const n = c.segs.length;
    c.segs.forEach((s, i) => {
      const x = X(s.to.x), y = Y(s.to.y);
      const closing = i === n - 1;
      if (s.kind === 'L') {
        if (closing) return; // Z draws the final line back to the start
        if (x === cx && y === cy) return; // vanishes at this precision
        if (y === cy) parts.push(`H${x}`);
        else if (x === cx) parts.push(`V${y}`);
        else parts.push(`L${x} ${y}`);
      } else {
        const { large, sweep } = svgArcFlags(s);
        const r = fmt(s.r * scale, precision);
        parts.push(`A${r} ${r} 0 ${large} ${sweep} ${x} ${y}`);
      }
      cx = x; cy = y;
    });
    parts.push('Z');
  }
  return parts.join('');
}
