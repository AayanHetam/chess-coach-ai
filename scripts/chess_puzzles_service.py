#!/usr/bin/env python3
"""
Chess Puzzles Service
Loads and queries the Lichess chess puzzles dataset for tactical pattern matching
"""

import json
import sys
from typing import List, Dict, Any, Optional
from datasets import load_dataset
import chess
import chess.pgn
from io import StringIO

# Global dataset cache
_dataset = None
_dataset_loaded = False

def load_puzzles_dataset():
    """Load the Lichess chess puzzles dataset"""
    global _dataset, _dataset_loaded
    
    if _dataset_loaded and _dataset is not None:
        return _dataset
    
    try:
        print("Loading Lichess chess puzzles dataset...", file=sys.stderr)
        _dataset = load_dataset("Lichess/chess-puzzles", split="train")
        _dataset_loaded = True
        print(f"✅ Loaded {len(_dataset)} puzzles", file=sys.stderr)
        return _dataset
    except Exception as e:
        print(f"❌ Error loading dataset: {e}", file=sys.stderr)
        return None

def find_similar_puzzles(fen: str, themes: List[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Find puzzles similar to the given position
    
    Args:
        fen: FEN position to match
        themes: List of tactical themes to filter by
        limit: Maximum number of puzzles to return
    
    Returns:
        List of similar puzzles with their solutions and themes
    """
    dataset = load_puzzles_dataset()
    if dataset is None:
        return []
    
    try:
        # Parse the input FEN
        board = chess.Board(fen)
        
        similar_puzzles = []
        seen_fens = set()
        
        # Search through dataset
        for puzzle in dataset:
            if len(similar_puzzles) >= limit:
                break
            
            try:
                puzzle_fen = puzzle.get("FEN", "")
                if not puzzle_fen or puzzle_fen in seen_fens:
                    continue
                
                puzzle_themes = puzzle.get("Themes", [])
                if isinstance(puzzle_themes, str):
                    puzzle_themes = [puzzle_themes]
                
                # Filter by themes if provided
                if themes:
                    theme_match = any(theme in puzzle_themes for theme in themes)
                    if not theme_match:
                        continue
                
                # Check if positions are similar (same material, similar structure)
                puzzle_board = chess.Board(puzzle_fen)
                
                # Compare material count
                input_pieces = sum(1 for _ in board.piece_map().values())
                puzzle_pieces = sum(1 for _ in puzzle_board.piece_map().values())
                
                # If material count is very different, skip
                if abs(input_pieces - puzzle_pieces) > 4:
                    continue
                
                # Get puzzle details
                puzzle_data = {
                    "id": puzzle.get("PuzzleId", ""),
                    "fen": puzzle_fen,
                    "themes": puzzle_themes if isinstance(puzzle_themes, list) else [puzzle_themes],
                    "rating": puzzle.get("Rating", 0),
                    "popularity": puzzle.get("Popularity", 0),
                    "nbPlays": puzzle.get("NbPlays", 0),
                    "solution": puzzle.get("Moves", "").split() if puzzle.get("Moves") else [],
                }
                
                similar_puzzles.append(puzzle_data)
                seen_fens.add(puzzle_fen)
                
            except Exception as e:
                # Skip invalid puzzles
                continue
        
        return similar_puzzles[:limit]
        
    except Exception as e:
        print(f"Error finding similar puzzles: {e}", file=sys.stderr)
        return []

def get_puzzles_by_theme(themes: List[str], limit: int = 10) -> List[Dict[str, Any]]:
    """
    Get puzzles that match specific tactical themes
    
    Args:
        themes: List of tactical themes
        limit: Maximum number of puzzles to return
    
    Returns:
        List of puzzles with matching themes
    """
    dataset = load_puzzles_dataset()
    if dataset is None:
        return []
    
    try:
        matching_puzzles = []
        seen_fens = set()
        
        for puzzle in dataset:
            if len(matching_puzzles) >= limit:
                break
            
            try:
                puzzle_themes = puzzle.get("Themes", [])
                if isinstance(puzzle_themes, str):
                    puzzle_themes = [puzzle_themes]
                
                # Check if any theme matches
                theme_match = any(theme in puzzle_themes for theme in themes)
                if not theme_match:
                    continue
                
                puzzle_fen = puzzle.get("FEN", "")
                if not puzzle_fen or puzzle_fen in seen_fens:
                    continue
                
                puzzle_data = {
                    "id": puzzle.get("PuzzleId", ""),
                    "fen": puzzle_fen,
                    "themes": puzzle_themes,
                    "rating": puzzle.get("Rating", 0),
                    "popularity": puzzle.get("Popularity", 0),
                    "nbPlays": puzzle.get("NbPlays", 0),
                    "solution": puzzle.get("Moves", "").split() if puzzle.get("Moves") else [],
                }
                
                matching_puzzles.append(puzzle_data)
                seen_fens.add(puzzle_fen)
                
            except Exception as e:
                continue
        
        return matching_puzzles[:limit]
        
    except Exception as e:
        print(f"Error getting puzzles by theme: {e}", file=sys.stderr)
        return []

def get_all_themes() -> List[str]:
    """Get all unique tactical themes in the dataset"""
    dataset = load_puzzles_dataset()
    if dataset is None:
        return []
    
    try:
        themes_set = set()
        for puzzle in dataset:
            puzzle_themes = puzzle.get("Themes", [])
            if isinstance(puzzle_themes, str):
                puzzle_themes = [puzzle_themes]
            themes_set.update(puzzle_themes)
        
        return sorted(list(themes_set))
    except Exception as e:
        print(f"Error getting themes: {e}", file=sys.stderr)
        return []

def main():
    """CLI interface for the service"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Invalid command"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    try:
        if command == "find_similar":
            fen = sys.argv[2] if len(sys.argv) > 2 else ""
            themes = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else None
            limit = int(sys.argv[4]) if len(sys.argv) > 4 else 5
            
            puzzles = find_similar_puzzles(fen, themes, limit)
            print(json.dumps({"puzzles": puzzles, "count": len(puzzles)}))
            
        elif command == "by_theme":
            themes = sys.argv[2].split(",") if len(sys.argv) > 2 else []
            limit = int(sys.argv[3]) if len(sys.argv) > 3 else 10
            
            puzzles = get_puzzles_by_theme(themes, limit)
            print(json.dumps({"puzzles": puzzles, "count": len(puzzles)}))
            
        elif command == "themes":
            themes = get_all_themes()
            print(json.dumps({"themes": themes, "count": len(themes)}))
            
        elif command == "stats":
            dataset = load_puzzles_dataset()
            if dataset:
                print(json.dumps({
                    "total_puzzles": len(dataset),
                    "themes": get_all_themes(),
                    "status": "loaded"
                }))
            else:
                print(json.dumps({"error": "Dataset not loaded"}))
                
        else:
            print(json.dumps({"error": f"Unknown command: {command}"}))
            
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()

