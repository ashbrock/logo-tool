# ARCHITECTURE

How the tool is structured. Behaviour is in `SPEC.md`, visuals in `DESIGN.md`, and proof in `VERIFICATION.md`. Reasons for each choice are in `DECISIONS.md`.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) | |
| Build | Vite, static output | Deployed to GitHub Pages from `main`. |
| UI | Preact | Only in `src/ui/` and `src/render/`. |
| Booleans | Paper.js 0.17 (`paper`, core build) | Only imported by `src/boolean/paper-adapter.ts`. |
| SVG cleanup | SVGO 4 | Only imported by `src/export/`. |
| Tests | Vitest, fast-check, pixelmatch, Playwright (pre-installed Chromium), `paper-jsdom` | Test-only. |
| Fonts | IBM Plex Mono and Plex Serif Italic, self-hosted | OFL. |

All of these dependencies are approved (`DECISIONS.md`). **Any other dependency needs the designer's approval first.**

## 2. Module boundaries

```
src/
  geometry/   pure maths: lattice ints, plane points, contours (line + circular arc),
              corners (fillet + wrap), stroke outline, validation, symmetry expansion.
              NO DOM, NO Paper.js, NO pixels.
  grids/      grid definitions as data + the three mapping kinds (affine, polar, rows).
  model/      document types, schema version + migrations, commands, history.
  boolean/    BooleanEngine interface + paper-adapter.ts (the only Paper.js import)
              + arc recovery.
  pipeline/   document → mark: resolve → outline → boolean → recover → pieces.
              Pure and deterministic. The canvas and export both call it.
  render/     Preact SVG components: grid, construction, mark, points, overlays.
              The only place that maps cells to screen pixels.
  export/     SVG writer, SVGO config, PNG rasteriser, clipboard, overlay export.
              The only place that maps cells to export units.
  persist/    autosave (localStorage, try/catch) and project file save/open.
  ui/         rail, dialogs, keyboard map, hint line, input handling, app store.
```

**Dependency rule**, enforced by `tests/architecture.test.ts`, which parses every import in `src/` and fails on a forbidden edge. That avoids adding ESLint as a dependency:

```
ui ──► render ──► pipeline ──► geometry ◄── grids
 │        │          │  └────► boolean ──► geometry
 │        │          └───────► grids
 ├──► model ──► geometry, grids
 ├──► export ──► pipeline, geometry
 └──► persist ──► model
```

- `geometry/` imports nothing from `src/`. `grids/` imports only types from `geometry/`.
- Nothing outside `ui/` and `render/` imports Preact. Nothing outside `boolean/paper-adapter.ts` imports Paper.js. Nothing outside `export/` imports SVGO.
- **Adding a grid type of an existing kind is a data file in `grids/definitions/`.** Adding a new mapping kind is one module in `grids/kinds/` implementing `GridKind`. Neither touches `geometry/`.

## 3. Data model

The document holds **only the source of truth**. Everything drawn (outlines, booleans, symmetry copies) is derived, never stored.

The source of truth is `src/model/types.ts`. In summary:

```ts
Lattice   { u: Int; v: Int; layer?: 'square' }            // sub-step units; 'square' = polar companion lattice
Vertex    { id; at: Lattice; corner: 'auto'|'outer'|'round'|'inward'; radius: Len240 | { ref } }
Segment   { kind: 'line' } | { kind: 'arc'; centre: Lattice; sweep: 0|1 }
Path      { vertices; segments; closed }                   // segments[i]: vertices[i] → vertices[i+1]
Paint     { kind: 'fill' } | { kind: 'stroke'; width: Len240; cap; join; endRadius: Len240 }
Repeat    none | rotate { centre; count 2–360; mirrored; axis? } | mirror { through; to } | translate { step; count }
Shape     { id; path; paint; role: 'add'|'cut'|'intersect'; repeat: Repeat; jointRadius: Len240 }
LogoDocument { schema: 1; name; nextId; grid: GridDef; shapes (evaluation order); radii: NamedRadius[]; export: ExportSettings }
```
Len240 = whole 1/240 cells. A one-point fill with a radius is a circle. Open fills with fewer than 3 points are shapes being placed, and draw nothing yet.


**Invariants**, checked by `model/validate.ts` on every command result and on file open:
1. Every `Lattice` and every arc `centre` is integral and inside `grid.extent`.
2. For every arc, `dist²(centre, start) === dist²(centre, end)`, computed exactly in lattice integers using the grid kind's exact metric (§4.1).
3. No two consecutive vertices are equal. A closed fill has at least 3 distinct vertices.
4. Every `{ ref }` names an existing radius.
5. A shape with one vertex is a filled circle with radius > 0. A repeat's centre, axis points and step are lattice values.

The document is plain JSON, frozen in development builds (`Object.freeze`, deep) to catch mutation.

## 4. Geometry core (`src/geometry/`)

### 4.1 Lattice to plane

`grids/` provides one `GridKind` per mapping kind:

```ts
interface GridKind<P> {
  toPlane(p: Lattice, g: GridDef): Vec2;                 // cells, y down
  nearest(q: Vec2, g: GridDef, opts: { wholeOnly: boolean }): Lattice;
  dist2Exact(a: Lattice, b: Lattice, g: GridDef): ExactScalar;   // for the arc equidistance invariant
  symmetries(g: GridDef): SymmetryOp[];                  // each maps Lattice → Lattice exactly
  tiles(g: GridDef): TileDef[];
  lines(g: GridDef): ConstructionLine[];                 // for rendering grids
}
```

- **affine** (square, slanted square, triangular, isometric, typographic): `toPlane = rotate_about_pivot((u·e1 + v·e2) / subdivision)`.
  - Square: e1 = (1, 0), e2 = (tan slant, 1). Triangular: e1 = (1, 0), e2 = (½, √3/2). Isometric: e1 = (1, k), e2 = (1, −k), with k = tan 30°, 2/3 or 1/2.
  - **Typographic is a square lattice** with labelled horizontal rows (baseline, x-height, …) placed on sub-steps. Uneven row spacing isn't needed, because subdivision gives the resolution.
  - **The rotation pivot is the whole-cell lattice point nearest the rectangle's centre.** It stays fixed and inside, so a rotated grid is never empty. Rotating about the rectangle's centre could empty a small grid (found by P1 at 2,000 runs).
- **polar:** `toPlane = (R, R) + ring/subdivision · (cos θ, sin θ)` with θ = rotation + 2π·ray/rays. Ring 0 is normalised to (0, 0). Companion square points map to (R, R) + (u, v)/subdivision. A square point on a ray is normalised to the polar point, so every position has one representation. Polar-to-square distances are exact when the ray count divides 24 and the rotation is a multiple of 15°.
- **Exact squared distances** (`src/geometry/exact.ts`) are integer combinations of [1, √2, √3, √6, t, t²], where t is the slant tangent, scaled by a constant per grid:
  - affine: the basis's quadratic form on integer deltas. The t terms appear only when the slant isn't zero, otherwise (3, 4) and (5, 0) would compare unequal.
  - polar: the law of cosines with 4·cos(m·15°) held exactly, so it's exact whenever the ray count divides 24. Other ray counts carry an approximate value compared with a 1e-12 relative tolerance, the one tolerance-based invariant (`VERIFICATION.md` §2).
  - Coefficient-wise equality is conservative: it can only refuse an arc, never accept a wrong one.

`nearest` (affine) finds the nearest lattice point ignoring the extent, using a 5 × 5 neighbourhood of the rounded inverse map. If that point is outside the extent (the pointer is off the grid), it falls back to scanning the extent. `nearest` (polar) projects the pointer onto the nearest rays (±2) and takes the best ring on each. Both are verified against a full scan by P1.

### 4.2 Contours

Derived geometry uses a single representation:

```ts
type Seg = { kind: 'L'; to: Vec2 } | { kind: 'A'; to: Vec2; centre: Vec2; r: number; sweep: 0 | 1; large: 0 | 1 };
interface Contour { start: Vec2; segs: Seg[]; closed: true; source: SourceTag[] }
```

Each arc remembers its exact centre and radius. That's what lets the boolean step turn curves back into arcs (§5.2).

### 4.3 Corners

For each closed path, with points Pᵢ and radii rᵢ:

1. **Assign each point a role.**
   - `round` → fillet. It's treated as a circle of radius 0 at Pᵢ in pass 2.
   - `outer` → a wrap circle (Pᵢ, rᵢ) on the outside, side s = +1 relative to the path's winding.
   - `inward` → a wrap circle on the inside, s = −1.
   - `auto` → +1 if the turn at Pᵢ (cross product of the incoming and outgoing directions, using the neighbours' centres) is convex, else −1.
   - r = 0 → a sharp vertex, for every type.
2. **Edges (pass 1).** For each neighbouring pair of circles (Cᵢ, sᵢ, rᵢ) → (Cⱼ, sⱼ, rⱼ), find the tangent line that touches Cᵢ on side sᵢ and Cⱼ on side sⱼ:
   - **Same side (outer tangent):** it exists if d > |rᵢ − rⱼ|.
   - **Opposite sides (cross tangent):** it exists if d > rᵢ + rⱼ.
   - If it doesn't exist, the shape is **invalid** (`SPEC.md` §9.4–9.5) and the largest radius that would work is reported.
   - For an **arc segment** between two points, the edge is the arc itself, offset by the corner circles where needed. *(Not yet built. `src/geometry/corners.ts` handles straight-segment paths, and arc segments come with strokes.)*
3. **Wrap arcs.** At each wrap point, the outline follows its circle from the incoming tangent point to the outgoing tangent point. Its direction is given by s, so the SVG `sweep` flag follows from s and the winding. `large` is set when the swept angle is over π.
4. **Fillets (pass 2).** At each `round` point, the two edges meeting there make interior angle θ. The fillet circle has radius r and is tangent to both edges, at tangent length t = r / tan(θ/2) from Pᵢ. Tangent lengths are clamped per edge (`SPEC.md` §9.4): the two corners of an edge share its length in proportion to the lengths they asked for. The clamped radius is reported, never hidden.
5. **Hairpins and limits.** A fillet at a 180° reversal has no width, so it stays sharp and is reported as clamped to 0. A wrap circle's reported limit is exclusive: at the limit the edge has zero length. When a big circle swallows a small neighbour on the same side, only the big one is reported, because the small one isn't at fault.
6. The output is a `Contour` of `L` and `A` segments. **It never contains an arc with r = 0 or endpoints that are equal.** SVG would silently treat those as a line or omit them: *"If either rx or ry is 0, then this arc is treated as a straight line segment"* and *"If the endpoint (x, y) of the segment is identical to the current point … this is equivalent to omitting the elliptical arc segment entirely"* (SVG 2, Paths, *Out-of-range elliptical arc parameters*). It also never contains an arc whose radius is too small to reach its endpoints, which SVG would *"scale up uniformly until there is exactly one solution"* (same section). A property test (`VERIFICATION.md` §2, P4) checks all three.

### 4.4 Strokes (`src/geometry/strokes.ts`)

A stroke is a centre line of line and arc segments, with a width w, a cap, a join and an end radius.
1. **Rounded centre-line corners.** Where two straight segments meet, a point with radius r > 0 gets a fillet on the **centre line**, clamped per segment like fill fillets. Every corner type does this on a stroke, because wraps, coves and filled corners are for fills. Offsetting the fillet gives concentric arcs of radius r − w/2 and r + w/2 (the isometric asterisk).
2. **Offsets.** A line offsets to a parallel line. An arc of radius R offsets to a concentric arc of radius R ± w/2, so it stays exact. If R − w/2 ≤ 0, the stroke is flagged as too wide, with its widest allowed width, and isn't drawn inside-out (`SPEC.md` §9.7).
3. **Joins** at sharp centre-line corners, on the outer side:
   - miter: SVG's miter length / width = 1/sin(φ/2), limit 4, falling back to bevel
   - round: an arc of radius w/2 centred on the corner
   - bevel

   On the inner side, two straight offsets are trimmed to their crossing. Anything else passes through the corner point, and the overlap is resolved by the boolean pass.
4. **Caps:** butt, square (extended by w/2) or round (a half circle). **End radius** e fillets the two corners of butt and square caps, clamped to w/2 and, for butt, to half the end segment. Closed strokes produce two contours: the outer, and the inner reversed.

**Current limits** (each reported as an issue, never silently approximated):
- Centre-line fillets only form between two straight segments. Corners touching an arc segment are joined, not rounded.
- End radius needs a straight end segment (`end-radius-on-arc`).
- Overlaps at non-straight inner joins wait for the boolean pass.

Closed-form checks in `tests/geometry.strokes.test.ts`: rectangle w·L, round caps w·L + π(w/2)², square caps (L + w)·w, miter, round and bevel at a right angle, concentric corner arcs w·(legs + πr/2), half annulus w·πR, rings, and end radius w·L − 4(1 − π/4)e².

### 4.5 Repeats (`src/geometry/repeat.ts`)

`expandRepeat(contours, repeat)` applies exact plane transforms to a shape's **outline contours**: rotation about the centre, reflection in a line, or translation. Lines map to lines, and arcs map to arcs (centres move, radii stay, and the sweep sign flips under a reflection). Copies are derived, so the lattice invariant, which is about stored points, isn't affected. Copies inherit the role and paint, are tagged with their source id for selection, and enter the boolean fold together with their source. **Detach** is only offered when the grid's own `SymmetryOp`s can reproduce the copies on lattice points.

## 5. Pipeline (`src/pipeline/`)

```
LogoDocument
  → resolve      expand symmetry; resolve named radii; map Lattice → Vec2 (cells)
  → outline      per shape: corners (fill) or offset (stroke) → Contour[]; collect invalids
  → boolean      fold shapes in order: add = unite, cut = subtract, intersect = intersect
                 (skipped when there is a single add shape with no self-intersection)
  → recover      Paper.js cubics → L/A segments matched to source circles
  → joints       fillet corners whose two edges come from different shape instances (repeat copies
                 count as different instances), using the later shape's jointRadius. One construction
                 for L–L, L–A and A–A: offset both edges by ρ towards the turn, cross the offsets for the
                 centre, project back for the tangent points; accept only a centre exactly ρ from both
                 edges; clamp by bisection when it doesn't fit (src/pipeline/joints.ts)
  → pieces       split into connected pieces: each outer contour + the holes inside it
  → Mark         { pieces: Piece[], invalid: Issue[], clamped: Issue[] }
```

The pipeline is a pure function `(doc) → Mark`, memoised by document identity. The canvas and export both consume the same `Mark`, which is how "the canvas and the export are the same thing" is enforced.

### 5.1 Boolean adapter

```ts
interface BooleanEngine {
  fold(ops: { op: 'add' | 'cut' | 'intersect'; contours: Contour[] }[]): CubicContour[];
}
```

`paper-adapter.ts` converts contours to Paper paths (arcs via `arcTo`) and applies `unite`, `subtract` and `intersect` with `{ insert: false }`. Paper.js's own JSDoc describes them:
- `unite`: *"Unites the geometry of the specified path with this path's geometry and returns the result as a new path item."*
- `subtract`: *"Subtracts the geometry of the specified path from this path's geometry …"*
- `insert`: *"whether the resulting item should be inserted back into the scene graph"* (`src/path/PathItem.Boolean.js`).

Paper.js approximates arcs with cubics of at most 90°: *"Calculate amount of segments required to approximate over `extend` degrees (extend / 90)"* (`src/path/Path.js`, `addArc`). So its output is cubic and needs §5.2.

**First implementation task (a spike):** confirm the Paper core build runs boolean operations in the browser without a visible canvas, and in Node through `paper-jsdom`. Its README states: *"`paper-jsdom` is a shim module for Node.js, offering headless use with SVG importing and exporting through jsdom."* If either fails, stop and report before building on it.

### 5.2 Arc recovery

Every source arc's (centre, r) is known. For each cubic in the boolean result:
1. **Classify** each cubic as a line (control points on the chord, matched to the source line it lies on), or an arc matched to a source circle. Its ends and ¼, ½ and ¾ points must lie within max(1e-5, 1e-3·r), and the closest circle wins. Paper's arc cubics sit about 2.7e-4·r off the true circle, so this is about 4× that. Measured on 5,445 random shapes, it gives 0 failures, while 1e-4·r failed about 3%.
   **Exact corners:** every corner is then recomputed as the exact crossing of its two neighbours (line–line, line–circle, circle–circle). Paper computes crossings between its approximations, so its corner points are slightly off the true geometry.
   **Arcs reach Paper as our own cubics** (≤ 90°, control length 4/3·tan(θ/4)·r), because Paper's `arcTo` throws on tiny, nearly straight arcs.
2. Merge consecutive cubics on the same circle into one `A` segment (splitting at 180° so `large` stays meaningful).
3. Cubics whose control points are collinear with their endpoints become `L`.
4. Anything left unmatched is a **pipeline error**: it fails loudly in development and is reported as an issue in production. It's never exported as a cubic, because the model can't create one.

### 5.3 Pieces

Contours are grouped by containment: each outer contour (counter-clockwise in screen space after normalisation) gets the holes directly inside it, as `nonzero` subpaths with reversed winding. Each piece becomes one `<path>`. That preserves the "one path per piece, holes as subpaths" convention from the references.

## 6. Rendering (`src/render/`)

- One `<svg>` with `viewBox` in **cells**. Zoom and pan change only the `viewBox`, never transforms on content, so the canvas DOM mirrors the export.
- Layers are drawn in this order: grid → construction (radius circles, axes, cut outlines) → mark → points → selection → snap preview → lattice cursor. Each is a memoised Preact component keyed on the inputs it uses.
- **The mark is drawn with the same SVG path writer the export uses** (`export/write-path.ts`) at canvas precision.
- Canvas strokes use `vector-effect="non-scaling-stroke"` (`DESIGN.md` §4).
- Hit-testing works in cells: the pointer is mapped to cells once, then `GridKind.nearest` and contour distance tests run in `geometry/`.

## 7. Export (`src/export/`)

1. **Bounds:** the mark's tight bounds in cells, plus `paddingCells`.
2. **Write:** `write-path.ts` emits absolute `M L H V A Z`, with arcs as `A r r 0 large sweep x y`.
   - Coordinates are in export units (`unitsPerCell`, default chosen so the long side is 512).
   - Square, rows and affine 2:3 / 1:2 grids give integer coordinates when `unitsPerCell` allows. Other grids are rounded to 3 decimal places.
   - Output order is fixed (pieces sorted by top-left of bounds, then by contour), so it's deterministic.
3. **SVGO** with `preset-default` and these overrides:
   - **`mergePaths: false`**, so each piece stays its own `<path>`. SVGO documents the plugin as *"Merge multiple paths into one."*
   - **`convertPathData: { floatPrecision: 3, smartArcRounding: false }`**. smartArcRounding is documented as *"Round the radius of circular arcs when the effective change is under the error"*. Turning it off keeps radii identical to the model.
   - **`cleanupIds: { preserve: ['construction'] }`**, because SVGO otherwise removes ids nothing references, which would drop the overlay group's name.
   - SVGO's `preset-default` doesn't include `removeViewBox`: the preset's plugin list in its docs omits it, so the `viewBox` survives.
   - SVGO 4.1.0. The app loads its browser build (`svgo/browser`, about 800 KB) on demand, starting once the app is idle, so first load stays small and Copy SVG can run inside the click. Tests use the Node build with the same config (`src/export/svg.ts`, `SVGO_CONFIG`).
4. **Root:** `<svg xmlns width height viewBox>`, one `<path d fill>` per piece, and optionally `<g id="construction">` first (`DESIGN.md` §8). No `transform`, `style`, `class` or `id` on the mark.
5. **PNG:** the exported SVG, resized to the target pixels, is drawn to a `<canvas>` at the chosen size through an `Image` from a Blob URL, then encoded as PNG. (A plain canvas works everywhere the app runs; `OffscreenCanvas` adds nothing for a one-off render.) Fonts aren't involved: the overlay has no text.
6. **Clipboard:** `navigator.clipboard.writeText(svg)` inside the click or keyboard handler. On rejection, a text area with the selected SVG is shown.

## 8. State, commands and history (`src/model/`, `src/ui/store.ts`)

```ts
interface Command<A = unknown> { type: string; args: A }        // serialisable, named
type Reducer = (doc: LogoDocument, cmd: Command) => LogoDocument | CommandError;

interface History { past: Entry[]; present: LogoDocument; future: Entry[] }
interface Entry { doc: LogoDocument; label: string; selection: Selection }
```

- All edits are `dispatch(command)`. Reducers are pure and return a new frozen document. The command pattern is required by `CLAUDE.md`.
- `undo` pops `past` into `present`; `redo` is the mirror. Because entries hold the *same* document objects, undo then redo is identical by reference, not just deep-equal.
- **Coalescing:** a pointer drag is one entry (committed on pointer up, previewed with a transient document). Arrow nudges within 600 ms on the same selection, and repeated `[ ]` presses within 600 ms, merge into one entry.
- History is capped at 500 entries.
- UI state (mode, selection, hover, viewport, dialogs) lives outside the document and outside history. Each `Entry` keeps the selection so undo can restore it.

## 9. Persistence (`src/persist/`)

- **Autosave:** `localStorage['logo-tool:doc']` holds `JSON.stringify(doc)`, debounced 500 ms after a committed command. Every read and write is wrapped in try/catch. A failure switches to "Not autosaving" (`DESIGN.md` §6).
- **Project file:** `<name>.logo.json`, the same JSON plus `{ app: 'logo-tool', schema }`.
- **Open:** parse, then `migrate(schema → current)`, then `validate` (§3 invariants). Any failure refuses the file with a specific message.

## 10. Test strategy

| Layer | Tool | What |
|---|---|---|
| `geometry/`, `grids/` | Vitest + fast-check | Unit tests per function, plus the property suite P1–P8 (`VERIFICATION.md` §2). |
| `boolean/` | Vitest + `paper-jsdom` | Adapter round trips, arc recovery properties (P6), and known hard cases: shared edges, tangent circles, coincident arcs. |
| `pipeline/` | Vitest | Golden marks: fixed documents → exported SVG string snapshots (reviewed when they change). |
| `model/` | Vitest + fast-check | Random command sequences: invariants hold after every step, and undo/redo is exact (P3). |
| `export/` | Vitest + SVGO + Playwright Chromium | Structural export checks (`VERIFICATION.md` §3), idempotence, and PNG size and transparency. |
| Rebuild tests | Playwright Chromium + pixelmatch | The 13 reference rebuilds (`VERIFICATION.md` §1). |
| UI | Playwright | Keyboard-only core flow, every `SPEC.md` §6 flow, reduced motion, focus visibility. |

- `npm test` runs everything except Playwright. `npm run test:e2e` runs Playwright with `--trace off`.
- CI (GitHub Actions) runs both on every push. The geometry and export suites run before and after any change to `src/geometry/`, `src/grids/` or `src/export/`, as `CLAUDE.md` requires.
- fast-check runs 200 cases per property locally and 2,000 in CI. Failing seeds are printed and pinned as regression cases.
