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
}

export type Action =
  | { type: 'command'; command: Command; label?: string; key?: string; at?: number; select?: 'last-vertex' | 'none'; startPlacing?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'mode'; mode: Mode }
  | { type: 'select'; ids: readonly string[] }
  | { type: 'placing'; shapeId: string | null }
  | { type: 'status'; text: string; tone?: 'info' | 'error' }
  | { type: 'paperPreview' };

export const initState = (doc: LogoDocument): UiState => ({
  history: initHistory(doc), mode: 'place', selection: [], placing: null, status: null, paperPreview: false,
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
    case 'mode': return { ...s, mode: a.mode, placing: a.mode === 'place' ? s.placing : null };
    case 'select': return { ...s, selection: a.ids };
    case 'placing': return { ...s, placing: a.shapeId };
    case 'status': return { ...s, status: { text: a.text, tone: a.tone ?? 'info', at: Date.now() } };
    case 'paperPreview': return { ...s, paperPreview: !s.paperPreview };
  }
}

export const cellOf = (p: Lattice, sub: number) => ({ x: p.u / sub, y: p.v / sub });
