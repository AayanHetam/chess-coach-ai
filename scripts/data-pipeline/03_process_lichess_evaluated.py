#!/usr/bin/env python3
"""
Step 3: Download & process a small sample of Lichess games with Stockfish evaluations.

Streams a monthly Lichess PGN archive (zst compressed) and extracts only
games that contain inline %eval annotations. Targets ~1000 evaluated games
for use as a validation benchmark.

Source: https://database.lichess.org/ (monthly PGN archives)
License: CC0

Output: data-pipeline/output/lichess_evaluated_sample.jsonl
"""

import json
import io
import os
import sys
import re
from pathlib import Path

try:
    import chess.pgn
except ImportError:
    print("ERROR: python-chess not installed. Run: pip install python-chess")
    sys.exit(1)

try:
    import zstandard
except ImportError:
    print("ERROR: zstandard not installed. Run: pip install zstandard")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip install requests")
    sys.exit(1)

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Use a smaller/older month to keep download size manageable
# Standard games from 2024-01 are ~3-4GB compressed
# We'll stream and stop after finding enough evaluated games
LICHESS_DB_URL = "https://database.lichess.org/standard/lichess_db_standard_rated_2024-01.pgn.zst"

# How many evaluated games to collect
TARGET_GAMES = 1000
# Max games to scan before giving up
MAX_SCAN = 500000


def parse_eval_from_comment(comment):
    """Extract %eval value from a PGN comment like '{[%eval 1.23]}'."""
    if not comment:
        return None
    match = re.search(r'\[%eval\s+([+-]?\d+\.?\d*|#[+-]?\d+)\]', comment)
    if match:
        val = match.group(1)
        if val.startswith('#'):
            # Mate score — convert to large centipawn value
            mate_in = int(val[1:])
            return 10000 if mate_in > 0 else -10000
        return float(val)
    return None


def extract_evaluated_moves(game):
    """Extract moves with %eval annotations from a game."""
    evaluated_moves = []
    node = game
    move_number = 0

    while node.variations:
        next_node = node.variation(0)
        move_number += 1

        eval_val = parse_eval_from_comment(next_node.comment)

        if eval_val is not None:
            move_san = next_node.san() if hasattr(next_node, 'san') else str(next_node.move)
            evaluated_moves.append({
                'move_number': (move_number + 1) // 2,
                'is_white': (move_number % 2 == 1),
                'move': move_san,
                'eval_cp': round(eval_val * 100) if abs(eval_val) < 100 else int(eval_val),
                'fen_before': node.board().fen(),
                'fen_after': next_node.board().fen(),
            })

        node = next_node

    return evaluated_moves


def classify_game_phase_positions(evaluated_moves):
    """Tag each evaluated position with its game phase for validation diversity."""
    for move in evaluated_moves:
        fen = move['fen_before']
        piece_count = sum(1 for c in fen.split()[0] if c.isalpha())
        mn = move['move_number']

        if mn <= 12:
            move['phase'] = 'opening'
        elif piece_count <= 14:
            move['phase'] = 'endgame'
        else:
            move['phase'] = 'middlegame'

    return evaluated_moves


def stream_and_extract(zst_url, target_games, max_scan):
    """Stream a zst-compressed PGN and extract evaluated games."""
    print(f"  Streaming from: {zst_url}")
    print(f"  Target: {target_games} evaluated games (scanning up to {max_scan})")

    evaluated_games = []
    games_checked = 0

    # Stream the download — don't download the whole file
    resp = requests.get(zst_url, stream=True, timeout=30)
    resp.raise_for_status()

    dctx = zstandard.ZstdDecompressor()
    reader = dctx.stream_reader(resp.raw)
    text_stream = io.TextIOWrapper(reader, encoding='utf-8', errors='replace')

    while len(evaluated_games) < target_games and games_checked < max_scan:
        try:
            game = chess.pgn.read_game(text_stream)
            if game is None:
                print(f"  Reached end of archive after {games_checked} games")
                break
        except Exception:
            games_checked += 1
            continue

        games_checked += 1

        if games_checked % 10000 == 0:
            print(f"  Scanned {games_checked} games, found {len(evaluated_games)} evaluated...")

        # Quick check: does the game have eval annotations?
        has_eval = False
        node = game
        check_depth = 0
        while node.variations and check_depth < 5:
            node = node.variation(0)
            check_depth += 1
            if node.comment and '%eval' in node.comment:
                has_eval = True
                break

        if not has_eval:
            continue

        # Full extraction
        evaluated_moves = extract_evaluated_moves(game)
        if len(evaluated_moves) < 10:
            continue  # Need substantial eval coverage

        evaluated_moves = classify_game_phase_positions(evaluated_moves)

        # Compute eval volatility (large swings = interesting positions)
        evals = [m['eval_cp'] for m in evaluated_moves]
        eval_changes = [abs(evals[i+1] - evals[i]) for i in range(len(evals)-1)]
        max_swing = max(eval_changes) if eval_changes else 0
        avg_swing = sum(eval_changes) / len(eval_changes) if eval_changes else 0

        record = {
            'id': f"lichess-eval-{games_checked}",
            'white': game.headers.get('White', ''),
            'black': game.headers.get('Black', ''),
            'white_elo': game.headers.get('WhiteElo', ''),
            'black_elo': game.headers.get('BlackElo', ''),
            'result': game.headers.get('Result', ''),
            'eco': game.headers.get('ECO', ''),
            'time_control': game.headers.get('TimeControl', ''),
            'site': game.headers.get('Site', ''),
            'evaluated_moves': evaluated_moves,
            'total_evaluated_moves': len(evaluated_moves),
            'max_eval_swing_cp': max_swing,
            'avg_eval_swing_cp': round(avg_swing, 1),
            'source': 'lichess_evaluated',
        }
        evaluated_games.append(record)

    return evaluated_games, games_checked


def extract_validation_positions(evaluated_games, positions_per_phase=50):
    """
    Extract a balanced set of validation positions across game phases.
    These are positions where we know the Stockfish eval, and can test
    our pipeline's annotation accuracy.
    """
    positions = {'opening': [], 'middlegame': [], 'endgame': []}

    for game in evaluated_games:
        for move in game['evaluated_moves']:
            phase = move.get('phase', 'middlegame')
            if len(positions[phase]) < positions_per_phase:
                positions[phase].append({
                    'fen': move['fen_before'],
                    'expected_eval_cp': move['eval_cp'],
                    'best_move': move['move'],
                    'phase': phase,
                    'game_id': game['id'],
                    'white_elo': game['white_elo'],
                    'black_elo': game['black_elo'],
                })

    all_positions = []
    for phase, pos_list in positions.items():
        all_positions.extend(pos_list)

    return all_positions


def main():
    print("=" * 60)
    print("Lichess Evaluated Games Data Pipeline")
    print("=" * 60)
    print()
    print("NOTE: This streams a large archive over the network.")
    print("It will download only as much as needed to find evaluated games.")
    print()

    evaluated_games, total_scanned = stream_and_extract(
        LICHESS_DB_URL, TARGET_GAMES, MAX_SCAN
    )

    # Write full evaluated games
    output_path = OUTPUT_DIR / 'lichess_evaluated_sample.jsonl'
    with open(output_path, 'w') as f:
        for record in evaluated_games:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')

    # Extract balanced validation positions
    validation_positions = extract_validation_positions(evaluated_games)
    validation_path = OUTPUT_DIR / 'validation_positions.json'
    with open(validation_path, 'w') as f:
        json.dump(validation_positions, f, indent=2)

    # Summary
    total_moves = sum(r['total_evaluated_moves'] for r in evaluated_games)
    phase_counts = {'opening': 0, 'middlegame': 0, 'endgame': 0}
    for vp in validation_positions:
        phase_counts[vp['phase']] += 1

    print(f"\n  Results:")
    print(f"    Games scanned: {total_scanned}")
    print(f"    Evaluated games found: {len(evaluated_games)}")
    print(f"    Total evaluated moves: {total_moves}")
    print(f"    Avg evaluated moves/game: {total_moves/max(len(evaluated_games),1):.1f}")
    print(f"\n  Validation positions extracted: {len(validation_positions)}")
    print(f"    Opening: {phase_counts['opening']}")
    print(f"    Middlegame: {phase_counts['middlegame']}")
    print(f"    Endgame: {phase_counts['endgame']}")
    print(f"\n  Outputs:")
    print(f"    Full data: {output_path}")
    print(f"    Validation set: {validation_path}")


if __name__ == '__main__':
    main()
