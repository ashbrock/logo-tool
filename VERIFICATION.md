# VERIFICATION

How we prove the tool is right. A feature isn't done until its checks here pass (`CLAUDE.md`). Every check is marked **[auto]** (runs in `npm test` / `npm run test:e2e` / CI) or **[person]** (a human does it and records the evidence).

## 0. Summary

| # | Check | Type | Gate |
|---|---|---|---|
| 1 | Reconstruction of 13 reference logos | auto (+ person signs off on diffs) | Release |
| 2 | Property-based tests P1–P8 | auto | Every push |
| 3 | Export structure, SVGO and determinism E1–E10 | auto | Every push |
| 4 | Round-trip in Figma, Illustrator, Inkscape and browsers | person | Release |
| 5 | Accessibility A1–A7 | auto + person | Release |
| 6 | Usability protocol (3–5 designers) | person | Portfolio write-up |
| 7 | Performance budget | auto | Every push |

## 1. Reconstruction tests

The reference SVGs are **visual targets, not path-data targets** (`DECISIONS.md`). A rebuild passes when it *looks* the same, is *built correctly* (§2), and is *at least as lean* as the original.

### 1.1 Procedure [auto]

1. **Rebuild with the model.** Each logo is rebuilt through model commands in `tests/rebuilds/index.ts` (the same builder the built-in examples use). `npm run rebuilds` also writes each one as a project file, `artifacts/rebuilds/<name>.logo.json`. Rebuilds never import or trace the original's path data: measurements are read off the original (corner positions, arc centres, radii) and the shape is then constructed on a lattice.
2. **Export** with `unitsPerCell` set close to the original's cell size (e.g. p-logo-1: 125 units per cell, giving `0 0 375 500`), colour `#000`, padding 0, no overlay. `unitsPerCell` is a whole number, so a cell of 13.33 or 7.27 exports at 13 or 7. That only changes the file's size, because step 3 renders both files at 1024 px.
3. **Render** the original and the export in Playwright Chromium at **1024 px on the long side**, black on white, same viewport, `deviceScaleFactor: 1`.
4. **Align.** Both rasters are aligned on their ink bounding box. That only matters if an original has padding.
5. **Compare** with pixelmatch, `threshold: 0.1` (its default) and `includeAA: false`. Its README defines `threshold` as *"How different two colors must be for a pixel to count as mismatched, from 0 to 1 … to allow some percentage of the image to differ, compare the returned count against width * height instead."* We compare the returned count against **ink area**, not image area, so small marks aren't let off easily:

   **mismatch % = mismatched pixels / pixels that are ink in either image × 100**
6. **Structure:**
   - **pieces:** the number of 8-connected ink components in each raster must be equal.
   - **holes:** the number of enclosed background components must be equal.
   - **nodes:** count of `M L H V C S Q T A` commands in the exported, SVGO-processed `d` attributes (Z excluded) must be ≤ the original's count, measured the same way.
7. **Artefacts:** for each logo, write `artifacts/rebuilds/<name>.png`, a triptych of original | rebuild | diff (mismatches in `--color-danger`), plus a JSON row with all metrics.

### 1.2 Rebuild set and pass thresholds

Original node counts were measured on the files in `/references` (Z excluded).

| Logo | Grid (subdivision) | What it exercises | Original nodes | Max nodes | Max mismatch |
|---|---|---|---|---|---|
| p-logo-1 | square 3 × 4 (1) | polygon, cutout, 45° | 20 | 20 | 0.5% |
| e-logo-2 | square 3 × 3 (1) | 45° polygons, 3 pieces | 20 | 20 | 1.0%* |
| e-logo-3 | square 3 × 3 (1) | small fillets on 45° and 135° corners | 26 | 26 | 1.0% |
| e-logo-4 | isometric 2:3 (2) | slope 2:3, bands, small fillets | 40 | 40 | 1.5%‡ |
| p-logo-7 | square, 1/4 steps (slope 5:8) | three sharp pieces | 15 | 15 | 3.0%† |
| p-logo-4 | square, slant 21.24°, cells of 100/9 | slanted grid, large fillets, cutout | 32 | 32 | 1.0% |
| p-logo-3 | square (1) | oblique cube in strokes, round joins | 191 | 60 | 1.0% |
| p-logo-5 | polar, rotation 30° | outer wrap (teardrop), inward star cutout | 16 | 16 | 1.5% |
| a-logo | triangular (2) | strokes, round caps, inward bends | 65 | 65 | 1.5% |
| node-logo | triangular, rotation 15° | outer and inward wraps, cutout | 111 | 111 | 1.5% |
| motion-logo | square 23 × 6 (8) | wraps r = 0.5, flat ends, 0.375 spacing, cutouts | 119 | 119 | 1.0% |
| m-logo-2 | square (1) | strokes with arc segments, round caps | 97 | 97 | 1.0% |
| m-logo-1 | polar 24 rays + companion square | rays intersected with a frame, joint radius at clip corners | 50 | 50 | 1.5% |

- \* e-logo-2's original has nodes about 0.028 off its lattice. The rebuild puts them on the lattice, which is an intentional deviation within the threshold.
- † p-logo-7's two slopes (31.36° and 32.64°) are unified in the rebuild at 5:8 (32.0°). That fits a square grid with 1/4 steps exactly, and isometric true 30° fits worse. This deviation is recorded in `DECISIONS.md`, which justifies the 3.0% threshold.
- ‡ e-logo-4's slope is 0.6715, not 2/3. The rebuild uses the grid's exact 2/3, which shows as a uniform hairline along every sloped edge (1.38%). Recorded in `DECISIONS.md`.
- **Status:** 10 of 13 pass (`npm run rebuilds`). Three are still open: **a-logo**, whose slope is 1.75 rather than √3 (it fits a triangular grid to about 1%); **node-logo**, whose edge directions differ by 53° and 63.5°, so it isn't on a triangular lattice and is likely wraps around circles; and **p-logo-5**, whose star-arc centres sit at uneven distances and angles from the disc centre. Each needs its construction worked out before it can be rebuilt.
- **p-logo-3's limit is 60 nodes, not 191,** because the original's 146 tiny curve segments are a defect. The rebuild must be about 3× leaner. That's the evidence that export quality beats the reference.
- **m-logo-1** needs both the companion square lattice (its frame) and the joint radius (its rounded clip corners).
- Radii are stored in 1/240 cell, so original radii that aren't multiples (e.g. e-logo-3's 2/35 cell) round to the nearest step. The thresholds absorb this. It's under 0.02 px at the original sizes.
- Excluded: p-logo-2 (elliptical bowl) and p-logo-6 (two polar centres). Both are non-goals in `SPEC.md` §2.

### 1.3 Sign-off [person]

A rebuild that passes on numbers still gets one look: open its triptych and confirm the diff pixels are only edge anti-aliasing or the documented deviations. Record the sign-off in the PR description.

## 2. Property-based tests [auto]

fast-check, with 200 runs locally and 2,000 in CI. Generators build random **valid command sequences** (place, connect, arc, close, move, set radius, set corner type, set role, symmetry, delete, grid change), not random documents. Every test also asserts the document invariants (`ARCHITECTURE.md` §3).

| ID | Property | How |
|---|---|---|
| **P1 On the lattice** | After any command sequence, every vertex and arc centre is integral, inside the extent, and `nearest(toPlane(p)) == p`. | For every grid preset and random parameters. Separately, `nearest` is compared with a brute-force scan of all lattice points for random plane points. |
| **P2 Deterministic export** | `exportSvg(doc)` is byte-identical across two calls, across a JSON round trip, and across two equivalent command orders that produce equal documents. | Compare strings and SHA-256. |
| **P3 Exact undo/redo** | For a sequence of n commands: undo k then redo k returns the identical object (`===`) and a deep-equal JSON. Undo n returns the initial document. Redo after a new command is empty. | Also with coalesced drags and nudges. |
| **P4 Valid arcs and continuity** | Every exported `A` has r > 0, endpoints that differ, and radius big enough to reach them (λ ≤ 1 + 1e-9 in the SVG 2 radius correction, so the renderer never has to correct). At every L/A or A/A junction, tangent directions match within 1e-9 rad, except at intended sharp corners (r = 0, miter or bevel joins). | Rules quoted in `ARCHITECTURE.md` §4.3. |
| **P5 Repeat closure** | Rotating by 360°/n, n times, is the identity on contours. Mirroring twice is the identity. Repeat transforms preserve lengths and arc radii. The grid's native `SymmetryOp`s map lattice to lattice, which is what detach needs. | Per grid's native group and per repeat. |
| **P6 Arc recovery** | For random shapes with cut and intersect roles: every exported segment is an `L` or `A` (never a cubic), every `A`'s endpoints lie on a source circle within 1e-6 cells, and the recovered path's raster differs from Paper.js's cubic raster by ≤ 0.1% of ink. | `paper-jsdom`. |
| **P7 Clamping and invalid shapes** | A fillet's tangent lengths (point and joint fillets) never exceed their edge length. Joint fillets are tangent to both neighbouring segments within 1e-9. Invalid wraps are always reported, never exported. Exported contours never self-intersect. | Segment-intersection check on the output. |
| **P8 Persistence** | Save then open returns a deep-equal document. Migrating any stored older schema fixture then validating succeeds. | Fixtures in `tests/fixtures/schema-*`. |

Polar grids with ray counts outside {4, 6, 8, 12, 24} use a 1e-12 relative tolerance for the arc equidistance check (`ARCHITECTURE.md` §4.1). This is the only invariant allowed a tolerance, and P1 asserts it's applied nowhere else.

## 3. Export checks

### 3.1 Automated [auto]

Run on the 13 rebuilds, all golden documents and 200 random documents:

| ID | Check |
|---|---|
| **E1 Valid XML** | Parses as XML with no errors (DOMParser `parsererror` absent, and a strict parser in Node). The root is `<svg>` in the SVG namespace with `width`, `height` and `viewBox`. |
| **E2 Allowed elements** | Mark-only export: root `<svg>` plus `<path>` only. Overlay export: also exactly one `<g id="construction">` as the first child, containing only `path`, `line` and `circle`. |
| **E3 No stray transforms** | No `transform` attribute anywhere, no `style` attribute, no `class`, and no `id` except `construction`. |
| **E4 Path commands** | `d` uses only `M L H V A Z` (absolute or relative after SVGO). No `C S Q T`. |
| **E5 Precision** | No number has more than 3 decimal places. On square, rows and 2:3 / 1:2 isometric grids, a mark whose every coordinate is a lattice point (sharp corners, no strokes or arcs) produces integers only when `unitsPerCell` × sub-step is integral. Radii, stroke offsets and tangent points are rounded to 3 places like everything else. |
| **E6 SVGO applied and stable** | The output equals `svgo(output)` with the project config, so SVGO is idempotent on our output. The config is `preset-default` with `mergePaths: false` and `convertPathData: { floatPrecision: 3, smartArcRounding: false }` (`ARCHITECTURE.md` §7). |
| **E7 One path per piece** | Number of `<path>` elements in a mark-only export = number of pieces (§1.1 step 6). Holes are subpaths, never separate paths. |
| **E8 Matches the canvas** | The canvas's mark layer and the export's `d` strings are identical at equal precision (same writer). |
| **E9 Renders the same across engines** | Chromium raster of the SVG vs the exported PNG at the same size: mismatch ≤ 0.1% of ink. Firefox and WebKit are added in CI when their Playwright browsers are installed there. Locally only Chromium is available. |
| **E10 PNG** | Exactly the chosen pixel size on the long side, the aspect ratio of the `viewBox` within 1 px, and a transparent background when chosen (corner pixel alpha = 0). |

### 3.2 Manual round-trip checklist [person]

Do this before each release with three files: p-logo-1 rebuild (sharp, cutout), node-logo rebuild (arcs, inward corners, rotation) and motion-logo rebuild (many pieces, fractional spacing). Also try one dark-overlay export. Record app versions, and take a screenshot for each tick.

**Figma**
- [ ] Drag the `.svg` in. Then also use Copy SVG and paste onto the canvas.
- [ ] The layer count equals the number of pieces, and holes are holes (not white fills).
- [ ] Rotation shows 0° on every layer, so no transforms were introduced.
- [ ] Arcs are smooth at 800% zoom, with no faceting.
- [ ] The size matches the export's `width` × `height`.
- [ ] Fill is the export colour.
- [ ] The overlay imports as one group named `construction` behind the mark.

**Adobe Illustrator**
- [ ] File › Open the `.svg`. No import warnings.
- [ ] Layers panel: one path or compound path per piece, with no clipping groups.
- [ ] Document Info › Objects: the path count matches. The anchor count with the Direct Selection tool is reasonable (no clusters of tiny segments).
- [ ] Arcs: the round corner anchors sit at the tangent points.
- [ ] Transform panel shows rotation 0°.

**Inkscape**
- [ ] Open the `.svg`. In the XML editor (Ctrl+Shift+X), no `transform` appears on any element.
- [ ] Node tool: node counts per piece match the export's `d`.
- [ ] Object › Fill and Stroke: holes behave correctly with the file's fill rule.

**Browsers**
- [ ] Open the `.svg` directly in Chrome, Safari and Firefox. They're identical at 100% and 800% zoom.
- [ ] Open the PNG next to it, at the same size. No visible difference.
- [ ] Paste the copied SVG into a plain HTML file. It renders the same.

A failure in any app is a bug in the export, never something "for the user to fix", unless it reproduces with a hand-written minimal SVG. Then it's recorded in `DECISIONS.md` as a known importer limitation.

## 4. Snapping and pointer feel [person]

After any change to input handling, record a 20 s screen capture per check:
- [ ] The snap preview never lags the pointer by a visible frame at 60 Hz, and never shows an unsnapped position.
- [ ] Hovering on a cell boundary doesn't flicker (the hysteresis in `SPEC.md` §7.1).
- [ ] A drag that ends on a neighbour shows the merge preview before release.
- [ ] Box-select at 400% zoom selects exactly the points inside.
- [ ] Holding Ctrl to snap to whole cells, then releasing, switches back immediately.

## 5. Accessibility

| ID | Check | Type |
|---|---|---|
| A1 | Contrast of every text and control-boundary token pair meets `DESIGN.md` §2. A script reads the tokens from the CSS and recomputes the ratios. | auto |
| A2 | Keyboard-only core flow: create a square grid, place 4 points with the lattice cursor, close, set one corner to round 0.25, add a cut shape, and export SVG. No pointer events. | auto (Playwright) |
| A3 | Every interactive element shows a focus ring on Tab (`:focus-visible` computed outline width ≥ 2 px). | auto |
| A4 | With `prefers-reduced-motion: reduce` emulated, computed `transition-duration` and `animation-duration` are 0 s for all elements. | auto |
| A5 | Targets are at least 24 × 24 px (WCAG 2.5.8). Our minimum is 32. Checked from element bounding boxes. | auto |
| A6 | Screen reader pass (VoiceOver on Safari): rail controls have names and values, the hint line announces selection and status, and dialogs trap focus and restore it. | person |
| A7 | 200% browser zoom: the rail scrolls, nothing is clipped, and the canvas notice appears below `--canvas-min`. | person |

## 6. Usability protocol [person]

### 6.1 Participants and set-up
- **3–5 designers** who build marks in Illustrator or Figma at least monthly and haven't seen the tool.
- Their own machine or a provided laptop with a mouse, screen and audio recorded, think-aloud, and one facilitator who doesn't help unless asked.
- Two minutes of orientation: the facilitator reads a fixed script naming the three modes and the `?` sheet. No demo.

### 6.2 Tasks
- **T1 (timed, main):** *"Rebuild this mark."* A printed card shows p-logo-1 on its 3 × 4 grid, with its four outer convex corners rounded at 0.25 cells. It covers choosing a grid, placing points, connecting, a cutout, corner radius and export. **Limit: 10 minutes.** Finish = SVG downloaded.
- **T1-B (baseline):** the same card in the participant's usual tool (Illustrator or Figma), starting from a blank file with a grid available. The order of T1 and T1-B alternates between participants.
- **T2 (untimed, exploratory, 8 min):** *"Make an original mark using symmetry and at least one arc."* This is for qualitative notes only.

### 6.3 What to record (per participant, in `research/usability/<id>.md`)
- Time to complete T1 and T1-B (stopwatch from first click to file saved).
- Completed (yes/no), and the number of facilitator assists, with the step where each happened.
- Errors: undo count, deleted points, wrong grid chosen, wrong corner type tried.
- Output quality: the rebuild metric (§1.1) against the card's target for both exports, and in T1-B the number of nodes off the lattice (measured by script).
- SEQ (Single Ease Question, 1–7) after each task.
- Three quotes, and each moment of hesitation of 5 s or more, with what they were looking for.

### 6.4 Failure criteria
**A participant fails T1** if any of these happen:
- not finished in 10 minutes
- more than one assist on the same step
- the exported SVG fails the §1 threshold (1.0%) against the target

**The protocol fails (redesign needed before the portfolio claim)** if any of these happen:
- fewer than 80% of participants complete T1 without failing
- the median T1 time is longer than the median T1-B time
- median SEQ for T1 is below 5
- the same hesitation point appears for half or more of the participants

## 7. Performance [auto]

A Playwright benchmark on the motion-logo rebuild (6 pieces), and on a generated 40-shape / 400-point document with cuts and 6-fold symmetry:
- The 95th percentile of `dispatch → painted` over 200 drags is under 16 ms (`SPEC.md` §10), measured with `performance.now()` around `requestAnimationFrame`.
- The CI machine's numbers are recorded, and a drop of more than 20% against the last baseline fails.

## 8. Evidence for the portfolio write-up

Capture these as you go. Each item says where it comes from.

| Evidence | Source |
|---|---|
| Rebuild triptychs (original, rebuild, diff) for all 13 | `artifacts/rebuilds/*.png` (§1.1) |
| Before/after table: original nodes vs rebuild nodes, and off-lattice node counts (e.g. p-logo-3 191 → ≤ 60, e-logo-2 3 off-lattice → 0) | Rebuild JSON rows |
| Construction overlay exports (dark and light) of 4–6 rebuilds | Export dialog |
| Property test summary: properties, runs and total cases, with a pinned regression seed and the bug it caught | CI log |
| Figma, Illustrator and Inkscape import screenshots from §3.2 | Manual checklist |
| Usability results: T1 vs T1-B median times, completion rate, SEQ, and two or three quotes | `research/usability/` |
| Screen recordings: placing with snap, rounding with the radius circle, an inward corner, a live cutout, symmetry | §4 captures |
| Contrast table and keyboard-only run recording | A1, A2 |
| `DECISIONS.md` as the decision log | Repo |
| Before and after of the visual directions (the three explored, the one chosen) | Directions comparison page |
