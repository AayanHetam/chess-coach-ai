#!/usr/bin/env python3
"""
Step 1: Download & process Icannos/chess_studies from HuggingFace.

Extracts human-annotated chess studies with inline commentary.
Produces structured JSONL records for few-shot prompt building.

Source: https://huggingface.co/datasets/Icannos/chess_studies
License: CC0

Output: data-pipeline/output/icannos_studies.jsonl
"""

import json
import io
import os
import sys
from pathlib import Path

try:
    import chess.pgn
except ImportError:
    print("ERROR: python-chess not installed. Run: pip install chess")
    sys.exit(1)

try:
    from huggingface_hub import hf_hub_download
except ImportError:
    print("ERROR: huggingface_hub not installed. Run: pip install huggingface_hub")
    sys.exit(1)

import csv

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


def extract_commentary_from_game(game):
    """Extract all moves with their inline comments from a parsed PGN game."""
    moves_with_commentary = []
    node = game
    move_number = 0

    while node.variations:
        next_node = node.variation(0)
        move_number += 1

        move_san = next_node.san() if hasattr(next_node, 'san') else str(next_node.move)
        comment = next_node.comment.strip() if next_node.comment else None

        move_data = {
            'move_number': (move_number + 1) // 2,
            'is_white': (move_number % 2 == 1),
            'move': move_san,
            'comment': comment,
            'fen_before': node.board().fen(),
            'fen_after': next_node.board().fen(),
        }

        if comment and len(comment) > 5:
            moves_with_commentary.append(move_data)

        node = next_node

    return moves_with_commentary


def classify_position_type(fen, move_number, comment_text):
    """Heuristic classification of position type based on FEN and context."""
    comment_lower = comment_text.lower() if comment_text else ""

    # Count pieces to estimate game phase
    piece_count = sum(1 for c in fen.split()[0] if c.isalpha())

    # Check for tactical keywords
    tactical_keywords = ['fork', 'pin', 'skewer', 'sacrifice', 'sac', 'mate', 'check',
                         'attack', 'tactic', 'combination', 'trap', 'threat', 'winning']
    strategic_keywords = ['plan', 'structure', 'weak', 'outpost', 'file', 'diagonal',
                          'bishop pair', 'space', 'control', 'pressure', 'blockade']
    endgame_keywords = ['endgame', 'king activity', 'passed pawn', 'opposition',
                        'rook ending', 'pawn ending', 'technique', 'convert']
    opening_keywords = ['opening', 'develop', 'castle', 'theory', 'gambit', 'variation']

    tactical_score = sum(1 for k in tactical_keywords if k in comment_lower)
    strategic_score = sum(1 for k in strategic_keywords if k in comment_lower)
    endgame_score = sum(1 for k in endgame_keywords if k in comment_lower)
    opening_score = sum(1 for k in opening_keywords if k in comment_lower)

    # Game phase heuristics
    if move_number <= 12:
        opening_score += 2
    if piece_count <= 14:
        endgame_score += 2
    if piece_count > 14 and move_number > 12:
        strategic_score += 1

    scores = {
        'tactical': tactical_score,
        'strategic': strategic_score,
        'endgame': endgame_score,
        'opening': opening_score,
    }

    return max(scores, key=scores.get) if max(scores.values()) > 0 else 'strategic'


def estimate_skill_level(comment_text):
    """Estimate the skill level the commentary is pitched at."""
    if not comment_text:
        return "intermediate"

    comment_lower = comment_text.lower()
    words = comment_lower.split()
    word_count = len(words)

    # Advanced indicators: deep calculation, concrete variations, evaluation symbols
    advanced_indicators = ['variation', 'evaluate', 'compensation', 'initiative',
                           'prophylaxis', 'zwischenzug', 'zugzwang', 'tempo',
                           'positional sacrifice', 'exchange sacrifice']
    beginner_indicators = ['always', 'never', 'remember', 'basic', 'simple',
                           'easy', 'first', 'beginner', 'learn', 'important to']

    adv_score = sum(1 for k in advanced_indicators if k in comment_lower)
    beg_score = sum(1 for k in beginner_indicators if k in comment_lower)

    # Longer, more detailed comments tend to be for higher levels
    if word_count > 60:
        adv_score += 1
    if word_count < 15:
        beg_score += 1

    if adv_score > beg_score:
        return "advanced"
    elif beg_score > adv_score:
        return "beginner"
    return "intermediate"


CSV_FILES = {
    'lichess': 'lichess_studies.csv',
    'others': 'others.csv',
}


def download_csv(subset_name):
    """Download raw CSV file from HuggingFace repo."""
    filename = CSV_FILES[subset_name]
    print(f"  Downloading {filename} from HuggingFace...")
    local_path = hf_hub_download(
        repo_id="Icannos/chess_studies",
        filename=filename,
        repo_type="dataset",
    )
    print(f"  Downloaded to: {local_path}")
    return local_path


def process_subset(subset_name, output_path):
    """Process a single Icannos dataset subset by downloading the raw CSV."""
    print(f"\n{'='*60}")
    print(f"Processing Icannos/{subset_name} subset...")
    print(f"{'='*60}")

    try:
        csv_path = download_csv(subset_name)
    except Exception as e:
        print(f"  ERROR downloading subset '{subset_name}': {e}")
        return []

    processed = []
    errors = 0
    total = 0

    with open(csv_path, 'r', errors='replace') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header:
            print(f"  CSV columns: {header}")

        # Find the column containing PGN text
        text_col = 0  # default to first column
        if header:
            for i, col in enumerate(header):
                if col.lower() in ('text', 'pgn', 'study', 'content'):
                    text_col = i
                    break

        for idx, row in enumerate(reader):
            total += 1
            if idx % 500 == 0 and idx > 0:
                print(f"  Processing {idx}...")

            try:
                pgn_text = row[text_col] if len(row) > text_col else ''
                if not pgn_text or len(pgn_text) < 20:
                    continue

                # The CSV may contain multiple games concatenated;
                # read the first game from each entry
                pgn_stream = io.StringIO(pgn_text)
                game = chess.pgn.read_game(pgn_stream)

                if game is None:
                    continue

                moves_with_commentary = extract_commentary_from_game(game)

                if not moves_with_commentary:
                    continue

                avg_comment_len = (
                    sum(len(m['comment']) for m in moves_with_commentary if m['comment'])
                    / len(moves_with_commentary)
                )

                # Classify each annotated move
                for move in moves_with_commentary:
                    move['position_type'] = classify_position_type(
                        move['fen_before'], move['move_number'], move['comment']
                    )
                    move['skill_level'] = estimate_skill_level(move['comment'])

                record = {
                    'id': f"icannos-{subset_name}-{idx}",
                    'event': game.headers.get('Event', ''),
                    'white': game.headers.get('White', ''),
                    'black': game.headers.get('Black', ''),
                    'result': game.headers.get('Result', ''),
                    'eco': game.headers.get('ECO', ''),
                    'annotator': game.headers.get('Annotator', ''),
                    'annotated_moves': moves_with_commentary,
                    'total_commentary_moves': len(moves_with_commentary),
                    'avg_comment_length': round(avg_comment_len, 1),
                    'source': f'icannos/{subset_name}',
                }
                processed.append(record)

            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"  Error processing entry {idx}: {e}")

    # Write JSONL
    with open(output_path, 'w') as f:
        for record in processed:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')

    total_moves = sum(r['total_commentary_moves'] for r in processed)
    print(f"\n  Results for '{subset_name}':")
    print(f"    Games with commentary: {len(processed)}/{total}")
    print(f"    Total commentary moves: {total_moves}")
    print(f"    Avg commentary moves/game: {total_moves/max(len(processed),1):.1f}")
    print(f"    Errors: {errors}")
    print(f"    Output: {output_path}")

    return processed


def main():
    print("=" * 60)
    print("Icannos/chess_studies Data Pipeline")
    print("=" * 60)

    all_records = []

    # Process both subsets
    for subset in ['lichess', 'others']:
        output_path = OUTPUT_DIR / f'icannos_{subset}.jsonl'
        records = process_subset(subset, output_path)
        all_records.extend(records)

    # Write combined output
    combined_path = OUTPUT_DIR / 'icannos_all.jsonl'
    with open(combined_path, 'w') as f:
        for record in all_records:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')

    # Summary statistics
    print(f"\n{'='*60}")
    print(f"COMBINED SUMMARY")
    print(f"{'='*60}")
    print(f"  Total annotated games: {len(all_records)}")
    total_moves = sum(r['total_commentary_moves'] for r in all_records)
    print(f"  Total commentary moves: {total_moves}")

    # Quality distribution
    quality_bins = {'rich': 0, 'moderate': 0, 'sparse': 0}
    for r in all_records:
        if r['avg_comment_length'] > 100:
            quality_bins['rich'] += 1
        elif r['avg_comment_length'] > 40:
            quality_bins['moderate'] += 1
        else:
            quality_bins['sparse'] += 1

    print(f"  Quality distribution:")
    print(f"    Rich (avg >100 chars):     {quality_bins['rich']}")
    print(f"    Moderate (avg 40-100):      {quality_bins['moderate']}")
    print(f"    Sparse (avg <40):           {quality_bins['sparse']}")
    print(f"\n  Combined output: {combined_path}")


if __name__ == '__main__':
    main()
