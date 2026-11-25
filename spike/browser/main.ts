// Spike: Paper.js core build doing booleans in a browser page with no <canvas> element.
import paper from 'paper/dist/paper-core';

const scope = new paper.PaperScope();
scope.setup(new scope.Size(1, 1));
const opt = { insert: false };

const sq = new scope.Path.Rectangle({ point: [0, 0], size: [4, 4], insert: false });
const hole = new scope.Path.Circle({ center: [2, 2], radius: 1, insert: false });
const cut = sq.subtract(hole, opt);
const a = new scope.Path.Rectangle({ point: [0, 0], size: [1, 1], insert: false });
const b = new scope.Path.Rectangle({ point: [1, 0], size: [1, 1], insert: false });
const merged = a.unite(b, opt);
const wedge = new scope.Path({ segments: [[0, 0], [10, -1], [10, 1]], closed: true, insert: false });
const clip = wedge.intersect(new scope.Path.Rectangle({ point: [-5, -5], size: [10, 10], insert: false }), opt);

const result = {
  canvasElements: document.querySelectorAll('canvas').length,
  cutArea: Math.abs(cut.area),
  cutClass: cut.className,
  mergedArea: Math.abs(merged.area),
  mergedSegments: (merged as paper.Path).segments.length,
  clipArea: Math.abs(clip.area),
};
(window as unknown as { spike: unknown }).spike = result;
document.getElementById('out')!.textContent = JSON.stringify(result, null, 2);
