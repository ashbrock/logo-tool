import fc from 'fast-check';
import { formatCells, parseCells } from '../src/ui/cells';

describe('cell lengths in the interface', () => {
  it('shows simple fractions exactly and other values as decimals', () => {
    expect(formatCells(30)).toBe('1/8');
    expect(formatCells(10)).toBe('1/24');
    expect(formatCells(165)).toBe('11/16');
    expect(formatCells(360)).toBe('1 1/2');
    expect(formatCells(480)).toBe('2');
    expect(formatCells(72)).toBe('0.3');
    expect(formatCells(0)).toBe('0');
  });
  it('reads fractions, mixed numbers and decimals, with or without "cell"', () => {
    expect(parseCells('1/8')).toBe(30);
    expect(parseCells(' 11 / 16 ')).toBe(165);
    expect(parseCells('1 1/2 cells')).toBe(360);
    expect(parseCells('0.3')).toBe(72);
    expect(parseCells('.5')).toBe(120);
    expect(parseCells('2 cell')).toBe(480);
    for (const bad of ['', 'abc', '1/0', '-1', '1/2/3']) expect(parseCells(bad)).toBeNull();
  });
  it('round-trips every stored length exactly (3 decimals are finer than 1/240)', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 240 * 24 }), (n) => {
      expect(parseCells(formatCells(n))).toBe(n);
    }));
  });
});
