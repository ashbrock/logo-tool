/**
 * Export dialog (SPEC.md §4.3, §6.10; DESIGN.md §5): format, colour, padding, construction overlay,
 * PNG size and background, a live preview that is the exact output, Download and Copy SVG. Settings
 * live in the document (`doc.export`), so the dialog reopens with the last-used ones.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import type { ExportSettings, LogoDocument } from '../model/types';
import { buildSvg, exportProblems, finishSvg, type Evaluation } from '../export/svg';
import { download, fileStem, pngSize, renderPng } from '../export/png';
import { loadSvgo, svgoNow } from '../export/svgo-loader';
import { copySvg } from './clipboard';
import type { Action } from './state';

type Format = 'svg' | 'png';
const SIZES = [512, 1024, 2048, 4096] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

interface Props {
  doc: LogoDocument;
  evaluated: Evaluation;
  dispatch: Dispatch<Action>;
  onClose: () => void;
  onShow: (shapeId: string) => void;
}

export function ExportDialog({ doc, evaluated, dispatch, onClose, onShow }: Props) {
  const s = doc.export;
  const [format, setFormat] = useState<Format>('svg');
  const [colour, setColour] = useState(s.colour);
  const [optimize, setOptimize] = useState(() => svgoNow());
  const [busy, setBusy] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    if (!optimize) void loadSvgo().then((o) => setOptimize(() => o));
    dialog.current?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus();
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  const set = (patch: Partial<ExportSettings>) => dispatch({ type: 'command', command: { type: 'setExport', patch }, label: 'Export settings', key: 'export-settings', at: performance.now() });
  const problems = exportProblems(doc, evaluated);
  const overlayOn = s.overlay !== 'off';
  const pngBg: 'transparent' | 'white' = s.pngBackground === 'white' ? 'white' : 'transparent';

  const out = useMemo(() => {
    if (problems.length || !optimize) return null;
    const raw = buildSvg(doc, evaluated, s);
    return { ...raw, svg: finishSvg(raw.svg, optimize) };
  }, [doc, evaluated, optimize, problems.length]);

  const stem = fileStem(doc.name);
  const px = out ? pngSize(out.width, out.height, s.pngSize) : null;
  const paths = out ? (out.svg.match(/<path /g) ?? []).length - (overlayOn ? (out.svg.split('</g>')[0]!.match(/<path /g) ?? []).length : 0) : 0;
  const kb = out ? (new Blob([out.svg]).size / 1024).toFixed(1) : '';

  const doDownload = async () => {
    if (!out) return;
    if (format === 'svg') {
      download(new Blob([out.svg], { type: 'image/svg+xml' }), `${stem}.svg`);
      dispatch({ type: 'status', text: `Saved ${stem}.svg` });
      return;
    }
    setBusy(`Rendering ${s.pngSize} px…`);
    try {
      const blob = await renderPng(out.svg, out.width, out.height, s.pngSize, overlayOn ? 'transparent' : pngBg);
      download(blob, `${stem}-${s.pngSize}.png`);
      dispatch({ type: 'status', text: `Saved ${stem}-${s.pngSize}.png` });
    } catch (e) {
      dispatch({ type: 'status', text: `PNG export failed: ${(e as Error).message}`, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const doCopy = async () => {
    if (!out) return;
    const ok = await copySvg(out.svg);
    if (ok) dispatch({ type: 'status', text: 'SVG copied to the clipboard.' });
    else setFallback(out.svg);
  };

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab' || !dialog.current) return;
    // Keep focus inside the dialog.
    const els = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, a[href]')];
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };

  const colourOk = HEX.test(colour);
  // Preview on paper unless the mark is light, so it is always visible.
  const lightMark = (() => { const c = s.colour; const n = parseInt(c.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 160; })();
  const previewBg = overlayOn ? '' : format === 'png' && pngBg === 'white' ? 'paper' : lightMark ? 'dark' : 'paper';

  return (
    <div class="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="dialog export" role="dialog" aria-modal="true" aria-labelledby="export-title" ref={dialog} onKeyDown={onKey}>
        <div class="export-preview" data-bg={previewBg}>
          {out ? <img alt={`Preview of ${doc.name}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.svg)}`} /> : null}
          {!out && !problems.length ? <p class="note">Preparing the optimiser…</p> : null}
          {problems.length ? (
            <div class="problems" role="alert">
              <p class="value">Export is blocked</p>
              {problems.map((p) => (
                <p class="note bad">{p.text} {p.shapeId ? <button type="button" class="link" onClick={() => onShow(p.shapeId!)}>Show</button> : null}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div class="export-controls">
          <h2 class="dialog-title" id="export-title">Export</h2>

          <div class="group">
            <span class="label" id="fmt-label">Format</span>
            <div class="seg" role="group" aria-labelledby="fmt-label">
              {(['svg', 'png'] as const).map((f) => <button type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>)}
            </div>
          </div>

          <div class="group">
            <label class="label" for="export-colour">Mark colour</label>
            <div class="row">
              <span class="swatch" style={{ background: colourOk ? colour : 'transparent' }} aria-hidden="true" />
              <input id="export-colour" class={colourOk ? '' : 'invalid'} value={colour} spellcheck={false} disabled={s.overlay === 'dark'}
                aria-invalid={!colourOk} aria-describedby="colour-msg"
                onInput={(e) => { const v = (e.target as HTMLInputElement).value.trim(); setColour(v); if (HEX.test(v)) set({ colour: v.toLowerCase() }); }} />
            </div>
            <p class="note" id="colour-msg">{s.overlay === 'dark' ? 'The dark overlay draws the mark in its own colour.' : colourOk ? 'One hex colour, e.g. #000000.' : <span class="bad">Use six hex digits, e.g. #1a1a1a.</span>}</p>
          </div>

          <div class="group">
            <span class="label">Padding</span>
            <div class="row radius">
              <button type="button" class="btn" aria-label="Less padding" disabled={s.paddingCells <= 0} onClick={() => set({ paddingCells: Math.max(0, s.paddingCells - 0.5) })}>−</button>
              <span class="value">{s.paddingCells} cell{s.paddingCells === 1 ? '' : 's'}</span>
              <button type="button" class="btn" aria-label="More padding" disabled={s.paddingCells >= 8} onClick={() => set({ paddingCells: s.paddingCells + 0.5 })}>+</button>
            </div>
          </div>

          <div class="group">
            <span class="label" id="ov-label">Construction</span>
            <div class="seg" role="group" aria-labelledby="ov-label">
              {(['off', 'dark', 'light'] as const).map((o) => <button type="button" aria-pressed={s.overlay === o} onClick={() => set({ overlay: o })}>{o}</button>)}
            </div>
            <button type="button" class="btn" aria-pressed={s.edgeGuides} disabled={!overlayOn} title={overlayOn ? 'Extend every straight edge of the mark across the frame' : 'Turn the construction overlay on first'} onClick={() => set({ edgeGuides: !s.edgeGuides })}>Edge guides</button>
          </div>

          {format === 'png' ? (
            <div class="group">
              <span class="label" id="size-label">Size (long side)</span>
              <div class="seg" role="group" aria-labelledby="size-label">
                {SIZES.map((n) => <button type="button" aria-pressed={s.pngSize === n} onClick={() => set({ pngSize: n })}>{n}</button>)}
              </div>
              <span class="label" id="bg-label">Background</span>
              <div class="seg" role="group" aria-labelledby="bg-label">
                {(['transparent', 'white'] as const).map((b) => <button type="button" aria-pressed={!overlayOn && pngBg === b} disabled={overlayOn} onClick={() => set({ pngBackground: b })}>{b}</button>)}
              </div>
              {overlayOn ? <p class="note">The construction overlay brings its own background.</p> : null}
            </div>
          ) : null}

          <p class="note export-meta" aria-live="polite">
            {out ? (format === 'svg' ? `${fmtN(out.width)} × ${fmtN(out.height)} · ${paths} path${paths === 1 ? '' : 's'} · ${kb} KB` : `${px!.w} × ${px!.h} px`) : ' '}
          </p>

          <div class="row actions">
            <button type="button" class="btn primary" disabled={!out || !!busy} onClick={doDownload}>{busy ?? 'Download'}</button>
            <button type="button" class="btn" disabled={!out} onClick={doCopy}>Copy SVG</button>
            <button type="button" class="btn" onClick={onClose}>Close <kbd>Esc</kbd></button>
          </div>

          {fallback ? (
            <div class="group">
              <label class="field" for="svg-text">The browser blocked the clipboard. Copy the SVG from here.</label>
              <textarea id="svg-text" class="svg-text" readOnly value={fallback} ref={(el) => { if (el) { el.focus(); el.select(); } }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));
