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
