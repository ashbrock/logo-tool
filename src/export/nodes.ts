/**
 * Node count of path data (VERIFICATION.md §1.1 step 6): drawing segments of M L H V C S Q T A,
 * counting implicit repeats (e.g. "l1 2 3 4" is two). Z is excluded.
 */
const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

export function countNodes(d: string): number {
  // Tokens: a command letter, or a number. Arc flags may be written without separators ("a5 5 0 015 5").
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let n = 0, i = 0, cmd = '';
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[a-zA-Z]/.test(t)) { cmd = t.toLowerCase(); i++; if (cmd === 'z') continue; }
    const k = ARGS[cmd];
    if (!k) { i++; continue; }
    if (cmd === 'a') {
      // Flags may be glued to the next number: split a token like "015" into "0", "1", "5".
      const nums: string[] = [];
      while (nums.length < 7 && i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
        let tok = tokens[i++]!;
        while ((nums.length === 3 || nums.length === 4) && /^[01]\d/.test(tok)) { nums.push(tok[0]!); tok = tok.slice(1); }
        nums.push(tok);
      }
      n++;
      continue;
    }
    i += k;
    n++;
  }
  return n;
}

export function countSvgNodes(svg: string): number {
  return [...svg.matchAll(/\sd="([^"]*)"/g)].reduce((a, m) => a + countNodes(m[1]!), 0);
}
