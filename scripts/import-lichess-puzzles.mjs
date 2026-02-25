#!/usr/bin/env node
/**
 * Import Lichess Puzzle Database (CC0 licensed)
 * Downloads the full puzzle CSV from database.lichess.org,
 * parses it, and builds the local JSON puzzle files organized
 * by theme and difficulty band.
 *
 * Usage:
 *   node scripts/import-lichess-puzzles.mjs [--max-per-band 500] [--min-popularity 70] [--skip-download]
 *
 * The CSV is ~300MB compressed (zstd), ~1.5GB uncompressed, ~4M puzzles.
 * This script streams it line-by-line to keep memory usage low.
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
import { execSync } from "child_process";
import https from "https";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");
const PUZZLES_DIR = join(PROJECT_ROOT, "src", "data", "puzzles");

// --- Configuration ---
const CSV_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const DOWNLOAD_PATH = join(PROJECT_ROOT, "lichess_db_puzzle.csv.zst");
const CSV_PATH = join(PROJECT_ROOT, "lichess_db_puzzle.csv");

const DIFFICULTY_BANDS = {
  beginner:     [0, 1200],
  intermediate: [1201, 1600],
  advanced:     [1601, 2000],
  expert:       [2001, 9999],
};

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultVal;
  return args[idx + 1];
}
const MAX_PER_BAND = parseInt(getArg("--max-per-band", "500"));
const MIN_POPULARITY = parseInt(getArg("--min-popularity", "60"));
const MIN_NB_PLAYS = parseInt(getArg("--min-plays", "100"));
const SKIP_DOWNLOAD = args.includes("--skip-download");

console.log(`\n🧩 Lichess Puzzle Importer`);
console.log(`   Max per band/theme: ${MAX_PER_BAND}`);
console.log(`   Min popularity: ${MIN_POPULARITY}`);
console.log(`   Min plays: ${MIN_NB_PLAYS}`);
console.log(`   Skip download: ${SKIP_DOWNLOAD}\n`);

// --- Step 1: Download ---
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️  Downloading ${url} ...`);
    const file = createWriteStream(dest);
    const get = url.startsWith("https") ? https.get : http.get;

    function follow(url) {
      get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`   ↳ Redirect to ${response.headers.location}`);
          follow(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        const total = parseInt(response.headers["content-length"] || "0");
        let downloaded = 0;
        let lastPct = -1;
        response.on("data", (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct !== lastPct && pct % 5 === 0) {
              process.stdout.write(`\r   ${pct}% (${(downloaded / 1e6).toFixed(0)}MB / ${(total / 1e6).toFixed(0)}MB)`);
              lastPct = pct;
            }
          }
        });
        response.pipe(file);
        file.on("finish", () => { file.close(); console.log("\n   ✅ Download complete"); resolve(); });
      }).on("error", reject);
    }
    follow(url);
  });
}

// --- Step 2: Decompress ---
function decompressZstd(src, dest) {
  console.log(`📦 Decompressing ${src} → ${dest} ...`);
  try {
    execSync(`zstd -d "${src}" -o "${dest}" --force`, { stdio: "inherit" });
    console.log("   ✅ Decompression complete");
    return true;
  } catch {
    console.error("   ❌ zstd not found. Install with: brew install zstd");
    console.error("   Or download the uncompressed CSV manually and use --skip-download");
    return false;
  }
}

// --- Step 3: Parse & collect ---
function getBand(rating) {
  if (rating <= 1200) return "beginner";
  if (rating <= 1600) return "intermediate";
  if (rating <= 2000) return "advanced";
  return "expert";
}

async function parseCsv(csvPath) {
  console.log(`\n📖 Parsing CSV: ${csvPath}`);

  // Data structure: { theme -> { band -> puzzle[] } }
  const data = {};
  // Track counts to know when bands are full
  const counts = {}; // { theme -> { band -> count } }

  // Set of all themes that have at least one full band
  const fullThemes = new Set();

  const stream = createReadStream(csvPath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNum = 0;
  let imported = 0;
  let skipped = 0;

  for await (const line of rl) {
    lineNum++;

    // Skip header
    if (lineNum === 1) {
      console.log(`   Header: ${line.slice(0, 100)}...`);
      continue;
    }

    // Progress
    if (lineNum % 500000 === 0) {
      console.log(`   ... processed ${(lineNum / 1e6).toFixed(1)}M lines, imported ${imported} puzzles`);
    }

    // Parse CSV line (simple — no quoted fields expected)
    const parts = line.split(",");
    if (parts.length < 8) continue;

    const puzzleId = parts[0];
    const fen = parts[1];
    const movesStr = parts[2];
    const rating = parseInt(parts[3]);
    const ratingDeviation = parseInt(parts[4]);
    const popularity = parseInt(parts[5]);
    const nbPlays = parseInt(parts[6]);
    const themesStr = parts[7];
    const openingTags = parts.length > 9 ? parts[9] : null;

    // Quality filters
    if (isNaN(rating) || isNaN(popularity)) continue;
    if (popularity < MIN_POPULARITY) { skipped++; continue; }
    if (nbPlays < MIN_NB_PLAYS) { skipped++; continue; }
    if (ratingDeviation > 150) { skipped++; continue; } // Skip unstable ratings

    const moves = movesStr.split(" ").filter(Boolean);
    if (moves.length < 2) { skipped++; continue; } // Need at least setup move + solution

    const themes = themesStr.split(" ").filter(Boolean);
    if (themes.length === 0) { skipped++; continue; }

    const band = getBand(rating);

    const puzzle = {
      id: puzzleId,
      fen,
      moves,
      rating,
      themes,
      openingTags: openingTags || null,
      popularity,
      nbPlays,
    };

    // Add to each theme bucket
    for (const theme of themes) {
      if (!data[theme]) {
        data[theme] = { beginner: [], intermediate: [], advanced: [], expert: [] };
        counts[theme] = { beginner: 0, intermediate: 0, advanced: 0, expert: 0 };
      }

      if (counts[theme][band] < MAX_PER_BAND) {
        data[theme][band].push(puzzle);
        counts[theme][band]++;
        imported++;
      }
    }

    // Check if we can stop early (all themes have full bands)
    // This is a heuristic — we keep going to discover new themes
  }

  console.log(`\n   📊 Parsed ${lineNum.toLocaleString()} lines`);
  console.log(`   ✅ Imported ${imported.toLocaleString()} puzzle entries`);
  console.log(`   ⏭️  Skipped ${skipped.toLocaleString()} (quality filters)`);
  console.log(`   🏷️  Found ${Object.keys(data).length} themes`);

  return data;
}

// --- Step 4: Write JSON files ---
function writeOutput(data) {
  console.log(`\n💾 Writing puzzle files to ${PUZZLES_DIR}`);

  const indexData = {
    totalPuzzles: 0,
    themes: {},
    difficultyBands: DIFFICULTY_BANDS,
    generatedAt: new Date().toISOString(),
  };

  const allIds = new Set();

  for (const [theme, bands] of Object.entries(data)) {
    const themeDir = join(PUZZLES_DIR, theme);
    mkdirSync(themeDir, { recursive: true });

    let themeTotal = 0;
    const bandCounts = {};

    for (const [band, puzzles] of Object.entries(bands)) {
      if (puzzles.length === 0) continue;

      // Sort by rating within band for consistency
      puzzles.sort((a, b) => a.rating - b.rating);

      // Write band file
      const filePath = join(themeDir, `${band}.json`);
      writeFileSync(filePath, JSON.stringify(puzzles));

      bandCounts[band] = puzzles.length;
      themeTotal += puzzles.length;

      for (const p of puzzles) allIds.add(p.id);
    }

    if (themeTotal > 0) {
      indexData.themes[theme] = {
        total: themeTotal,
        bands: bandCounts,
      };
    }
  }

  indexData.totalPuzzles = allIds.size;

  // Sort themes alphabetically
  const sortedThemes = {};
  for (const key of Object.keys(indexData.themes).sort()) {
    sortedThemes[key] = indexData.themes[key];
  }
  indexData.themes = sortedThemes;

  // Write index
  const indexPath = join(PUZZLES_DIR, "index.json");
  writeFileSync(indexPath, JSON.stringify(indexData, null, 2));

  console.log(`   ✅ Wrote ${Object.keys(data).length} theme directories`);
  console.log(`   ✅ Total unique puzzles: ${allIds.size.toLocaleString()}`);
  console.log(`   ✅ Index written to ${indexPath}`);

  // Print theme summary
  console.log(`\n📋 Theme Summary:`);
  const sortedEntries = Object.entries(indexData.themes).sort((a, b) => b[1].total - a[1].total);
  for (const [theme, info] of sortedEntries.slice(0, 20)) {
    const bandStr = Object.entries(info.bands).map(([b, c]) => `${b}:${c}`).join(" ");
    console.log(`   ${theme.padEnd(25)} ${String(info.total).padStart(5)} puzzles  [${bandStr}]`);
  }
  if (sortedEntries.length > 20) {
    console.log(`   ... and ${sortedEntries.length - 20} more themes`);
  }
}

// --- Main ---
async function main() {
  try {
    // Download
    if (!SKIP_DOWNLOAD) {
      if (!existsSync(DOWNLOAD_PATH)) {
        await downloadFile(CSV_URL, DOWNLOAD_PATH);
      } else {
        console.log(`📁 Compressed file already exists: ${DOWNLOAD_PATH}`);
      }

      // Decompress
      if (!existsSync(CSV_PATH)) {
        const ok = decompressZstd(DOWNLOAD_PATH, CSV_PATH);
        if (!ok) process.exit(1);
      } else {
        console.log(`📁 CSV already exists: ${CSV_PATH}`);
      }
    } else {
      if (!existsSync(CSV_PATH)) {
        console.error(`❌ CSV not found at ${CSV_PATH}. Run without --skip-download first.`);
        process.exit(1);
      }
      console.log(`📁 Using existing CSV: ${CSV_PATH}`);
    }

    // Parse
    const data = await parseCsv(CSV_PATH);

    // Write
    writeOutput(data);

    console.log(`\n🎉 Done! Puzzle database expanded successfully.`);
    console.log(`   You can delete the downloaded files to save space:`);
    console.log(`   rm "${DOWNLOAD_PATH}" "${CSV_PATH}"`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
