import { defineConfig } from 'vite';

// Preact JSX through Vite's built-in transform (no extra plugin dependency).
// Fixed output names let the build be published as a page with predictable file paths.
export default defineConfig({
  // Relative asset paths: the same build works on GitHub Pages (/logo-tool/) and as a standalone page.
  base: './',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'app-[name].js',
        // The stylesheet is app.css; fonts keep their names under fonts/.
        assetFileNames: (a) => (a.names?.some((n) => n.endsWith('.css')) ? 'app.[ext]' : 'fonts/[name].[ext]'),
      },
    },
  },
});
