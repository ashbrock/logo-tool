/** Project files (ARCHITECTURE.md §9): `<name>.logo.json`, migrated and validated on open. */
import { deepFreeze, SCHEMA, type LogoDocument } from '../model/types';
import { validateDocument } from '../model/validate';

export const APP = 'logo-tool';

export function serialize(doc: LogoDocument): string {
  return JSON.stringify({ app: APP, schema: doc.schema, doc }, null, 2);
}

export function parseProject(text: string): { ok: true; doc: LogoDocument } | { ok: false; error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'This file isn’t valid JSON.' }; }
  const file = raw as { app?: unknown; schema?: unknown; doc?: unknown };
  if (!file || file.app !== APP || typeof file.doc !== 'object') return { ok: false, error: 'This isn’t a logo-tool project file.' };
  if (typeof file.schema !== 'number' || file.schema > SCHEMA) return { ok: false, error: 'This file was made by a newer version of the tool.' };
  const doc = migrate(file.doc as LogoDocument, file.schema);
  const problems = validateDocument(doc);
  if (problems.length > 0) return { ok: false, error: `This file has a problem: ${problems[0]}` };
  return { ok: true, doc: deepFreeze(doc) };
}

/** Schema 1 is current; later schemas add steps here. */
function migrate(doc: LogoDocument, _from: number): LogoDocument {
  return doc;
}
