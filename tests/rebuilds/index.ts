/**
 * Reference rebuilds (VERIFICATION.md §1.2). Each is built through model commands only; the original's
 * path data is never imported or traced. Measurements read off the originals are noted per rebuild.
 * Most are also built-in examples (under descriptive names) and are loaded from there; the file names
 * here only identify the reference each one is compared with.
 */
import { builder, square } from '../../src/examples/builder';
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
    build: () => example('block-p'),
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
    build: () => example('rounded-diagonals'),
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
    build: () => example('iso-e'),
  },
  {
    name: 'p-logo-4', unitsPerCell: 11, maxNodes: 32, maxMismatch: 1.0,
    note: 'Square grid slanted 21.24°, cells of 100/9 (the original steps horizontally in ninths of its 100-unit rows). One outline with an S-shaped counter; radii 2, 5, 6.607 and 14.107 cells as measured.',
    build: () => example('slanted-p'),
  },
  {
    name: 'm-logo-1', unitsPerCell: 32, maxNodes: 50, maxMismatch: 1.5,
    note: 'Polar, 24 rays, with the companion square lattice. Seven 30° wedges (rings to 8) intersected with a 10 × 8 frame; frame corners and the clip corners (joint radius) rounded 1/6 cell.',
    build: () => example('rays-in-frame'),
  },
  {
    name: 'motion-logo', unitsPerCell: 28, maxNodes: 119, maxMismatch: 1.0,
    note: 'Square 23 × 6, 1/8 steps (cells of 27.98). Letters are filled paths of lines and lattice-centred arcs (wraps of r 0.5 and bowls of r 1.5). The m is two shapes merged: their r 1.5 humps cross off the lattice, which the merge resolves exactly. The o counters are cut shapes.',
    build: () => example('curled-wordmark'),
  },
  {
    name: 'm-logo-2', unitsPerCell: 7, maxNodes: 97, maxMismatch: 1.0,
    note: 'Square grid, cells of 7.27 (= 80/11). One ribbon of width 0.6875 cell (165/240) with round caps: a hook, U-turns of radius 1 and two crossing arches of radius 3, all about lattice points. Drawn as two strokes meeting under a round cap. The original draws one stem twice; the rebuild draws it once.',
    build: () => example('ribbon'),
  },
  {
    name: 'p-logo-3', unitsPerCell: 79, maxNodes: 60, maxMismatch: 1.0,
    note: 'Square grid, cells of 79.3, whole cells. An oblique cube plus stem as strokes 0.3 cell wide (72/240) with round joins: the front square as a ring, the back face as one open line running into the top 45° edge (the hidden edge is not drawn), three more 45° edges and a three-segment stem. The original spends 146 tiny curves on what are round joins.',
    build: () => example('wire-cube'),
  },
];
