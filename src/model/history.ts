/**
 * Undo / redo (ARCHITECTURE.md §8): history holds whole document snapshots. Because entries hold the
 * same frozen objects, undo then redo returns the identical document (P3). A drag or a run of nudges
 * passes a coalescing key, so it becomes one entry.
 */
import { apply, type Command, type Result } from './commands';
import type { LogoDocument } from './types';

export interface Entry {
  readonly doc: LogoDocument;
  readonly label: string;
  readonly key?: string;
  readonly at: number;
}

export interface History {
  readonly past: readonly Entry[];
  readonly present: Entry;
  readonly future: readonly Entry[];
}

export const LIMIT = 500;
export const COALESCE_MS = 600;

export const initHistory = (doc: LogoDocument): History => ({ past: [], present: { doc, label: 'Start', at: 0 }, future: [] });

export function dispatch(h: History, cmd: Command, opts: { label?: string; key?: string; at?: number } = {}): { history: History; result: Result } {
  const result = apply(h.present.doc, cmd);
  if (!result.ok || result.doc === h.present.doc) return { history: h, result };
  const at = opts.at ?? 0;
  const entry: Entry = { doc: result.doc, label: opts.label ?? cmd.type, ...(opts.key ? { key: opts.key } : {}), at };
  // Coalesce: same key within the window replaces the present entry instead of adding one.
  if (opts.key && h.present.key === opts.key && at - h.present.at <= COALESCE_MS) {
    return { history: { past: h.past, present: entry, future: [] }, result };
  }
  const past = [...h.past, h.present];
  return { history: { past: past.length > LIMIT ? past.slice(past.length - LIMIT) : past, present: entry, future: [] }, result };
}

export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  return prev ? { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] } : h;
}

export function redo(h: History): History {
  const next = h.future[0];
  return next ? { past: [...h.past, h.present], present: next, future: h.future.slice(1) } : h;
}
