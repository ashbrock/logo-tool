# CLAUDE.md

## Project
A browser-based geometric logo construction tool. The user picks a grid type, then builds a logo mark by placing points on the grid and connecting them. There is never free drawing: every point snaps to the grid. Points and grids are adjustable (size, corner radius, corner type), and finished marks export as SVG and PNG, optionally with the construction overlay.

It is a construction tool for geometric marks, not a Figma or Illustrator replacement. Don't add features that push it in that direction (layers panels, effects, gradients, general-purpose pen tool).

This is a portfolio piece. Design quality, polish and clear decisions matter as much as functionality.

## Source of truth
- `SPEC.md` (behaviour), `DESIGN.md` (visual system), `ARCHITECTURE.md` (structure) and `VERIFICATION.md` (how we prove it's right) define the project.
- If the code and these documents disagree, stop and ask me. Don't silently pick one.
- Never invent colours, fonts or spacing values. Use the tokens in `DESIGN.md`.
- `/references` holds my real logo files. Treat them as visual targets for what the tool must be able to build, not as examples of good path data. Export quality is defined in `VERIFICATION.md`.
- Inspiration (another designer's tool, stock sheets of geometric marks) is for interaction patterns and capability targets only. Never copy its layout, naming or styling, and don't commit those images.

## Stack and constraints
- Static site. No backend, no accounts, no database.
- The editing surface is SVG, so what I see and what I export are the same thing.
- Prefer an established library (e.g. Paper.js) for boolean path operations over hand-written maths. Don't add any dependency without asking first. Say why it's needed and what the lighter alternative is.
- No AI features in v1.

## Architecture
- The geometry core has no DOM and no rendering code. It works in grid coordinates (for example `(3, 2)` or `(1.5, 4)`), never pixels. Pixels only appear at the rendering and export edges.
- Grid types (square, isometric/triangular, polar/radial, typographic baseline and x-height) are data definitions that map to a lattice. Adding a grid type should not require touching the geometry core.
- Corner rounding is a true tangent arc, not an approximation. Corner types (auto, outer, round, inward) are part of the point model.
- All edits go through a command pattern so undo and redo are exact.
- Keep export in its own module: path generation, node minimisation, SVGO cleanup, PNG scaling, optional construction overlay.
- Suggested layout: `src/geometry/`, `src/grids/`, `src/render/`, `src/export/`, `src/ui/`.

## Testing and verification
- Follow `VERIFICATION.md`. Don't mark a feature done until its checks pass.
- Property-based tests (e.g. fast-check) for: every placed point lies exactly on the lattice, export is deterministic, undo then redo restores identical state.
- Reconstruction tests: rebuild the logos in `/references`, export them, and compare with the originals visually (rendered overlay diff). Node count must not exceed the original. Intentional deviations from a reference are recorded in `DECISIONS.md`.
- Exported SVG must have no stray transforms, minimal nodes, and valid markup. Run SVGO before declaring an export feature done.
- Run the geometry and export tests before and after any change to `src/geometry/`, `src/grids/` or `src/export/`.
- Tell me which checks you ran and which need me to do by hand (opening exports in Figma, Illustrator, Inkscape).

## Design rules
- Desktop first, with precise keyboard and pointer control. Canvas is dominant; controls live in a narrow rail.
- Visual direction: dark, monospace-forward, construction area front and centre. Follow the direction chosen in `DESIGN.md` and keep it distinct from the reference.
- Show geometry instead of numbers where possible (for example, a corner radius drawn as a circle around its point).
- Teach shortcuts with a hint line at the bottom of the canvas.
- Every interactive element needs visible hover, focus, active and disabled states. WCAG AA contrast. Respect `prefers-reduced-motion`.
- Avoid generic SaaS styling: no default purple gradients, no cookie-cutter card grids.

## Working style
- Work in small steps. Finish and verify one feature before starting the next.
- Before building something new, briefly say what you plan to do and which files it touches. Ask me if the plan changes scope.
- If something is ambiguous, ask. Don't guess missing product or brand details.
- After each task, say what changed and anything I should check by hand (especially snapping feel, export quality and pointer interactions).
- Keep a running `DECISIONS.md`: one or two lines per significant design or technical decision, with the reason. I'll use it for the portfolio write-up.

## Out of scope for v1
Free drawing, accounts, cloud saving, collaboration, AI features, layers, effects and gradients.
