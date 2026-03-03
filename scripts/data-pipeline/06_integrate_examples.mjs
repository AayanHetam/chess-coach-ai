#!/usr/bin/env node
/**
 * Step 6: Integrate curated examples into goldStandardExamples.ts
 *
 * Reads output/curated_examples.json and generates a new version of
 * src/data/goldStandardExamples.ts that includes both the original
 * 20 hand-crafted examples AND the new data-pipeline curated examples.
 *
 * Usage:
 *   node scripts/data-pipeline/06_integrate_examples.mjs
 *
 * This script:
 *   1. Reads the existing goldStandardExamples.ts to preserve hand-crafted examples
 *   2. Reads curated_examples.json from the pipeline output
 *   3. Generates an expanded GOLD_STANDARD_EXAMPLES array
 *   4. Writes to src/data/goldStandardExamples.ts (backs up the original first)
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const OUTPUT_DIR = join(__dirname, 'output');
const TARGET_FILE = join(PROJECT_ROOT, 'src', 'data', 'goldStandardExamples.ts');
const CURATED_JSON = join(OUTPUT_DIR, 'curated_examples.json');
const BACKUP_FILE = TARGET_FILE + '.bak';

function escapeTemplateString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function truncateScenario(example) {
  const parts = [];
  if (example.white && example.black) {
    parts.push(`${example.white} vs ${example.black}`);
  }
  if (example.event) {
    parts.push(example.event);
  }
  parts.push(`Move ${example.move_number}. ${example.move}`);
  parts.push(`FEN: ${example.fen_before}`);
  const scenario = parts.join(' — ');
  return scenario.length > 250 ? scenario.slice(0, 247) + '...' : scenario;
}

function mapPositionType(type) {
  const valid = ['tactical', 'strategic', 'endgame', 'opening', 'blunder'];
  return valid.includes(type) ? type : 'strategic';
}

function mapSkillLevel(level) {
  const valid = ['beginner', 'intermediate', 'advanced'];
  return valid.includes(level) ? level : 'intermediate';
}

function main() {
  console.log('='.repeat(60));
  console.log('Integrating curated examples into goldStandardExamples.ts');
  console.log('='.repeat(60));
  console.log();

  // Check curated examples exist
  if (!existsSync(CURATED_JSON)) {
    console.error(`ERROR: ${CURATED_JSON} not found.`);
    console.error('Run the Python pipeline first: bash run_pipeline.sh');
    process.exit(1);
  }

  // Load curated examples
  const curated = JSON.parse(readFileSync(CURATED_JSON, 'utf-8'));
  console.log(`  Loaded ${curated.length} curated examples from pipeline`);

  // Backup existing file
  if (existsSync(TARGET_FILE)) {
    copyFileSync(TARGET_FILE, BACKUP_FILE);
    console.log(`  Backed up existing file to ${BACKUP_FILE}`);
  }

  // Build the new curated entries
  const newEntries = curated.map((ex, i) => {
    const id = `data-${ex.position_type.slice(0, 4)}-${ex.skill_level.slice(0, 3)}-${i + 1}`;
    const scenario = truncateScenario(ex);
    const comment = escapeTemplateString(ex.comment);
    const posType = mapPositionType(ex.position_type);
    const skillLvl = mapSkillLevel(ex.skill_level);

    return `  {
    id: "${id}",
    positionType: "${posType}",
    skillLevel: "${skillLvl}",
    scenario: "${escapeTemplateString(scenario)}",
    idealResponse: \`${comment}\`,
  }`;
  });

  // Read the existing file to extract the hand-crafted examples section
  const existingContent = readFileSync(TARGET_FILE, 'utf-8');

  // Find the closing of the GOLD_STANDARD_EXAMPLES array
  // We'll insert new entries before the closing ];
  const arrayClosePattern = /^];$/m;
  const arrayCloseMatch = existingContent.match(arrayClosePattern);

  if (!arrayCloseMatch) {
    console.error('ERROR: Could not find closing ]; of GOLD_STANDARD_EXAMPLES array');
    process.exit(1);
  }

  // Insert the new entries before the ];
  const insertPoint = existingContent.indexOf(arrayCloseMatch[0]);
  const newContent =
    existingContent.slice(0, insertPoint) +
    '\n  // === AUTO-CURATED EXAMPLES FROM DATA PIPELINE ===\n' +
    '  // Source: Icannos/chess_studies + GM_games.pgn\n' +
    `  // Generated: ${new Date().toISOString().slice(0, 10)}\n` +
    '  // Run scripts/data-pipeline/run_pipeline.sh to regenerate\n\n' +
    newEntries.join(',\n') + ',\n' +
    existingContent.slice(insertPoint);

  writeFileSync(TARGET_FILE, newContent, 'utf-8');

  // Count total examples
  const totalExamples = 20 + curated.length; // 20 original + curated
  console.log(`\n  Written ${TARGET_FILE}`);
  console.log(`  Total examples: ${totalExamples} (20 hand-crafted + ${curated.length} data-curated)`);

  // Type distribution
  const typeCounts = {};
  const levelCounts = {};
  for (const ex of curated) {
    typeCounts[ex.position_type] = (typeCounts[ex.position_type] || 0) + 1;
    levelCounts[ex.skill_level] = (levelCounts[ex.skill_level] || 0) + 1;
  }
  console.log(`  New examples by type: ${JSON.stringify(typeCounts)}`);
  console.log(`  New examples by level: ${JSON.stringify(levelCounts)}`);
  console.log(`\n  Backup: ${BACKUP_FILE}`);
}

main();
