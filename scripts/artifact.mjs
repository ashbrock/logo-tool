// Packages the production build as a shareable page: artifacts/app/index.html plus every built
// script and stylesheet (app.js, app.css, and lazily loaded chunks such as SVGO's).
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
const dist = new URL('../dist/', import.meta.url);
const out = new URL('../artifacts/app/', import.meta.url);
mkdirSync(out, { recursive: true });
const files = readdirSync(dist).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
for (const f of files) copyFileSync(new URL(f, dist), new URL(f, out));
writeFileSync(new URL('index.html', out), `<title>Construction Tool</title>
<link rel="stylesheet" href="app.css">
<div id="app"></div>
<script type="module" src="app.js"></script>
`);
console.log(`wrote artifacts/app: ${files.join(', ')}`);
