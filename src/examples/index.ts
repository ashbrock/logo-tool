/**
 * Built-in examples (SPEC.md §4.2): each is built through ordinary commands, so it opens as a normal,
 * editable mark. Two are the designer's own references; the rest show techniques (cut, repeat along a
 * line, rotate any n, joint radius, strokes with arcs).
 */
import { LEN, type LogoDocument, type Repeat } from '../model/types';
import { builder, square } from './builder';

export interface Example {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  build(): LogoDocument;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'p-logo-1', name: 'p-logo-1', note: 'Your mark: a 3 × 4 square grid, 45° cuts, a square cutout.',
    build() {
      const b = builder(square(3, 4, 1), 'p-logo-1');
      b.polygon([[0, 3], [1, 3], [1, 4], [0, 4]]);
      b.polygon([[3, 1], [3, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 0], [2, 0]]);
      b.polygon([[1, 1], [2, 1], [2, 2], [1, 2]], { role: 'cut' });
      return b.doc;
    },
  },
  {
    id: 'e-logo-3', name: 'e-logo-3', note: 'Your mark: two 45° pieces on a 3 × 3 grid, every corner rounded 14/240 cell.',
    build() {
      const b = builder(square(3, 3, 1), 'e-logo-3');
      const r = 14 / LEN;
      b.polygon([[1, 2], [3, 2], [2, 3], [0, 3], [0, 2], [1, 1]], { corners: Array(6).fill(r) });
      b.polygon([[3, 1], [2, 2], [2, 1], [0, 1], [1, 0], [3, 0]], { corners: Array(6).fill(r) });
      return b.doc;
    },
  },
  {
    id: 'thunderbolt', name: 'Thunderbolt cut', note: 'A block with two round corners, minus a bolt whose tips touch its edges.',
    build() {
      const b = builder(square(6, 5, 2), 'Thunderbolt cut');
      b.polygon([[0, 0.5], [6, 0.5], [6, 4.5], [0, 4.5]], { corners: [1.5, 0, 1.5, 0] });
      b.polygon([[3, 0.5], [1.5, 3], [3, 3], [3, 4.5], [4.5, 2], [3, 2]], { role: 'cut' });
      return b.doc;
    },
  },
  {
    id: 'striped-circle', name: 'Striped circle', note: 'A circle minus one thin stripe repeated ×5 along a line.',
    build() {
      const b = builder(square(6, 6, 8), 'Striped circle');
      b.circle(3, 3, 2.75);
      b.polygon([[0, 0.875], [6, 0.875], [6, 1.125], [0, 1.125]], { role: 'cut', repeat: { kind: 'translate', step: b.L(0, 1), count: 5 } });
      return b.doc;
    },
  },
  {
    id: 'sun', name: 'Sun (8-fold)', note: 'Two bars with one round corner each, repeated ×8 on a square grid.',
    build() {
      const b = builder(square(6, 6, 4), 'Sun');
      const rep: Repeat = { kind: 'rotate', centre: b.L(3, 3), count: 8, mirrored: false };
      b.polygon([[2.75, 0.25], [3.25, 0.25], [3.25, 1.25], [2.75, 1.25]], { corners: [0, 0, 0, 0.2], repeat: rep });
      b.polygon([[3.25, 1.25], [3.75, 1.25], [3.75, 2.25], [3.25, 2.25]], { corners: [0, 0.2, 0, 0], repeat: rep });
      return b.doc;
    },
  },
  {
    id: 'plus', name: 'Plus with joint radius', note: 'One bar repeated ×4; the joint radius rounds where the copies cross.',
    build() {
      const b = builder(square(6, 6, 2), 'Plus');
      b.polygon([[1, 2.5], [5, 2.5], [5, 3.5], [1, 3.5]], { repeat: { kind: 'rotate', centre: b.L(3, 3), count: 4, mirrored: false }, joint: 0.25 });
      return b.doc;
    },
  },
  {
    id: 'arch', name: 'Arch (stroke + arc)', note: 'A line, an arc centred on a grid point and a line, as one stroke with round ends.',
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
];
