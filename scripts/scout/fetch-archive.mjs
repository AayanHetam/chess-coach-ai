// Pull a chess.com archive down with results attached, not just moves.
//
//   node scripts/scout/fetch-archive.mjs <username> [outfile]
//
// The scout prep features are only ever as good as what they do on a real
// archive, and every serious defect in them was found by running against one
// rather than against a fixture: the opponent whose repertoire had changed
// (58.6% of all games versus 96.3% of recent ones), the line that looked like a
// 26% collapse over 32 games and was 49% over 167, the engine desync that
// returned a move illegal in the position it came back for.
//
// Deliberately keeps `result` and `end_time`. An earlier version of this script
// saved moves only, which made every results-based signal impossible to check
// and cost a full re-fetch to notice.
import { Chess } from '/Users/aayanhetamsaria/Downloads/Inspirit_project/chess-coach-ai/node_modules/chess.js/dist/esm/chess.js';
import { writeFileSync } from 'node:fs';

const user = process.argv[2] ?? 'chilllychess';
const out = process.argv[3] ?? `/tmp/${user}_full.json`;
const UA = { 'User-Agent': 'chessmasti-scout-validation/1.0' };

const archives = await (await fetch(`https://api.chess.com/pub/player/${user}/games/archives`, { headers: UA })).json();
console.log(`${archives.archives.length} monthly archives`);

const games = [];
for (const url of archives.archives) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) { console.log('skip', url, r.status); continue; }
  const { games: batch } = await r.json();
  for (const g of batch ?? []) {
    if (!g.pgn || g.rules !== 'chess') continue;
    const w = g.white.username.toLowerCase() === user.toLowerCase();
    const b = g.black.username.toLowerCase() === user.toLowerCase();
    if (!w && !b) continue;

    const c = new Chess();
    try { c.loadPgn(g.pgn); } catch { continue; }
    const moves = c.history();
    if (moves.length < 4) continue;

    // Normalise chess.com's per-side result strings to a PGN result.
    const wr = g.white.result;
    const result = wr === 'win' ? '1-0'
      : g.black.result === 'win' ? '0-1'
      : ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(wr) ? '1/2-1/2'
      : null;
    if (!result) continue;

    games.push({
      moves: moves.slice(0, 30),
      color: w ? 'white' : 'black',
      result,
      timeClass: g.time_class,
      rating: w ? g.white.rating : g.black.rating,
      end: g.end_time,
    });
  }
  process.stdout.write('.');
}
console.log(`\n${games.length} games`);
writeFileSync(out, JSON.stringify(games));
console.log('→', out);
