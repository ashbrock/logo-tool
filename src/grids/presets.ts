/** Default grid definitions per preset (SPEC.md §5 defaults). */
import type { GridDef } from './types';

export const PRESETS = ['square', 'triangular', 'isometric', 'polar', 'typographic'] as const;
export type Preset = (typeof PRESETS)[number];

export function defaultGrid(preset: Preset): GridDef {
  switch (preset) {
    case 'square':
      return { kind: 'affine', preset, subdivision: 1, width: 6, height: 6, slantDeg: 0, rotationDeg: 0 };
    case 'triangular':
      return { kind: 'affine', preset, subdivision: 1, width: 6, height: 6, rotationDeg: 0 };
    case 'isometric':
      return { kind: 'affine', preset, subdivision: 1, width: 6, height: 6, ratio: 'true30', rotationDeg: 0 };
    case 'polar':
      return { kind: 'polar', preset, subdivision: 1, rings: 6, rays: 24, rotationDeg: 0 };
    case 'typographic':
      // Rows in sub-steps from the top (subdivision 2): ascender 0, cap 1 cell, x-height 3 cells, baseline 6 cells, descender 7.5 cells.
      return {
        kind: 'affine', preset, subdivision: 2, width: 12, height: 8,
        rows: [
          { name: 'ascender', at: 0 },
          { name: 'cap height', at: 2 },
          { name: 'x-height', at: 6 },
          { name: 'baseline', at: 12 },
          { name: 'descender', at: 15 },
        ],
      };
  }
}
