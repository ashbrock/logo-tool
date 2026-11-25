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
      return { kind: 'polar', preset, subdivision: 1, rings: 6, rays: 24, rotationDeg: 0, companionSquare: false };
    case 'typographic':
      // An 8-cell em with common Latin proportions (rows in half-cell sub-steps from the top):
      // ascender 0.75 em above the baseline, cap height ≈ 0.69 em, x-height 0.5 em, descender 0.25 em.
      return {
        kind: 'affine', preset, subdivision: 2, width: 12, height: 8,
        rows: [
          { name: 'ascender', at: 0 },     // 6 cells above baseline
          { name: 'cap height', at: 1 },   // 5.5 cells above baseline
          { name: 'x-height', at: 4 },     // 4 cells above baseline
          { name: 'baseline', at: 12 },
          { name: 'descender', at: 16 },   // 2 cells below baseline
        ],
      };
  }
}
