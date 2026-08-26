import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// The loader reads with `fs` on purpose — see the comment at the top of
// load.ts — so the seam is the filesystem, not an import.
async function freshLoader() {
  vi.resetModules();
  return await import('../load');
}

const ELITE = 'src/data/repertoire-map.json';

function mapFile(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    meta: {
      source: 'test',
      games: 1,
      band: null,
      bandScale: null,
      openings: 1,
      gapMaxPly: 3,
      gapMinShare: 0.02,
      steerPly: 8,
      otherFirstMoves: 0,
      ...over,
    },
    slots: [],
    transpositions: [],
  });
}

/** Serve only the files named; anything else is ENOENT, as on a real build. */
function serve(files: Record<string, string>) {
  vi.spyOn(fs, 'readFileSync').mockImplementation(((p: string) => {
    const rel = path.relative(process.cwd(), String(p));
    if (rel in files) return files[rel];
    throw Object.assign(new Error(`ENOENT: ${rel}`), { code: 'ENOENT' });
  }) as typeof fs.readFileSync);
}

afterEach(() => vi.restoreAllMocks());

describe('loadRepertoireMap', () => {
  it('reads the band’s own file when it is there and says so', async () => {
    serve({
      'src/data/repertoire-map.improving.json': mapFile({
        band: 'improving',
        bandScale: 'common (chess.com), converted from lichess',
        games: 232_933,
      }),
    });
    const { loadRepertoireMap } = await freshLoader();
    expect(loadRepertoireMap('improving')?.meta.band).toBe('improving');
  });

  it('falls back to the Elite map when a band has no file', async () => {
    serve({ [ELITE]: mapFile({ games: 3_439_091 }) });
    const { loadRepertoireMap } = await freshLoader();
    const map = loadRepertoireMap('improving');
    // Degrades to real numbers rather than to nothing — AND arrives saying
    // band null, which is what stops the page claiming "your level" over it.
    expect(map?.meta.games).toBe(3_439_091);
    expect(map?.meta.band).toBeNull();
  });

  // R3. `bandFor()` buckets a rating already normalised onto the chess.com
  // scale. A corpus banded on raw Lichess Elo would file a Lichess 1200 — a
  // beginner on the common scale — as improving, and every frequency would
  // still render. A file that cannot prove which scale it used is refused.
  it('refuses a banded file measured on an unstated scale', async () => {
    serve({
      'src/data/repertoire-map.improving.json': mapFile({ band: 'improving', bandScale: null, games: 999 }),
      [ELITE]: mapFile({ games: 3_439_091 }),
    });
    const { loadRepertoireMap } = await freshLoader();
    expect(loadRepertoireMap('improving')?.meta.games).toBe(3_439_091);
  });

  it('refuses a banded file that is a different band than the one asked for', async () => {
    serve({
      'src/data/repertoire-map.improving.json': mapFile({
        band: 'club',
        bandScale: 'common (chess.com), converted from lichess',
        games: 999,
      }),
      [ELITE]: mapFile({ games: 3_439_091 }),
    });
    const { loadRepertoireMap } = await freshLoader();
    expect(loadRepertoireMap('improving')?.meta.games).toBe(3_439_091);
  });

  it('returns null when nothing is readable at all, and never throws', async () => {
    serve({});
    const { loadRepertoireMap } = await freshLoader();
    expect(loadRepertoireMap('improving')).toBeNull();
    expect(loadRepertoireMap(null)).toBeNull();
  });

  it('treats an unknown band as no band rather than looking for a file', async () => {
    serve({ [ELITE]: mapFile({ games: 7 }) });
    const { loadRepertoireMap } = await freshLoader();
    expect(loadRepertoireMap('grandmaster')?.meta.games).toBe(7);
  });

  it('reads each file once, so a missing band is not re-read per request', async () => {
    serve({ [ELITE]: mapFile({ games: 7 }) });
    const { loadRepertoireMap } = await freshLoader();
    for (let i = 0; i < 5; i++) loadRepertoireMap('improving');
    // One failed read of the band file, one successful read of the Elite map.
    expect(vi.mocked(fs.readFileSync).mock.calls.length).toBe(2);
  });
});
