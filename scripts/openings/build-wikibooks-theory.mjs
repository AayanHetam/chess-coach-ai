#!/usr/bin/env node
/**
 * Build src/data/wikibooks-theory.json from the Wikibooks book
 * "Chess Opening Theory" (CC BY-SA 4.0).
 *
 *   node scripts/openings/build-wikibooks-theory.mjs
 *
 * Run by hand when we want to refresh; the output is committed, so nothing at
 * runtime ever touches Wikibooks. Raw wikitext is cached under .cache/ so a
 * re-run after an extractor change costs no requests at all — the Wikimedia API
 * rate-limits hard, and it is rude to re-download 3,000 pages to fix a regex.
 *
 * WHY THIS IS KEYED BY POSITION, NOT BY PATH
 *
 * The book is one page per move path — /1. e4/1...c5/2. c3 — so 1.Nf3 c5 2.e4
 * d6 3.d4 and 1.e4 c5 2.Nf3 d6 3.d4 are two URLs for one position. Measured
 * against our own 3.4M-game corpus, path-keyed lookup covers 35% of real play
 * and position-keyed covers 69%: 42 points of the coverage exist ONLY because
 * transpositions are pooled. Same reason positionStats pools them.
 *
 * And where several pages share a position, we keep the BEST WRITTEN one rather
 * than the shortest path. 1.d4 Nf6 2.Nf3 e6 3.c4 d5 is a bare navigation node
 * with no prose; the Queen's Gambit Declined spelling of that same position is
 * where the explanation lives.
 *
 * LICENCE
 *
 * Text is CC BY-SA 4.0. Share-alike attaches to ADAPTED material, so we store
 * excerpts VERBATIM and never paraphrase, summarise or run them through a
 * model — an unmodified excerpt shown with attribution is a quotation, and
 * touches nothing else in this repo. Every record keeps its source page title
 * so the UI can link back, which is what the attribution requires.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// One append-only file, not one file per page. Page titles run to twelve plies
// and their base64 exceeds the 255-byte filename limit, which fails only on the
// deepest pages — i.e. after twenty minutes of downloading.
const CACHE_FILE = path.join(ROOT, '.cache/wikibooks-theory.jsonl');
const OUT = path.join(ROOT, 'src/data/wikibooks-theory.json');
const API = 'https://en.wikibooks.org/w/api.php';
const UA = 'chessmasti/1.0 (opening theory import; kapilhetamsaria@gmail.com)';
const PREFIX = 'Chess Opening Theory/';

/** Longest excerpt we store, in characters. Trimmed at a sentence boundary. */
const MAX_EXCERPT = 700;
/** Below this a page is a navigation node, not an explanation. */
const MIN_EXCERPT = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet(params, attempts = 5) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: 'json' })) u.searchParams.set(k, v);
  for (let a = 0; a < attempts; a++) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA } });
      const body = await res.text();
      // The API answers rate limiting with a plain-text body, not a status
      // code, so a JSON.parse failure here is indistinguishable from a real
      // parse error unless we look.
      if (!res.ok || body.startsWith('You are making')) throw new Error(`throttled (${res.status})`);
      return JSON.parse(body);
    } catch (e) {
      const wait = 4000 * 2 ** a;
      process.stderr.write(`  retry ${a + 1}/${attempts} in ${wait}ms — ${e.message}\n`);
      await sleep(wait);
    }
  }
  return null;
}

async function allTitles() {
  const titles = [];
  let cont;
  do {
    const data = await apiGet({
      action: 'query',
      list: 'allpages',
      apprefix: PREFIX,
      aplimit: '500',
      ...(cont ? { apcontinue: cont } : {}),
    });
    if (!data) break;
    for (const p of data.query.allpages) titles.push(p.title);
    cont = data.continue?.apcontinue;
    await sleep(500);
  } while (cont);
  return titles;
}

export function readCache() {
  const pages = new Map();
  if (!fs.existsSync(CACHE_FILE)) return pages;
  for (const line of fs.readFileSync(CACHE_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const { title, wikitext } = JSON.parse(line);
      pages.set(title, wikitext);
    } catch {
      // A half-written final line from an interrupted run. Skip it; the page
      // is simply re-fetched.
    }
  }
  return pages;
}

async function fetchWikitext(titles) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  const have = readCache();
  const need = titles.filter((t) => !have.has(t));
  process.stderr.write(`cached ${have.size}, fetching ${need.length}\n`);

  for (let i = 0; i < need.length; i += 25) {
    const batch = need.slice(i, i + 25);
    const data = await apiGet({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: batch.join('|'),
    });
    if (!data) {
      process.stderr.write(`  giving up on batch at ${i}\n`);
      continue;
    }
    const lines = Object.values(data.query?.pages ?? {}).map((p) =>
      JSON.stringify({ title: p.title, wikitext: p.revisions?.[0]?.slots?.main?.['*'] ?? '' })
    );
    fs.appendFileSync(CACHE_FILE, lines.join('\n') + '\n');
    if (i % 250 === 0) process.stderr.write(`  ${i}/${need.length}\n`);
    await sleep(3000);
  }
}

// ── Extraction ───────────────────────────────────────────────────────────────

/** `1. e4` / `1...c5` → the SAN alone. */
export function sanOf(segment) {
  // ONE regex. Stripping "1." first turns "1...Nc6" into "..Nc6", which is
  // illegal in every position and silently voids the whole import.
  return segment.replace(/^\d+\s*\.(\s*\.\.)?\s*/, '').trim();
}

/** Replay a page title to its position, or null if the moves do not play. */
export function positionOf(title) {
  const board = new Chess();
  for (const segment of title.slice(PREFIX.length).split('/')) {
    const san = sanOf(segment);
    try {
      if (!board.move(san)) return null;
    } catch {
      return null;
    }
  }
  return board.fen();
}

/** Opening name and ECO from the page's {{...Position}} template. */
export function headerOf(wikitext) {
  const m = wikitext.match(/\{\{Chess Opening Theory\/Position\s*([\s\S]*?)\}\}/i);
  if (!m) return {};
  const body = m[1];
  const name = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('|') && !l.includes('='))
    ?.replace(/^\|/, '')
    .trim();
  const eco = body.match(/eco\s*=\s*(?:\[\[[^|\]]*\|)?([A-E]\d{2})/i)?.[1];
  return { name: name || undefined, eco: eco || undefined };
}

/**
 * The lead prose: what the page says about the ideas, before it turns into
 * history and a theory table.
 *
 * Kept verbatim. Markup is removed and link labels are unwrapped, but no word
 * is rewritten — see the licence note at the top.
 */
export function excerptOf(wikitext) {
  let body = wikitext;

  // Everything from the first heading that is not the opening's own title.
  const firstHeading = body.match(/^==[^=].*?==\s*$/m);
  if (firstHeading) body = body.slice(firstHeading.index + firstHeading[0].length);
  // Stop at the next heading of any level: History, Theory table, References.
  const nextHeading = body.match(/^={2,}[^=].*?={2,}\s*$/m);
  if (nextHeading) body = body.slice(0, nextHeading.index);

  const text = body
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\{\|[\s\S]*?\|\}/g, '')
    .replace(/<[^>]+>/g, '')
    // [[/2...Nc6|'''2...Nc6!?''']] → 2...Nc6!?  (label, or target when unlabelled)
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*\n\s*/g, '\n\n')
    .trim();

  if (text.length <= MAX_EXCERPT) return text;

  // Whole paragraphs, never a partial one. Trimming at "the last '. '" cuts
  // chess prose mid-sentence, because move numbers ARE periods followed by a
  // space — the Alapin page ended at "However, 2." on exactly that bug.
  const paragraphs = text.split(/\n{2,}/);
  let out = '';
  for (const p of paragraphs) {
    if (out && out.length + p.length + 2 > MAX_EXCERPT) break;
    out = out ? `${out}\n\n${p}` : p;
  }
  if (out.length <= MAX_EXCERPT) return out.trim();

  // A single paragraph longer than the cap: cut at a sentence end that is not a
  // move number, so "3. d4" can never be mistaken for the end of a thought.
  const cut = out.slice(0, MAX_EXCERPT);
  let stop = -1;
  for (const m of cut.matchAll(/(?<![\d.])\.(?=\s)/g)) stop = m.index;
  return (stop > MIN_EXCERPT ? cut.slice(0, stop + 1) : cut).trim();
}

/** Drop the counters so transpositions share a key. Mirrors positionStats. */
export const positionKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

export function buildIndex(pages) {
  const byPosition = new Map();
  const stats = { pages: pages.length, unplayable: 0, empty: 0 };

  for (const { title, wikitext } of pages) {
    const fen = positionOf(title);
    if (!fen) {
      stats.unplayable += 1;
      continue;
    }
    const excerpt = excerptOf(wikitext);
    if (excerpt.length < MIN_EXCERPT) {
      stats.empty += 1;
      continue;
    }
    const { name, eco } = headerOf(wikitext);
    const key = positionKey(fen);
    const prev = byPosition.get(key);
    // Best written wins, not shortest path.
    if (!prev || excerpt.length > prev.x.length) {
      byPosition.set(key, { t: title, ...(name ? { n: name } : {}), ...(eco ? { e: eco } : {}), x: excerpt });
    }
  }
  return { byPosition, stats };
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const titles = await allTitles();
  process.stderr.write(`titles: ${titles.length}\n`);
  await fetchWikitext(titles);

  const cached = readCache();
  const pages = titles
    .filter((t) => cached.has(t))
    .map((title) => ({ title, wikitext: cached.get(title) }));

  const { byPosition, stats } = buildIndex(pages);
  const out = {
    source: 'Wikibooks — Chess Opening Theory',
    url: 'https://en.wikibooks.org/wiki/Chess_Opening_Theory',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    builtAt: new Date().toISOString().slice(0, 10),
    positions: Object.fromEntries(byPosition),
  };
  fs.writeFileSync(OUT, JSON.stringify(out));

  const bytes = fs.statSync(OUT).size;
  process.stderr.write(
    `\npages ${stats.pages} · unplayable ${stats.unplayable} · no prose ${stats.empty}\n` +
      `positions with theory: ${byPosition.size}\n` +
      `written ${OUT} (${(bytes / 1e6).toFixed(2)} MB)\n`
  );
}
