/**
 * Parse the Vienna Whiteside PGN file and extract all variations into
 * a JSON structure suitable for the repertoire drill system.
 *
 * Usage: node scripts/parse-vienna-pgn.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PGN_PATH = path.join(
  __dirname,
  "..",
  "Openings",
  "Vienna Whiteside (2).pgn"
);

const raw = fs.readFileSync(PGN_PATH, "utf-8");

// Split into individual games by [Event headers
const gameBlocks = [];
const lines = raw.split("\n");
let currentBlock = [];
for (const line of lines) {
  if (line.startsWith('[Event ') && currentBlock.length > 0) {
    gameBlocks.push(currentBlock.join("\n"));
    currentBlock = [];
  }
  currentBlock.push(line);
}
if (currentBlock.length > 0) gameBlocks.push(currentBlock.join("\n"));

console.log(`Found ${gameBlocks.length} game blocks\n`);

// Extract headers from a game block
function extractHeaders(block) {
  const headers = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    headers[m[1]] = m[2];
  }
  return headers;
}

// Extract movetext (everything after the last header line)
function extractMovetext(block) {
  const lines = block.split("\n");
  let lastHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("[")) lastHeaderIdx = i;
  }
  return lines
    .slice(lastHeaderIdx + 1)
    .join(" ")
    .trim();
}

// Tokenize PGN movetext into tokens
function tokenize(movetext) {
  const tokens = [];
  let i = 0;
  while (i < movetext.length) {
    // Skip whitespace
    if (/\s/.test(movetext[i])) {
      i++;
      continue;
    }
    // Comment
    if (movetext[i] === "{") {
      const end = movetext.indexOf("}", i);
      if (end === -1) break;
      tokens.push({ type: "comment", value: movetext.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    // Variation start
    if (movetext[i] === "(") {
      tokens.push({ type: "var_start" });
      i++;
      continue;
    }
    // Variation end
    if (movetext[i] === ")") {
      tokens.push({ type: "var_end" });
      i++;
      continue;
    }
    // NAG ($1, $2, etc.)
    if (movetext[i] === "$") {
      let j = i + 1;
      while (j < movetext.length && /\d/.test(movetext[j])) j++;
      tokens.push({ type: "nag", value: movetext.slice(i, j) });
      i = j;
      continue;
    }
    // Result
    if (
      movetext.slice(i).startsWith("1-0") ||
      movetext.slice(i).startsWith("0-1") ||
      movetext.slice(i).startsWith("1/2-1/2") ||
      movetext[i] === "*"
    ) {
      if (movetext.slice(i).startsWith("1/2-1/2")) {
        tokens.push({ type: "result", value: "1/2-1/2" });
        i += 7;
      } else if (movetext.slice(i).startsWith("1-0")) {
        tokens.push({ type: "result", value: "1-0" });
        i += 3;
      } else if (movetext.slice(i).startsWith("0-1")) {
        tokens.push({ type: "result", value: "0-1" });
        i += 3;
      } else {
        tokens.push({ type: "result", value: "*" });
        i++;
      }
      continue;
    }
    // Move number (e.g., "1." or "1...")
    if (/\d/.test(movetext[i])) {
      let j = i;
      while (j < movetext.length && /\d/.test(movetext[j])) j++;
      if (movetext[j] === ".") {
        while (j < movetext.length && movetext[j] === ".") j++;
        tokens.push({ type: "move_number", value: movetext.slice(i, j) });
        i = j;
        continue;
      }
      // Could be part of a move like a4, but shouldn't start with digit for SAN
      // Fall through to move parsing
    }
    // SAN move or other token
    let j = i;
    while (j < movetext.length && !/[\s{}()$]/.test(movetext[j])) j++;
    const token = movetext.slice(i, j);
    if (token.length > 0) {
      // Check if it's a move number
      if (/^\d+\.+$/.test(token)) {
        tokens.push({ type: "move_number", value: token });
      } else if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) {
        tokens.push({ type: "result", value: token });
      } else {
        tokens.push({ type: "move", value: token });
      }
    }
    i = j;
  }
  return tokens;
}

// Build a variation tree from tokens
// Returns an array of variation paths (each path = array of SAN moves)
function extractVariations(tokens) {
  const allPaths = [];
  const stack = [[]]; // stack of move arrays; stack[0] = main line

  for (const token of tokens) {
    if (token.type === "move") {
      stack[stack.length - 1].push(token.value);
    } else if (token.type === "var_start") {
      // Fork: copy parent moves up to the fork point (minus the last move which is being replaced)
      const parent = stack[stack.length - 1];
      const fork = parent.slice(0, -1); // remove last move (the one being varied)
      stack.push(fork);
    } else if (token.type === "var_end") {
      if (stack.length > 1) {
        const completed = stack.pop();
        allPaths.push(completed);
      }
    }
  }

  // The main line
  if (stack.length > 0) {
    allPaths.push(stack[0]);
  }

  return allPaths;
}

// Extract a meaningful comment near the start of a variation
function extractFirstComment(tokens, startIdx) {
  let depth = 0;
  for (let i = startIdx; i < tokens.length && i < startIdx + 30; i++) {
    if (tokens[i].type === "var_start") depth++;
    if (tokens[i].type === "var_end") {
      depth--;
      if (depth < 0) break;
    }
    if (tokens[i].type === "comment" && depth === 0) {
      // Clean up chess annotations
      let c = tokens[i].value;
      c = c.replace(/\[%[^\]]*\]/g, "").trim();
      // Remove game references
      c = c.replace(/\d+-\d+\s+\w.*$/g, "").trim();
      if (c.length > 10 && c.length < 200) return c;
    }
  }
  return "";
}

// Better variation extraction: walk the token stream and record every
// complete path from root to leaf
function extractAllPaths(tokens) {
  const results = [];

  function walk(idx, movesSoFar, depth) {
    let moves = [...movesSoFar];
    let i = idx;
    let lastMoveIdx = -1;

    while (i < tokens.length) {
      const t = tokens[i];

      if (t.type === "move") {
        moves.push(t.value);
        lastMoveIdx = i;
        i++;
      } else if (t.type === "var_start") {
        // A variation branches off: the last move is replaced
        const branchPoint = moves.slice(0, -1);
        let varDepth = 1;
        let varStart = i + 1;

        // Find the matching var_end
        let j = i + 1;
        // But first, recurse into this variation
        walk(varStart, branchPoint, depth + 1);

        // Skip past this variation
        j = i + 1;
        varDepth = 1;
        while (j < tokens.length && varDepth > 0) {
          if (tokens[j].type === "var_start") varDepth++;
          if (tokens[j].type === "var_end") varDepth--;
          j++;
        }
        i = j;
      } else if (t.type === "var_end") {
        // End of current variation
        break;
      } else {
        i++;
      }
    }

    // Record this path if it has enough moves
    if (moves.length >= 3) {
      results.push(moves);
    }
  }

  walk(0, [], 0);
  return results;
}

// Deduplicate paths and filter
function dedup(paths) {
  const seen = new Set();
  const unique = [];
  for (const p of paths) {
    const key = p.join(" ");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique;
}

// Process each game block
const allLines = [];
let lineCounter = 0;

for (let g = 0; g < gameBlocks.length; g++) {
  const block = gameBlocks[g];
  const headers = extractHeaders(block);
  const movetext = extractMovetext(block);

  if (!movetext || movetext.length < 10) continue;

  const chapterName =
    (headers.White || "") + (headers.Black ? " " + headers.Black : "");

  console.log(`\n=== Chapter ${g + 1}: ${chapterName} ===`);

  const tokens = tokenize(movetext);
  const paths = extractAllPaths(tokens);
  const uniquePaths = dedup(paths);

  console.log(`  Extracted ${uniquePaths.length} unique variation paths`);

  for (const p of uniquePaths) {
    // Limit to opening phase (max 30 moves = 60 half-moves)
    const trimmed = p.slice(0, 40);
    if (trimmed.length < 3) continue;

    lineCounter++;
    const lineId = `vienna-${lineCounter}`;

    // Generate a name from the first few moves
    const movePreview = trimmed.slice(0, 8).join(" ");
    const lineName = `${chapterName} (${movePreview}...)`.slice(0, 80);

    allLines.push({
      id: lineId,
      name: lineName,
      moves: trimmed,
      description: `${chapterName} — ${trimmed.length} moves`,
    });
  }
}

console.log(`\n\nTotal lines extracted: ${allLines.length}`);

// Write output
const outputPath = path.join(__dirname, "..", "src", "data", "vienna-lines.json");
fs.writeFileSync(outputPath, JSON.stringify(allLines, null, 2));
console.log(`\nWritten to ${outputPath}`);

// Also print a summary
for (const line of allLines) {
  console.log(`  ${line.id}: ${line.name} (${line.moves.length} moves)`);
}
