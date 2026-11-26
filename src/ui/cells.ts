/**
 * Lengths in the interface are in cells (SPEC.md §3), stored in 1/240 cell. Shown as an exact
 * fraction when it is a simple one (1/8, 11/16, 1 1/2), otherwise as a decimal; typed as either.
 */
import { LEN } from '../model/types';

const DENOMINATORS = [1, 2, 3, 4, 6, 8, 12, 16, 24];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** 30 → "1/8", 360 → "1 1/2", 72 → "0.3", 0 → "0". */
export function formatCells(len240: number): string {
  const n = Math.round(len240);
  if (n === 0) return '0';
  const g = gcd(Math.abs(n), LEN);
  const num = n / g, den = LEN / g;
  if (DENOMINATORS.includes(den)) {
    if (den === 1) return String(num);
    const whole = Math.trunc(num / den), rest = Math.abs(num % den);
    return whole ? `${whole} ${rest}/${den}` : `${num}/${den}`;
  }
  return String(Number((n / LEN).toFixed(3)));
}

/** "1/8", "0.3", "1 1/2", "1.5", " 3/10 cell" → 1/240 cell (rounded), or null if it isn't a length. */
export function parseCells(text: string): number | null {
  const t = text.trim().replace(/\s*cells?$/i, '').trim();
  let m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) return m[3] === '0' ? null : Math.round((Number(m[1]) + Number(m[2]) / Number(m[3])) * LEN);
  m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return m[2] === '0' ? null : Math.round((Number(m[1]) / Number(m[2])) * LEN);
  if (/^(\d+\.?\d*|\.\d+)$/.test(t)) return Math.round(Number(t) * LEN);
  return null;
}

/** Export size of a length, for the note under a value: "12.5" at 100 units per cell. */
export const exportUnits = (len240: number, unitsPerCell: number): string => String(Number(((len240 / LEN) * unitsPerCell).toFixed(2)));
