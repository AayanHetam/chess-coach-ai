#!/usr/bin/env node
/**
 * Build enriched openings.json from:
 * 1. Existing src/data/openings.ts (3,401 name+FEN pairs)
 * 2. lichess-org/chess-openings TSV dataset (ECO codes + PGN sequences)
 *
 * Output: src/data/openings.json — each entry has { name, fen, eco, pgn }
 *
 * Usage: node scripts/build-openings-json.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Step 1: Parse existing openings from openings.ts ─────────────────────────

const openingsTs = readFileSync(join(ROOT, "src/data/openings.ts"), "utf-8");

// Extract all { name: "...", fen: "..." } objects (multi-line format)
const openingRegex = /\{\s*name:\s*"([^"]+)",\s*fen:\s*"([^"]+)",?\s*\}/gs;
const existingOpenings = [];
let match;
while ((match = openingRegex.exec(openingsTs)) !== null) {
  existingOpenings.push({ name: match[1], fen: match[2] });
}
console.log(`Parsed ${existingOpenings.length} openings from openings.ts`);

// ── Step 2: Download lichess-org/chess-openings TSV files ────────────────────

const TSV_URLS = [
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/a.tsv",
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/b.tsv",
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/c.tsv",
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/d.tsv",
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/e.tsv",
];

/** Parse a TSV file into { eco, name, pgn, uci, epd } objects */
function parseTsv(tsv) {
  const lines = tsv.trim().split("\n");
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (values[i] || "").trim();
    });
    return obj;
  });
}

console.log("Downloading lichess-org/chess-openings TSV files...");
const lichessOpenings = [];
for (const url of TSV_URLS) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to fetch ${url}: ${res.status}`);
    continue;
  }
  const tsv = await res.text();
  const entries = parseTsv(tsv);
  lichessOpenings.push(...entries);
  console.log(`  ${url.split("/").pop()}: ${entries.length} entries`);
}
console.log(`Total lichess openings: ${lichessOpenings.length}`);

// ── Step 3: Build lookup indexes for matching ────────────────────────────────

// Normalize name for matching (lowercase, remove extra spaces, handle punctuation)
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Build name → lichess entry map (by normalized name)
const lichessByName = new Map();
for (const entry of lichessOpenings) {
  const key = normalizeName(entry.name);
  // If multiple entries match the same name, keep the one with more moves
  const existing = lichessByName.get(key);
  if (!existing || (entry.pgn || "").split(" ").length > (existing.pgn || "").split(" ").length) {
    lichessByName.set(key, entry);
  }
}

// Build FEN prefix → lichess entry map (use first 4 FEN fields for matching)
function fenPrefix(fen) {
  // FEN: pieces activeColor castling enPassant halfmove fullmove
  // EPD (lichess): pieces activeColor castling enPassant
  const parts = fen.split(" ");
  return parts.slice(0, 4).join(" ");
}

const lichessByFen = new Map();
for (const entry of lichessOpenings) {
  if (entry.epd) {
    lichessByFen.set(entry.epd, entry);
  }
}

// ── Step 4: Merge — enrich existing openings with ECO + PGN ─────────────────

let matchedByName = 0;
let matchedByFen = 0;
let unmatched = 0;

const enriched = existingOpenings.map((opening) => {
  const result = {
    name: opening.name,
    fen: opening.fen,
    eco: null,
    pgn: null,
  };

  // Try matching by name first (most reliable)
  const nameKey = normalizeName(opening.name);
  const byName = lichessByName.get(nameKey);
  if (byName) {
    result.eco = byName.eco || null;
    result.pgn = byName.pgn || null;
    matchedByName++;
    return result;
  }

  // Try matching by FEN prefix (EPD)
  const fp = fenPrefix(opening.fen);
  const byFen = lichessByFen.get(fp);
  if (byFen) {
    result.eco = byFen.eco || null;
    result.pgn = byFen.pgn || null;
    matchedByFen++;
    return result;
  }

  unmatched++;
  return result;
});

// ── Step 5: Add lichess openings that don't exist in our dataset ─────────────

const existingNames = new Set(existingOpenings.map((o) => normalizeName(o.name)));
const existingFens = new Set(existingOpenings.map((o) => fenPrefix(o.fen)));

let added = 0;
for (const entry of lichessOpenings) {
  const nameKey = normalizeName(entry.name);
  if (existingNames.has(nameKey)) continue;
  if (entry.epd && existingFens.has(entry.epd)) continue;

  enriched.push({
    name: entry.name,
    fen: entry.epd ? entry.epd + " 0 1" : null,
    eco: entry.eco || null,
    pgn: entry.pgn || null,
  });
  added++;
}

// ── Step 6: Write output ─────────────────────────────────────────────────────

const outputPath = join(ROOT, "src/data/openings.json");
writeFileSync(outputPath, JSON.stringify(enriched, null, 2));

const withEco = enriched.filter((o) => o.eco).length;
const withPgn = enriched.filter((o) => o.pgn).length;

console.log("\n=== Results ===");
console.log(`Total openings: ${enriched.length}`);
console.log(`Matched by name: ${matchedByName}`);
console.log(`Matched by FEN: ${matchedByFen}`);
console.log(`Unmatched (from existing): ${unmatched}`);
console.log(`Added from lichess: ${added}`);
console.log(`With ECO codes: ${withEco} (${((withEco / enriched.length) * 100).toFixed(1)}%)`);
console.log(`With PGN sequences: ${withPgn} (${((withPgn / enriched.length) * 100).toFixed(1)}%)`);
console.log(`\nWritten to: ${outputPath}`);
