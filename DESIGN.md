# DESIGN — Drafting film

The visual system. Use these tokens. Never invent colours, fonts or spacing values (`CLAUDE.md`). The behaviour these styles serve is in `SPEC.md`.

## 1. Direction

**Drafting film, plus a cell ruler.** A draughtsman's film under a lamp. Construction is drawn in **non-photo blue**, the pencil colour drafters use because it doesn't show in prints. The mark sits on top in **bone**. The tool should feel quiet and exact, so the user's mark is always the loudest thing on screen.

Principles:
1. **Construction is blue, the mark is bone, and selection is bright paper white with a dark halo.** You can tell these three layers apart at a glance.
2. **Show geometry instead of numbers.** Radii are circles, arcs show their centres, and stroke widths show as guides. Numbers appear in the rail, second.
3. **Monospace first.** IBM Plex Mono carries everything you read as data or operate. The serif italic is reserved for the mark name and section headings.
4. **The near-neutral ground is deliberate.** A low-chroma dark ground shifts the perceived weight of a mark the least.

How it differs from the inspiration tool: warm bone fill (not pale blue-white), blue used only for construction, + crosses instead of dots for lattice points, open squares for points, a cell ruler, serif italic headings, and different mode names (Place / Adjust / Tile).

## 2. Colour tokens

Values are given in hex and OKLCH (computed from the hex). Contrast ratios are WCAG 2.x, measured on the surface named.

### 2.1 Interface

| Token | Hex | OKLCH | Use | Contrast |
|---|---|---|---|---|
| `--color-bg` | `#101416` | oklch(18.8% 0.007 229) | Page behind canvas and rail | — |
| `--color-surface` | `#171c1f` | oklch(22.3% 0.010 234) | Rail, dialogs | — |
| `--color-surface-raised` | `#1e2529` | oklch(25.9% 0.013 233) | Hover fill, pressed fill, menus | — |
| `--color-border` | `#2b3337` | oklch(31.5% 0.013 229) | Dividers, non-interactive rules | decorative |
| `--color-border-control` | `#67777d` | oklch(55.8% 0.021 222) | Boundaries of interactive controls | 3.69:1 on surface (≥3:1, WCAG 1.4.11) |
| `--color-text` | `#e6e9e4` | oklch(93.0% 0.007 132) | Primary text | 14.02:1 on surface |
| `--color-text-muted` | `#93a0a5` | oklch(69.7% 0.017 223) | Labels, hint line, ruler numbers | 6.39:1 on surface, 7.11:1 on canvas |
| `--color-text-disabled` | `#5d686d` | oklch(51.0% 0.016 227) | Disabled labels | 3.00:1 (disabled controls are exempt; kept legible) |
| `--color-accent` | `#7fc4e8` | oklch(78.8% 0.086 232) | Non-photo blue: active mode, focus ring, primary action outline, links | 8.97:1 on surface |
| `--color-on-accent` | `#0c1012` | oklch(17.0% 0.008 229) | Text on an accent fill | 9.98:1 on accent |
| `--color-danger` | `#f2958a` | oklch(76.3% 0.114 27) | Errors, invalid shapes | 7.72:1 on surface |
| `--color-warning` | `#e9b85c` | oklch(80.9% 0.123 81) | Clamped radius, autosave off | 9.39:1 on surface |

### 2.2 Canvas

| Token | Hex | OKLCH | Use | Contrast on canvas |
|---|---|---|---|---|
| `--canvas-bg` | `#0c1012` | oklch(17.0% 0.008 229) | Canvas ground | — |
| `--canvas-grid-minor` | `#162329` | oklch(24.7% 0.021 228) | Sub-step lines | decorative |
| `--canvas-grid-major` | `#22404c` | oklch(35.3% 0.041 226) | Whole-cell lines, polar rings and rays | 1.73:1 (decorative; lattice points carry the information) |
| `--canvas-lattice` | `#4f7d94` | oklch(56.6% 0.062 231) | Lattice point crosses | 4.27:1 |
| `--canvas-ruler` | `#93a0a5` | = text-muted | Ruler ticks and cell numbers | 7.11:1 |
| `--canvas-mark` | `#e8e3d3` | oklch(91.5% 0.022 93) | The mark (bone) | 15.1:1 |
| `--canvas-point` | `#e6e9e4` | oklch(93.0% 0.007 132) | Placed points (open squares) | 15.60:1 |
| `--canvas-active` | `#7fc4e8` | = accent | Snap preview, lattice cursor, hovered point, rubber band | 9.98:1 |
| `--canvas-radius` | `#6aa8c6` | oklch(70.1% 0.078 230) | Radius and fillet circles, arc centres, stroke guides | 7.31:1 |
| `--canvas-selection` | `#f7f5ee` | oklch(97.0% 0.010 94) | Selection rings, selected shape outline, box-select | 17.52:1 |
| `--canvas-halo` | `#0c1012` | = canvas-bg | 2 px halo under every point, ring and label | — |
| `--canvas-axis` | `#3d6a7e` | oklch(50.0% 0.059 228) | Symmetry axes and centre | 3.24:1 |
| `--canvas-cut` | `#7fc4e8` | = accent | Dashed outline of cut and intersect shapes | 9.98:1 |
| `--canvas-invalid` | `#f2958a` | = danger | Invalid shape outline, warning ring | 7.9:1 |
| `--canvas-clamped` | `#e9b85c` | = warning | Clamped fillet circle | 9.6:1 |
| `--canvas-ghost` | `#93a0a5` | = text-muted | Original position while dragging | 7.11:1 |

**Halo rule.** Selection on the bone mark is only 1.18:1, and active blue on bone is 1.49:1. Points sit on the mark's edge, so **every** point marker, ring and canvas label is drawn over a 2 px `--canvas-halo` stroke. The halo gives at least 15:1 against the bone, so markers stay visible on both the mark and the canvas.

### 2.3 Paper preview and export

| Token | Hex | Use |
|---|---|---|
| `--paper-bg` | `#ffffff` | Paper preview ground, light overlay ground, PNG "white" background |
| `--ink-default` | `#000000` | Default mark colour in export and paper preview |
| `--paper-grid-minor` | `#e6eff4` | Light overlay sub-step lines |
| `--paper-grid-major` | `#c4dbe7` | Light overlay cell lines |
| `--paper-lattice` | `#7fa9bf` | Light overlay lattice crosses (2.52:1 on white; decorative in export) |
| `--paper-radius` | `#3f87ad` | Light overlay radius circles (3.98:1 on white) |

Dark overlay export uses `--canvas-*` tokens, with the mark in `--canvas-mark` (bone).

## 3. Typography

Self-hosted (OFL) and subset to Latin, with `font-display: swap`. Fallback stacks are always declared.

| Token | Family | Weights | Fallback |
|---|---|---|---|
| `--font-mono` | IBM Plex Mono | 400, 500, 600 | `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace` |
| `--font-serif` | IBM Plex Serif Italic | 400 | `Georgia, "Times New Roman", serif` |

**Pairing rule.** Plex Mono is used for everything you operate or read as data: controls, labels, coordinates, hint line, ruler, dialogs. Plex Serif Italic is used **only** for the mark name in the rail header and the section headings in dialogs and the shortcut sheet. It never appears in controls.

### 3.1 Scale

The ratio is about 1.17, with the base anchored at 13 px for dense desktop controls.

| Token | Size / line height | Family, weight | Use |
|---|---|---|---|
| `--type-micro` | 11 / 16 px | mono 400, tracking +0.02em | Ruler numbers, canvas labels, hint line |
| `--type-label` | 11 / 16 px | mono 500, uppercase, tracking +0.08em | Rail section labels |
| `--type-body` | 13 / 20 px | mono 400 | Control text, values, dialog body |
| `--type-strong` | 13 / 20 px | mono 600 | Active segmented option, primary button |
| `--type-heading` | 16 / 24 px | serif italic 400 | Dialog and sheet section headings |
| `--type-title` | 20 / 28 px | serif italic 400 | Mark name in rail header, dialog titles |

Numbers use `font-variant-numeric: tabular-nums` everywhere. Coordinates are written `(3, 1)` or `(1.5, 4)`, with two decimals only when sub-steps aren't halves (e.g. `0.30`, `(3.375, 2)` is shown as `(3⅜, 2)` when subdivision is 8). Radius and width are always shown in cells with two decimals.

## 4. Spacing, sizing and shape

**8 px base.** Half-steps are allowed only for inner padding.

| Token | Value | Use |
|---|---|---|
| `--space-0-5` | 4 px | Icon-to-label gap, segmented inner padding |
| `--space-1` | 8 px | Gap between controls in a group |
| `--space-2` | 16 px | Rail inner padding, gap between groups |
| `--space-3` | 24 px | Gap between rail sections |
| `--space-4` | 32 px | Dialog padding |
| `--space-6` | 48 px | Empty-state offsets |
| `--space-8` | 64 px | Dialog top margin |

| Token | Value | Use |
|---|---|---|
| `--rail-width` | 240 px | Fixed rail width |
| `--hint-height` | 32 px | Hint line height |
| `--ruler-size` | 24 px | Ruler band thickness |
| `--control-height` | 32 px | Buttons, inputs, segmented controls, selects |
| `--control-min-target` | 32 × 32 px | Minimum hit area for any control (WCAG 2.5.8 requires 24; we use 32) |
| `--icon-size` | 16 px | Icons inside 32 px targets |
| `--canvas-min` | 640 × 480 px | Below this the canvas shows a "widen your window" notice |
| `--radius-control` | 2 px | Control corners (drafting: almost square) |
| `--border-width` | 1 px | All borders |
| `--focus-width` | 2 px | Focus ring, with 2 px offset |

**Canvas strokes** are non-scaling: they keep a constant screen width at any zoom.

| Element | Width | Style |
|---|---|---|
| Grid minor / major | 1 px | solid |
| Lattice cross | 1 px, arm length 5 px (whole), 3 px at 50% opacity (sub-step) | + |
| Placed point | 7 × 7 px open square, 1.5 px stroke, fill `--canvas-bg` | over halo |
| Selected point | 7 × 7 px filled `--canvas-selection` square + 12 px radius ring 1.5 px | over halo |
| Snap preview | crosshair, arms 9 px, 1.5 px + 6 px dashed ring (2 2) | |
| Radius circle (outer) | 1.25 px solid | `--canvas-radius` |
| Radius circle (inward, cove) | 1.25 px dashed 4 3 | `--canvas-radius` |
| Radius circle (filled corner) | 1.25 px solid | `--canvas-radius` |
| Fillet circle (round) | 1.25 px solid + 3 px centre dot | `--canvas-radius` |
| Arc centre | 7 px cross | `--canvas-radius` |
| Cut / intersect outline | 1.25 px dashed 6 4 | `--canvas-cut` |
| Selected shape outline | 1.5 px solid over a 4 px `--canvas-halo` | `--canvas-selection` |
| Radius handle | 5 px dot in `--canvas-active` over a 6 px halo, 26 px up-right of the point, joined by a 1 px dashed `--canvas-radius` line; live "r 0.50" label in `--type-micro`; `--canvas-selection` while dragging | |
| Line preview while placing | the next segment at the line width, `--canvas-mark` at 45% opacity, plus a 1.25 px `--canvas-active` centre line | |
| Box-select | 1 px dashed 3 3, fill `--canvas-selection` at 6% | |
| Repeat centre or axis | 1 px dash-dot 8 3 1 3 | `--canvas-axis` |

## 5. Layout

- The rail is on the left at `--rail-width`, with the full-height surface separated by a 1 px `--color-border`. Sections are separated by `--space-3` and a `--color-border` rule. A section label sits above its controls.
- The canvas area has the ruler band along the top and left, then the canvas, then the hint line pinned at the bottom.
- The ruler numbers whole cells with ticks at sub-steps; polar grids show ring numbers on the horizontal ruler and the ray angle on hover. It uses the same 24 px band as the cell ruler. (Taken from the "cutting mat" direction.)
- Dialogs are centred, at most 560 px wide (export: 880 px with a preview), with `--space-4` padding, a 1 px `--color-border-control` border and no shadow. A `--color-bg` scrim at 72% opacity covers the rest.
- No cards, no drop shadows, no gradients.

## 6. Component states

All interactive elements have every state below. Colours are given as tokens.

| State | Button / segmented option | Input / select | Canvas point |
|---|---|---|---|
| **Default** | text `--color-text`, border `--color-border-control`, fill none | border `--color-border-control`, fill `--color-bg` | open square `--canvas-point` |
| **Hover** | fill `--color-surface-raised` | border `--color-text-muted` | square fills `--canvas-active`, cursor pointer |
| **Focus (keyboard)** | 2 px `--color-accent` outline, 2 px offset (`:focus-visible` only) | same | 2 px `--color-accent` ring at 14 px around the point |
| **Active / pressed** | fill `--color-surface-raised`, inset 1 px `--color-accent` bottom | — | — |
| **Selected / on** | segmented: text `--color-accent`, 2 px `--color-accent` underline; primary: border `--color-accent` | — | filled `--canvas-selection` + ring |
| **Disabled** | text `--color-text-disabled`, border `--color-border`, no hover, `cursor: not-allowed`, still focusable when it has a reason tooltip | same | — |
| **Loading** | label replaced by "Rendering 2048 px…", button disabled, no spinner | — | — |
| **Error** | — | border `--color-danger`, message below in `--type-micro` `--color-danger` | invalid ring: 1.5 px `--canvas-invalid` circle at 14 px |

Screen-level states:

| State | Treatment |
|---|---|
| **Empty** (no points) | Grid shown. A centred message in `--type-body` `--color-text-muted`: "Click a grid point to start a shape", plus an "Open an example" text button below. It disappears on the first point. |
| **Loading** (opening a project file, fonts) | The rail and canvas stay interactive. A file open shows "Opening…" in the hint line. Nothing blocks the UI for more than 100 ms. |
| **Error** (invalid shape, refused grid change, bad file) | The message goes in the hint line (`--color-danger` dot + text) and inline next to the control that caused it. Export lists blockers. Messages say what's wrong and how to fix it, without apologising. |
| **Autosave off** | One-time hint line warning in `--color-warning`, and a persistent small "Not autosaving" label in the rail header. |

### 6.1 Tool states

| Tool state | What's shown |
|---|---|
| **Point placing** | Crosshair cursor. Snap preview at the nearest lattice point. Rubber-band segment (1.25 px `--canvas-active`) from the last point. The shape in progress is filled at 40% `--canvas-mark` once it has 3 points. The first point gets a 12 px `--canvas-active` ring when hovering it would close the shape. |
| **Arc candidate** | Candidate circle (1 px dashed `--canvas-active`), centre cross, and the arc previewed in `--canvas-active`. The candidate index shows in the hint line. |
| **Dragging** | `grabbing` cursor. The point follows the snap preview. A ghost open square in `--canvas-ghost` at the original position. Affected arcs and fillets update live. A merge target gets a `--canvas-selection` ring. |
| **Snapping** | The snap preview jumps between lattice points with no transition, in any motion setting. A coordinate label appears after a 400 ms rest. |
| **Invalid connection** | The rubber band or segment turns dashed `--canvas-invalid` (6 4), the cursor shows `not-allowed`, and the hint line gives the reason (e.g. "There's already a point here." or "No lattice centre fits this arc."). |
| **Clamped radius** | The fillet circle is drawn in `--canvas-clamped`, with a second dashed circle at the requested radius in `--canvas-clamped` at 50%. The rail shows "0.42 of 0.80". |
| **Lattice cursor (keyboard)** | A 14 px square bracket in `--canvas-active` around the cursor point, always over the halo. |
| **Paper preview** | The canvas ground becomes `--paper-bg`, the mark becomes the export colour, construction is hidden, points are hidden, and a "Paper preview · \\ to exit" label shows in the hint line. |

## 7. Motion

- Durations: `--motion-fast` 120 ms (hover and press feedback), `--motion-base` 200 ms (dialog fade, section reveal). Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- **The canvas never animates geometry.** Snapping, dragging and geometry updates are instant.
- With `prefers-reduced-motion: reduce`, all durations are 0 and dialogs appear without fading. Nothing on the canvas changes, because nothing there moves anyway.

## 8. Construction overlay export style

The overlay sits **behind** the mark in exported SVG and PNG. It's included only when the user chooses it (`SPEC.md` §4.3).

| Element | Included | Dark style | Light style |
|---|---|---|---|
| Background | yes | `--canvas-bg` | `--paper-bg` |
| Grid lines (minor, major) | yes | `--canvas-grid-minor`, `--canvas-grid-major` | `--paper-grid-minor`, `--paper-grid-major` |
| Lattice crosses | yes | `--canvas-lattice` | `--paper-lattice` |
| Radius, fillet and arc-centre circles | yes, for every point with r > 0 and every arc | `--canvas-radius` | `--paper-radius` |
| Cut / intersect outlines | yes, dashed | `--canvas-cut` | `--paper-radius` |
| Repeat centres and axes | yes, for shapes with a repeat | `--canvas-axis` | `--paper-lattice` |
| Edge guides | optional (off by default): every straight edge of the mark extended across the frame, 1 px | `--canvas-grid-major` | `--paper-grid-major` |
| Ruler | no | — | — |
| Point markers, numbers, selection | no | — | — |
| Mark | yes, on top | `--canvas-mark` | export colour (default `--ink-default`) |

- Overlay strokes are exported at fixed widths in export units, scaled so they match the canvas at 1024 px on the long side: 1 px grid, 1.25 px circles.
- The overlay extends to the export bounds (mark bounds plus padding), clipped by the `viewBox`. It never enlarges the bounds.
- In SVG, the overlay is one `<g id="construction">` before the mark paths. This is the only case where a `<g>` is allowed (`VERIFICATION.md` §3).
