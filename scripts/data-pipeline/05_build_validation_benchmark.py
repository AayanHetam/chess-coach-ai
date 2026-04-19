#!/usr/bin/env python3
"""
Step 5: Build validation benchmark from Lichess evaluated positions.

Takes the validation_positions.json from script 03 and creates a
benchmark suite that can be used to test the Chess Masti AI pipeline:
  Position → Stockfish Analysis → positionAnnotator → LLM → Validation

Each benchmark position has:
- Known FEN
- Known Stockfish eval (ground truth)
- Expected game phase
- Position characteristics for annotation testing

Output: data-pipeline/output/benchmark_suite.json
        data-pipeline/output/benchmark_suite.ts (TypeScript importable)
"""

import json
import sys
from pathlib import Path
from collections import defaultdict

try:
    import chess
except ImportError:
    print("ERROR: python-chess not installed. Run: pip install python-chess")
    sys.exit(1)

OUTPUT_DIR = Path(__file__).parent / "output"


def analyze_position_characteristics(fen):
    """
    Extract position characteristics from FEN for annotation testing.
    These are the features that positionAnnotator.ts should detect.
    """
    board = chess.Board(fen)

    # Piece counts
    white_pieces = len(board.pieces(chess.PAWN, chess.WHITE)) + \
                   len(board.pieces(chess.KNIGHT, chess.WHITE)) + \
                   len(board.pieces(chess.BISHOP, chess.WHITE)) + \
                   len(board.pieces(chess.ROOK, chess.WHITE)) + \
                   len(board.pieces(chess.QUEEN, chess.WHITE))
    black_pieces = len(board.pieces(chess.PAWN, chess.BLACK)) + \
                   len(board.pieces(chess.KNIGHT, chess.BLACK)) + \
                   len(board.pieces(chess.BISHOP, chess.BLACK)) + \
                   len(board.pieces(chess.ROOK, chess.BLACK)) + \
                   len(board.pieces(chess.QUEEN, chess.BLACK))

    # Pawn structure
    white_pawns = list(board.pieces(chess.PAWN, chess.WHITE))
    black_pawns = list(board.pieces(chess.PAWN, chess.BLACK))

    # Detect isolated pawns
    def is_isolated(pawn_sq, pawn_list, color):
        file = chess.square_file(pawn_sq)
        adjacent_files = [f for f in [file - 1, file + 1] if 0 <= f <= 7]
        for other in pawn_list:
            if other == pawn_sq:
                continue
            if chess.square_file(other) in adjacent_files:
                return False
        return True

    white_isolated = sum(1 for p in white_pawns if is_isolated(p, white_pawns, chess.WHITE))
    black_isolated = sum(1 for p in black_pawns if is_isolated(p, black_pawns, chess.BLACK))

    # Detect passed pawns
    def is_passed(pawn_sq, opponent_pawns, color):
        file = chess.square_file(pawn_sq)
        rank = chess.square_rank(pawn_sq)
        blocking_files = [f for f in [file - 1, file, file + 1] if 0 <= f <= 7]
        for opp in opponent_pawns:
            opp_file = chess.square_file(opp)
            opp_rank = chess.square_rank(opp)
            if opp_file in blocking_files:
                if color == chess.WHITE and opp_rank > rank:
                    return False
                if color == chess.BLACK and opp_rank < rank:
                    return False
        return True

    white_passed = sum(1 for p in white_pawns if is_passed(p, black_pawns, chess.WHITE))
    black_passed = sum(1 for p in black_pawns if is_passed(p, white_pawns, chess.BLACK))

    # King safety (simple: is king castled?)
    white_king = board.king(chess.WHITE)
    black_king = board.king(chess.BLACK)
    wk_file = chess.square_file(white_king)
    bk_file = chess.square_file(black_king)
    white_castled = wk_file in [1, 2, 6, 7]  # b/c or g/h file = likely castled
    black_castled = bk_file in [1, 2, 6, 7]

    # Material imbalance
    piece_values = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
                    chess.ROOK: 5, chess.QUEEN: 9}
    white_material = sum(
        piece_values.get(board.piece_type_at(sq), 0)
        for sq in board.pieces(chess.PAWN, chess.WHITE) |
                   board.pieces(chess.KNIGHT, chess.WHITE) |
                   board.pieces(chess.BISHOP, chess.WHITE) |
                   board.pieces(chess.ROOK, chess.WHITE) |
                   board.pieces(chess.QUEEN, chess.WHITE)
    )
    black_material = sum(
        piece_values.get(board.piece_type_at(sq), 0)
        for sq in board.pieces(chess.PAWN, chess.BLACK) |
                   board.pieces(chess.KNIGHT, chess.BLACK) |
                   board.pieces(chess.BISHOP, chess.BLACK) |
                   board.pieces(chess.ROOK, chess.BLACK) |
                   board.pieces(chess.QUEEN, chess.BLACK)
    )

    # Check/checkmate status
    in_check = board.is_check()

    # Open files
    open_files = []
    for f in range(8):
        white_on_file = any(chess.square_file(p) == f for p in white_pawns)
        black_on_file = any(chess.square_file(p) == f for p in black_pawns)
        if not white_on_file and not black_on_file:
            open_files.append(chr(ord('a') + f))

    return {
        'white_pieces': white_pieces,
        'black_pieces': black_pieces,
        'material_balance': white_material - black_material,
        'white_isolated_pawns': white_isolated,
        'black_isolated_pawns': black_isolated,
        'white_passed_pawns': white_passed,
        'black_passed_pawns': black_passed,
        'white_castled': white_castled,
        'black_castled': black_castled,
        'in_check': in_check,
        'open_files': open_files,
        'total_pieces': white_pieces + black_pieces + 2,  # +2 for kings
        'turn': 'white' if board.turn == chess.WHITE else 'black',
    }


def build_benchmark_suite(positions):
    """Build the full benchmark suite with position characteristics."""
    suite = []

    for pos in positions:
        fen = pos['fen']
        try:
            characteristics = analyze_position_characteristics(fen)
        except Exception as e:
            print(f"  Skipping invalid FEN: {e}")
            continue

        benchmark = {
            'id': f"bench-{len(suite)+1:03d}",
            'fen': fen,
            'expected_eval_cp': pos['expected_eval_cp'],
            'best_move': pos['best_move'],
            'phase': pos['phase'],
            'characteristics': characteristics,
            # Validation checks the pipeline should pass
            'expected_annotations': {
                'should_detect_check': characteristics['in_check'],
                'should_detect_material_imbalance': abs(characteristics['material_balance']) >= 2,
                'should_detect_passed_pawn': (
                    characteristics['white_passed_pawns'] > 0 or
                    characteristics['black_passed_pawns'] > 0
                ),
                'should_detect_open_files': len(characteristics['open_files']) > 0,
                'should_detect_king_safety_issue': (
                    not characteristics['white_castled'] or
                    not characteristics['black_castled']
                ),
                'eval_direction': (
                    'white_winning' if pos['expected_eval_cp'] > 150
                    else 'black_winning' if pos['expected_eval_cp'] < -150
                    else 'roughly_equal'
                ),
            },
        }
        suite.append(benchmark)

    return suite


def generate_typescript_benchmark(suite):
    """Generate TypeScript importable benchmark file."""
    lines = []
    lines.append("/**")
    lines.append(" * Validation Benchmark Suite")
    lines.append(" * Auto-generated from Lichess evaluated games.")
    lines.append(" * Use to test positionAnnotator.ts accuracy.")
    lines.append(" */")
    lines.append("")
    lines.append("export interface BenchmarkPosition {")
    lines.append("  id: string;")
    lines.append("  fen: string;")
    lines.append("  expectedEvalCp: number;")
    lines.append("  bestMove: string;")
    lines.append("  phase: 'opening' | 'middlegame' | 'endgame';")
    lines.append("  expectedAnnotations: {")
    lines.append("    shouldDetectCheck: boolean;")
    lines.append("    shouldDetectMaterialImbalance: boolean;")
    lines.append("    shouldDetectPassedPawn: boolean;")
    lines.append("    shouldDetectOpenFiles: boolean;")
    lines.append("    shouldDetectKingSafetyIssue: boolean;")
    lines.append("    evalDirection: 'white_winning' | 'black_winning' | 'roughly_equal';")
    lines.append("  };")
    lines.append("}")
    lines.append("")
    lines.append(f"export const BENCHMARK_POSITIONS: BenchmarkPosition[] = {json.dumps(suite, indent=2)};")

    return "\n".join(lines)


def main():
    print("=" * 60)
    print("Validation Benchmark Builder")
    print("=" * 60)

    validation_path = OUTPUT_DIR / 'validation_positions.json'
    if not validation_path.exists():
        print(f"\nERROR: {validation_path} not found.")
        print("Run script 03 first: python 03_process_lichess_evaluated.py")
        sys.exit(1)

    with open(validation_path, 'r') as f:
        positions = json.load(f)

    print(f"  Loaded {len(positions)} validation positions")

    # Build suite
    suite = build_benchmark_suite(positions)

    # Phase distribution
    phase_counts = defaultdict(int)
    for b in suite:
        phase_counts[b['phase']] += 1

    print(f"  Benchmark positions: {len(suite)}")
    print(f"  By phase: {dict(phase_counts)}")

    # Annotation coverage
    annotation_stats = defaultdict(int)
    for b in suite:
        for key, val in b['expected_annotations'].items():
            if val and val is not True:
                annotation_stats[key] += 1
            elif val is True:
                annotation_stats[key] += 1

    print(f"  Annotation coverage:")
    for key, count in sorted(annotation_stats.items()):
        print(f"    {key}: {count}/{len(suite)}")

    # Save JSON
    json_path = OUTPUT_DIR / 'benchmark_suite.json'
    with open(json_path, 'w') as f:
        json.dump(suite, f, indent=2)
    print(f"\n  JSON output: {json_path}")

    # Save TypeScript
    ts_content = generate_typescript_benchmark(suite)
    ts_path = OUTPUT_DIR / 'benchmark_suite.ts'
    with open(ts_path, 'w') as f:
        f.write(ts_content)
    print(f"  TypeScript output: {ts_path}")


if __name__ == '__main__':
    main()
