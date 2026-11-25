# Decisions

One or two lines per significant decision, with the reason. Newest last.

## Product scope

- **Geometric marks are the focus.** The tool is for marks built from grid points, straight lines and circular arcs, like stock "geometric logo" sheets. That's where a lattice-locked tool beats a general editor.
- **One mark per document.** Sheets of marks were only examples of range. No multi-mark board in v1.
- **Font generation is a non-goal for v1.** motion-logo shows it's a real future use. The data model shouldn't block it, but v1 doesn't build it.
- **Stroke shapes are first-class alongside fills.** 5 of the 13 reference logos are monoline, and the designer's workflow starts with strokes.
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
