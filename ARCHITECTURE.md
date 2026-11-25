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

```ts
type Int = number;                       // always an integer; checked by assertInt() at boundaries

/** A lattice point in sub-step units of the document's grid. (27, 8) with subdivision 8 = (3⅜, 1). */
interface Lattice { u: Int; v: Int }

/** Lengths (radius, stroke width) in 1/240 of a cell. 240 is divisible by every allowed subdivision. */
type Len240 = Int;

type CornerType = 'auto' | 'outer' | 'round' | 'inward';

interface Vertex {
  id: string;                            // "v12"; ids come from doc.nextId, never random
  at: Lattice;
  corner: CornerType;
  radius: Len240 | { ref: string };      // a literal, or a named radius
}

type Segment =
  | { kind: 'line' }
  | { kind: 'arc'; centre: Lattice; sweep: 0 | 1 };   // sweep as in SVG's sweep-flag

interface Path {
  vertices: Vertex[];                    // segments[i] joins vertices[i] → vertices[i+1 (mod n if closed)]
  segments: Segment[];
  closed: boolean;
}

type Paint =
  | { kind: 'fill' }
  | { kind: 'stroke'; width: Len240; cap: 'butt' | 'round' | 'square'; join: 'miter' | 'round' | 'bevel' };

interface Shape {
  id: string;
  path: Path;
  paint: Paint;
  role: 'add' | 'cut' | 'intersect';
  jointRadius: Len240;                   // fillets corners created where this shape meets the result so far
}

type GridDef =                           // src/grids/types.ts is the source of truth
  | { kind: 'affine'; preset: 'square'; subdivision; width; height; slantDeg; rotationDeg }
  | { kind: 'affine'; preset: 'triangular'; subdivision; width; height; rotationDeg }
  | { kind: 'affine'; preset: 'isometric'; subdivision; width; height; ratio: 'true30' | '2:3' | '1:2'; rotationDeg }
  | { kind: 'affine'; preset: 'typographic'; subdivision; width; height; rows: { name; at /* sub-steps from top */ }[] }
  | { kind: 'polar'; preset: 'polar'; subdivision /* rings */; rings; rays; rotationDeg };
// width/height are whole cells. The extent is the rectangle [0, width] × [0, height] (polar: [0, 2·rings]²
// with the centre at (rings, rings)); lattice points are every (u, v) whose position lies inside it.

type Symmetry =
  | { kind: 'none' }
  | { kind: 'mirror'; axis: string }      // axis id from the grid's symmetry group
  | { kind: 'rotate'; order: Int };       // must divide the grid's native order

interface LogoDocument {
  schema: 1;
  name: string;
  nextId: Int;
  grid: GridDef;
  shapes: Shape[];                       // evaluation order = array order
  radii: { id: string; name: string; value: Len240 }[];
  symmetry: Symmetry;
  export: { colour: string; paddingCells: number; overlay: 'off' | 'dark' | 'light';
            pngSize: 512 | 1024 | 2048 | 4096; pngBackground: 'transparent' | 'white' | 'overlay';
            unitsPerCell: Int };
}
```

**Invariants**, checked by `model/validate.ts` on every command result and on file open:
1. Every `Lattice` and every arc `centre` is integral and inside `grid.extent`.
2. For every arc, `dist²(centre, start) === dist²(centre, end)`, computed exactly in lattice integers using the grid kind's exact metric (§4.1).
3. No two consecutive vertices are equal. A closed fill has at least 3 distinct vertices.
4. Every `{ ref }` names an existing radius.
5. `symmetry` is in the grid's native group.

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
- **polar:** `toPlane = (R, R) + ring/subdivision · (cos θ, sin θ)` with θ = rotation + 2π·ray/rays. Ring 0 is normalised to (0, 0).
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
   - For an **arc segment** between two points, the edge is the arc itself, offset by the corner circles where needed.
3. **Wrap arcs.** At each wrap point, the outline follows its circle from the incoming tangent point to the outgoing tangent point. Its direction is given by s, so the SVG `sweep` flag follows from s and the winding. `large` is set when the swept angle is over π.
4. **Fillets (pass 2).** At each `round` point, the two edges meeting there make interior angle θ. The fillet circle has radius r and is tangent to both edges, at tangent length t = r / tan(θ/2) from Pᵢ. Tangent lengths are clamped per edge (`SPEC.md` §9.4): the two corners of an edge share its length in proportion to the lengths they asked for. The clamped radius is reported, never hidden.
5. The output is a `Contour` of `L` and `A` segments. **It never contains an arc with r = 0 or endpoints that are equal.** SVG would silently treat those as a line or omit them: *"If either rx or ry is 0, then this arc is treated as a straight line segment"* and *"If the endpoint (x, y) of the segment is identical to the current point … this is equivalent to omitting the elliptical arc segment entirely"* (SVG 2, Paths, *Out-of-range elliptical arc parameters*). It also never contains an arc whose radius is too small to reach its endpoints, which SVG would *"scale up uniformly until there is exactly one solution"* (same section). A property test (`VERIFICATION.md` §2, P4) checks all three.

### 4.4 Strokes

A stroke's outline is built from its path with all corners treated as sharp centre-line vertices (corner settings apply to fills only), then offset by ±w/2:
- **Line segments** offset to parallel lines.
- **Arc segments** offset to concentric arcs with r ± w/2, which are exact circular arcs. If the inner r − w/2 ≤ 0, the offset is clamped to the centre and the shape is flagged (`SPEC.md` §9.7).
- **Joins:** miter (a line intersection, falling back to bevel past a miter limit of 4), bevel (a line), or round (an arc of radius w/2 centred on the vertex).
- **Caps:** butt, square (extended by w/2), or round (a half-circle).

The result is one closed contour per stroke, or two for a closed stroke: outer, plus inner reversed. It can self-overlap at tight joins. The boolean pass resolves that.

### 4.5 Symmetry

`expandSymmetry(shapes, symmetry, grid)` applies the grid's exact `SymmetryOp`s to **lattice coordinates** (not plane points). Copies are therefore exact lattice shapes. Copies inherit the role and paint, and are tagged with their source id for selection.

## 5. Pipeline (`src/pipeline/`)

```
LogoDocument
  → resolve      expand symmetry; resolve named radii; map Lattice → Vec2 (cells)
  → outline      per shape: corners (fill) or offset (stroke) → Contour[]; collect invalids
  → boolean      fold shapes in order: add = unite, cut = subtract, intersect = intersect
                 (skipped when there is a single add shape with no self-intersection)
  → recover      Paper.js cubics → L/A segments matched to source circles
  → joints       fillet corners whose two segments come from different shapes, using the
                 later shape's jointRadius (L–L, L–A, A–A fillets, solved analytically; clamped)
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
1. Check it against the source circles touching its endpoints. It belongs to a circle if both endpoints, the curve's midpoint and the ¼ and ¾ points lie within ε = 1e-6 cells of that circle's radius.
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
   - SVGO's `preset-default` doesn't include `removeViewBox`: the preset's plugin list in its docs omits it, so the `viewBox` survives.
4. **Root:** `<svg xmlns width height viewBox>`, one `<path d fill>` per piece, and optionally `<g id="construction">` first (`DESIGN.md` §8). No `transform`, `style`, `class` or `id` on the mark.
5. **PNG:** the exported SVG is drawn to an `OffscreenCanvas` (with a `<canvas>` fallback) at the chosen size through an `Image` from a Blob URL, then encoded as PNG. Fonts aren't involved: the overlay has no text.
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
