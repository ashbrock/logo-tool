// Reconstruction, part 2 (VERIFICATION.md §1.1 steps 3–7): render each original and its rebuild in
// Chromium at 1024 px on the long side, black on white; align on the ink bounding box; compare with
// pixelmatch (threshold 0.1, includeAA false) against ink area; count pieces (8-connected ink) and
// holes (enclosed background); write a triptych (original | rebuild | diff) and a JSON row each.
// Run: npm run rebuilds (the vitest step writes artifacts/rebuilds/ first).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'artifacts/rebuilds');
const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
const only = process.argv[2];
const pm = fs.readFileSync(path.join(root, 'node_modules/pixelmatch/index.js'), 'utf8').replace('export default function pixelmatch', 'window.pixelmatch = function pixelmatch');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  await p.setContent('<!doctype html><body></body>');
  await p.addScriptTag({ content: pm });
  const rows = [];
  let failed = 0;
  for (const m of manifest) {
    if (only && m.name !== only) continue;
    const original = fs.readFileSync(path.join(root, 'references', `${m.name}.svg`), 'utf8');
    const rebuild = fs.readFileSync(path.join(out, `${m.name}.svg`), 'utf8');
    const r = await p.evaluate(async ([a, b]) => {
      const LONG = 1024;
      const raster = async (svg) => {
        const vb = svg.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
        const k = LONG / Math.max(vb[2], vb[3]);
        const w = Math.round(vb[2] * k), h = Math.round(vb[3] * k);
        const sized = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1').replace('<svg', `<svg width="${w}" height="${h}"`);
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
        await img.decode();
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        return { w, h, data: g.getImageData(0, 0, w, h).data };
      };
      const inkAt = (im, i) => im.data[i * 4] < 128;
      const crop = (im) => {
        let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
        for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (inkAt(im, y * im.w + x)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      };
      const A = await raster(a), B = await raster(b);
      const ca = crop(A), cb = crop(B);
      // Common frame: the larger of the two ink boxes, plus a 2 px white margin so holes and pieces read cleanly.
      const W = Math.max(ca.w, cb.w) + 4, H = Math.max(ca.h, cb.h) + 4;
      const place = (im, c) => {
        const d = new Uint8ClampedArray(W * H * 4).fill(255);
        for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
          const s = ((c.y0 + y) * im.w + c.x0 + x) * 4, t = ((y + 2) * W + x + 2) * 4;
          d[t] = im.data[s]; d[t + 1] = im.data[s + 1]; d[t + 2] = im.data[s + 2]; d[t + 3] = 255;
        }
        return d;
      };
      const da = place(A, ca), db = place(B, cb);
      const diff = new Uint8ClampedArray(W * H * 4);
      const mismatched = window.pixelmatch(da, db, diff, W, H, { threshold: 0.1, includeAA: false, diffColor: [242, 149, 138], alpha: 0.15 });
      let ink = 0;
      for (let i = 0; i < W * H; i++) if (da[i * 4] < 128 || db[i * 4] < 128) ink++;
      // Components: pieces are 8-connected ink; holes are 4-connected background not touching the border.
      const components = (d, wantInk, eight) => {
        const seen = new Uint8Array(W * H); let count = 0, holes = 0;
        const isInk = (i) => d[i * 4] < 128;
        for (let i = 0; i < W * H; i++) {
          if (seen[i] || isInk(i) !== wantInk) continue;
          count++; let border = false; const stack = [i]; seen[i] = 1;
          while (stack.length) {
            const j = stack.pop(), x = j % W, y = (j / W) | 0;
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              if ((!dx && !dy) || (!eight && dx && dy)) continue;
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              const k = ny * W + nx;
              if (!seen[k] && isInk(k) === wantInk) { seen[k] = 1; stack.push(k); }
            }
          }
          if (!border) holes++;
        }
        return wantInk ? count : holes;
      };
      // Triptych: original | rebuild | diff.
      const c = document.createElement('canvas'); c.width = W * 3 + 16; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#93a0a5'; g.fillRect(0, 0, c.width, c.height);
      g.putImageData(new ImageData(da, W, H), 0, 0); g.putImageData(new ImageData(db, W, H), W + 8, 0); g.putImageData(new ImageData(diff, W, H), 2 * W + 16, 0);
      return {
        mismatch: (100 * mismatched) / ink, mismatched, ink,
        pieces: [components(da, true, true), components(db, true, true)],
        holes: [components(da, false, false), components(db, false, false)],
        sizes: [[ca.w, ca.h], [cb.w, cb.h]],
        png: c.toDataURL('image/png').split(',')[1],
      };
    }, [original, rebuild]);
    fs.writeFileSync(path.join(out, `${m.name}.png`), Buffer.from(r.png, 'base64'));
    const ok = r.mismatch <= m.maxMismatch && r.pieces[0] === r.pieces[1] && r.holes[0] === r.holes[1] && m.nodes <= m.maxNodes;
    if (!ok) failed++;
    const row = { name: m.name, ok, mismatch: +r.mismatch.toFixed(3), maxMismatch: m.maxMismatch, pieces: r.pieces, holes: r.holes, nodes: m.nodes, originalNodes: m.originalNodes, maxNodes: m.maxNodes, inkBox: r.sizes };
    fs.writeFileSync(path.join(out, `${m.name}.json`), JSON.stringify(row, null, 2));
    rows.push(row);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${m.name.padEnd(12)} mismatch ${row.mismatch.toFixed(3)}% (≤ ${m.maxMismatch}%)  pieces ${r.pieces.join('/')}  holes ${r.holes.join('/')}  nodes ${m.nodes}/${m.originalNodes} (≤ ${m.maxNodes})  ink box ${r.sizes.map((s) => s.join('×')).join(' vs ')}`);
  }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(rows, null, 2));
  await b.close();
  if (failed) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
