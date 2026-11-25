// Packages the production build as a shareable page: artifacts/app/index.html + app.js + app.css.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
const out = new URL('../artifacts/app/', import.meta.url);
mkdirSync(out, { recursive: true });
copyFileSync(new URL('../dist/app.js', import.meta.url), new URL('app.js', out));
copyFileSync(new URL('../dist/app.css', import.meta.url), new URL('app.css', out));
writeFileSync(new URL('index.html', out), `<title>Construction Tool</title>
<link rel="stylesheet" href="app.css">
<div id="app"></div>
<script type="module" src="app.js"></script>
`);
console.log('wrote artifacts/app');
