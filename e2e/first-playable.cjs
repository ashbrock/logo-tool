// End-to-end check of the first playable, in real Chromium against the production build.
// Run: npm run e2e  (builds, starts `vite preview`, drives the app, asserts, stops the server).
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

(async () => {
  const server = spawn('npx', ['vite', 'preview', '--port', '5310', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2000));
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.goto('http://localhost:5310/');
    await p.waitForSelector('svg.canvas');
    const at = (x, y) => p.evaluate(([x, y]) => { const s = document.querySelector('svg.canvas'); const pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q = pt.matrixTransform(s.getScreenCTM()); return [q.x, q.y]; }, [x, y]);
    const click = async (x, y) => { const [sx, sy] = await at(x, y); await p.mouse.move(sx, sy); await p.mouse.click(sx, sy); };
    const markD = () => p.evaluate(() => document.querySelector('svg.canvas > path')?.getAttribute('d'));

    for (const [x, y] of [[2, 2], [6, 2], [6, 6], [2, 6], [2, 2]]) await click(x, y);
    assert.equal(await markD(), 'M2 2H6V6H2Z', 'placing and closing a square');

    await p.keyboard.press('v');
    await click(6, 2);
    await p.keyboard.press('r'); // round → inward
    await p.keyboard.press('r'); // inward → auto (outer on this convex corner)
    for (let i = 0; i < 3; i++) await p.keyboard.press(']');
    assert.equal(await p.locator('.radius .value').textContent(), 'r 1.50', 'fast key presses all register');
    assert.match(await markD(), /A1\.5 1\.5 0 0 1 /, 'outer wrap arc of radius 1.5');

    await p.keyboard.press('p');
    for (const [x, y] of [[3, 3], [4, 3], [4, 4], [3, 4], [3, 3]]) await click(x, y);
    await p.keyboard.press('v'); await click(3, 3); await p.keyboard.press('2');
    assert.match(await markD(), /ZM4 3H3V4H4Z$/, 'cut shape becomes a hole');

    for (let i = 0; i < 3; i++) await p.keyboard.press('Control+z');
    assert.doesNotMatch(await markD(), /M4 3/, 'undo removes the cut');

    const hint = await p.evaluate(() => document.querySelector('.hint').getBoundingClientRect().bottom);
    assert.ok(hint <= 860, 'hint line is on screen');
    assert.deepEqual(errors, [], 'no console errors');
    console.log('first playable: all checks passed');
  } finally {
    await b.close();
    server.kill();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
