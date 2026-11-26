# SPEC — Geometric logo construction tool

Behaviour of the tool. Visual treatment is in `DESIGN.md`, structure in `ARCHITECTURE.md`, and proof in `VERIFICATION.md`. Reasons for decisions are in `DECISIONS.md`.

## 1. Purpose

A browser tool for constructing **one geometric mark at a time** on a lattice. Every point the user creates lies exactly on the chosen grid. Outlines are built from straight lines and circular arcs only. The output is a clean SVG (and PNG) that looks the way the canvas does, optionally with its construction drawn behind it.

Target user: a designer who builds marks from a grid, strokes first, then fills, then rounding (see the designer's notes in `DECISIONS.md`). Target marks: the 13 rebuildable references in `/references` and the kind of geometric mark found in stock "geometric logo" sheets. Those sheets are capability targets only.

## 2. Non-goals

These are deliberately out of scope. Any one of them would push the tool towards a general editor.

- Free drawing or a general pen tool. Every point snaps to the lattice, always.
- Curves other than straight lines and circular arcs: no ellipses, free Béziers or superellipses (this rules out p-logo-2's elliptical bowl).
- Layers panel, groups, effects, gradients, textures, opacity, blend modes.
- Interlaced or over/under strokes (woven knots).
- More than one mark per document, glyph sets, type specimens, font export. The data model must not block a future typeface mode (motion-logo shows the need), but v1 doesn't build it.
- Multi-centre polar grids (p-logo-6).
- Text tools, image import, tracing.
- Accounts, cloud saving, collaboration, AI features.
- Touch and mobile editing. The tool is desktop only, and narrow viewports show a notice.
- Exporting live SVG strokes. Strokes are always outlined.

## 3. Glossary

| Term | Meaning |
|---|---|
| **Grid** | The chosen lattice definition: its type, size, subdivision and parameters. |
| **Lattice point** | A position the grid allows. It includes sub-steps when subdivision is more than 1. |
| **Cell** | The grid's unit. All sizes in the interface are shown in cells (e.g. radius 0.30). |
| **Point** | A vertex the user placed. It always sits on a lattice point. It has a corner type and a radius. |
| **Segment** | The connection between two consecutive points: a **line**, or an **arc** centred on a lattice point. |
| **Shape** | An ordered list of points and segments with a **paint** (fill, or stroke with width, cap and join) and a **role** (add, cut or intersect). |
| **Mark** | The result of evaluating all shapes in order, plus symmetry. This is what is exported. |
| **Construction** | Everything that isn't the mark: grid lines, lattice points, radius circles, symmetry axes, cut outlines. |

## 4. Screens and layout

There is **one working screen** plus two dialogs. Exact sizes, colours and type are in `DESIGN.md`.

### 4.1 Working screen

```
┌──────────┬──────────────────────────────────────────────┐
│          │  ruler (cells)                               │
│  RAIL    │ ┌──────────────────────────────────────────┐ │
│  240 px  │ │                                          │ │
│          │ │              CANVAS (SVG)                │ │
│ mark     │ │      grid · construction · mark          │ │
│ grid     │ │                                          │ │
│ mode     │ └──────────────────────────────────────────┘ │
│ point    │  hint line (context shortcuts / messages)    │
│ shape    │                                              │
│ symmetry │                                              │
│ export   │                                              │
└──────────┴──────────────────────────────────────────────┘
```

- **Rail** (left, fixed width). From top to bottom:
  1. **Mark:** name (editable), the project menu (New, Open project file, Save project file, Examples), undo and redo.
  2. **Grid:** type (read-only once points exist), size in cells, subdivision, and type parameters (slant, isometric ratio, rotation, polar rings and rays, typographic rows). Also snap targets (whole cells / sub-steps).
  3. **Mode:** Place · Adjust · Tile.
  4. **Point** (shown when points are selected): coordinates, corner type (auto, outer, round, inward), radius. Mixed values in a multi-selection show as "mixed".
  5. **Shape** (shown when a shape is selected): paint (fill/stroke), stroke width, cap and join, role (add/cut/intersect), plus actions: mirror, rotate by the grid step, duplicate, delete.
  6. **Symmetry:** off, or the grid's own symmetries (§6.9).
  7. **View:** grid lines, construction circles, paper preview.
  8. **Export…** (primary action) and **Copy SVG**, pinned to the bottom of the rail so they stay reachable while it scrolls.
- **Canvas** fills the rest. It shows a cell ruler along the top and left edges, the grid, construction, the mark, points, selection and the snap preview. It pans and zooms but doesn't rotate.
- **Hint line** is pinned under the canvas. It shows 3–5 shortcuts for the current mode and state, and replaces them for 4 s with a status message after an event (e.g. "Radius clamped to 0.42 at (3, 1)"). It's also an `aria-live="polite"` region.

### 4.2 New-mark dialog

Opens on first visit, and from **New**. It has two parts:
- **Grid type**, a vertical list with a live mini-preview of each lattice: Square, Triangular, Isometric, Polar, Typographic. Choosing one shows its parameters with defaults (§5).
- **Examples:** 2–3 rebuilt reference marks (e.g. p-logo-1, e-logo-3, motion-logo). These open as normal, editable documents.

The dialog has no "skip". Closing it with Esc keeps the current document, or creates a default square 6 × 6 document on first visit.

### 4.3 Export dialog

A modal over the canvas. It has:
- a format (SVG / PNG)
- a mark colour (default `#000000`; any single hex)
- padding in cells (default 0)
- a construction overlay (off / dark / light)
- PNG size (512 / 1024 / 2048 / 4096 px on the long side) and background (transparent / white). With the construction overlay on, the PNG uses the overlay's own background, and the choice is disabled.
- a live preview, which is the exact output
- buttons: **Download** and **Copy SVG**

The dialog lists any blocking problems (§9) with a "Show" link that closes it and selects the offending point.

## 5. Grid types (v1)

All grids are data definitions (see `ARCHITECTURE.md` §3). Defaults are in brackets.

| Type | Parameters | Native symmetry | Tiles (Tile mode) | Covers |
|---|---|---|---|---|
| **Square** | columns × rows [6 × 6], subdivision [1], slant −45…45° [0], rotation [0] | mirror H/V, 90° rotation | square, 4 right triangles, 4 quarter-discs, 2 half-discs per cell pair | p-logo-1, e-logos, motion, m-logo-2, p-logo-3; p-logo-4 (slant) |
| **Triangular** | size [6], subdivision [1], rotation [0] | mirror (6 axes), 60° rotation | 2 triangles per rhombus cell | a-logo, node-logo (rotation 15°) |
| **Isometric** | size [6], subdivision [1], ratio: true 30° / 2:3 / 1:2 [true 30°] | mirror V, 180° rotation (120° when true 30°) | rhombus faces, triangles | e-logo-4 (2:3), p-logo-7 |
| **Polar** | rings [6], rays [24], subdivision (ring) [1], rotation [0], companion square lattice [off] | n-fold rotation for n dividing the ray count; mirror on any ray. With the companion lattice on: only 2- and 4-fold rotation and mirrors at multiples of 45°. | annular sectors, triangles (centre wedges) | p-logo-5, node-logo (alt.), m-logo-1 (companion on) |
| **Typographic** | 12 × 8 cells, subdivision [2], named rows measured from the top on an 8-cell em [ascender 0, cap height 0.5, x-height 2, baseline 6, descender 8], i.e. ascender 0.75 em, cap ≈ 0.69 em, x-height 0.5 em, descender 0.25 em | mirror left–right | square, quarter-discs | motion-logo (alt.) |

- Grid **type** is fixed once the document has a point. Size, subdivision, slant, ratio and rotation can change only if every existing point (and arc centre) maps to an exact lattice point under the new parameters. Otherwise the change is refused with a message naming how many points wouldn't map.
- Subdivision options: 1, 2, 3, 4, 6, 8. Maximum grid: 24 × 24 cells (polar: 24 rings × 360 rays).
- **Companion square lattice (polar).** An axis-aligned square lattice with the polar grid's unit and centre, for building frames around rays (m-logo-1 and stock "rays in a square" marks). Where a square point falls on a ray, it is the same point as the polar one.

## 6. User flows

Shortcuts are listed in full in §8. Each flow is written for the pointer, with the keyboard path in brackets.

### 6.1 Choose a grid
1. In New mark, choose a type and adjust its parameters. The preview updates.
2. **Create**. The canvas opens empty, in **Place** mode, fitted to the grid.
3. Empty state: the canvas shows the grid, and the hint line says *"Click a grid point to start a shape · Examples are in the project menu"*.

(Keyboard: arrows move through the type list, Tab moves to parameters, Enter creates.)

### 6.2 Place points
1. In Place mode, the pointer shows a **snap preview** at the nearest lattice point (§7.1).
2. Click to place the first point of a new shape. Each further click adds a point, and a **rubber-band segment** previews the next segment from the last point to the snap preview.
3. Backspace removes the last placed point while placing. Esc ends placing. A shape with 2 or more points is kept as an open path (§6.3). A single point is discarded.

(Keyboard: arrows move a visible **lattice cursor** one sub-step, Shift+arrows one cell, Space places a point at the cursor.)

### 6.3 Connect
- **Line segments** are the default.
- **Arc segment:** press A while placing to arm arcs (A again, or Esc, returns to lines), or hold Alt while clicking the next point (Alt+Space with the keyboard). A stays armed for the following segments. Alt alone can't be used to preview, because Alt+Tab belongs to the operating system. The tool offers only centres that are **lattice points the same distance from both ends**, nearest radius first. Tab and Shift+Tab cycle the candidates, and the preview shows the circle and the arc. If no candidate exists, the hint line says *"No lattice point is the same distance from both ends. This segment can only be straight."* and the click places a line.
- **Drawing is stroke-first.** While you place points, the path is drawn as a line at the current **line width** (set in the rail), so diagonal and straight parts read at the same true width. A band built from grid points as a filled shape is measured horizontally, so at 45° it is only about 71% as thick as a straight band; strokes avoid this.
- **Close as fill:** click the shape's first point, or press C. Closing turns the line into a filled shape, then switches to **Adjust** with the new shape's points selected, so R and `[ ]` work straight away. P returns to drawing.
- **Circle:** a filled shape with a single point and a radius is a circle centred on that point. Press O in Place mode to start one, then use `[ ]` for its radius.
- **Finish as a line:** press Enter with an open path. It stays a stroke (default width 1/8 cell, the minimum, round caps, round joins, end radius 0) and Adjust opens with its points selected. Shift+C closes a path as a stroke (a ring).
- **Stroke corners and ends.** On a stroke, a point's radius rounds the **centre line**, giving concentric inner and outer arcs. The **end radius** (Shape section) softens the corners of butt and square ends.
- Any shape can switch between fill and stroke with S. Switching an open path to fill closes it.

### 6.4 Adjust a point
1. Switch to **Adjust** (V). Click a point to select it; it shows its selection ring and coordinates (e.g. `(3, 1)`).
2. Drag to move it. It snaps live. The original position stays as a hollow ghost until the drag ends, and the hint line shows the offset (e.g. `Δ +1, −0.5`).
3. Arrows nudge one sub-step (Shift: one cell).
4. Moving a point onto its neighbour merges them (§9.1).

### 6.5 Round a corner
1. Select one or more points. Drag the **radius handle** on the right of the last selected point's selection ring (right to increase, left to decrease; one cell of drag is one cell of radius; snaps to 1/24 cell, or to the sub-step with Shift), press `]` or `[` to change the radius by one sub-step (Shift: one cell), or use the rail. 0 removes rounding. A line's end points have no corner, so they show no handle.
2. The radius is always **drawn as a circle** (§7.4). Typed values snap to multiples of 1/240 of a cell.
3. **Named radii:** "Save radius" in the Point section stores the current value as a named radius (e.g. `r1 = 0.30`). Points can use a named radius, and changing it updates them all. That's how a mark keeps one consistent radius (see e-logo-3).

### 6.6 Choose a corner type
Press R to cycle auto → outer → round → inward (Shift+R reverses), or use the segmented control. The geometry is defined in §7.3 and `ARCHITECTURE.md` §4.

| Type | What it does | Use |
|---|---|---|
| **auto** | outer where the outline turns convex, inward where it turns concave | evenly soft shapes, merged circles |
| **outer** | outline wraps around the outside of a circle centred on the point | round ends, bulbs, teardrops |
| **round** | classic fillet: the corner stays on the point and an arc of the radius replaces the tip | crisp shapes with rounded corners (e-logo-3) |
| **inward** | outline wraps the inside of a circle centred on the point, biting a concave arc | star cut-ins, node-logo's centre |

**Against the corner.** Inward on a **convex** corner makes a **cove**: the disc of radius r centred on the point is removed, leaving a quarter-circle scoop that meets both edges r from the point, with crisp corners there. Outer on a **concave** corner makes a **filled corner**: the disc is added into the notch, the same way. Both clamp to the room on their edges (§9.4).

At radius 0 all four types give a sharp corner exactly on the point.

### 6.7 Add a cutout (and merge or intersect)
1. Draw a shape where it should cut. Select it and press 2 (or choose **Cut** in the Shape section) to set its role. 1 = **Add** (default) and 3 = **Intersect**.
2. Shapes are evaluated in creation order: the mark starts empty, then each shape adds to, cuts from or intersects the result so far. Cmd+[ and Cmd+] move the selected shape earlier or later in that order. There's no list panel (see the non-goals).
3. Cut shapes draw their outline as a dashed construction line on the canvas, so you can still select and edit them.
4. All boolean operations are **live**: moving a point of a cut shape updates the mark. Results are never baked in, because intersection points are generally not lattice points.
5. **Joint radius.** Every shape has a joint radius (default 0). Corners that the boolean operation *creates*, where this shape's outline crosses the result so far, are rounded with fillets of that radius. Corners at the shape's own points keep their per-point settings. Joint fillets are drawn as fillet circles like round corners, and are clamped the same way (§9.4). Set it in the Shape section, or with Alt+`[` and Alt+`]`. This is how rays clipped by a frame get rounded clip corners (m-logo-1).

### 6.8 Tile mode (cell fill)
1. Press T. Hovering a cell previews the current tile in it.
2. Click to place the tile as a new shape (normal points and segments, fully editable later). Space cycles tile shapes, R rotates the tile, Shift+click places and keeps the same tile for the next click, and Alt+click deletes the tile-made shape under the pointer.
3. The tiles available depend on the grid (§5).

### 6.9 Repeat (per shape)
- Each shape has its own **repeat**, set in the Shape section (Y cycles through common options):
  - **off**
  - **rotate ×n** about a centre lattice point, for any n from 2 to 360, optionally also mirrored
  - **mirror** in a line through a lattice point
  - **along a line ×n** by a lattice step

  The centre, axis or step shows on the canvas while the shape is selected. In this build the rail sets the type, count, mirror and step, and the centre and mirror axes are the lattice point nearest the grid centre. Choosing the centre by clicking comes later.
- Repeats are **live**: you edit the source shape, and the copies are derived from it exactly each time. Copies aren't stored points, so they don't have to land on lattice points. An 8-fold repeat on a square grid is allowed. Copies at angles the grid doesn't share export with 3-decimal coordinates.
- Copies take part in merge, cut and intersect exactly like their source, in the source's place in the evaluation order. Their points can't be selected, and clicking a copy selects its source.
- **Detach** turns copies into ordinary shapes. It's only offered when every copy's points land on lattice points (for example a 4-fold repeat on a square grid). Otherwise it's disabled, and its tooltip says why.
- One-off transforms (Shift+H mirror horizontally, Shift+V mirror vertically, E / Shift+E rotate by the grid step) apply to the selected shapes. They're only offered when the result stays on the lattice, because they change stored points.

### 6.10 Export
1. Press Cmd+E or choose **Export…**. The dialog opens with the last-used settings (§4.3).
2. Choose the format and options. The preview is the exact output.
3. **Download** saves `<mark-name>.svg` or `<mark-name>-<size>.png`. **Copy SVG** places the SVG markup on the clipboard. Cmd+Shift+C copies straight from the canvas without opening the dialog. If the browser refuses the clipboard, the dialog shows the SVG in a selected text box to copy by hand.
4. If any shape is invalid (§9), Download and Copy are disabled and the problems are listed with "Show".

### 6.11 Save and open
- **Autosave:** the document is saved in browser storage on every committed change (debounced 500 ms). Reopening the tool restores it. If storage is unavailable, the hint line warns once: *"Autosave is off in this browser. Use Save project file."*
- **Save project file** (Cmd+S) downloads `<mark-name>.logo.json`. **Open project file** (Cmd+O) loads one, replacing the current document. Opening is undoable as one step.
- Files carry a schema version. Older versions are migrated, and newer ones are refused with a message.

## 7. Interaction rules

### 7.1 How snapping feels
- **There's no free position, ever.** The snap preview is always at the nearest allowed lattice point (whole cells, or sub-steps when that snap target is on). Hold Ctrl to snap to whole cells only, temporarily.
- **It's instant.** The preview jumps with no easing or animation. Precision matters more than smoothness here.
- **Hysteresis:** the preview only switches to a new lattice point when the pointer is at least 10% of a sub-step closer to it than to the current one. That prevents flicker on boundaries.
- The snap preview shows its coordinates when the pointer rests for 400 ms.
- **Points outside the grid extent can't be placed.** The preview clamps to the grid edge.

### 7.2 Selecting
- **Click a point:** select only that point. **Shift-click:** add it to or remove it from the selection.
- **Click inside a shape's fill or stroke:** select the shape (all its points, plus the Shape section in the rail).
- **The selected shape is outlined** in the selection colour (over a dark halo), so it stands out even when every shape has the same fill — including cut shapes drawn on top of others.
- Working on the canvas takes keyboard focus back from the rail, and rail dropdowns hand focus back after a choice, so shortcuts keep working. With overlapping shapes, the one latest in evaluation order wins; Alt-click selects the next one below.
- **Drag on empty canvas:** box-select points inside the box, replacing the selection. **Shift-drag:** add to the selection. **Alt-drag:** remove from it.
- **Click empty canvas or press Esc:** clear the selection.
- **Tab / Shift+Tab** move to the next or previous point along the current shape. Cmd+A selects all points of the current shape, and Cmd+Shift+A selects all points.
- Selection isn't part of the document, but undo restores the selection that was active when the undone step happened.

### 7.3 Corners: rules users can rely on
- A point's radius is a **wish**. The geometry shows what's possible:
  - A **round** fillet that doesn't fit is clamped. The circle turns to the clamped colour, and the rail shows the actual and requested values (e.g. "0.42 of 0.80").
  - An **outer**, **inward** or **auto** corner that has no valid tangent makes the shape **invalid** (§9.3).
- Corners never change shape order or move other points.

### 7.4 What's drawn instead of numbers
- **Radius circles:** for outer and inward corners, centred on the point. For round fillets, centred inside the corner (the true fillet circle). Inward circles are dashed. They show for selected points always, and for all points when construction circles are on.
- **Arc segments** show their centre as a small cross while the shape is selected.
- **Stroke width** shows as two thin offset guides along the stroke while it's selected.
- **Symmetry** shows axes or a centre mark.

### 7.5 Modes
- **Place, Adjust and Tile** are explicit modes, shown in the rail and by the cursor. The current mode is always visible. Shortcuts that would have no effect in the current mode do nothing; they never switch mode silently.
- Holding Cmd temporarily switches to Adjust while held (in Place or Tile), so you can select without changing mode.

## 8. Keyboard shortcuts

Cmd means Ctrl on Windows and Linux. All shortcuts are listed in a sheet opened with `?`.

**Global**

| Key | Action |
|---|---|
| P / V / T | Place / Adjust / Tile mode |
| Cmd+Z, Cmd+Shift+Z (or Cmd+Y) | Undo, redo |
| Cmd+S / Cmd+O | Save / open project file |
| Cmd+E | Export dialog |
| Cmd+Shift+C | Copy SVG |
| `\` | Paper preview (mark in export colour on white) |
| G / Shift+G | Grid lines / construction circles on or off |
| Y | Cycle the selected shape's repeat |
| Cmd+= / Cmd+− / Cmd+0 | Zoom in / out / fit grid |
| Space+drag, or scroll | Pan |
| Esc | Cancel the current action, then clear the selection |
| ? | Shortcut sheet |

**Place**

| Key | Action |
|---|---|
| Click / Space | Place point at snap preview / lattice cursor |
| Arrows / Shift+arrows | Move lattice cursor one sub-step / one cell |
| A | Arm / disarm arc segments for the next points |
| Alt+click / Alt+Space | Place with an arc segment |
| Tab / Shift+Tab (arc shown) | Next / previous arc centre |
| C / click first point | Close as fill |
| Shift+C | Close as stroke |
| Enter | Finish open path as stroke |
| Backspace | Remove last placed point |
| Ctrl (hold) | Snap to whole cells only |

**Adjust**

| Key | Action |
|---|---|
| Click / Shift-click | Select / toggle point or shape |
| Drag empty / Shift-drag / Alt-drag | Box-select / add / remove |
| Arrows / Shift+arrows | Nudge one sub-step / one cell |
| Tab / Shift+Tab | Next / previous point in shape |
| R / Shift+R | Cycle corner type forward / back |
| `[` `]` / Shift+`[` `]` | Radius − / + one sub-step / one cell |
| 0 | Radius 0 |
| S | Toggle fill / stroke |
| `,` `.` | Stroke width − / + one sub-step |
| 1 / 2 / 3 | Role: add / cut / intersect |
| Alt+`[` `]` | Joint radius − / + one sub-step |
| Cmd+[ / Cmd+] | Move shape earlier / later in evaluation order |
| Shift+H / Shift+V | Mirror selected shapes horizontally / vertically |
| E / Shift+E | Rotate selected shapes by grid step clockwise / anticlockwise |
| Cmd+D | Duplicate shape (offset one cell) |
| Delete / Backspace | Delete selected points (or the shape, if all its points are selected) |
| Cmd+A / Cmd+Shift+A | Select all points in shape / in mark |

**Tile**

| Key | Action |
|---|---|
| Click / Shift+click | Place tile / place and keep tile |
| Space / R | Next tile shape / rotate tile |
| Alt+click | Delete tile shape under pointer |

### 8.1 Hint line content

| State | Hint line |
|---|---|
| Place, nothing started | Click a grid point to start · Alt-click for an arc · ? shortcuts |
| Place, placing | Click to add · A arc · C closes as fill · Enter ends as stroke · Backspace undoes last |
| Place, arc candidate shown | Tab next centre (2 of 3) · Click to place arc · Esc straight line |
| Adjust, nothing selected | Click a point · Drag to box-select · Shift adds · Tab steps through points |
| Adjust, points selected | R corner type · [ ] radius · Arrows nudge · Delete removes |
| Adjust, shape selected | S fill/stroke · 1 2 3 add/cut/intersect · Shift+H mirror · E rotate |
| Tile | Click to place tile · Space next shape · R rotate · Alt-click deletes |
| Dragging a point | Δ +1, −0.5 · Drop on a neighbour to merge · Esc cancels |
| Status message (4 s) | e.g. *Radius clamped to 0.42 at (3, 1).* or *Moved 3 points.* |

## 9. Edge cases

Each edge case has one defined behaviour. Nothing is silently distorted.

### 9.1 Zero-length segments
- Placing a point on the previous point is ignored, and the hint line says *"There's already a point here."*
- Dragging a point onto its neighbour in the same shape **merges** them on drop. The preview shows the merge before release, and the merge is one undo step.
- A closed fill with fewer than 3 distinct points can't be closed (C does nothing, and the hint explains). It can only be a stroke.
- A filled shape whose points are all on one line has **no area**. It's kept, flagged, and excluded from the mark (§9.3) until it's fixed.

### 9.2 Self-intersection
- Allowed: a filled shape's outline may cross itself (e.g. a figure-eight). Its fill uses the nonzero rule, as in SVG's `fill-rule` default.
- On export, crossings are resolved by the boolean pass, so the output has no self-intersecting contours (verified in `VERIFICATION.md` §3).
- The canvas marks crossings with a small construction cross, which is information, not an error.

### 9.3 Invalid shapes
A shape is **invalid** if it has no area as a fill, or if any corner has no valid tangent (§9.4–9.5).

- Invalid shapes are drawn as a dashed outline in the error colour and are left out of the mark.
- The failing point gets a warning ring.
- The hint line names the problem and the fix.
- Export is blocked while any shape is invalid. The dialog lists them with "Show".

### 9.4 Extreme corner radius
- **Round (fillet):** the tangent length is *t = r / tan(θ/2)*, where θ is the interior angle. The two corners at either end of an edge share its length in proportion to the tangent lengths they ask for. If they'd overlap, both radii are clamped so their tangent lengths sum exactly to the edge length. Clamping is shown (§7.3) and is never an error.
- **Joint fillets** follow the same clamping as round fillets. A joint between two arcs, or between a line and an arc, uses the circle tangent to both. Where the two outlines meet tangentially there's no corner, so no fillet is made.
- **Outer / inward / auto:** large radii are allowed as long as tangents exist between neighbouring circles. If one circle contains the neighbouring circle it should wrap to, the corner has no tangent and the shape is invalid. The message is: *"Radius at (3, 1) swallows its neighbour. Reduce it below 1.41."* The limit is computed exactly.
- **Interaction limit:** the radius control's range is 0 to the grid's largest dimension. Typed values above that are clamped to it.

### 9.5 Inward corner with no room
- An inward corner needs the outline to cross between its circle and its neighbours' circles. A cross tangent between two circles exists only if the distance between their centres is greater than the sum of their radii. If it isn't, the shape is invalid and the message gives the largest radius that works: *"No room for an inward curve at (2, 2) at radius 0.80. It fits up to 0.55."*
- If an inward bite would cut through the opposite edge of its own shape, the result self-intersects. That's handled as in §9.2 and marked on the canvas, so the designer can see the bite has gone too deep.

### 9.6 Arc segments that stop being valid
- If moving a point makes an arc's ends no longer the same distance from its centre, the drag preview looks for another valid centre (the nearest one). If none exists, the segment previews as a straight line drawn in the invalid style.
- On drop, it becomes a straight line, and the hint line says *"Arc at (2, 3)–(3, 2) became straight: no lattice centre fits."* One undo step reverts the move and the arc together.

### 9.7 Strokes
- A stroke wider than twice the radius of an arc it follows would turn inside out on the inner side. The inner offset is clamped to a sharp point, and the shape is flagged with *"Stroke is wider than this curve can hold."*
- An open stroke of one segment of length 0 is impossible (see §9.1).

### 9.8 Grid edits
- Changing grid parameters that would move any point off the lattice is refused (§5). The message gives the number of points affected.
- In a polar grid, all points at ring 0 are the same point (the centre). They're stored in one canonical form, so "ray 3 at ring 0" equals "ray 0 at ring 0".

### 9.9 Repeats
- Copies that overlap their source are merged as part of the mark, so there's no doubled outline in the export.
- A shape lying on a mirror axis is mirrored onto itself, and the result is merged.
- Shapes that touch at a single point after merge or cut (for example a thunderbolt cut whose tips touch the block's edges) export as separate pieces. There are no zero-width connections or slivers.

### 9.10 Empty and degenerate documents
- No shapes: Export and Copy SVG are disabled with the reason *"Nothing to export yet."*
- All shapes cut away (empty mark): export is disabled with the reason *"The cut shapes remove the whole mark."*

## 10. Performance and accessibility requirements

- Every edit to a mark of up to 40 shapes and 400 points re-renders in under 16 ms at the 95th percentile on a 2022 laptop. The boolean pass runs only when shapes with cut or intersect roles, overlaps or symmetry are present.
- Every action is reachable from the keyboard. The lattice cursor gives full placement without a pointer.
- WCAG 2.2 AA: contrast (`DESIGN.md` §2), visible focus, targets of at least 24 × 24 px (WCAG 2.5.8), reduced motion (`DESIGN.md` §7), and `aria-live` hint line.
- The canvas exposes an accessible summary of the selection (e.g. "Point (3, 1), corner round, radius 0.30, shape 2 of 3") through the hint-line live region.

## 11. Open questions

These are decisions for the designer. Until each is answered, the default in brackets applies.

Resolved:
- **Rounding at boolean edges:** answered by adding a joint radius (§6.7 step 5).
- **Named radii:** belong to the document. There are no cross-document presets.

- **A square frame on the polar grid:** added as the companion square lattice (§5).
- **Typographic row defaults:** common Latin proportions on an 8-cell em (§5). They're editable per document.

Open: none.
