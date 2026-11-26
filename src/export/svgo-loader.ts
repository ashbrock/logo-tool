/**
 * SVGO is large (about 800 KB), so the app loads its browser build on demand: once when idle after
 * start-up, so Copy SVG can run inside the click that asked for it, and again on demand if needed.
 */
import type { Optimize } from './svg';

let loaded: Optimize | null = null;
let pending: Promise<Optimize> | null = null;

export function loadSvgo(): Promise<Optimize> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import('svgo/browser').then((m) => (loaded = m.optimize as unknown as Optimize));
  return pending;
}

/** SVGO if it has finished loading, else null. */
export const svgoNow = (): Optimize | null => loaded;
