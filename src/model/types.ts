/**
 * The document: the only source of truth (ARCHITECTURE.md §3). Everything drawn — outlines, booleans,
 * repeat copies — is derived from it and never stored. Plain JSON, frozen in development.
 */
import type { Lattice } from '../geometry/lattice';
import type { Int } from '../geometry/num';
import type { CornerType } from '../geometry/corners';
import type { Cap, Join } from '../geometry/strokes';
import type { GridDef } from '../grids';

/** Lengths (radius, stroke width) in 1/240 of a cell: exact for every allowed subdivision. */
export type Len240 = Int;
export const LEN = 240;

export interface Vertex {
  readonly id: string;
  readonly at: Lattice;
  readonly corner: CornerType;
  readonly radius: Len240 | { readonly ref: string };
}

/** segments[i] joins vertices[i] → vertices[i + 1] (wrapping when closed). Arcs are centred on a lattice point. */
export type Segment =
  | { readonly kind: 'line' }
  | { readonly kind: 'arc'; readonly centre: Lattice; readonly sweep: 0 | 1 };

export interface Path {
  readonly vertices: readonly Vertex[];
  readonly segments: readonly Segment[];
  readonly closed: boolean;
}

export type Paint =
  | { readonly kind: 'fill' }
  | { readonly kind: 'stroke'; readonly width: Len240; readonly cap: Cap; readonly join: Join; readonly endRadius: Len240 };

/** Per-shape repeat (SPEC.md §6.9). Copies are derived, so they need not land on lattice points. */
export type Repeat =
  | { readonly kind: 'none' }
  | { readonly kind: 'rotate'; readonly centre: Lattice; readonly count: Int; readonly mirrored: boolean; readonly axis?: Lattice }
  | { readonly kind: 'mirror'; readonly through: Lattice; readonly to: Lattice }
  | { readonly kind: 'translate'; readonly step: Lattice; readonly count: Int };

export interface Shape {
  readonly id: string;
  readonly path: Path;
  readonly paint: Paint;
  readonly role: 'add' | 'cut' | 'intersect';
  readonly repeat: Repeat;
  readonly jointRadius: Len240;
}

export interface NamedRadius {
  readonly id: string;
  readonly name: string;
  readonly value: Len240;
}

export interface ExportSettings {
  readonly colour: string;
  readonly paddingCells: number;
  readonly overlay: 'off' | 'dark' | 'light';
  readonly edgeGuides: boolean;
  readonly pngSize: 512 | 1024 | 2048 | 4096;
  readonly pngBackground: 'transparent' | 'white' | 'overlay';
  readonly unitsPerCell: Int;
}

export const SCHEMA = 1 as const;

export interface LogoDocument {
  readonly schema: typeof SCHEMA;
  readonly name: string;
  readonly nextId: Int;
  readonly grid: GridDef;
  /** Evaluation order = array order (SPEC.md §6.7). */
  readonly shapes: readonly Shape[];
  readonly radii: readonly NamedRadius[];
  readonly export: ExportSettings;
}

export const DEFAULT_EXPORT: ExportSettings = {
  colour: '#000000', paddingCells: 0, overlay: 'off', edgeGuides: false,
  pngSize: 1024, pngBackground: 'transparent', unitsPerCell: 100,
};

export function emptyDocument(grid: GridDef, name = 'Untitled mark'): LogoDocument {
  return { schema: SCHEMA, name, nextId: 1, grid, shapes: [], radii: [], export: DEFAULT_EXPORT };
}

/** Deep-freeze for development builds: catches accidental mutation of documents in history. */
export function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as object)) deepFreeze(v);
  }
  return x;
}
