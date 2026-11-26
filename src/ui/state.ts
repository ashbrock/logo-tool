/**
 * App state (ARCHITECTURE.md §8): the document history plus interface state. Interface state (mode,
 * selection, the shape being placed, status message) is never part of the document or of undo.
 */
import type { Lattice } from '../geometry/lattice';
import { dispatch as dispatchHistory, initHistory, redo, undo, type History } from '../model/history';
import type { Command } from '../model/commands';
import type { LogoDocument } from '../model/types';

export type Mode = 'place' | 'adjust';

export interface UiState {
  readonly history: History;
  readonly mode: Mode;
  /** Selected vertex ids. */
  readonly selection: readonly string[];
  /** The open shape being placed in Place mode, if any. */
  readonly placing: string | null;
  readonly status: { readonly text: string; readonly tone: 'info' | 'error'; readonly at: number } | null;
  readonly paperPreview: boolean;
  /** Width (1/240 cell) for new lines; drawing is stroke-first (a closed path becomes a fill). */
  readonly strokeWidth: number;
  /** Arc mode while drawing: the next segments are arcs (SPEC.md §6.3). */
  readonly arcArmed: boolean;
  readonly arcIndex: number;
  /** What the canvas currently offers, for the hint line. */
  readonly arcPreview: { readonly count: number; readonly index: number } | null;
}

export type Action =
  | { type: 'command'; command: Command; label?: string; key?: string; at?: number; select?: 'last-vertex' | 'none'; startPlacing?: boolean; /** After this command, leave Place mode with the placed shape selected. */ finish?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'mode'; mode: Mode }
  | { type: 'select'; ids: readonly string[] }
  | { type: 'placing'; shapeId: string | null }
  | { type: 'status'; text: string; tone?: 'info' | 'error' }
  | { type: 'paperPreview' }
  | { type: 'strokeWidth'; value: number }
  | { type: 'arcArm'; on?: boolean }
  | { type: 'arcCycle'; delta: number }
  | { type: 'arcPreview'; value: { count: number; index: number } | null }
  | { type: 'finishPlacing'; selectShape: boolean };

export const initState = (doc: LogoDocument): UiState => ({
  history: initHistory(doc), mode: 'place', selection: [], placing: null, status: null, paperPreview: false, strokeWidth: 30, arcArmed: false, arcIndex: 0, arcPreview: null,
});

/** Drop selection entries and the placing shape that no longer exist after an edit. */
function prune(s: UiState): UiState {
  const doc = s.history.present.doc;
  const vids = new Set(doc.shapes.flatMap((sh) => sh.path.vertices.map((v) => v.id)));
  const placing = s.placing && doc.shapes.some((sh) => sh.id === s.placing && !sh.path.closed) ? s.placing : null;
  return { ...s, selection: s.selection.filter((id) => vids.has(id)), placing };
}

export function reducer(s: UiState, a: Action): UiState {
  switch (a.type) {
    case 'command': {
      const { history, result } = dispatchHistory(s.history, a.command, { ...(a.label ? { label: a.label } : {}), ...(a.key ? { key: a.key } : {}), ...(a.at !== undefined ? { at: a.at } : {}) });
      if (!result.ok) return { ...s, status: { text: result.error, tone: 'error', at: Date.now() } };
      let next: UiState = { ...s, history };
      if (a.finish && s.placing) {
        const sh = history.present.doc.shapes.find((x) => x.id === s.placing);
        next = { ...next, placing: null, mode: 'adjust', selection: sh ? sh.path.vertices.map((v) => v.id) : [] };
      }
      if (a.startPlacing) {
        const doc = history.present.doc;
        next = { ...next, placing: doc.shapes[doc.shapes.length - 1]?.id ?? null };
      }
      if (a.select === 'last-vertex') {
        const doc = history.present.doc;
        const sh = doc.shapes.find((x) => x.id === (next.placing ?? doc.shapes[doc.shapes.length - 1]?.id)) ?? doc.shapes[doc.shapes.length - 1];
        const last = sh?.path.vertices[sh.path.vertices.length - 1];
        if (last) next = { ...next, selection: [last.id] };
      }
      return prune(next);
    }
    case 'undo': return prune({ ...s, history: undo(s.history) });
    case 'redo': return prune({ ...s, history: redo(s.history) });
    case 'mode': return { ...s, mode: a.mode, placing: a.mode === 'place' ? s.placing : null, arcArmed: a.mode === 'place' ? s.arcArmed : false };
    case 'select': return { ...s, selection: a.ids };
    case 'placing': return { ...s, placing: a.shapeId };
    case 'status': return { ...s, status: { text: a.text, tone: a.tone ?? 'info', at: Date.now() } };
    case 'paperPreview': return { ...s, paperPreview: !s.paperPreview };
    case 'strokeWidth': return { ...s, strokeWidth: a.value };
    case 'arcArm': return { ...s, arcArmed: a.on ?? !s.arcArmed, arcIndex: 0 };
    case 'arcCycle': return { ...s, arcIndex: s.arcIndex + a.delta };
    case 'arcPreview': {
      const v = a.value, o = s.arcPreview;
      if (v === o || (v && o && v.count === o.count && v.index === o.index)) return s;
      return { ...s, arcPreview: v };
    }
    case 'finishPlacing': {
      // After a shape is finished, switch to Adjust with its points selected, ready to round or set its role.
      const sh = s.history.present.doc.shapes.find((x) => x.id === s.placing);
      if (!sh || !a.selectShape) return { ...s, placing: null };
      return { ...s, placing: null, mode: 'adjust', selection: sh.path.vertices.map((v) => v.id) };
    }
  }
}

export const cellOf = (p: Lattice, sub: number) => ({ x: p.u / sub, y: p.v / sub });
