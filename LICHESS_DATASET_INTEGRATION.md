# Lichess Chess Puzzles Dataset Integration

The AI coach now has full access to the complete Lichess chess puzzles dataset to better understand and explain Stockfish's tactical reasoning.

## Overview

The system integrates the `Lichess/chess-puzzles` dataset from Hugging Face, which contains millions of real chess puzzle positions with:
- Tactical themes (fork, pin, discovered attack, skewer, etc.)
- Solution sequences
- Puzzle ratings
- Popularity metrics

## Architecture

### 1. Python Service (`scripts/chess_puzzles_service.py`)
- Loads the full Lichess dataset using Hugging Face's `datasets` library
- Provides functions to:
  - Find similar puzzles to a given position
  - Get puzzles by tactical theme
  - Query all available themes
  - Get dataset statistics

### 2. API Endpoint (`/api/chess-puzzles-dataset`)
- RESTful API to query the Python service
- Supports:
  - `POST /api/chess-puzzles-dataset` - Find similar puzzles or query by theme
  - `GET /api/chess-puzzles-dataset?command=stats` - Get dataset statistics

### 3. Integration Points

#### Enhanced Analysis Route
- Automatically queries the dataset when analyzing positions
- Finds similar puzzles based on:
  - Position similarity (FEN matching)
  - Tactical themes identified
- Includes puzzle data in AI coach prompts

#### AI Coach System Prompt
- Updated to explicitly use the dataset
- Instructions to:
  - Reference specific puzzle IDs when similar puzzles are found
  - Explain how puzzle solutions relate to Stockfish's principal variation
  - Mention puzzle ratings and popularity
  - Connect current positions to well-known puzzle patterns

## Setup

### 1. Install Python Dependencies

```bash
cd chess-coach-ai
pip install -r scripts/requirements.txt
```

Required packages:
- `datasets>=2.14.0` - Hugging Face datasets library
- `python-chess>=1.999` - Chess position handling

### 2. Verify Python Installation

```bash
python3 --version  # Should be Python 3.8+
python3 scripts/chess_puzzles_service.py stats
```

The dataset will be automatically downloaded on first use (this may take a few minutes).

### 3. Test the Integration

```bash
# Test finding similar puzzles
python3 scripts/chess_puzzles_service.py find_similar "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

# Test by theme
python3 scripts/chess_puzzles_service.py by_theme "fork,pin" 10
```

## How It Works

### 1. Position Analysis Flow

1. **Stockfish Analysis**: Position is analyzed by Stockfish, generating principal variation
2. **Theme Identification**: System identifies tactical themes (fork, pin, etc.)
3. **Dataset Query**: Python service searches for similar puzzles in the Lichess dataset
4. **AI Coach Prompt**: Similar puzzles and themes are included in the AI coach prompt
5. **Enhanced Explanation**: AI coach references real puzzle patterns to explain Stockfish's reasoning

### 2. Example Usage

When analyzing a position with a fork:
- System identifies "fork" as a tactical theme
- Queries dataset for puzzles with "fork" theme and similar positions
- Finds puzzle #12345 (rated 1650) with similar fork pattern
- AI coach explains: "Stockfish suggests this move because it creates a fork, similar to puzzle #12345 from the Lichess dataset. This pattern appears in over 50,000 puzzles..."

## Benefits

1. **Grounded Explanations**: AI coach references real puzzle positions, not just abstract concepts
2. **Pattern Recognition**: Connects current positions to well-known tactical patterns
3. **Educational Value**: Users learn that these patterns occur frequently in real games
4. **Rating Context**: Puzzle ratings help users understand difficulty levels
5. **Solution Sequences**: Puzzle solutions show how tactical sequences typically unfold

## API Reference

### POST /api/chess-puzzles-dataset

Find similar puzzles to a position:

```json
{
  "command": "find_similar",
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "themes": ["fork", "pin"],
  "limit": 5
}
```

Response:
```json
{
  "success": true,
  "puzzles": [
    {
      "id": "12345",
      "fen": "...",
      "themes": ["fork"],
      "rating": 1650,
      "solution": ["e4", "e5", "Nf3", ...]
    }
  ],
  "count": 5
}
```

### GET /api/chess-puzzles-dataset?command=stats

Get dataset statistics:

```json
{
  "success": true,
  "total_puzzles": 2500000,
  "themes": ["fork", "pin", "discoveredAttack", ...],
  "status": "loaded"
}
```

## Troubleshooting

### Python Not Found
- Ensure Python 3.8+ is installed: `python3 --version`
- On some systems, use `python` instead of `python3`

### Dataset Download Issues
- First download may take 10-15 minutes
- Ensure stable internet connection
- Dataset is cached after first download

### Import Errors
- Install dependencies: `pip install -r scripts/requirements.txt`
- May need to install Hugging Face: `pip install datasets`

## Performance Notes

- Dataset is loaded once and cached in memory
- Query performance depends on dataset size (~2.5M puzzles)
- Similarity search may take 1-3 seconds
- Consider caching results for frequently analyzed positions

## Future Enhancements

- [ ] Pre-process dataset for faster queries
- [ ] Cache frequently accessed puzzles
- [ ] Add position similarity scoring
- [ ] Support for puzzle difficulty filtering
- [ ] Integration with puzzle training features

