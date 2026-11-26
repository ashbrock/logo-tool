// End-to-end check of the playable build, in real Chromium against the production build.
// Run: npm run e2e  (builds, starts `vite preview`, drives the app, asserts, stops the server).
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const server = spawn('npx', ['vite', 'preview', '--port', '5310', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2000));
  const b = await chromium.launch();
  const results = [];
  const check = async (name, f) => { try { await f(); results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n').slice(0, 6).join(' | ')}`); process.exitCode = 1; } };
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const errors = [];
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.goto('http://localhost:5310/');
    await p.waitForSelector('svg.canvas');
    // First visit opens the New-mark dialog; keep the default mark for these checks.
    await p.waitForSelector('.dialog.new-mark');
    await p.keyboard.press('Escape');
    const at = (x, y) => p.evaluate(([x, y]) => { const s = document.querySelector('svg.canvas'); const pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q = pt.matrixTransform(s.getScreenCTM()); return [q.x, q.y]; }, [x, y]);
    const click = async (x, y) => { const [sx, sy] = await at(x, y); await p.mouse.move(sx, sy); await p.mouse.click(sx, sy); };
    const markD = () => p.evaluate(() => document.querySelector('svg.canvas > path:not([fill="none"])')?.getAttribute('d') ?? '');
    const pointCount = () => p.evaluate(() => document.querySelectorAll('svg.canvas rect[width]').length / 2 - 1);

    await check('placing then closing on the first point makes a filled square', async () => {
      for (const [x, y] of [[2, 2], [6, 2], [6, 6], [2, 6], [2, 2]]) await click(x, y);
      assert.equal(await markD(), 'M2 2H6V6H2Z');
    });
    await check('closing switches to Adjust with the shape selected and outlined', async () => {
      assert.equal(await p.locator('.seg button[aria-pressed="true"]').first().textContent(), 'Adjust V');
      assert.equal(await p.locator('.value').filter({ hasText: 'points' }).first().textContent(), '4 points');
      assert.ok(await p.evaluate(() => [...document.querySelectorAll('svg.canvas path')].some((e) => e.getAttribute('stroke') === 'var(--canvas-selection)')));
    });
    await check('fast keys all register (R R ] ] ])', async () => {
      await click(6, 2);
      await p.keyboard.press('r'); await p.keyboard.press('r');
      for (let i = 0; i < 3; i++) await p.keyboard.press(']');
      assert.equal(await p.inputValue('#point-radius'), '1/8'); // 3 × 1/24 cell
    });
    await check('the radius handle drags: right increases, left decreases', async () => {
      await p.keyboard.press('0');
      const [hx, hy] = await p.evaluate(() => { const c = document.querySelector('.radius-handle circle:last-of-type'); const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      const [x0] = await at(0, 0), [x1] = await at(1, 0);
      const cell = x1 - x0;
      await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx + cell * 0.5, hy, { steps: 5 }); await p.mouse.up();
      assert.equal(await p.inputValue('#point-radius'), '1/2');
      const [h2x, h2y] = await p.evaluate(() => { const c = document.querySelector('.radius-handle circle:last-of-type'); const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await p.mouse.move(h2x, h2y); await p.mouse.down(); await p.mouse.move(h2x - cell * 0.25, h2y, { steps: 5 }); await p.mouse.up();
      assert.equal(await p.inputValue('#point-radius'), '1/4');
    });
    await check('keys still work after using a rail dropdown', async () => {
      await p.selectOption('#grid-sub', '2');
      await click(6, 2);
      await p.keyboard.press(']');
      assert.equal(await p.inputValue('#point-radius'), '7/24'); // 0.25 + 1/24
    });
    await check('the rail’s + and − step like ] and [ (1/24 cell; Shift: a grid step)', async () => {
      await p.locator('button[aria-label="Larger radius"]').click();
      assert.equal(await p.inputValue('#point-radius'), '1/3');
      await p.locator('button[aria-label="Smaller radius"]').click();
      await p.keyboard.press('[');
      assert.equal(await p.inputValue('#point-radius'), '1/4');
      await p.locator('button[aria-label="Larger radius"]').click({ modifiers: ['Shift'] });
      assert.equal(await p.inputValue('#point-radius'), '1/2'); // Shift: next 1/2-cell grid step
    });
    await check('Delete removes the selected point', async () => {
      await click(6, 6);
      await p.keyboard.press('Delete');
      assert.equal(await p.locator('.value').first().textContent().then(() => p.evaluate(() => document.querySelector('svg.canvas > path:not([fill="none"])').getAttribute('d').includes('6 6'))), false);
    });
    await check('Backspace (Mac “delete”) removes the selected point too', async () => {
      await click(2, 6);
      await p.keyboard.press('Backspace');
      assert.ok(!(await markD()).includes('2 6'));
    });
    await check('a diagonal and a straight line come out the same width', async () => {
      await p.keyboard.press('p');
      for (const [x, y] of [[1, 7], [7, 7]]) await click(x, y);
      await p.keyboard.press('Enter');
      await p.keyboard.press('p');
      for (const [x, y] of [[1, 1], [4, 4]]) await click(x, y);
      await p.keyboard.press('Enter');
      const widths = await p.evaluate(() => {
        // Measure each line's outline: straight one is horizontal; diagonal one at 45°.
        const d = document.querySelector('svg.canvas > path:not([fill="none"])').getAttribute('d');
        return d;
      });
      // Width 1/8 cell. Straight: y from 6.9375 to 7.0625. Diagonal (45°): offsets of 0.0625/√2 ≈ 0.04419 in x and y,
      // so both are 0.125 wide measured perpendicular to the line.
      assert.match(widths, /6\.9375/);
      assert.match(widths, /1\.04419|0\.95581/);
    });
    await check('examples open and undo goes back', async () => {
      await p.selectOption('#examples', 'sun');
      const sun = await markD();
      assert.ok(sun.length > 200, 'sun drawn');
      await p.keyboard.press('Control+z');
      assert.notEqual(await markD(), sun);
    });
    await check('new lines start at the thinnest width (1/8 cell)', async () => {
      assert.equal(await p.inputValue('#line-width'), '1/8');
    });
    await check('lengths can be typed as fractions or decimals, in cells', async () => {
      assert.equal(await p.inputValue('#line-width'), '1/8');
      assert.match(await p.locator('#line-width-note').textContent(), /12\.5 in export/);
      await p.fill('#line-width', '3/10');
      await p.press('#line-width', 'Enter');
      assert.equal(await p.inputValue('#line-width'), '0.3');
      await p.fill('#line-width', 'wide');
      await p.press('#line-width', 'Enter');
      assert.equal(await p.getAttribute('#line-width', 'aria-invalid'), 'true');
      await p.press('#line-width', 'Escape');
      assert.equal(await p.inputValue('#line-width'), '0.3');
      await p.fill('#line-width', '1/8');
      await p.press('#line-width', 'Enter');
      assert.equal(await p.inputValue('#line-width'), '1/8');
    });
    await check('A arms arcs; Tab cycles centres; clicking places a true arc', async () => {
      await p.selectOption('#examples', 'plus'); // start from a known document
      await p.keyboard.press('Control+z');
      await p.locator('button', { hasText: 'Clear mark' }).click();
      await p.keyboard.press('p');
      await click(1, 6);
      await p.keyboard.press('a');
      const [sx, sy] = await at(5, 6); await p.mouse.move(sx, sy);
      await p.waitForFunction(() => /Arc: centre 1 of \d+/.test(document.querySelector('.hint').textContent));
      await p.keyboard.press('Tab');
      await p.waitForFunction(() => /Arc: centre 2 of/.test(document.querySelector('.hint').textContent));
      await p.keyboard.press('Shift+Tab');
      await p.mouse.click(sx, sy);
      await p.keyboard.press('Enter');
      assert.match(await markD(), /A/, 'the mark contains an arc');
    });
    await check('Rotate repeats a shape around the grid centre, and + adds copies', async () => {
      await p.keyboard.press('p');
      for (const [x, y] of [[4, 1], [5, 1], [5, 2], [4, 2], [4, 1]]) await click(x, y);
      const before = await markD();
      await p.locator('.repeat button', { hasText: 'Rotate' }).click();
      const four = await markD();
      assert.ok(four.length > before.length + 40, 'copies drawn');
      await p.locator('.repeat button[aria-label="More copies"]').click();
      assert.equal(await p.locator('.repeat .value').first().textContent(), '×5');
      assert.ok((await markD()).length > four.length, 'a fifth copy');
    });
    await check('Set centre, then a click, moves the rotate centre there', async () => {
      await p.locator('.repeat button', { hasText: 'Set centre' }).click();
      assert.match(await p.locator('.hint').textContent(), /repeat centre/);
      const before = await markD();
      await click(2, 2);
      assert.notEqual(await markD(), before);
      assert.equal(await p.locator('.repeat button', { hasText: 'Click a point' }).count(), 0);
    });
    await check('Save downloads the mark as a project file, and Open brings it back', async () => {
      const markBefore = await markD();
      const [d] = await Promise.all([p.waitForEvent('download'), p.locator('.rail-head button', { hasText: 'Save' }).click()]);
      assert.match(d.suggestedFilename(), /\.logo\.json$/);
      const file = await d.path();
      await p.locator('button', { hasText: 'Clear mark' }).click();
      assert.equal(await markD(), '');
      await p.setInputFiles('input[type=file]', file);
      await p.waitForTimeout(200);
      assert.equal(await markD(), markBefore);
    });
    await check('Ctrl+A selects points, not page text', async () => {
      await p.evaluate(() => window.getSelection().removeAllRanges()); // only Ctrl+A's own effect counts
      await p.keyboard.press('Control+a');
      assert.equal(await p.evaluate(() => String(window.getSelection())), '');
      assert.match(await p.locator('.value').filter({ hasText: 'points' }).first().textContent(), /\d+ points/);
    });
    // ---- grids ----
    await check('New… offers every grid type, and creates the chosen one', async () => {
      await p.locator('.rail-head button', { hasText: 'New…' }).click();
      await p.waitForSelector('.dialog.new-mark');
      assert.equal(await p.locator('.grid-types button').count(), 5);
      await p.locator('.grid-types button[data-preset="polar"]').click();
      await p.locator('.dialog.new-mark button', { hasText: 'Create' }).click();
      assert.equal(await p.locator('.dialog').count(), 0);
      assert.match(await p.locator('#grid-label + .value').textContent(), /^Polar · 6 rings × 24 rays/);
      assert.ok(await p.evaluate(() => document.querySelectorAll('svg.canvas circle[fill="none"]').length >= 6), 'rings drawn');
    });
    await check('on a polar grid, points snap to rings and rays and a closed shape fills', async () => {
      // Centre is (6, 6); ring 3 at 0°, 90°, 180°, 270°.
      for (const [x, y] of [[9, 6], [6, 9], [3, 6], [6, 3], [9, 6]]) await click(x, y);
      const d = await markD();
      assert.match(d, /^M9 6/);
      assert.ok(d.length > 10);
    });
    await check('an isometric 2:3 grid snaps to its 2:3 slopes', async () => {
      await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z');
      await p.locator('.rail-head button', { hasText: 'New…' }).click();
      await p.locator('.grid-types button[data-preset="isometric"]').click();
      await p.locator('.dialog.new-mark .seg button', { hasText: '2:3' }).click();
      await p.locator('.dialog.new-mark button', { hasText: 'Create' }).click();
      assert.match(await p.locator('#grid-label + .value').textContent(), /^Isometric 2:3/);
      await p.keyboard.press('p');
      for (const [x, y] of [[1, 2], [2, 2 + 2 / 3], [3, 2], [2, 2 - 2 / 3], [1, 2]]) await click(x, y);
      const d = await markD();
      assert.match(d, /2\.66667/); assert.match(d, /1\.33333/); assert.match(d, /Z$/);
    });
    await check('back to a square grid for the remaining checks', async () => {
      await p.locator('.rail-head button', { hasText: 'New…' }).click();
      await p.locator('.grid-types button[data-preset="square"]').click();
      await p.locator('.dialog.new-mark button', { hasText: 'Create' }).click();
      assert.match(await p.locator('#grid-label + .value').textContent(), /^Square · 6 × 6/);
    });

    // ---- export ----
    const openExample = async (id) => { await p.selectOption('#examples', id); await p.waitForTimeout(100); };
    const dl = async () => { const [d] = await Promise.all([p.waitForEvent('download'), p.locator('.dialog .btn.primary').click()]); return { name: d.suggestedFilename(), data: fs.readFileSync(await d.path()) }; };
    let svgFile = '';
    await check('⌘E opens Export; the preview renders; Esc closes and canvas keys work again', async () => {
      await openExample('plus');
      await p.keyboard.press('Control+e');
      await p.waitForSelector('.dialog.export .export-preview img', { timeout: 10000 });
      assert.ok(await p.evaluate(() => document.querySelector('.export-preview img').naturalWidth > 0));
      await p.keyboard.press('Escape');
      assert.equal(await p.locator('.dialog').count(), 0);
      await p.keyboard.press('p');
      assert.equal(await p.locator('.seg button[aria-pressed="true"]').first().textContent(), 'Place P');
    });
    await check('Download SVG: one clean path per piece (no transforms, only M L H V A Z)', async () => {
      await p.keyboard.press('Control+e');
      await p.waitForSelector('.export-preview img');
      const f = await dl();
      svgFile = f.data.toString('utf8');
      assert.match(f.name, /\.svg$/);
      assert.match(svgFile, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+" viewBox="0 0 \d+ \d+"><path d="[MLHVAZmlhvaz0-9 .\-]+"\/><\/svg>$/);
      assert.doesNotMatch(svgFile, /transform|style=|class=/);
    });
    await check('Copy SVG puts exactly the downloaded file on the clipboard', async () => {
      await p.locator('.dialog button', { hasText: 'Copy SVG' }).click();
      await p.waitForTimeout(100);
      assert.equal(await p.evaluate(() => navigator.clipboard.readText()), svgFile);
    });
    await check('PNG at 1024: exact size, transparent background, same pixels as the SVG (≤ 0.1% of ink)', async () => {
      await p.locator('.dialog .seg button', { hasText: 'PNG' }).click();
      await p.locator('.dialog .seg button', { hasText: '1024' }).click();
      const f = await dl();
      assert.equal(f.name, 'plus-1024.png');
      assert.equal(f.data.readUInt32BE(16), 1024); // IHDR width
      assert.equal(f.data.readUInt32BE(20), 1024); // IHDR height
      const diff = await p.evaluate(async ([png, svg]) => {
        const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
        const px = async (img) => { const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1024, 1024); return g.getImageData(0, 0, 1024, 1024).data; };
        const a = await px(await load('data:image/png;base64,' + png));
        const sized = svg.replace('width="400" height="400"', 'width="1024" height="1024"');
        const b = await px(await load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized)));
        let ink = 0, bad = 0;
        for (let i = 3; i < a.length; i += 4) { if (a[i] > 127 || b[i] > 127) ink++; if (Math.abs(a[i] - b[i]) > 64) bad++; }
        return { ink, bad, corner: a[3] };
      }, [f.data.toString('base64'), svgFile]);
      assert.equal(diff.corner, 0, 'transparent corner');
      assert.ok(diff.ink > 1000 && diff.bad / diff.ink <= 0.001, JSON.stringify(diff));
    });
    await check('the dark construction overlay exports one construction group behind the mark', async () => {
      await p.locator('.dialog .seg button', { hasText: 'SVG' }).click();
      await p.locator('.dialog .seg button', { hasText: 'dark' }).click();
      const f = await dl();
      const s = f.data.toString('utf8');
      assert.match(s, /^<svg[^>]*><g id="construction">/);
      assert.equal((s.match(/<g /g) || []).length, 1);
      await p.locator('.dialog .seg button', { hasText: 'off' }).click();
      await p.keyboard.press('Escape');
    });
    await check('hint line is on screen and there are no console errors', async () => {
      const bottom = await p.evaluate(() => document.querySelector('.hint').getBoundingClientRect().bottom);
      assert.ok(bottom <= 860);
      assert.deepEqual(errors, []);
    });
    void pointCount;
    await p.mouse.move(5, 5);
    await p.screenshot({ path: process.env.SHOT ?? '/tmp/e2e-last.png' });
  } finally {
    console.log(results.join('\n'));
    await b.close();
    server.kill();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
