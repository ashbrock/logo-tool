import { defineConfig } from 'vite';

// Preact JSX through Vite's built-in transform (no extra plugin dependency).
// Fixed output names let the build be published as a page with predictable file paths.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: { entryFileNames: 'app.js', chunkFileNames: 'app-[name].js', assetFileNames: 'app.[ext]' },
    },
  },
});
