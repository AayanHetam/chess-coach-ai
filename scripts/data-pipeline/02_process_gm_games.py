#!/usr/bin/env python3
"""
Step 2: Download & process GM_games.pgn from GitHub.

Richly annotated grandmaster games with coaching-style prose.
Small file (<5MB), high quality annotations.

Source: https://github.com/ValdemarOrn/Chess/blob/master/Annotated%20Games/GM_games.pgn
License: Public/unclear — use for internal reference

Output: data-pipeline/output/gm_games.jsonl
"""

import json
import io
import os
import sys
from pathlib import Path

try:
    import chess.pgn
except ImportError:
    print("ERROR: python-chess not installed. Run: pip install python-chess")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip install requests")
    sys.exit(1)

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

GM_GAMES_URL = (
    "https://raw.githubusercontent.com/ValdemarOrn/Chess/master/"
    "Annotated%20Games/GM_games.pgn"
)
LOCAL_PGN = OUTPUT_DIR / "GM_games.pgn"


def download_pgn():
    """Download GM_games.pgn if not already cached locally."""
    if LOCAL_PGN.exists():
        print(f"  Using cached PGN: {LOCAL_PGN} ({LOCAL_PGN.stat().st_size / 1024:.0f} KB)")
        return

    print(f"  Downloading from GitHub...")
    resp = requests.get(GM_GAMES_URL, timeout=60)
    resp.raise_for_status()

    LOCAL_PGN.write_bytes(resp.content)
    print(f"  Downloaded: {len(resp.content) / 1024:.0f} KB")


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

        # Also collect NAG annotations (!, ?, !!, etc.)
        nag_str = ""
        if next_node.nags:
            nag_map = {
                1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!",
                10: "=", 13: "∞", 14: "+=", 15: "=+", 16: "±", 17: "∓",
                18: "+-", 19: "-+",
            }
            nag_str = " ".join(nag_map.get(n, f"${n}") for n in next_node.nags)

        move_data = {
            'move_number': (move_number + 1) // 2,
            'is_white': (move_number % 2 == 1),
            'move': move_san,
            'nag': nag_str or None,
            'comment': comment,
            'fen_before': node.board().fen(),
            'fen_after': next_node.board().fen(),
        }

        if comment and len(comment) > 5:
            moves_with_commentary.append(move_data)

        node = next_node

    return moves_with_commentary


def classify_position_type(fen, move_number, comment_text):
    """Heuristic classification of position type."""
    comment_lower = comment_text.lower() if comment_text else ""
    piece_count = sum(1 for c in fen.split()[0] if c.isalpha())

    tactical_keywords = ['fork', 'pin', 'skewer', 'sacrifice', 'sac', 'mate', 'check',
                         'attack', 'tactic', 'combination', 'trap', 'threat', 'winning',
                         'capture', 'exchange']
    strategic_keywords = ['plan', 'structure', 'weak', 'outpost', 'file', 'diagonal',
                          'bishop pair', 'space', 'control', 'pressure', 'blockade',
                          'pawn', 'positional', 'maneuver']
    endgame_keywords = ['endgame', 'king activity', 'passed pawn', 'opposition',
                        'rook ending', 'pawn ending', 'technique', 'convert', 'drawn']
    opening_keywords = ['opening', 'develop', 'castle', 'theory', 'gambit', 'variation',
                        'book', 'novelty']

    tactical_score = sum(1 for k in tactical_keywords if k in comment_lower)
    strategic_score = sum(1 for k in strategic_keywords if k in comment_lower)
    endgame_score = sum(1 for k in endgame_keywords if k in comment_lower)
    opening_score = sum(1 for k in opening_keywords if k in comment_lower)

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
    """Estimate commentary skill level target."""
    if not comment_text:
        return "intermediate"

    comment_lower = comment_text.lower()
    word_count = len(comment_lower.split())

    advanced_indicators = ['variation', 'evaluate', 'compensation', 'initiative',
                           'prophylaxis', 'zwischenzug', 'zugzwang', 'tempo',
                           'positional sacrifice', 'exchange sacrifice', 'novelty']
    beginner_indicators = ['always', 'never', 'remember', 'basic', 'simple',
                           'easy', 'first', 'beginner', 'learn']

    adv_score = sum(1 for k in advanced_indicators if k in comment_lower)
    beg_score = sum(1 for k in beginner_indicators if k in comment_lower)

    # GM annotations tend to be advanced/intermediate
    if word_count > 50:
        adv_score += 1

    if adv_score > beg_score:
        return "advanced"
    elif beg_score > adv_score:
        return "beginner"
    return "intermediate"


def main():
    print("=" * 60)
    print("GM_games.pgn Data Pipeline")
    print("=" * 60)

    download_pgn()

    processed = []
    errors = 0
    game_idx = 0

    with open(LOCAL_PGN, 'r', errors='replace') as f:
        while True:
            game = chess.pgn.read_game(f)
            if game is None:
                break

            game_idx += 1

            try:
                moves_with_commentary = extract_commentary_from_game(game)

                if not moves_with_commentary:
                    continue

                avg_comment_len = (
                    sum(len(m['comment']) for m in moves_with_commentary if m['comment'])
                    / len(moves_with_commentary)
                )

                for move in moves_with_commentary:
                    move['position_type'] = classify_position_type(
                        move['fen_before'], move['move_number'], move['comment']
                    )
                    move['skill_level'] = estimate_skill_level(move['comment'])

                record = {
                    'id': f"gm-games-{game_idx}",
                    'event': game.headers.get('Event', ''),
                    'white': game.headers.get('White', ''),
                    'black': game.headers.get('Black', ''),
                    'result': game.headers.get('Result', ''),
                    'eco': game.headers.get('ECO', ''),
                    'annotator': game.headers.get('Annotator', ''),
                    'date': game.headers.get('Date', ''),
                    'annotated_moves': moves_with_commentary,
                    'total_commentary_moves': len(moves_with_commentary),
                    'avg_comment_length': round(avg_comment_len, 1),
                    'source': 'gm_games_pgn',
                }
                processed.append(record)

            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"  Error processing game {game_idx}: {e}")

    # Write output
    output_path = OUTPUT_DIR / 'gm_games.jsonl'
    with open(output_path, 'w') as f:
        for record in processed:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')

    # Summary
    total_moves = sum(r['total_commentary_moves'] for r in processed)
    print(f"\n  Results:")
    print(f"    Total games parsed: {game_idx}")
    print(f"    Games with commentary: {len(processed)}")
    print(f"    Total commentary moves: {total_moves}")
    print(f"    Avg commentary moves/game: {total_moves/max(len(processed),1):.1f}")
    print(f"    Avg comment length: {sum(r['avg_comment_length'] for r in processed)/max(len(processed),1):.0f} chars")
    print(f"    Errors: {errors}")
    print(f"    Output: {output_path}")

    # Show sample game
    if processed:
        sample = processed[0]
        print(f"\n  Sample: {sample['white']} vs {sample['black']}")
        if sample['annotated_moves']:
            m = sample['annotated_moves'][0]
            preview = m['comment'][:120] + '...' if len(m['comment']) > 120 else m['comment']
            print(f"    Move {m['move_number']}. {m['move']}: {preview}")


if __name__ == '__main__':
    main()
