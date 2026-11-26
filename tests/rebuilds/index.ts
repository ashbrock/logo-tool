/**
 * Reference rebuilds (VERIFICATION.md §1.2). Each is built through model commands only; the original's
 * path data is never imported or traced. Measurements read off the originals are noted per rebuild.
 */
import { builder, square, type PathStep } from '../../src/examples/builder';
import { lattice } from '../../src/geometry/lattice';
import type { GridDef } from '../../src/grids';
import { EXAMPLES } from '../../src/examples';
import type { LogoDocument } from '../../src/model/types';

export interface Rebuild {
  readonly name: string;
  /** Export units per cell. The comparison renders both files at 1024 px, so this only sets file size. */
  readonly unitsPerCell: number;
  readonly maxNodes: number;
  /** Max mismatch, % of ink. */
  readonly maxMismatch: number;
  readonly note: string;
  build(): LogoDocument;
}

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!.build();

export const REBUILDS: readonly Rebuild[] = [
  {
    name: 'p-logo-1', unitsPerCell: 125, maxNodes: 20, maxMismatch: 0.5,
    note: '3 × 4 square grid, cells of 125: whole-cell polygon with 45° corners, square cutout, separate foot.',
    build: () => example('p-logo-1'),
  },
  {
    name: 'e-logo-2', unitsPerCell: 100, maxNodes: 20, maxMismatch: 1.0,
    note: '3 × 3 grid (cells of 13.333): two 45° pieces and a square. The original has two nodes 0.028 off the lattice; the rebuild puts them on it.',
    build() {
      const b = builder(square(3, 3, 1), 'e-logo-2');
      b.polygon([[1, 2], [3, 2], [2, 3], [0, 3], [0, 2], [1, 1]]);
      b.polygon([[3, 1], [2, 2], [2, 1], [1, 1], [2, 0], [3, 0]]);
      b.polygon([[0, 0], [1, 0], [1, 1], [0, 1]]);
      return b.doc;
    },
  },
  {
    name: 'e-logo-3', unitsPerCell: 100, maxNodes: 26, maxMismatch: 1.0,
    note: '3 × 3 grid: two 45° pieces, every corner filleted. Radius 0.7619 of 13.333 = 2/35 cell, stored as 14/240.',
    build: () => example('e-logo-3'),
  },
  {
    name: 'p-logo-7', unitsPerCell: 50, maxNodes: 15, maxMismatch: 3.0,
    note: 'Three sharp parallelograms. The original mixes slopes of 31.36° and 32.64°; the rebuild unifies them at 5:8 (32.0°) on a square grid of 50 with 1/4 steps (x in 100s, y in 62.5s), instead of isometric true 30°, which fits worse.',
    build() {
      const b = builder(square(8, 10, 4), 'p-logo-7');
      b.polygon([[2, 10], [0, 8.75], [0, 3.75], [2, 2.5]]);
      b.polygon([[8, 6.25], [4, 8.75], [2, 7.5], [8, 3.75]]);
      b.polygon([[6, 2.5], [6, 5], [0, 1.25], [2, 0]]);
      return b.doc;
    },
  },
  {
    name: 'e-logo-4', unitsPerCell: 12, maxNodes: 40, maxMismatch: 1.5,
    note: 'Isometric 2:3, cells of 12, 1/2 steps (x in 6s, y in 4s): a chevron band and a zigzag band, every corner filleted 20/240 cell. The original slope is 0.6715; the grid gives exactly 2/3.',
    build() {
      const b = builder({ kind: 'affine', preset: 'isometric', ratio: '2:3', subdivision: 2, width: 4, height: 5, rotationDeg: 0 } as GridDef, 'e-logo-4');
      const r = 20 / 240;
      const t = 1 / 3;
      b.polygon([[2, 14 * t], [0, 10 * t], [0, 8 * t], [2, 12 * t], [4, 8 * t], [4, 10 * t]], { corners: Array(6).fill(r) });
      b.polygon([[0.5, 5 * t], [1, 6 * t], [3, 2 * t], [3.5, 3 * t], [1.5, 7 * t], [2, 8 * t], [4, 4 * t], [4, 6 * t], [2, 10 * t], [0, 6 * t], [0, 4 * t], [2, 0], [2.5, t]], { corners: Array(13).fill(r) });
      return b.doc;
    },
  },
  {
    name: 'p-logo-4', unitsPerCell: 11, maxNodes: 32, maxMismatch: 1.0,
    note: 'Square grid slanted 21.24°, cells of 100/9 (the original steps horizontally in ninths of its 100-unit rows). One outline with an S-shaped counter; radii 2, 5, 6.607 and 14.107 cells as measured.',
    build() {
      const b = builder({ kind: 'affine', preset: 'square', subdivision: 1, width: 56, height: 45, slantDeg: 21.241, rotationDeg: 0 } as GridDef, 'p-logo-4');
      const P = (u: number, v: number) => lattice(u, v);
      b.polygon([P(0, 0), P(21, 0), P(21, 9), P(41, 9), P(41, 36), P(20, 36), P(20, 27), P(11, 27), P(11, 45), P(0, 45)], { corners: [0, 5, 2, 14.107, 6.607, 5, 2, 0, 0, 0] });
      b.polygon([P(21, 18), P(21, 27), P(30, 27), P(30, 18), P(20, 18), P(20, 9), P(11, 9), P(11, 18)], { corners: [5, 2, 2, 2, 5, 2, 0, 0], role: 'cut' });
      return b.doc;
    },
  },
  {
    name: 'm-logo-1', unitsPerCell: 32, maxNodes: 50, maxMismatch: 1.5,
    note: 'Polar, 24 rays, with the companion square lattice. Seven 30° wedges (rings to 8) intersected with a 10 × 8 frame; frame corners and the clip corners (joint radius) rounded 1/6 cell.',
    build() {
      const b = builder({ kind: 'polar', preset: 'polar', subdivision: 1, rings: 8, rays: 24, rotationDeg: 0, companionSquare: true }, 'm-logo-1');
      const O = lattice(0, 0);
      for (const [a, c] of [[23, 1], [2, 4], [5, 7], [8, 10], [11, 13], [14, 16], [20, 22]] as const) b.polygon([O, lattice(8, a), lattice(8, c)]);
      const S = (x: number, y: number) => lattice(x, y, 'square');
      b.polygon([S(-5, -4), S(5, -4), S(5, 4), S(-5, 4)], { corners: Array(4).fill(1 / 6), role: 'intersect', joint: 1 / 6 });
      return b.doc;
    },
  },
  {
    name: 'motion-logo', unitsPerCell: 28, maxNodes: 119, maxMismatch: 1.0,
    note: 'Square 23 × 6, 1/8 steps (cells of 27.98). Letters are filled paths of lines and lattice-centred arcs (wraps of r 0.5 and bowls of r 1.5). The m is two shapes merged: their r 1.5 humps cross off the lattice, which the merge resolves exactly. The o counters are cut shapes.',
    build() {
      const b = builder(square(23, 6, 8), 'motion-logo');
      const A = (x: number, y: number, cx: number, cy: number, sweep?: 0 | 1): PathStep => ({ to: [x, y], c: [cx, cy], ...(sweep !== undefined ? { sweep } : {}) });
      // m: left half with its hump, right half with its hump; merged.
      b.path([[0, 2.5], [0, 6], [1, 6], [1, 2.5], A(1.5, 2, 1.5, 2.5), A(2, 1.5, 1.5, 1.5), A(2.5, 2, 2.5, 1.5, 1), A(2, 2.5, 2.5, 2.5), [2, 6], [3, 6], [3, 2.5], A(3.5, 2, 3.5, 2.5), A(4, 1.5, 3.5, 1.5), A(1, 1.5, 2.5, 1.5, 0), A(0.5, 2, 0.5, 1.5), A(0, 2.5, 0.5, 2.5)], { closed: true });
      b.path([[4, 1.5], A(4.5, 2, 4.5, 1.5, 1), A(4, 2.5, 4.5, 2.5), [4, 6], [5, 6], [5, 2.5], A(5.5, 2, 5.5, 2.5), A(6, 1.5, 5.5, 1.5), A(3, 1.5, 4.5, 1.5, 0)], { closed: true });
      // o (twice): bowl with a curl, minus its counter.
      for (const dx of [0, 8.875]) {
        b.path([[6 + dx, 4.5], [6 + dx, 2.5], A(6.5 + dx, 2, 6.5 + dx, 2.5), A(7 + dx, 1.5, 6.5 + dx, 1.5), A(10 + dx, 1.5, 8.5 + dx, 1.5, 1), A(9.5 + dx, 2, 9.5 + dx, 1.5), A(9 + dx, 2.5, 9.5 + dx, 2.5), [9 + dx, 4.5], A(6 + dx, 4.5, 7.5 + dx, 4.5, 1)], { closed: true });
        b.path([[7 + dx, 2.5], [7 + dx, 4.5], A(8 + dx, 4.5, 7.5 + dx, 4.5, 0), [8 + dx, 2.5], A(8.5 + dx, 2, 8.5 + dx, 2.5), A(8 + dx, 1.5, 8.5 + dx, 1.5, 0), A(7.5 + dx, 2, 7.5 + dx, 1.5), A(7 + dx, 2.5, 7.5 + dx, 2.5)], { closed: true, role: 'cut' });
      }
      // t
      b.path([[10.375, 2.5], [10.375, 6], [11.375, 6], [11.375, 2.5], A(11.875, 2, 11.875, 2.5), A(12.375, 1.5, 11.875, 1.5), [12.375, 1], [13.375, 1], [13.375, 0], [10.375, 0], [10.375, 1], [11.375, 1], [11.375, 1.5], A(10.875, 2, 10.875, 1.5), A(10.375, 2.5, 10.875, 2.5)], { closed: true });
      // i
      b.path([[12.875, 2.5], [12.875, 6], [13.875, 6], [13.875, 2.5], A(14.375, 2, 14.375, 2.5), A(14.875, 1.5, 14.375, 1.5), [14.875, 0], [13.875, 0], [13.875, 1.5], A(13.375, 2, 13.375, 1.5), A(12.875, 2.5, 13.375, 2.5)], { closed: true });
      // n
      b.path([[18.875, 2.5], [18.875, 6], [19.875, 6], [19.875, 2.5], A(20.375, 2, 20.375, 2.5), A(20.875, 1.5, 20.375, 1.5), A(21.375, 2, 21.375, 1.5, 1), A(20.875, 2.5, 21.375, 2.5), [20.875, 6], [21.875, 6], [21.875, 2.5], A(22.375, 2, 22.375, 2.5), A(22.875, 1.5, 22.375, 1.5), A(19.875, 1.5, 21.375, 1.5, 0), A(19.375, 2, 19.375, 1.5), A(18.875, 2.5, 19.375, 2.5)], { closed: true });
      return b.doc;
    },
  },
  {
    name: 'm-logo-2', unitsPerCell: 7, maxNodes: 97, maxMismatch: 1.0,
    note: 'Square grid, cells of 7.27 (= 80/11). One ribbon of width 0.6875 cell (165/240) with round caps: a hook, U-turns of radius 1 and two crossing arches of radius 3, all about lattice points. Drawn as two strokes meeting under a round cap. The original draws one stem twice; the rebuild draws it once.',
    build() {
      const b = builder(square(12, 7, 1), 'm-logo-2');
      const w = 165 / 240;
      // One ribbon, drawn as two strokes that meet under a round cap at (11, 3): a hook, a U, the first
      // arch (r 3 about (6, 2)), a U; then the second arch (r 3 about (8, 3)) crossing it, and a last U.
      b.path([[0, 0], { to: [1, 1], c: [0, 1] }, [1, 5], { to: [3, 5], c: [2, 5], sweep: 0 }, [3, 2], { to: [9, 2], c: [6, 2], sweep: 1 }, [9, 5], { to: [11, 5], c: [10, 5], sweep: 0 }, [11, 3]], { stroke: w });
      b.path([[11, 3], { to: [5, 3], c: [8, 3], sweep: 0 }, [5, 5], { to: [7, 5], c: [6, 5], sweep: 0 }, [7, 2]], { stroke: w });
      return b.doc;
    },
  },
];
