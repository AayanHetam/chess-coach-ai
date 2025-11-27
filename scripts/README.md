# Chess Puzzles Dataset Service

This service provides access to the Lichess chess puzzles dataset for tactical pattern recognition.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. The dataset will be automatically downloaded on first use from Hugging Face.

## Usage

The service can be called via the API endpoint `/api/chess-puzzles-dataset` or directly via Python:

```bash
# Find similar puzzles to a position
python3 scripts/chess_puzzles_service.py find_similar "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

# Get puzzles by theme
python3 scripts/chess_puzzles_service.py by_theme "fork,pin" 10

# Get all themes
python3 scripts/chess_puzzles_service.py themes

# Get dataset statistics
python3 scripts/chess_puzzles_service.py stats
```

## Integration

The service is automatically integrated into the enhanced-analysis route and provides:
- Similar puzzle positions from the Lichess dataset
- Tactical theme matching
- Solution sequences for reference

This helps the AI coach explain Stockfish's reasoning by referencing real puzzle patterns.

