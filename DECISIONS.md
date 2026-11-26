# Decisions

One or two lines per significant decision, with the reason. Newest last.

## Product scope

- **Geometric marks are the focus.** The tool is for marks built from grid points, straight lines and circular arcs, like stock "geometric logo" sheets. That's where a lattice-locked tool beats a general editor.
- **One mark per document.** Sheets of marks were only examples of range. No multi-mark board in v1.
- **Font generation is a non-goal for v1.** motion-logo shows it's a real future use. The data model shouldn't block it, but v1 doesn't build it.
- **Stroke shapes are first-class alongside fills.** 5 of the 15 reference SVGs are monoline (motion, m-logo-2, a-logo, p-logo-3, p-logo-6), and the designer's workflow starts with strokes.
- **v1 additions accepted:** live symmetry (per grid's native symmetry), cell fill, full union/subtract/intersect, arc segments centred on lattice points. Parallel repeat ships if time allows. It's the first thing to cut.
- **Non-goals added:** interlaced (over/under) strokes, non-circular curves (ellipses, free Béziers, superellipses), gradients and textures.

## Grids

- **Polar grid has a single centre** (rings plus rays). It covers m-logo-1, p-logo-5 and node-logo. p-logo-6's second centre is out of scope.
- **Square grid gets a slant parameter, and the isometric grid gets an adjustable angle.** These cover p-logo-4 (21.24° shear) and e-logo-4 (2:3 slope) as data, not new grid types.
- **Fractional snapping (sub-steps of a cell).** This covers motion-logo's 0.375-cell letter spacing.

## References and verification

- **References are visual targets, not path-data targets.** The reference SVGs contain defects (off-lattice nodes in e-logo-2, 146 micro-segments in p-logo-3, float noise in a-logo, duplicate paths in m-logo-2). Matching them node for node would reward reproducing those defects.
- **Rebuild tests compare rendered overlays.** Node count must be less than or equal to the original's. Intentional deviations (for example, one consistent slope for p-logo-7) are recorded here.
- **Removed from the rebuild set:** upload-1.png (raster with no source) and p-logo-2 (elliptical bowl, a non-circular curve).
- **Export uses SVG arc commands (`A`) for circular arcs,** not cubic approximations. Arcs are exact, smaller, and match the geometry model.

## Geometry model (step 2)

- **Points are stored as whole numbers in sub-step units** (e.g. u = 27 with subdivision 8 means 3⅜ cells). They're exactly on the lattice by construction, so there's no float drift. The UI shows decimal grid coordinates.
- **Grids are data definitions using one of three mapping kinds:** affine (square, slant, triangular, isometric angle), polar (rings × rays, single centre), rows (typographic lines + column step). Each grid declares its native symmetry group and cell tiles. A new grid of an existing kind needs data only.
- **Corner model is per point: fillet or wrap.** round = fillet (the vertex stays on the point). outer and inward = the outline wraps a circle centred on the point. auto = outer when the outline turns convex, inward when concave. Edges are tangent lines computed analytically. The reference logos use both models.
- **The core never emits a zero-radius or out-of-range arc.** SVG renderers silently "correct" those (SVG 2, out-of-range arc parameters), which would hide bugs. r = 0 becomes a sharp vertex. A fillet too large for its edges is clamped and flagged. A wrap with no valid tangent marks the shape invalid.
- **Path segments are lines or arcs centred on a lattice point.** An arc is valid only when both ends are equidistant from its centre (checked on the stored lattice integers, not computed positions).
- **Strokes are paths with width, cap and join, outlined on export.** Offsetting a circular arc gives a circular arc, so the outline stays exact. Live SVG strokes in export are deferred.
- **Booleans use Paper.js and stay live, never baked in.** Intersections are generally not lattice points, so baking them would break the lattice invariant. Paper.js stores arcs as cubics, so export recovers arcs by matching result curves to known source circles. Dependency approved: `paper` at runtime (core build), `paper-jsdom` for tests only.
- **Symmetry is live copies,** limited to the grid's native symmetry group so copies stay on the lattice. A detach command bakes them into ordinary shapes.
- **Undo is pure commands over an immutable document,** with history as snapshots. Undo returns the identical document by construction. Drags and nudge runs coalesce into one entry. Derived geometry is never stored.

## Visual direction (step 3)

- **Direction A, Drafting film, chosen, plus B's cell ruler.** Construction is drawn in non-photo blue and the mark in bone white, so construction and mark separate at a glance. The construction-overlay export reads as a drafting sheet. A near-neutral ground distorts a mark's perceived weight the least.
- **Adjustments to A:** the serif italic is limited to the mark name and section headings (rail labels are monospace). Selection gets its own colour, distinct from construction blue. Control borders are raised to 3:1 non-text contrast.

## Product details (step 4)

- **Saving:** browser autosave plus Save / Open project file (`.json`). There's no cloud, but closing a tab shouldn't lose work.
- **Export:** SVG, PNG and Copy SVG to clipboard. PNG at 512, 1024, 2048 and 4096 px (long side), transparent by default. Mark colour is black by default, or any single hex.
- **Construction overlay export** includes grid lines, lattice points, radius circles, and cutout and boolean outlines, but not point numbers or selection. It comes in dark (drafting film) and light (paper) styles.
- **Export bounds:** a tight `viewBox` around the mark, with optional padding in cells.
- **Grid type is fixed once the first point exists.** Density, subdivision and angle changes are allowed only when every point maps exactly. Lattice coordinates don't translate between grid types.
- **Start:** a blank grid, or Examples (rebuilt references) to show the tool's range in the first minute.
- **Paper preview toggle:** see the mark in its export colour on white, because marks read differently light-on-dark.
- **Targets:** current desktop Chrome, Safari and Firefox. No touch support. Hosted on GitHub Pages.
- **Dependencies approved:** TypeScript, Vite, Preact, Vitest, fast-check, SVGO, pixelmatch, Paper.js (+ paper-jsdom for tests), and self-hosted IBM Plex Mono and Plex Serif (OFL).

## Documents (step 5)

- **Rebuild set is 13 logos:** all 15 reference SVGs except p-logo-2 (ellipse) and p-logo-6 (two polar centres). An earlier message miscounted this as 14 SVGs and 11 of 13.
- **Affine grids get a rotation parameter, and isometric grids are set by ratio (true 30°, 2:3, 1:2), not free degrees.** node-logo is a triangular lattice rotated 15°. e-logo-4's 2:3 slope gives whole-number export coordinates when stored as a ratio.
- **Cell fill mode is named Tile (T),** to avoid clashing with "fill" as a paint.
- **Shapes are evaluated in creation order (add / cut / intersect), with keyboard reordering and no list panel.** It's an ordered boolean fold, not layers.
- **Radii are stored as whole numbers of 1/240 cell,** exact for every allowed subdivision (1, 2, 3, 4, 6, 8).
- **Joint radius per shape.** Corners created by boolean operations get fillets from the later shape's joint radius. This gives rounded clip corners (m-logo-1, and stock "rays in a square" marks) without baking off-lattice points into the document.
- **Named radii belong to the document.** There are no cross-document presets.
- **Architecture boundaries are enforced by an import-scanning test,** not ESLint. That avoids an unapproved dependency.
- **Polar grids offer a companion square lattice** (same unit and centre, off by default). m-logo-1's frame corners aren't polar points. With the companion on, only symmetries that keep square points on their lattice are offered (2- and 4-fold rotation, mirrors at multiples of 45°). m-logo-1 is back in the must-pass rebuild set.
- **Lattice coordinates never hold −0.** The constructor normalises it, so equality and JSON round trips agree. Found by P1.

## Build log

- **Paper.js test passed** in Node (`paper-jsdom`) and in Chromium (core build, no `<canvas>` element). It covers union, cutout-as-hole, a wedge clipped by a frame, rectangles sharing an edge (shared edge removed, 4 corners), and a circle tangent to a line. Curved results are 0.025–0.028% larger in area than true circles, which is Paper's four-cubic circle approximation. This confirms export needs arc recovery to produce exact `A` arcs.
- **Playwright is used from the environment's global install** for now (`npm run spike:browser`). CI will need it installed as a dev dependency, which needs approval.
- **Lattice core built** (`src/geometry/`, `src/grids/`). P1 and P5 pass at 200 and 2,000 runs. At 2,000 runs, P1 found two real bugs. Small rotated grids could contain no lattice points, fixed by rotating about a lattice point rather than the rectangle centre. Polar snapping with few rays missed nearer inner-ring points, fixed by projecting the pointer onto each nearby ray. A third, off-grid snapping on rotated grids, was fixed by scanning the extent only when the pointer is outside it.
- **Mutation checks:** breaking the triangular 60° rotation or restricting polar snapping to one candidate ring fails the suite. Restricting polar snapping to the single nearest ray survives 2,000 cases and an exhaustive 121 × 121 sample. Checking ±2 rays is kept as cheap insurance, not because a failing case is known.
- **No `@types/node`:** the two Node globals the tests use are declared in `tests/env.d.ts`, and the throwaway spike files sit outside the type check.
- **Typographic row defaults use common Latin proportions on an 8-cell em:** ascender 0.75 em, cap ≈ 0.69 em, x-height 0.5 em, descender 0.25 em. The designer asked for a sensible default. The values are editable.
- **Corner geometry built** (`src/geometry/corners.ts`, `contour.ts`). Wrap edges are offset tangent lines solved from m·D = ρᵢ − ρⱼ, which exist only when |ρᵢ − ρⱼ| < |D|. That single condition gives both SPEC limits: a same-side circle "swallows" its neighbour, and opposite sides have "no room". Fillets are cut afterwards and clamped per edge. Closed-form area checks pass: fillet square 1 − (4 − π)r², offset square 1 + 4r + πr², capsule 2rL + πr², teardrop kite plus major sector.
- **P4 and P7 found three issues:** the wrong point blamed when a big circle swallows a small one, sliver line segments (~1e-11) with meaningless direction after a fully clamped fillet, and degenerate fillets at 180° hairpins. All are fixed. Breaking the fillet centre, the wrap direction or clamping makes the suite fail.
- **Path writer and geometry gallery built.** `src/export/write-path.ts` writes absolute `M L H V A Z`, with arcs as `A r r 0 large sweep x y`, trimmed fixed precision, no `-0`, and Z instead of a final line. p-logo-1's square comes out as `M0 0H125V125H0Z`. `npm run gallery` builds a specimen sheet from the real geometry core with the DESIGN.md canvas styles, so behaviour can be checked by eye. The design tokens now live in `src/ui/tokens.css`, copied verbatim from DESIGN.md.
- **The gallery showed that inward circles which touch turn star tips into zero-width hairlines.** The geometry is correct, but such spikes are worth warning about later.
- **Corner types against the corner use disc semantics** (designer approved). Inward on a convex corner is a cove (disc removed), and outer on a concave corner is a filled corner (disc added). The arc meets each edge r from the point and spans π − |turn|, with deliberate crisp corners at its ends. Before this, the tangent rule produced self-looping outlines that no designer would choose. Closed-form checks: cove 1 − πr²/4, filled L 3 + πr²/4.
- **Strokes built** (`src/geometry/strokes.ts`), with rounded centre-line corners and end radius (designer approved). Offsets of arcs are concentric arcs, so strokes stay exact. 19 tests cover closed-form areas for caps, joins, concentric corner arcs, a half annulus, rings and end radius, plus P4 on random strokes. Flipping the arc offset side, removing inner trims or reversing round caps makes the suite fail. Known limits, each reported as an issue: no centre-line fillet where a corner touches an arc segment, end radius only on straight ends, and overlap at non-straight inner joins waits for the boolean pass.

## Repeats, circles, booleans (merge-and-cut step)

- **Repeats are per shape, not per mark** (designer approved). The ray-hatched ring needs ~100-fold rays and 3-fold bands, and flowers need different repeats for petals and centre.
- **Repeats can rotate any n (2–360) about a lattice point, mirror, or translate by a lattice step** (designer approved). Copies are derived geometry, like boolean crossings, so they don't need to land on lattice points. That allows the 8-armed sun on a square grid. Detach is only offered when every copy lands on lattice points. Transform contours, not lattice points.
- **A one-point filled shape is a circle.** Needed by the striped circle, the moon and the spade. A full circle is exported as two half-circle `A`s, because an arc whose end equals its start is omitted (SVG 2, out-of-range arc parameters).
- **Polar ray cap raised to 360** (designer approved) for the hatched ring.
- **Clipping uses the ordered add/cut/intersect list in v1** (designer approved), for example thick rays, intersect a region, add thin rays, intersect the ring. The hatched ring becomes a built-in Examples recipe. Clip groups are reconsidered after usability testing.
- **The overlay export gains optional edge guides** (designer approved): straight edges extended across the frame, as in designers' published construction sheets.
- **Merge, cut and intersect built** (`src/boolean/`, `src/pipeline/`). The steps are: repeats, the ordered Paper.js fold, arc recovery, then pieces. Closed-form areas match to 1e-9: two circles merged, a square minus a circle, a wedge clipped by a frame, the thunderbolt S (two pieces touching at points), a striped circle (6 slices, every arc on the circle) and a hatched ring (24 pieces bounded by the two exact ring radii).
- **Recovery recomputes corners exactly** as line–line, line–circle and circle–circle crossings, because Paper's crossings are between its cubic approximations.
- **Arcs are handed to Paper as our own cubics,** because Paper's `arcTo` throws on tiny, nearly collinear arcs.
- **Recovery tolerance is max(1e-5, 1e-3·r), set by measurement.** 0 failures on 5,445 random shapes; 1e-4·r failed ~3%.
- **A cove-direction bug was found through recovery.** The cove arc took its direction from the shape's winding, which goes wrong when big neighbouring wraps tilt the edges. It's now the short way around the point. P4 hadn't caught it because it never checked that start + sweep lands on the end, and P4 now checks that in the corner and stroke tests. On the way there I widened tolerances and tried scaling coordinates for Paper. Both were treating a symptom of this bug, so both were reverted once measurements showed they weren't needed.
- **Joint radius built** (`src/pipeline/joints.ts`). Recovery reports each output edge's source line or circle, tagged with the shape instances it came from. A corner is a joint when its edges share no instance, so overlapping repeat copies are filleted too (the plus sign), and the later shape's radius applies. One offset-and-cross construction covers line–line, line–arc and arc–arc fillets. Closed-form checks: concave and convex line–line area changes, and exact tangency |F − C| = R + ρ for line–arc and arc–arc. Property tests found that the crossing helper's near-tangent fallback produced bogus centres when the offsets don't cross. Fillets are now accepted only when the centre is exactly ρ from both edges (to 1e-10), and otherwise clamped by bisection.
- **Gallery shows merge, cut and intersect:** merged circles with and without a joint, the thunderbolt cut, the striped circle, the 8-fold sun, the hatched ring, the clipped fan with rounded clip corners, and the plus sign.
- **Post-v1 candidate: "keep separate on export"** (designer agreed): a per-shape flag to export a shape as its own overlapping path instead of merging it, so gradients can be applied in Figma or Illustrator (the gradient asterisk example). Gradients themselves remain a non-goal.
- **First playable moved earlier:** right after the document model and before export, so the designer can judge snapping and pointer feel early (CLAUDE.md asks for hand checks of these).
- **Document model built** (`src/model/`, `src/persist/`, `src/pipeline/resolve.ts`). Commands are pure reducers, and every result is re-validated, so a reducer bug can't put an invalid document into history. History holds frozen snapshots, and coalescing keys make a drag one entry. P3 (undo k / redo k returns the identical object; undo all returns the start) and P8 (save, open, deep-equal) pass at 2,000 runs, with every invariant checked after each random command. A mutant that makes redo return a copy fails P3.
- **First rebuild through the model: p-logo-1.** Built with commands on a 3 × 4 grid: area identical to the original, whole-number coordinates, no more than its 20 nodes.
- **Known gap: filled shapes with arc segments draw with sharp corners at their points.** Radius on those points is reported as "not applied". Fillets next to arcs (fills and strokes) are a later step. Tile-mode shapes have sharp corners anyway.
- **First playable built** (`src/ui/`, `src/render/Canvas.tsx`, Preact with Vite's built-in JSX transform, so no extra plugin dependency). It's published as a page. Square grid; place, close, select, drag, box-select, corner type, radius, add/cut/intersect, undo/redo, paper preview, autosave. `npm run e2e` drives the production build in Chromium.
- **Keyboard handler reads live state through a ref** and is attached once. Driving the app showed that re-attaching it every render made fast key presses act on stale state (R, R, ], ], ] lost presses).
- **New points start as 'round' (fillet).** R cycles round → inward → auto → outer. The classic fillet is the least surprising first rounding.
- **GitHub Pages deployment** (`.github/workflows/pages.yml`): every push to `main` runs the unit tests, builds, and publishes `dist/` to https://ashbrock.github.io/logo-tool/. The build uses relative asset paths (`base: './'`), so the same output also works as a standalone page. Pages must be switched on once in the repo settings (Source: GitHub Actions). The session's GitHub proxy can't change that setting.

## First feedback round (designer, first playable)

- **Drawing is stroke-first.** The designer saw straight lines look thicker than diagonals. That's real geometry: a band between lattice points built as a fill is measured horizontally, so at 45° it is about 1/√2 as thick. New paths now draw as lines at a true constant width. Closing makes a filled shape, and Enter keeps the line. One tool gives both outcomes, with no separate line tool.
- **Finishing a shape switches to Adjust with it selected,** so rounding and role changes are one keypress away. Closing and finishing are one step: two separate steps lost the shape reference in between (found by e2e).
- **Radius drag handle:** right increases, left decreases, one cell of drag per cell of radius, snapping to 1/24 cell (Shift: sub-step). It's hidden on a line's end points.
- **The selected shape is outlined** over a halo so it stands out on the shared bone fill (cut shapes especially).
- **Delete:** both Delete and Backspace already worked, but keys were swallowed while a rail dropdown had focus. Canvas clicks now take focus back, and dropdowns blur after a choice. Ctrl/Cmd+A selects points instead of page text.
- **Examples menu:** p-logo-1 and e-logo-3 (the designer's), plus the thunderbolt cut, the striped circle, the 8-fold sun, the plus with joint radius, and the arch (stroke + arc). They're built through commands and tested to evaluate cleanly.

## Second feedback round

- **Radius handle sits on the selection ring** (right-hand side, 12 px out), so it reads as part of the point, not a separate widget.
- **New lines start at the minimum width (1/8 cell).** The 1/2-cell default read as chunky; widening is one click.
- **Arcs while drawing: A arms arc mode, Tab cycles centres.** Alt-hold can't preview because Alt+Tab is the operating system's. Only lattice points exactly equidistant from both ends are offered, nearest first, so every arc is a true grid arc.
- **Repeat controls in the rail** (rotate ×n with optional mirror, mirror, along a line). For now the centre and axes are the lattice point nearest the grid centre; picking the centre on the canvas is a later step.

## Export

- **SVGO 4.1.0, loaded on demand.** It is about 800 KB, so the app fetches its browser build once idle rather than at start-up. Config as in ARCHITECTURE.md §7, plus `cleanupIds` preserving `construction`, which SVGO would otherwise strip as unreferenced (caught by the E2/E3 tests).
- **The overlay is built as data, then optimised with the mark.** Grid lines come from the lattice itself (lines through lattice points along each lattice direction; rings and rays for polar), so every grid type gets an overlay without its own drawing code. Everything is clipped to the export frame, so the overlay never changes the bounds.
- **Overlay colours are literal hex values with a drift test** against `tokens.css`, because an exported file can't read CSS variables.
- **Bounds are exact for arcs** (end points plus the quarter-angle extremes the arc passes through), so a circle's frame is exactly its diameter.
- **PNG background follows the overlay.** With the overlay on, the PNG uses the overlay's background and the transparent/white choice is disabled. That removes a contradictory combination rather than explaining it.
- **E5 refined:** integers only for lattice-only marks. Radii in 1/240 cell, stroke offsets and tangent points can't be integral at 100 units per cell, and they round to 3 places.
- **The rail's Export and Copy SVG are pinned to the bottom,** because the rail scrolls and they were below the fold.
- **PNG is checked against the browser's own SVG raster** (e2e, ≤ 0.1% of ink differs); an 8 px shift fails it at 3%.

## Reconstruction

- **Rebuilds are construction, not tracing.** Each original is measured (sharp corners from intersecting its straight edges, arc centres and radii from three points per curve). The rebuild is then written as commands on a lattice that the measurements fit. 10 of 13 references pass, and every passing rebuild has fewer nodes than its original: p-logo-3 has 40 against 191, and m-logo-2 has 31 against 97.
- **p-logo-4's grid is in ninths.** Its horizontal steps are 1/9 of its 100-unit rows, so the rebuild uses cells of 100/9, slanted 21.24°. It then matches to the pixel.
- **p-logo-7 moved from isometric to square.** Its two slopes are unified at 5:8, which a square grid with 1/4 steps hits exactly.
- **e-logo-4 keeps the grid's 2/3 slope** rather than the original's 0.6715. The threshold is 1.5%, and the diff is a uniform hairline.
- **m-logo-2 is one ribbon,** drawn as two strokes that meet under a round cap so neither crosses itself. **motion-logo's m is two shapes merged:** its humps cross at a point off the lattice, which the merge computes exactly.
- **Arcs over a half turn need an explicit direction** in the rebuild builder. Its first motion-logo attempt chose the short way round the 270° counter tops, and the pixel diff caught it.
- **Open:** a-logo, node-logo and p-logo-5 (see VERIFICATION.md §1.2 for the measured reasons).

## Grid types in the interface

- **Every grid type is in the New-mark dialog,** with a live preview of each lattice. Grid lines come from the lattice itself (`src/grids/lines.ts`), shared by the canvas, the previews and the export overlay. The rebuilds had already exercised every grid type in the core; this only adds drawing and controls.
- **Type parameters are set when the mark is created.** Slant, rotation, ratio, rays and the companion lattice are chosen in the dialog. The rail changes size, rings and steps, which `setGrid` rescales exactly or refuses. "Change grid type…" appears while the mark is empty. Editing slant or rotation on a mark with points would rarely keep them on the lattice, so it waits until it's asked for.
- **Typographic rows are dashed `--canvas-lattice` lines with `--canvas-ruler` labels to the right.** DESIGN.md names no row style, so these reuse existing tokens: construction rather than mark, readable but quiet. The canvas adds two cells of margin on the right for the labels.
- **The New-mark dialog opens on first visit** (SPEC.md §4.2). Esc keeps the default square mark. Esc now closes any dialog wherever focus is; the e2e suite found that otherwise it failed intermittently.

## Repeat centre and project files

- **The repeat centre is set by clicking.** "Set centre" arms the next canvas click (a copy cursor and a hint line, Esc cancels). It also works in Place mode, so you don't have to switch modes to adjust a repeat.
- **Mirror axes are found in the plane, not in lattice coordinates.** On a polar grid, (u, v + 1) is a different ray, not a point below. So a vertical axis is the nearest lattice point exactly below the axis point, and moving a mirror keeps the line's direction.
- **Save and Open project files** (⌘S, ⌘O) download and load `.logo.json`. Opening is one undoable step, and a bad file is reported in the hint line. The rebuilds in `artifacts/rebuilds/` open this way too.
- **Export scale is 100 units per cell** (confirmed by the designer), not "long side 512". It keeps lattice coordinates whole for whole cells and 1/2 and 1/4 steps, and the file's size follows the grid rather than the mark.
- **One step rule for every radius control** (designer feedback: the handle moved in small steps, the rail's − / + in large ones). The handle, `[ ]`, the rail's − / +, the joint radius and Alt+`[ ]` all step by 1/24 cell, or one grid sub-step with Shift, and snap to that step (`src/ui/steps.ts`). Fine control is the default because rounding is judged by eye; Shift gives grid-exact radii.
- **Lengths stay in cells, shown as fractions, typed freely.** Pixels only exist at export, and the same mark exports at 12.5 px or 128 px a line, so the interface keeps cells (as the model does) and adds the export size as a note. Values show as exact fractions when the denominator is grid-like (up to 24ths) because "0.13" was a rounded 1/8 that no step could produce. Every length is a typeable field, since the designer's own marks use widths like 3/10 and 11/16 that no step reaches. Line width now steps like a radius (1/24, Shift: grid step) with its 1/8 minimum kept.

## Type and controls from the cutting mat

- **Direction B's type and controls, direction A's colours** (the designer's call). Martian Mono for everything you operate (variable: narrow at 87.5% in the rail, 75% in segmented controls, wide at 112.5% for ruler numbers), Archivo Narrow 600 for the mark name and dialog titles, 4 px control corners, bordered key caps, and selected options filled with the accent (`--color-on-accent` text, about 9:1). The colour tokens are unchanged.
- **Fonts are self-hosted files in the repo**, Latin and Latin Extended only (about 110 KB in total), with their OFL licences. That's lighter than keeping font packages as dependencies, and nothing loads from a font CDN.
- **Shortcut hints moved into tooltips on the two pinned rail buttons,** because Martian Mono is wider than Plex and "Export… ⌘E" wrapped.
- **One typeface: Martian Mono everywhere** (designer's direction). The mark name and dialog titles drop Archivo Narrow (which had replaced the original serif) and use Martian Mono 600. Hierarchy comes from size and weight. One family also means one font download.
- **IBM Plex Mono replaces Martian Mono** (designer's direction), still the only typeface, self-hosted at 400, 500 and 600 (Latin and Latin Extended). Plex has no width axis, so the width tokens (narrow rail, wide ruler, 75% segmented labels) are gone; segmented labels fit at the micro size.

## Examples per grid type

- **At least two examples per grid type, grouped rather than filtered.** Opening an example replaces the whole mark, grid included, so hiding other types' examples would hide exactly what a curious user wants. The New-mark dialog shows the selected type's examples; the rail menu shows all of them, with the current type's group first. A test enforces two or more per type.
- **Descriptive names, never reference file names** (designer's request), also enforced by a test. The reference rebuilds now live in the examples (Block P, Rounded diagonals, Isometric E, Slanted P, Rays in a frame, Curled wordmark, Ribbon, Wireframe cube P), and the reconstruction tests load them from there, so each is built once. Only the tests keep the file names, to know which original to compare against.
- **New examples fill the types without references:** Cube with a Y cut (isometric), Segmented dial (polar), Hexagon with a triangle cut and Nested chevrons (triangular), Letter n and Letter b (typographic, flat-ended strokes on the named rows).
