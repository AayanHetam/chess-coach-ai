# Chess Masti AI — Data Pipeline

Downloads, processes, and curates chess commentary datasets for the AI coaching pipeline.

## Architecture

```
Datasets → Python Processing → Curated JSON → TypeScript Integration → LLM Few-Shot Prompts
```

These datasets feed the **prompt engineering** layer — they are NOT used for model fine-tuning.

## Datasets Integrated

| Dataset | Script | Purpose |
|---------|--------|---------|
| Icannos/chess_studies (6.1K games) | `01_process_icannos_studies.py` | Few-shot coaching examples |
| GM_games.pgn (~100 games) | `02_process_gm_games.py` | High-quality annotated GM games |
| Lichess Evaluated Games (1K sample) | `03_process_lichess_evaluated.py` | Validation benchmark |

## Quick Start

```bash
cd scripts/data-pipeline

# Install Python dependencies
pip install -r requirements.txt

# Run full pipeline (skip Lichess streaming for faster run)
bash run_pipeline.sh --skip-lichess

# Or run everything including validation benchmark
bash run_pipeline.sh
```

## Step-by-Step

```bash
# 1. Process Icannos/chess_studies from HuggingFace (CC0 license)
python3 01_process_icannos_studies.py

# 2. Download & process GM_games.pgn from GitHub
python3 02_process_gm_games.py

# 3. Stream Lichess evaluated games for validation (takes 10-30 min)
python3 03_process_lichess_evaluated.py

# 4. Curate best 60 examples for gold-standard few-shot prompts
python3 04_curate_gold_standard.py

# 5. Build validation benchmark suite
python3 05_build_validation_benchmark.py

# 6. Integrate into TypeScript codebase
node 06_integrate_examples.mjs
```

## Outputs

All outputs go to `scripts/data-pipeline/output/`:

| File | Description |
|------|-------------|
| `icannos_all.jsonl` | All processed Icannos studies |
| `gm_games.jsonl` | Processed GM game annotations |
| `lichess_evaluated_sample.jsonl` | Lichess games with Stockfish evals |
| `validation_positions.json` | Balanced validation positions |
| `curated_examples.json` | Best 60 examples for few-shot prompts |
| `curated_examples_fragment.ts` | TypeScript fragment for copy-paste |
| `benchmark_suite.json` | Validation benchmark (JSON) |
| `benchmark_suite.ts` | Validation benchmark (TypeScript) |

## Integration Points

- **`src/data/goldStandardExamples.ts`** — Expanded from 20 → 80 examples
- **`src/data/benchmarkPositions.ts`** — New file for validation testing
- **`selectExamples()`** — Now selects from larger, more diverse pool

## Refreshing Data

Re-run the pipeline periodically to update examples:

```bash
bash run_pipeline.sh
node 06_integrate_examples.mjs
```

The integration script backs up the existing `goldStandardExamples.ts` before overwriting.
