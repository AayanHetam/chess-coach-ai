#!/usr/bin/env python3
"""
Step 4: Curate gold-standard few-shot examples from processed datasets.

Reads the JSONL outputs from scripts 01 (Icannos) and 02 (GM_games),
scores each annotated move by commentary quality, and selects the best
50-100 examples balanced across position types and skill levels.

Outputs a TypeScript-ready JSON file that can be merged into
goldStandardExamples.ts.

Output: data-pipeline/output/curated_examples.json
        data-pipeline/output/curated_examples.ts  (copy-paste ready)
"""

import json
import re
import sys
from pathlib import Path
from collections import defaultdict

OUTPUT_DIR = Path(__file__).parent / "output"

# Target distribution for curated examples
TARGET_TOTAL = 60  # examples to select
TARGET_DISTRIBUTION = {
    # position_type -> count
    'tactical': 15,
    'strategic': 15,
    'endgame': 10,
    'opening': 10,
    'blunder': 10,
}
SKILL_TARGETS = {
    'beginner': 0.25,
    'intermediate': 0.45,
    'advanced': 0.30,
}


def load_processed_data():
    """Load all processed JSONL files."""
    records = []
    files = [
        OUTPUT_DIR / 'icannos_all.jsonl',
        OUTPUT_DIR / 'icannos_lichess.jsonl',
        OUTPUT_DIR / 'icannos_others.jsonl',
        OUTPUT_DIR / 'gm_games.jsonl',
    ]

    for fpath in files:
        if not fpath.exists():
            print(f"  Skipping {fpath.name} (not found)")
            continue

        count = 0
        with open(fpath, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                    count += 1
                except json.JSONDecodeError:
                    continue
        print(f"  Loaded {count} records from {fpath.name}")

    # Deduplicate by id
    seen_ids = set()
    unique = []
    for r in records:
        if r['id'] not in seen_ids:
            seen_ids.add(r['id'])
            unique.append(r)

    print(f"  Total unique records: {len(unique)}")
    return unique


def score_commentary_quality(move_data):
    """
    Score a single annotated move for few-shot example suitability.
    Higher = better candidate.
    
    Criteria:
    - Comment length (longer = more explanatory)
    - Contains chess concepts/vocabulary
    - Contains specific move references
    - Educational tone indicators
    - Has concrete analysis (variations mentioned)
    """
    comment = move_data.get('comment', '') or ''
    if not comment:
        return 0.0

    score = 0.0
    word_count = len(comment.split())

    # Length scoring (sweet spot: 30-150 words)
    if word_count < 10:
        score += 0.0
    elif word_count < 30:
        score += 1.0
    elif word_count < 80:
        score += 3.0  # Ideal range
    elif word_count < 150:
        score += 2.5
    else:
        score += 2.0  # Too long might be rambling

    # Chess concept vocabulary
    concept_words = [
        'because', 'idea', 'plan', 'threat', 'weakness', 'strong', 'weak',
        'attack', 'defend', 'control', 'pressure', 'tempo', 'initiative',
        'development', 'structure', 'sacrifice', 'compensation', 'advantage',
        'winning', 'losing', 'equal', 'better', 'worse', 'critical',
        'key', 'important', 'typical', 'standard', 'interesting',
    ]
    comment_lower = comment.lower()
    concept_hits = sum(1 for w in concept_words if w in comment_lower)
    score += min(concept_hits * 0.3, 2.0)

    # Contains specific move references (e.g., Nf3, Bxe5, etc.)
    move_refs = re.findall(r'[KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8][+#]?', comment)
    if move_refs:
        score += min(len(move_refs) * 0.2, 1.5)

    # Educational tone
    educational_phrases = [
        'the idea is', 'this is because', 'the point is', 'notice how',
        'the key move', 'important to', 'this allows', 'preventing',
        'with the idea', 'followed by', 'threatening', 'preparing',
    ]
    edu_hits = sum(1 for p in educational_phrases if p in comment_lower)
    score += edu_hits * 0.5

    # Contains variation/line analysis
    if '...' in comment or re.search(r'\d+\.', comment):
        score += 0.5

    # Penalty for very short or symbolic-only comments
    if word_count < 5:
        score *= 0.1
    # Penalty for comments that are mostly symbols
    alpha_ratio = sum(1 for c in comment if c.isalpha()) / max(len(comment), 1)
    if alpha_ratio < 0.4:
        score *= 0.5

    return round(score, 2)


def extract_candidate_examples(records):
    """
    Extract individual annotated moves as candidate few-shot examples.
    Each candidate is a single (FEN, commentary) pair with metadata.
    """
    candidates = []

    for record in records:
        for move in record.get('annotated_moves', []):
            comment = move.get('comment', '')
            if not comment or len(comment) < 20:
                continue

            quality_score = score_commentary_quality(move)
            if quality_score < 2.0:
                continue  # Skip low-quality

            candidate = {
                'source_id': record['id'],
                'source': record.get('source', 'unknown'),
                'event': record.get('event', ''),
                'white': record.get('white', ''),
                'black': record.get('black', ''),
                'annotator': record.get('annotator', ''),
                'move_number': move['move_number'],
                'move': move['move'],
                'fen_before': move['fen_before'],
                'fen_after': move['fen_after'],
                'comment': comment,
                'position_type': move.get('position_type', 'strategic'),
                'skill_level': move.get('skill_level', 'intermediate'),
                'quality_score': quality_score,
            }
            candidates.append(candidate)

    candidates.sort(key=lambda x: x['quality_score'], reverse=True)
    print(f"  Total candidates (score >= 2.0): {len(candidates)}")

    # Distribution of candidates
    type_counts = defaultdict(int)
    level_counts = defaultdict(int)
    for c in candidates:
        type_counts[c['position_type']] += 1
        level_counts[c['skill_level']] += 1

    print(f"  By type: {dict(type_counts)}")
    print(f"  By level: {dict(level_counts)}")

    return candidates


def select_balanced_examples(candidates, target_total=TARGET_TOTAL):
    """
    Select a balanced set of examples across position types and skill levels.
    Uses greedy selection: fill each bucket proportionally, picking highest-scored.
    """
    selected = []
    used_source_ids = set()  # Avoid multiple examples from same game

    # Build per-type, per-level buckets
    buckets = defaultdict(list)
    for c in candidates:
        key = (c['position_type'], c['skill_level'])
        buckets[key].append(c)

    # Calculate target counts per bucket
    bucket_targets = {}
    for pos_type, type_count in TARGET_DISTRIBUTION.items():
        for skill, skill_ratio in SKILL_TARGETS.items():
            count = max(1, round(type_count * skill_ratio))
            bucket_targets[(pos_type, skill)] = count

    # Greedy fill
    for (pos_type, skill), target in bucket_targets.items():
        bucket = buckets.get((pos_type, skill), [])
        filled = 0
        for c in bucket:
            if filled >= target:
                break
            # Don't take multiple from same game
            if c['source_id'] in used_source_ids:
                continue
            selected.append(c)
            used_source_ids.add(c['source_id'])
            filled += 1

    # If under target, fill remaining from highest-scored unused
    remaining_target = target_total - len(selected)
    if remaining_target > 0:
        selected_ids = {id(c) for c in selected}
        remaining = [c for c in candidates
                     if id(c) not in selected_ids and c['source_id'] not in used_source_ids]
        for c in remaining[:remaining_target]:
            selected.append(c)
            used_source_ids.add(c['source_id'])

    return selected


def format_scenario(example):
    """Build a scenario string from the example metadata."""
    parts = []
    if example['white'] and example['black']:
        parts.append(f"{example['white']} vs {example['black']}")
    if example['event']:
        parts.append(example['event'])
    parts.append(f"Move {example['move_number']}. {example['move']}")
    parts.append(f"FEN: {example['fen_before']}")
    return " — ".join(parts)


def generate_typescript(selected_examples):
    """Generate TypeScript source for the new gold-standard examples."""
    lines = []
    lines.append("// === AUTO-CURATED EXAMPLES FROM DATA PIPELINE ===")
    lines.append("// Generated by scripts/data-pipeline/04_curate_gold_standard.py")
    lines.append("// Source datasets: Icannos/chess_studies, GM_games.pgn")
    lines.append("")

    for i, ex in enumerate(selected_examples):
        var_id = f"data-{ex['position_type'][:4]}-{ex['skill_level'][:3]}-{i+1}"
        scenario = format_scenario(ex)
        # Escape backticks and dollar signs for template literal
        comment = ex['comment'].replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

        lines.append(f"  {{")
        lines.append(f"    id: \"{var_id}\",")
        lines.append(f"    positionType: \"{ex['position_type']}\",")
        lines.append(f"    skillLevel: \"{ex['skill_level']}\",")
        lines.append(f"    scenario: \"{scenario[:200]}\",")
        lines.append(f"    idealResponse: `{comment}`,")
        lines.append(f"  }},")

    return "\n".join(lines)


def main():
    print("=" * 60)
    print("Gold-Standard Example Curation Pipeline")
    print("=" * 60)
    print()

    # Load processed data
    print("Loading processed datasets...")
    records = load_processed_data()

    if not records:
        print("\nERROR: No processed data found. Run scripts 01 and 02 first.")
        print("  python 01_process_icannos_studies.py")
        print("  python 02_process_gm_games.py")
        sys.exit(1)

    # Extract candidates
    print("\nExtracting candidate examples...")
    candidates = extract_candidate_examples(records)

    if not candidates:
        print("\nERROR: No suitable candidates found.")
        sys.exit(1)

    # Select balanced set
    print(f"\nSelecting {TARGET_TOTAL} balanced examples...")
    selected = select_balanced_examples(candidates)

    # Distribution of selected
    type_counts = defaultdict(int)
    level_counts = defaultdict(int)
    source_counts = defaultdict(int)
    for s in selected:
        type_counts[s['position_type']] += 1
        level_counts[s['skill_level']] += 1
        source_counts[s['source']] += 1

    print(f"\n  Selected: {len(selected)} examples")
    print(f"  By type: {dict(type_counts)}")
    print(f"  By level: {dict(level_counts)}")
    print(f"  By source: {dict(source_counts)}")
    print(f"  Avg quality score: {sum(s['quality_score'] for s in selected)/len(selected):.2f}")

    # Save JSON
    json_path = OUTPUT_DIR / 'curated_examples.json'
    with open(json_path, 'w') as f:
        json.dump(selected, f, indent=2, ensure_ascii=False)
    print(f"\n  JSON output: {json_path}")

    # Save TypeScript fragment
    ts_content = generate_typescript(selected)
    ts_path = OUTPUT_DIR / 'curated_examples_fragment.ts'
    with open(ts_path, 'w') as f:
        f.write(ts_content)
    print(f"  TypeScript fragment: {ts_path}")

    # Show top 5 examples
    print(f"\n  Top 5 examples by quality score:")
    for ex in selected[:5]:
        preview = ex['comment'][:100] + '...' if len(ex['comment']) > 100 else ex['comment']
        print(f"    [{ex['quality_score']:.1f}] {ex['position_type']}/{ex['skill_level']}: {preview}")


if __name__ == '__main__':
    main()
