/**
 * PNG export (ARCHITECTURE.md §7 step 5): the exported SVG is drawn to a canvas at the chosen size on
 * its long side, through an Image loaded from a Blob URL, then encoded as PNG. Browser only.
 */
import { PAPER_BG } from './palette';

/** Pixel size for a long side of `long` px, keeping the viewBox's aspect ratio (VERIFICATION.md E10). */
export function pngSize(width: number, height: number, long: number): { w: number; h: number } {
  if (width >= height) return { w: long, h: Math.max(1, Math.round((long * height) / width)) };
  return { w: Math.max(1, Math.round((long * width) / height)), h: long };
}

/** Render to PNG. `background: 'white'` fills `--paper-bg` first; the overlay draws its own background. */
export async function renderPng(svg: string, width: number, height: number, long: number, background: 'transparent' | 'white'): Promise<Blob> {
  const { w, h } = pngSize(width, height, long);
  // Give the SVG the target pixel size, so it is rasterised at full resolution rather than scaled up.
  const sized = svg.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 width="${w}" height="${h}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw to a canvas.');
    if (background === 'white') { ctx.fillStyle = PAPER_BG; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File-name-safe version of the mark name. */
export function fileStem(name: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'mark';
}
