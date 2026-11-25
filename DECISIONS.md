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
