/**
 * Built-in examples (SPEC.md §4.2), at least two per grid type. Each is built through ordinary commands,
 * so it opens as a normal, editable mark. Several are rebuilds of the designer's reference marks
 * (tests/rebuilds compares them with the originals); the rest show techniques.
 */
import { lattice } from '../geometry/lattice';
import { defaultGrid, toPlane, type GridDef } from '../grids';
import type { Preset } from '../grids/presets';
import { LEN, type LogoDocument, type Repeat } from '../model/types';
import { builder, square, type PathStep } from './builder';

export interface Example {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  /** The grid type it is built on, for grouping. */
  readonly grid: Preset;
  build(): LogoDocument;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'block-p', name: 'Block P', grid: 'square', note: 'A 3 × 4 grid of whole cells: a letter with 45° corners, a square counter cut out, and a separate foot.',
    build() {
      const b = builder(square(3, 4, 1), 'Block P');
      b.polygon([[0, 3], [1, 3], [1, 4], [0, 4]]);
      b.polygon([[3, 1], [3, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 0], [2, 0]]);
      b.polygon([[1, 1], [2, 1], [2, 2], [1, 2]], { role: 'cut' });
      return b.doc;
    },
  },
  {
    id: 'rounded-diagonals', name: 'Rounded diagonals', grid: 'square', note: 'Two 45° pieces on a 3 × 3 grid, every corner rounded 7/120 cell.',
    build() {
      const b = builder(square(3, 3, 1), 'Rounded diagonals');
      const r = 14 / LEN;
      b.polygon([[1, 2], [3, 2], [2, 3], [0, 3], [0, 2], [1, 1]], { corners: Array(6).fill(r) });
      b.polygon([[3, 1], [2, 2], [2, 1], [0, 1], [1, 0], [3, 0]], { corners: Array(6).fill(r) });
      return b.doc;
    },
  },
  {
    id: 'thunderbolt', name: 'Thunderbolt cut', grid: 'square', note: 'A block with two round corners, minus a bolt whose tips touch its edges.',
    build() {
      const b = builder(square(6, 5, 2), 'Thunderbolt cut');
      b.polygon([[0, 0.5], [6, 0.5], [6, 4.5], [0, 4.5]], { corners: [1.5, 0, 1.5, 0] });
      b.polygon([[3, 0.5], [1.5, 3], [3, 3], [3, 4.5], [4.5, 2], [3, 2]], { role: 'cut' });
      return b.doc;
    },
  },
  {
    id: 'striped-circle', name: 'Striped circle', grid: 'square', note: 'A circle minus one thin stripe repeated ×5 along a line.',
    build() {
      const b = builder(square(6, 6, 8), 'Striped circle');
      b.circle(3, 3, 2.75);
      b.polygon([[0, 0.875], [6, 0.875], [6, 1.125], [0, 1.125]], { role: 'cut', repeat: { kind: 'translate', step: b.L(0, 1), count: 5 } });
      return b.doc;
    },
  },
  {
    id: 'sun', name: 'Sun (8-fold)', grid: 'square', note: 'Two bars with one round corner each, repeated ×8 on a square grid.',
    build() {
      const b = builder(square(6, 6, 4), 'Sun');
      const rep: Repeat = { kind: 'rotate', centre: b.L(3, 3), count: 8, mirrored: false };
      b.polygon([[2.75, 0.25], [3.25, 0.25], [3.25, 1.25], [2.75, 1.25]], { corners: [0, 0, 0, 0.2], repeat: rep });
      b.polygon([[3.25, 1.25], [3.75, 1.25], [3.75, 2.25], [3.25, 2.25]], { corners: [0, 0.2, 0, 0], repeat: rep });
      return b.doc;
    },
  },
  {
    id: 'plus', name: 'Plus with joint radius', grid: 'square', note: 'One bar repeated ×4; the joint radius rounds where the copies cross.',
    build() {
      const b = builder(square(6, 6, 2), 'Plus');
      b.polygon([[1, 2.5], [5, 2.5], [5, 3.5], [1, 3.5]], { repeat: { kind: 'rotate', centre: b.L(3, 3), count: 4, mirrored: false }, joint: 0.25 });
      return b.doc;
    },
  },
  {
    id: 'arch', name: 'Arch (stroke + arc)', grid: 'square', note: 'A line, an arc centred on a grid point and a line, as one stroke with round ends.',
    build() {
      const b = builder(square(6, 6, 2), 'Arch');
      b.run({ type: 'addShape', at: b.L(1, 5.5), paint: 'stroke', width: LEN });
      const id = b.lastShape().id;
      b.run({ type: 'appendPoint', shapeId: id, at: b.L(1, 3) });
      b.run({ type: 'appendPoint', shapeId: id, at: b.L(5, 3), arc: { centre: b.L(3, 3), sweep: 1 } });
      b.run({ type: 'appendPoint', shapeId: id, at: b.L(5, 5.5) });
      return b.doc;
    },
  },
  // ---- square (more) ----
  {
    id: 'ribbon', name: 'Ribbon', grid: 'square', note: 'One ribbon 11/16 cell wide with round caps: a hook, U-turns and two crossing arches, every curve centred on a grid point. Two strokes that meet under a round cap.',
    build() {
      const b = builder(square(12, 7, 1), 'Ribbon');
      const w = 165 / 240;
      b.path([[0, 0], { to: [1, 1], c: [0, 1] }, [1, 5], { to: [3, 5], c: [2, 5], sweep: 0 }, [3, 2], { to: [9, 2], c: [6, 2], sweep: 1 }, [9, 5], { to: [11, 5], c: [10, 5], sweep: 0 }, [11, 3]], { stroke: w });
      b.path([[11, 3], { to: [5, 3], c: [8, 3], sweep: 0 }, [5, 5], { to: [7, 5], c: [6, 5], sweep: 0 }, [7, 2]], { stroke: w });
      return b.doc;
    },
  },
  {
    id: 'wire-cube', name: 'Wireframe cube P', grid: 'square', note: 'An oblique cube and a stem as lines 3/10 cell wide with round joins. The hidden back edge is simply not drawn.',
    build() {
      const b = builder(square(5, 7, 1), 'Wireframe cube P');
      const w = 72 / 240;
      b.path([[3, 1], [3, 3], [0, 3], [0, 0], [3, 0], [4, 1]], { stroke: w });
      b.path([[1, 1], [4, 1], [4, 4], [1, 4]], { stroke: w, closed: true });
      for (const [x, y] of [[0, 0], [3, 3], [0, 3]] as const) b.path([[x, y], [x + 1, y + 1]], { stroke: w });
      b.path([[0, 3], [0, 5], [1, 6], [1, 4]], { stroke: w });
      return b.doc;
    },
  },
  {
    id: 'curled-wordmark', name: 'Curled wordmark', grid: 'square', note: 'Six letters on a 23 × 6 grid in 1/8 steps: filled paths of lines and grid-centred arcs, curls of radius 1/2 and bowls of 1 1/2. The m is two shapes merged; the o counters are cuts.',
    build() {
      const b = builder(square(23, 6, 8), 'Curled wordmark');
      const A = (x: number, y: number, cx: number, cy: number, sweep?: 0 | 1): PathStep => ({ to: [x, y], c: [cx, cy], ...(sweep !== undefined ? { sweep } : {}) });
      b.path([[0, 2.5], [0, 6], [1, 6], [1, 2.5], A(1.5, 2, 1.5, 2.5), A(2, 1.5, 1.5, 1.5), A(2.5, 2, 2.5, 1.5, 1), A(2, 2.5, 2.5, 2.5), [2, 6], [3, 6], [3, 2.5], A(3.5, 2, 3.5, 2.5), A(4, 1.5, 3.5, 1.5), A(1, 1.5, 2.5, 1.5, 0), A(0.5, 2, 0.5, 1.5), A(0, 2.5, 0.5, 2.5)], { closed: true });
      b.path([[4, 1.5], A(4.5, 2, 4.5, 1.5, 1), A(4, 2.5, 4.5, 2.5), [4, 6], [5, 6], [5, 2.5], A(5.5, 2, 5.5, 2.5), A(6, 1.5, 5.5, 1.5), A(3, 1.5, 4.5, 1.5, 0)], { closed: true });
      for (const dx of [0, 8.875]) {
        b.path([[6 + dx, 4.5], [6 + dx, 2.5], A(6.5 + dx, 2, 6.5 + dx, 2.5), A(7 + dx, 1.5, 6.5 + dx, 1.5), A(10 + dx, 1.5, 8.5 + dx, 1.5, 1), A(9.5 + dx, 2, 9.5 + dx, 1.5), A(9 + dx, 2.5, 9.5 + dx, 2.5), [9 + dx, 4.5], A(6 + dx, 4.5, 7.5 + dx, 4.5, 1)], { closed: true });
        b.path([[7 + dx, 2.5], [7 + dx, 4.5], A(8 + dx, 4.5, 7.5 + dx, 4.5, 0), [8 + dx, 2.5], A(8.5 + dx, 2, 8.5 + dx, 2.5), A(8 + dx, 1.5, 8.5 + dx, 1.5, 0), A(7.5 + dx, 2, 7.5 + dx, 1.5), A(7 + dx, 2.5, 7.5 + dx, 2.5)], { closed: true, role: 'cut' });
      }
      b.path([[10.375, 2.5], [10.375, 6], [11.375, 6], [11.375, 2.5], A(11.875, 2, 11.875, 2.5), A(12.375, 1.5, 11.875, 1.5), [12.375, 1], [13.375, 1], [13.375, 0], [10.375, 0], [10.375, 1], [11.375, 1], [11.375, 1.5], A(10.875, 2, 10.875, 1.5), A(10.375, 2.5, 10.875, 2.5)], { closed: true });
      b.path([[12.875, 2.5], [12.875, 6], [13.875, 6], [13.875, 2.5], A(14.375, 2, 14.375, 2.5), A(14.875, 1.5, 14.375, 1.5), [14.875, 0], [13.875, 0], [13.875, 1.5], A(13.375, 2, 13.375, 1.5), A(12.875, 2.5, 13.375, 2.5)], { closed: true });
      b.path([[18.875, 2.5], [18.875, 6], [19.875, 6], [19.875, 2.5], A(20.375, 2, 20.375, 2.5), A(20.875, 1.5, 20.375, 1.5), A(21.375, 2, 21.375, 1.5, 1), A(20.875, 2.5, 21.375, 2.5), [20.875, 6], [21.875, 6], [21.875, 2.5], A(22.375, 2, 22.375, 2.5), A(22.875, 1.5, 22.375, 1.5), A(19.875, 1.5, 21.375, 1.5, 0), A(19.375, 2, 19.375, 1.5), A(18.875, 2.5, 19.375, 2.5)], { closed: true });
      return b.doc;
    },
  },
  {
    id: 'slanted-p', name: 'Slanted P', grid: 'square', note: 'A square grid slanted 21.24°, stepping in ninths: one outline with an S-shaped counter, large and small fillets.',
    build() {
      const b = builder({ kind: 'affine', preset: 'square', subdivision: 1, width: 56, height: 45, slantDeg: 21.241, rotationDeg: 0 } as GridDef, 'Slanted P');
      const P = (u: number, v: number) => lattice(u, v);
      b.polygon([P(0, 0), P(21, 0), P(21, 9), P(41, 9), P(41, 36), P(20, 36), P(20, 27), P(11, 27), P(11, 45), P(0, 45)], { corners: [0, 5, 2, 14.107, 6.607, 5, 2, 0, 0, 0] });
      b.polygon([P(21, 18), P(21, 27), P(30, 27), P(30, 18), P(20, 18), P(20, 9), P(11, 9), P(11, 18)], { corners: [5, 2, 2, 2, 5, 2, 0, 0], role: 'cut' });
      return b.doc;
    },
  },

  // ---- isometric ----
  {
    id: 'iso-e', name: 'Isometric E', grid: 'isometric', note: 'Isometric 2:3 in half steps: a chevron band and a zigzag band, every corner rounded 1/12 cell.',
    build() {
      const b = builder({ kind: 'affine', preset: 'isometric', ratio: '2:3', subdivision: 2, width: 4, height: 5, rotationDeg: 0 } as GridDef, 'Isometric E');
      const r = 20 / 240, t = 1 / 3;
      b.polygon([[2, 14 * t], [0, 10 * t], [0, 8 * t], [2, 12 * t], [4, 8 * t], [4, 10 * t]], { corners: Array(6).fill(r) });
      b.polygon([[0.5, 5 * t], [1, 6 * t], [3, 2 * t], [3.5, 3 * t], [1.5, 7 * t], [2, 8 * t], [4, 4 * t], [4, 6 * t], [2, 10 * t], [0, 6 * t], [0, 4 * t], [2, 0], [2.5, t]], { corners: Array(13).fill(r) });
      return b.doc;
    },
  },
  {
    id: 'iso-cube', name: 'Cube with a Y cut', grid: 'isometric', note: 'True 30° isometric: a hexagon with softened corners, and three lines cut from its centre along the cube edges.',
    build() {
      const g = { ...defaultGrid('isometric'), width: 6, height: 6 } as GridDef;
      const b = builder(g, 'Cube with a Y cut');
      const at = (u: number, v: number): [number, number] => { const p = toPlane(lattice(u, v), g); return [p.x, p.y]; };
      // Centre (4, -1); the hexagon's corners are 2 steps along each lattice direction.
      b.polygon([at(2, 1), at(4, 1), at(6, -1), at(6, -3), at(4, -3), at(2, -1)], { corners: Array(6).fill(0.2) });
      for (const end of [at(2, -1), at(4, 1), at(6, -3)]) b.path([at(4, -1), end], { stroke: 40 / LEN, role: 'cut' });
      return b.doc;
    },
  },

  // ---- polar ----
  {
    id: 'rays-in-frame', name: 'Rays in a frame', grid: 'polar', note: 'Polar, 24 rays, with the companion square lattice: seven 30° wedges intersected with a 10 × 8 frame. The joint radius rounds the corners where rays meet the frame.',
    build() {
      const b = builder({ kind: 'polar', preset: 'polar', subdivision: 1, rings: 8, rays: 24, rotationDeg: 0, companionSquare: true }, 'Rays in a frame');
      const O = lattice(0, 0);
      for (const [a, c] of [[23, 1], [2, 4], [5, 7], [8, 10], [11, 13], [14, 16], [20, 22]] as const) b.polygon([O, lattice(8, a), lattice(8, c)]);
      const S = (x: number, y: number) => lattice(x, y, 'square');
      b.polygon([S(-5, -4), S(5, -4), S(5, 4), S(-5, 4)], { corners: Array(4).fill(1 / 6), role: 'intersect', joint: 1 / 6 });
      return b.doc;
    },
  },
  {
    id: 'segmented-dial', name: 'Segmented dial', grid: 'polar', note: 'A ring (circle minus circle) cut by one 7.5° wedge repeated ×12. The wedge’s joint radius rounds every segment’s corners.',
    build() {
      const g: GridDef = { kind: 'polar', preset: 'polar', subdivision: 1, rings: 6, rays: 48, rotationDeg: 0, companionSquare: false };
      const b = builder(g, 'Segmented dial');
      const O = lattice(0, 0), c = toPlane(O, g);
      b.circle(c.x, c.y, 5);
      b.circle(c.x, c.y, 3, 'cut');
      b.polygon([O, lattice(6, 0), lattice(6, 1)], { role: 'cut', repeat: { kind: 'rotate', centre: O, count: 12, mirrored: false }, joint: 1 / 12 });
      return b.doc;
    },
  },

  // ---- triangular ----
  {
    id: 'hex-triangle', name: 'Hexagon with a triangle cut', grid: 'triangular', note: 'A hexagon two steps across each 60° direction, corners rounded 1/4 cell, minus a small triangle at its centre.',
    build() {
      const g = { ...defaultGrid('triangular'), width: 6, height: 6 } as GridDef;
      const b = builder(g, 'Hexagon with a triangle cut');
      const P = (u: number, v: number) => lattice(u, v);
      b.polygon([P(4, 3), P(2, 5), P(0, 5), P(0, 3), P(2, 1), P(4, 1)], { corners: Array(6).fill(0.25) });
      b.polygon([P(1, 4), P(3, 3), P(2, 2)], { role: 'cut', corners: Array(3).fill(0.1) });
      return b.doc;
    },
  },
  {
    id: 'chevron-strokes', name: 'Nested chevrons', grid: 'triangular', note: 'Three V-shaped lines along the 60° directions, 2/5 cell wide with round caps and joins, stacked one step apart.',
    build() {
      const g = { ...defaultGrid('triangular'), width: 5, height: 7 } as GridDef;
      const b = builder(g, 'Nested chevrons');
      const at = (u: number, v: number): [number, number] => { const p = toPlane(lattice(u, v), g); return [p.x, p.y]; };
      for (let i = 0; i < 3; i++) {
        const u = 1 - i, v = 2 * i;
        b.path([at(u, v), at(u, v + 3), at(u + 3, v)], { stroke: 96 / LEN });
      }
      return b.doc;
    },
  },

  // ---- typographic ----
  {
    id: 'letter-n', name: 'Letter n', grid: 'typographic', note: 'A lowercase n on the typographic rows: stems and an arch one cell wide with flat ends, sitting on the baseline and reaching the x-height.',
    build() {
      const b = builder(defaultGrid('typographic'), 'Letter n');
      b.path([[2, 2], [2, 6]], { stroke: 1, cap: 'butt' });
      b.path([[2, 4], { to: [5, 4], c: [3.5, 4], sweep: 1 }, [5, 6]], { stroke: 1, cap: 'butt' });
      return b.doc;
    },
  },
  {
    id: 'letter-b', name: 'Letter b', grid: 'typographic', note: 'A lowercase b: a stem from the ascender to the baseline and a round bowl between x-height and baseline, one cell wide.',
    build() {
      const b = builder(defaultGrid('typographic'), 'Letter b');
      b.path([[2, 0], [2, 6]], { stroke: 1, cap: 'butt' });
      b.path([[2, 4], { to: [5, 4], c: [3.5, 4], sweep: 1 }, { to: [2, 4], c: [3.5, 4], sweep: 1 }], { stroke: 1, closed: true });
      return b.doc;
    },
  },
];
