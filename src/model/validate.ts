/**
 * Document invariants (ARCHITECTURE.md §3), checked after every command and on file open.
 * Returns a list of problems; an empty list means valid.
 */
import { exactEq } from '../geometry/exact';
import { latticeEq, type Lattice } from '../geometry/lattice';
import { isInt } from '../geometry/num';
import { contains, dist2Exact, exactT, normalise, type GridDef } from '../grids';
import type { LogoDocument, Shape } from './types';

const intPt = (p: Lattice) => isInt(p.u) && isInt(p.v);
const onLattice = (p: Lattice, g: GridDef) => intPt(p) && contains(p, g) && latticeEq(p, normalise(p, g));

export function validateShape(s: Shape, doc: LogoDocument): string[] {
  const g = doc.grid, out: string[] = [];
  const { vertices, segments, closed } = s.path;
  const n = vertices.length;
  if (n === 0) out.push(`${s.id}: no points`);
  for (const v of vertices) {
    if (!onLattice(v.at, g)) out.push(`${s.id}/${v.id}: not on the lattice`);
    if (typeof v.radius === 'number') { if (!isInt(v.radius) || v.radius < 0) out.push(`${s.id}/${v.id}: radius must be a non-negative integer of 1/240 cell`); }
    else if (!doc.radii.some((r) => r.id === (v.radius as { ref: string }).ref)) out.push(`${s.id}/${v.id}: unknown named radius`);
  }
  const segCount = closed ? n : Math.max(0, n - 1);
  if (n >= 2 && segments.length !== segCount) out.push(`${s.id}: ${segments.length} segments for ${n} points`);
  for (let i = 0; i < segCount && n >= 2; i++) {
    const a = vertices[i]!.at, b = vertices[(i + 1) % n]!.at;
    if (latticeEq(a, b)) out.push(`${s.id}: consecutive points ${i} and ${(i + 1) % n} coincide`);
    const seg = segments[i];
    if (seg?.kind === 'arc') {
      if (!onLattice(seg.centre, g)) out.push(`${s.id}: arc ${i} centre not on the lattice`);
      else if (!exactEq(dist2Exact(seg.centre, a, g), dist2Exact(seg.centre, b, g), exactT(g))) out.push(`${s.id}: arc ${i} ends are not equidistant from its centre`);
    }
  }
  if (s.paint.kind === 'fill') {
    // A one-point fill is a circle once it has a radius; with radius 0 it is a point being placed.
    // Open fills with fewer than 3 points are shapes being placed, and draw nothing until closed.
  } else {
    if (!isInt(s.paint.width) || s.paint.width <= 0) out.push(`${s.id}: stroke width must be a positive integer of 1/240 cell`);
    if (!isInt(s.paint.endRadius) || s.paint.endRadius < 0) out.push(`${s.id}: end radius must be a non-negative integer of 1/240 cell`);
  }
  if (!isInt(s.jointRadius) || s.jointRadius < 0) out.push(`${s.id}: joint radius must be a non-negative integer of 1/240 cell`);
  const r = s.repeat;
  if (r.kind === 'rotate') {
    if (!onLattice(r.centre, g)) out.push(`${s.id}: repeat centre not on the lattice`);
    if (!isInt(r.count) || r.count < 2 || r.count > 360) out.push(`${s.id}: repeat count must be 2–360`);
    if (r.axis && !onLattice(r.axis, g)) out.push(`${s.id}: repeat axis not on the lattice`);
  } else if (r.kind === 'mirror') {
    if (!onLattice(r.through, g) || !onLattice(r.to, g) || latticeEq(r.through, r.to)) out.push(`${s.id}: mirror line needs two different lattice points`);
  } else if (r.kind === 'translate') {
    if (!intPt(r.step) || (r.step.u === 0 && r.step.v === 0)) out.push(`${s.id}: repeat step must be a non-zero lattice vector`);
    if (!isInt(r.count) || r.count < 2 || r.count > 360) out.push(`${s.id}: repeat count must be 2–360`);
  }
  return out;
}

export function validateDocument(doc: LogoDocument): string[] {
  const out: string[] = [];
  if (doc.schema !== 1) out.push(`unknown schema ${String(doc.schema)}`);
  if (!isInt(doc.nextId) || doc.nextId < 1) out.push('nextId must be a positive integer');
  const ids = new Set<string>();
  for (const s of doc.shapes) {
    if (ids.has(s.id)) out.push(`duplicate id ${s.id}`);
    ids.add(s.id);
    for (const v of s.path.vertices) { if (ids.has(v.id)) out.push(`duplicate id ${v.id}`); ids.add(v.id); }
    out.push(...validateShape(s, doc));
  }
  for (const r of doc.radii) if (!isInt(r.value) || r.value < 0) out.push(`radius ${r.name} must be a non-negative integer of 1/240 cell`);
  return out;
}
