/** Copy SVG markup as text (ARCHITECTURE.md §7 step 6). False when the browser refuses. */
export async function copySvg(svg: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(svg);
    return true;
  } catch {
    return false;
  }
}
