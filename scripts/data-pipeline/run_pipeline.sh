#!/bin/bash
# Chess Masti AI — Data Pipeline Runner
# Run all data processing scripts in order.
#
# Usage:
#   cd scripts/data-pipeline
#   pip install -r requirements.txt
#   bash run_pipeline.sh [--skip-lichess]
#
# The --skip-lichess flag skips the large Lichess evaluated games download (script 03).

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Detect the correct Python — prefer the one that has chess.pgn installed
if python3 -c "import chess.pgn" 2>/dev/null; then
    PYTHON=python3
elif /Users/aayanhetamsaria/anaconda3/bin/python3 -c "import chess.pgn" 2>/dev/null; then
    PYTHON=/Users/aayanhetamsaria/anaconda3/bin/python3
else
    echo "ERROR: No Python with chess.pgn found. Run: pip install chess datasets zstandard requests"
    exit 1
fi
echo "Using Python: $PYTHON"

SKIP_LICHESS=false
for arg in "$@"; do
    if [ "$arg" = "--skip-lichess" ]; then
        SKIP_LICHESS=true
    fi
done

echo "=============================================="
echo "Chess Masti AI — Data Pipeline"
echo "=============================================="
echo ""

# Step 1: Icannos/chess_studies
echo "[1/5] Processing Icannos/chess_studies..."
$PYTHON 01_process_icannos_studies.py
echo ""

# Step 2: GM_games.pgn
echo "[2/5] Processing GM_games.pgn..."
$PYTHON 02_process_gm_games.py
echo ""

# Step 3: Lichess Evaluated Games (optional)
if [ "$SKIP_LICHESS" = true ]; then
    echo "[3/5] SKIPPED: Lichess evaluated games (--skip-lichess flag)"
    echo ""
else
    echo "[3/5] Processing Lichess evaluated games..."
    echo "       (This streams a large archive — may take 10-30 minutes)"
    $PYTHON 03_process_lichess_evaluated.py
    echo ""
fi

# Step 4: Curate gold-standard examples
echo "[4/5] Curating gold-standard examples..."
$PYTHON 04_curate_gold_standard.py
echo ""

# Step 5: Build validation benchmark (requires step 3)
if [ "$SKIP_LICHESS" = true ]; then
    echo "[5/5] SKIPPED: Validation benchmark (requires Lichess evaluated games)"
else
    echo "[5/5] Building validation benchmark..."
    $PYTHON 05_build_validation_benchmark.py
fi

echo ""
echo "=============================================="
echo "Pipeline complete!"
echo "=============================================="
echo ""
echo "Outputs in: scripts/data-pipeline/output/"
echo ""
echo "Next steps:"
echo "  1. Review output/curated_examples.json"
echo "  2. Run: node scripts/data-pipeline/06_integrate_examples.mjs"
echo "     to merge curated examples into goldStandardExamples.ts"
echo "  3. If validation benchmark was built, copy output/benchmark_suite.ts"
echo "     to src/data/benchmarkPositions.ts"
