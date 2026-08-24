// Guard C-3: the Wikibooks text can never reach a course.
//
// The excerpts are CC BY-SA. Quoting them is a quotation and touches nothing
// else in the repo; putting one inside a generated artifact would make the
// artifact an adapted work and pull share-alike onto it. That is a licensing
// exposure nobody would notice until it mattered.
//
// So it is enforced structurally rather than by anyone remembering: the text is
// never in the same process as the builder. This test is what keeps it that way
// when somebody later reaches for "just the opening name" and finds it in the
// theory loader.

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Every module the course build pulls in, followed transitively. */
function moduleGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const walk = (rel: string) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    let source: string;
    try {
      source = read(rel);
    } catch {
      return;
    }
    const dir = path.dirname(rel);
    for (const m of Array.from(source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))) {
      walk(path.normalize(path.join(dir, m[1])));
    }
  };
  walk(entry);
  return seen;
}

describe('course build quarantine', () => {
  it('never imports the Wikibooks loader, at any depth', () => {
    const graph = moduleGraph('scripts/openings/build-courses.mjs');
    expect(graph.size).toBeGreaterThan(1); // the walk actually walked
    for (const mod of Array.from(graph)) {
      expect(mod).not.toMatch(/wikibooksTheory/);
      expect(read(mod)).not.toMatch(/wikibooks-theory\.json/);
    }
  });

  it('ships no course containing a licensed excerpt', () => {
    // Belt and braces on the artifacts themselves: the builder could be right
    // today and a future one could inline a page's prose. The excerpts are
    // prose, so any long run of words in a course file is the signal.
    const dir = path.join(ROOT, 'src/data/courses');
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(raw).not.toMatch(/wikibooks/i);
      expect(raw).not.toMatch(/CC BY-SA/i);
      // No string field longer than a move list or an opening name.
      const longest = Math.max(0, ...Array.from(raw.matchAll(/"([^"\\]{60,})"/g), m => m[1].length));
      expect(longest).toBeLessThan(120);
    }
  });
});
