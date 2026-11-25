// Starts Vite on the spike page, loads it in Chromium, and asserts the results.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
// Playwright is pre-installed globally in this environment; run with NODE_PATH="$(npm root -g)".
const { chromium } = createRequire(import.meta.url)('playwright');
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://localhost:5199/');
  await page.waitForFunction(() => window.spike, null, { timeout: 15000 });
  const r = await page.evaluate(() => window.spike);
  console.log(JSON.stringify(r));
  const ok =
    errors.length === 0 &&
    r.canvasElements === 0 &&
    Math.abs(r.cutArea - (16 - Math.PI)) / (16 - Math.PI) < 3e-4 &&
    r.cutClass === 'CompoundPath' &&
    Math.abs(r.mergedArea - 2) < 1e-9 && r.mergedSegments === 4 &&
    Math.abs(r.clipArea - 2.5) < 1e-6;
  console.log(ok ? 'BROWSER SPIKE PASS' : 'BROWSER SPIKE FAIL ' + JSON.stringify(errors));
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
  await server.close();
}
