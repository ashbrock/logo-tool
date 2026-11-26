/**
 * Reconstruction, part 1 (VERIFICATION.md §1.1 steps 1, 2 and the node rule of step 6): build each
 * rebuild through commands, check it is clean, export it, and compare node counts with the original.
 * Writes artifacts/rebuilds/<name>.svg, <name>.logo.json and manifest.json for the raster comparison
 * (`npm run rebuilds` runs e2e/rebuilds.mjs next).
 */
import { optimize } from 'svgo';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateDocument } from '../src/model/validate';
import { evaluateDocument } from '../src/pipeline/resolve';
import { buildSvg, exportProblems, finishSvg, type Optimize } from '../src/export/svg';
import { countSvgNodes } from '../src/export/nodes';
import { serialize } from '../src/persist/project';
import { REBUILDS } from './rebuilds';
import { engine } from './paper-engine';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string): void };
const OUT = new URL('../artifacts/rebuilds/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const manifest: object[] = [];

describe('reference rebuilds', () => {
  for (const r of REBUILDS) {
    it(`${r.name}: builds cleanly, exports, and has no more nodes than allowed`, () => {
      const doc = r.build();
      expect(validateDocument(doc)).toEqual([]);
      const ev = evaluateDocument(doc, engine);
      expect(exportProblems(doc, ev)).toEqual([]);
      expect(ev.issues.filter((i) => i.kind === 'corner' && (i.issue.kind === 'no-tangent' || i.issue.kind === 'degenerate'))).toEqual([]);
      const svg = finishSvg(buildSvg(doc, ev, { ...doc.export, colour: '#000000', paddingCells: 0, overlay: 'off', unitsPerCell: r.unitsPerCell }).svg, optimize as unknown as Optimize);
      const nodes = countSvgNodes(svg);
      const original = countSvgNodes(readFileSync(new URL(`../references/${r.name}.svg`, import.meta.url), 'utf8'));
      fs.writeFileSync(`${OUT}${r.name}.svg`, svg);
      fs.writeFileSync(`${OUT}${r.name}.logo.json`, serialize(doc));
      manifest.push({ name: r.name, nodes, originalNodes: original, maxNodes: r.maxNodes, maxMismatch: r.maxMismatch, pieces: ev.mark.pieces.length, note: r.note });
      fs.writeFileSync(`${OUT}manifest.json`, JSON.stringify(manifest, null, 2));
      expect(nodes).toBeLessThanOrEqual(r.maxNodes);
    });
  }
});
