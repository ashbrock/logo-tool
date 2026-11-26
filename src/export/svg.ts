/**
 * Mark → SVG (ARCHITECTURE.md §7). `buildSvg` writes the raw file: bounds, one <path> per piece, and
 * the optional construction overlay first. `finishSvg` runs SVGO with the project config. SVGO is
 * passed in, so the app can load it only when exporting and tests can use the Node build.
 */
import type { LogoDocument, ExportSettings } from '../model/types';
import type { Mark } from '../pipeline/evaluate';
import type { ShapeConstruction } from '../pipeline/resolve';
import { contourBounds, type Box } from './bounds';
import { buildOverlay } from './overlay';
import { OVERLAY_PALETTE } from './palette';
import { fmt, writePath } from './write-path';

export const PRECISION = 3;

export interface Evaluation {
  readonly mark: Mark;
  readonly construction: readonly ShapeConstruction[];
}

export interface ExportProblem {
  readonly text: string;
  readonly shapeId?: string;
}

/** Reasons export is blocked (SPEC.md §9). Empty when the mark can be exported. */
export function exportProblems(doc: LogoDocument, ev: Evaluation): ExportProblem[] {
  if (doc.shapes.length === 0) return [{ text: 'Nothing to export yet.' }];
  const out: ExportProblem[] = [];
  for (const c of ev.construction) {
    if (c.invalid) out.push({ text: `Shape ${doc.shapes.findIndex((s) => s.id === c.shapeId) + 1} has an outline that can't be built.`, shapeId: c.shapeId });
  }
  for (const e of ev.mark.errors) out.push({ text: `The merge could not be resolved exactly: ${e.message}` });
  if (out.length === 0 && ev.mark.pieces.length === 0) {
    out.push({ text: doc.shapes.some((s) => s.role === 'add') ? 'The cut shapes remove the whole mark.' : 'Nothing to export yet.' });
  }
  return out;
}

/** Export bounds in cells: the mark's tight bounds plus padding. */
export function exportBox(mark: Mark, paddingCells: number): Box | null {
  const b = contourBounds(mark.pieces.flatMap((p) => [p.outer, ...p.holes]));
  if (!b) return null;
  return { minX: b.minX - paddingCells, minY: b.minY - paddingCells, maxX: b.maxX + paddingCells, maxY: b.maxY + paddingCells };
}

export interface SvgOut {
  readonly svg: string;
  /** Size in export units (also the SVG's width and height). */
  readonly width: number;
  readonly height: number;
}

export function buildSvg(doc: LogoDocument, ev: Evaluation, settings: ExportSettings = doc.export): SvgOut {
  const box = exportBox(ev.mark, settings.paddingCells);
  if (!box) throw new Error('Nothing to export.');
  const scale = settings.unitsPerCell;
  const width = (box.maxX - box.minX) * scale, height = (box.maxY - box.minY) * scale;
  const W = fmt(width, PRECISION), H = fmt(height, PRECISION);
  const overlay = settings.overlay === 'off' ? '' : buildOverlay(doc, ev.mark, ev.construction, { box, scale, pxUnit: Math.max(width, height) / 1024 }, settings.overlay, settings.edgeGuides);
  const fill = (settings.overlay === 'dark' ? OVERLAY_PALETTE.dark.mark : null) ?? settings.colour;
  const paths = ev.mark.pieces
    .map((p) => `<path d="${writePath([p.outer, ...p.holes], { scale, precision: PRECISION, origin: { x: box.minX, y: box.minY } })}" fill="${fill}"/>`)
    .join('');
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${overlay}${paths}</svg>`, width, height };
}

/**
 * The project SVGO config (ARCHITECTURE.md §7). `cleanupIds` keeps the overlay's `construction` id,
 * which SVGO would otherwise drop as unreferenced.
 */
export const SVGO_CONFIG = {
  multipass: false,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          mergePaths: false,
          convertPathData: { floatPrecision: PRECISION, smartArcRounding: false },
          cleanupIds: { preserve: ['construction'] },
        },
      },
    },
  ],
} as const;

export type Optimize = (svg: string, config: typeof SVGO_CONFIG) => { data: string };

export function finishSvg(raw: string, optimize: Optimize): string {
  return optimize(raw, SVGO_CONFIG).data;
}
