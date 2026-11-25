// Builds the geometry gallery into artifacts/gallery/index.html (a single self-contained page).
// Uses Vite's SSR loader to run the TypeScript sources directly, so no extra dependency is needed.
import { createServer } from 'vite';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { renderGalleryHtml } = await server.ssrLoadModule('/gallery/specimens.ts');
  const tokens = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
  let commit = 'working tree';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch {}
  const html = renderGalleryHtml(tokens, { commit });
  mkdirSync(new URL('../artifacts/gallery/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../artifacts/gallery/index.html', import.meta.url), html);
  console.log('wrote artifacts/gallery/index.html', html.length, 'bytes');
} finally {
  await server.close();
}
