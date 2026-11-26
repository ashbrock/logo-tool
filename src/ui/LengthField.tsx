/**
 * A length in cells (DESIGN.md §6): − / + step by 1/24 cell (Shift: one grid step), and the value is a
 * field you can type in (1/8, 0.3, 1 1/2). Up / Down step it, Enter applies, Esc reverts. The note
 * under it gives the size in the exported file.
 */
import { useState } from 'preact/hooks';
import { exportUnits, formatCells, parseCells } from './cells';
import { radiusStep, stepRadius } from './steps';

interface Props {
  id: string;
  label: string;
  /** 1/240 cell, or undefined when a multi-selection has mixed values. */
  value: number | undefined;
  min?: number;
  subdivision: number;
  unitsPerCell: number;
  onChange: (value: number) => void;
}

export function LengthField({ id, label, value, min = 0, subdivision, unitsPerCell, onChange }: Props) {
  const shown = value === undefined ? '' : formatCells(value);
  // While typing, the field shows the draft; otherwise it always shows the stored value (no lag).
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const commit = (text: string) => {
    const n = parseCells(text);
    if (n === null || n < min) { setError(true); return; }
    setError(false);
    setDraft(null);
    if (n !== value) onChange(n);
  };
  const step = (dir: 1 | -1, shift: boolean) => { setDraft(null); setError(false); onChange(Math.max(min, stepRadius(value ?? 0, dir, radiusStep(subdivision, shift)))); };

  return (
    <div class="length-field">
      <label class="field" for={id}>{label[0]!.toUpperCase() + label.slice(1)}</label>
      <div class="row radius">
        <button type="button" class="btn" aria-label={`Smaller ${label}`} title="Shift: one grid step" disabled={value !== undefined && value <= min} onClick={(e) => step(-1, e.shiftKey)}>−</button>
        <input id={id} class={`length-input${error ? ' invalid' : ''}`} value={draft ?? shown} placeholder={value === undefined ? 'mixed' : ''} aria-label={`${label} in cells`}
          aria-invalid={error} aria-describedby={`${id}-note`} spellcheck={false} inputMode="decimal"
          onInput={(e) => { setDraft((e.target as HTMLInputElement).value); setError(false); }}
          onBlur={(e) => { if (draft !== null) commit((e.target as HTMLInputElement).value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit((e.target as HTMLInputElement).value); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(null); setError(false); (e.target as HTMLInputElement).blur(); }
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); step(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey); }
          }} />
        <button type="button" class="btn" aria-label={`Larger ${label}`} title="Shift: one grid step" onClick={(e) => step(1, e.shiftKey)}>+</button>
      </div>
      <p class={`note${error ? ' bad' : ''}`} id={`${id}-note`}>
        {error ? `Type a length in cells${min ? ` of at least ${formatCells(min)}` : ''}, e.g. 1/8 or 0.3.` : value === undefined ? 'Mixed values: type or step to set them all.' : `cells · ${exportUnits(value, unitsPerCell)} in export`}
      </p>
    </div>
  );
}
