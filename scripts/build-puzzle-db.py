#!/usr/bin/env python3
"""
Build Script: Segregated Puzzle Database
Downloads the Lichess chess puzzles dataset from HuggingFace and curates
a subset organized by tactical theme and difficulty rating band.

Output: src/data/puzzles/{theme}/{difficulty}.json + src/data/puzzles/index.json
"""

import json
import os
import sys
import random
from collections import defaultdict
from datasets import load_dataset

# === Configuration ===

# Difficulty rating bands
DIFFICULTY_BANDS = {
    "beginner":     (0, 1200),
    "intermediate": (1201, 1600),
    "advanced":     (1601, 2000),
    "expert":       (2001, 9999),
}

# Target puzzles per theme per difficulty band
TARGET_PER_BAND = 75

# Quality filters
MIN_POPULARITY = 60
MIN_NB_PLAYS = 50
MAX_RATING_DEVIATION = 120

# Themes to collect (Lichess dataset theme names)
# These cover all themes in TACTICAL_THEMES plus important Lichess-specific ones
TARGET_THEMES = [
    # Core tactical themes
    "fork",
    "pin",
    "skewer",
    "discoveredAttack",
    "doubleCheck",
    "xRayAttack",
    
    # Mating patterns
    "backRankMate",
    "smotheredMate",
    "mate",
    "mateIn1",
    "mateIn2",
    "mateIn3",
    "mateIn4",
    "mateIn5",
    
    # Material themes
    "sacrifice",
    "hangingPiece",
    "trappedPiece",
    
    # Pawn themes
    "promotion",
    "underPromotion",
    "advancedPawn",
    
    # Positional/quiet themes
    "defensiveMove",
    "quietMove",
    "intermezzo",
    "clearance",
    "zugzwang",
    
    # Attack themes
    "exposedKing",
    "castling",
    "kingsideAttack",
    "queensideAttack",
    "attackingF2F7",
    "attraction",
    "deflection",
    "interference",
    
    # Endgame themes
    "endgame",
    "bishopEndgame",
    "knightEndgame",
    "rookEndgame",
    "queenEndgame",
    "queenRookEndgame",
    "pawnEndgame",
    
    # Game phase
    "middlegame",
    "opening",
    
    # Length
    "short",
    "long",
    "veryLong",
    "oneMove",
]

# Output directory (relative to project root)
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "data", "puzzles")


def get_difficulty_band(rating):
    """Map a puzzle rating to a difficulty band name."""
    for band_name, (low, high) in DIFFICULTY_BANDS.items():
        if low <= rating <= high:
            return band_name
    return None


def passes_quality_filter(puzzle):
    """Check if a puzzle passes quality filters."""
    popularity = puzzle.get("Popularity", 0)
    nb_plays = puzzle.get("NbPlays", 0)
    rating_dev = puzzle.get("RatingDeviation", 999)
    fen = puzzle.get("FEN", "")
    moves = puzzle.get("Moves", "")
    
    if not fen or not moves:
        return False
    if popularity < MIN_POPULARITY:
        return False
    if nb_plays < MIN_NB_PLAYS:
        return False
    if rating_dev > MAX_RATING_DEVIATION:
        return False
    return True


def puzzle_to_dict(puzzle):
    """Convert a HuggingFace dataset row to our puzzle dict format."""
    themes = puzzle.get("Themes", [])
    if isinstance(themes, str):
        themes = themes.split()
    
    opening_tags = puzzle.get("OpeningTags", [])
    if isinstance(opening_tags, str):
        opening_tags = opening_tags.split()
    
    moves_str = puzzle.get("Moves", "")
    moves = moves_str.split() if isinstance(moves_str, str) else moves_str
    
    return {
        "id": puzzle.get("PuzzleId", ""),
        "fen": puzzle.get("FEN", ""),
        "moves": moves,
        "rating": puzzle.get("Rating", 0),
        "themes": themes,
        "openingTags": opening_tags,
        "popularity": puzzle.get("Popularity", 0),
        "nbPlays": puzzle.get("NbPlays", 0),
    }


def main():
    print("=" * 60)
    print("Building Segregated Puzzle Database")
    print("=" * 60)
    
    # === Step 1: Load dataset ===
    print("\n[1/4] Loading Lichess chess puzzles dataset from HuggingFace...")
    print("       (This may take a few minutes on first run)")
    dataset = load_dataset("Lichess/chess-puzzles", split="train")
    total = len(dataset)
    print(f"       Loaded {total:,} puzzles")
    
    # === Step 2: Collect puzzles by theme + difficulty ===
    print(f"\n[2/4] Filtering and collecting puzzles...")
    print(f"       Quality: popularity >= {MIN_POPULARITY}, plays >= {MIN_NB_PLAYS}, ratingDev <= {MAX_RATING_DEVIATION}")
    print(f"       Target: {TARGET_PER_BAND} puzzles per theme per difficulty band")
    
    # Structure: { theme: { difficulty: [puzzles] } }
    collected = defaultdict(lambda: defaultdict(list))
    # Track which theme+band combos are full
    full_combos = set()
    total_target = len(TARGET_THEMES) * len(DIFFICULTY_BANDS) * TARGET_PER_BAND
    collected_count = 0
    skipped_quality = 0
    processed = 0
    
    # Shuffle indices for random sampling
    indices = list(range(total))
    random.seed(42)
    random.shuffle(indices)
    
    for idx in indices:
        # Check if we've filled everything
        if len(full_combos) >= len(TARGET_THEMES) * len(DIFFICULTY_BANDS):
            print(f"       All theme+band combos filled!")
            break
        
        puzzle = dataset[idx]
        processed += 1
        
        if processed % 500000 == 0:
            print(f"       Processed {processed:,} / {total:,} ({collected_count:,} collected)")
        
        if not passes_quality_filter(puzzle):
            skipped_quality += 1
            continue
        
        rating = puzzle.get("Rating", 0)
        band = get_difficulty_band(rating)
        if not band:
            continue
        
        themes = puzzle.get("Themes", [])
        if isinstance(themes, str):
            themes = themes.split()
        
        puzzle_dict = None  # Lazy conversion
        
        for theme in themes:
            if theme not in TARGET_THEMES:
                continue
            
            combo_key = f"{theme}:{band}"
            if combo_key in full_combos:
                continue
            
            if puzzle_dict is None:
                puzzle_dict = puzzle_to_dict(puzzle)
            
            collected[theme][band].append(puzzle_dict)
            collected_count += 1
            
            if len(collected[theme][band]) >= TARGET_PER_BAND:
                full_combos.add(combo_key)
    
    print(f"       Processed {processed:,} puzzles total")
    print(f"       Skipped {skipped_quality:,} for quality")
    print(f"       Collected {collected_count:,} puzzle entries (some puzzles appear in multiple themes)")
    
    # === Step 3: Write JSON files ===
    print(f"\n[3/4] Writing JSON files to {OUTPUT_DIR}")
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    index_data = {
        "totalPuzzles": 0,
        "themes": {},
        "difficultyBands": DIFFICULTY_BANDS,
        "generatedAt": None,
    }
    
    # Track unique puzzle IDs for accurate total count
    unique_ids = set()
    
    for theme in sorted(collected.keys()):
        theme_dir = os.path.join(OUTPUT_DIR, theme)
        os.makedirs(theme_dir, exist_ok=True)
        
        theme_total = 0
        theme_bands = {}
        
        for band in sorted(collected[theme].keys()):
            puzzles = collected[theme][band]
            # Sort by rating within each band for consistent ordering
            puzzles.sort(key=lambda p: p["rating"])
            
            filepath = os.path.join(theme_dir, f"{band}.json")
            with open(filepath, "w") as f:
                json.dump(puzzles, f, separators=(",", ":"))
            
            for p in puzzles:
                unique_ids.add(p["id"])
            
            theme_total += len(puzzles)
            theme_bands[band] = len(puzzles)
            print(f"       {theme}/{band}.json - {len(puzzles)} puzzles")
        
        index_data["themes"][theme] = {
            "total": theme_total,
            "bands": theme_bands,
        }
    
    index_data["totalPuzzles"] = len(unique_ids)
    
    # Add timestamp
    from datetime import datetime, timezone
    index_data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    
    # Write index
    index_path = os.path.join(OUTPUT_DIR, "index.json")
    with open(index_path, "w") as f:
        json.dump(index_data, f, indent=2)
    print(f"       index.json - metadata for {len(collected)} themes")
    
    # === Step 4: Summary ===
    print(f"\n[4/4] Summary")
    print(f"       Unique puzzles: {len(unique_ids):,}")
    print(f"       Themes covered: {len(collected)}")
    print(f"       Files written: {sum(len(bands) for bands in collected.values()) + 1}")
    
    # Show theme coverage
    missing = [t for t in TARGET_THEMES if t not in collected]
    if missing:
        print(f"\n       ⚠️  Missing themes (no puzzles found): {', '.join(missing)}")
    
    # Show per-band totals
    for band_name in DIFFICULTY_BANDS:
        band_total = sum(
            len(collected[t].get(band_name, []))
            for t in collected
        )
        print(f"       {band_name}: {band_total:,} puzzle entries")
    
    print(f"\n✅ Puzzle database built successfully!")
    print(f"   Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
