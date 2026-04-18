# Tester Guide: Mistake-to-Puzzle Generation System

## What We're Testing

A new feature that **automatically recommends targeted practice puzzles** based on mistakes in your chess games. For example:
- Miss a fork → Get 5 fork-themed puzzles
- Miss a pin → Get 5 pin-themed puzzles
- Blunder into back-rank mate → Get mating attack puzzles

## Why This Matters

Currently, chess platforms show generic puzzles. This system shows **contextually relevant puzzles** matched to your specific mistakes, helping you learn faster.

## How to Test (5-10 minutes)

### Setup
1. Visit: **http://localhost:3000** (or the hosted URL if provided)
2. You should see the Chess Masti AI interface

### Test Scenario 1: Fork Mistake
**Goal**: Verify the system recommends fork puzzles when you miss a fork

1. **Load this PGN** (contains a missed knight fork):
   ```
   [Event "Test Game - Fork Mistake"]
   [White "Tester"]
   [Black "Opponent"]

   1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5
   6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nce7 9. O-O c6
   10. d4 Kd7 11. dxe5 Kc7 12. Re1 Ng6 13. Bf4 Nxf4
   14. Qxf4 Be6 15. Bxd5 cxd5 16. Nxd5+ Bxd5 17. Qxd5
   ```

2. **Click "Analyze My Game"** (or paste PGN and analyze)

3. **Expected Result**:
   - AI analysis mentions the fork on move 16 (Nxd5+)
   - Below the analysis, you should see **"🎯 Targeted Practice Puzzles"**
   - Should show 3-5 puzzles with themes like "Fork", "Knight Fork", "Royal Fork"

4. **What to Check**:
   - [ ] Do the puzzle previews show chess boards?
   - [ ] Are the themes listed as "fork", "knight-fork", etc?
   - [ ] Does clicking "Start Practice" work?
   - [ ] Do the puzzles feel relevant to the fork concept?

### Test Scenario 2: Pin Mistake
**Goal**: Verify diverse theme matching (not just forks)

1. **Load this PGN** (contains a missed pin):
   ```
   [Event "Test Game - Pin Mistake"]
   [White "Tester"]
   [Black "Opponent"]

   1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
   6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5
   11. d4 Qc7 12. Nbd2 Bd7 13. Nf1 Rfe8 14. Ne3 g6
   15. d5 Nh5 16. g4 Nf4 17. Bxf4 exf4 18. Nf1 Bf6
   ```

2. **Analyze the game**

3. **Expected Result**:
   - AI mentions the pin tactic on move 18 (Bf6 pins the knight)
   - Puzzle recommendations should include "Pin", "Absolute Pin", or similar
   - **IMPORTANT**: Should NOT show fork puzzles (theme matching should work correctly)

4. **What to Check**:
   - [ ] Are the recommended puzzles pin-themed (not forks)?
   - [ ] Do you see variety in puzzle themes?
   - [ ] Does the explanation text match the mistake type?

### Test Scenario 3: Multiple Mistakes
**Goal**: Verify the system handles games with multiple mistake types

1. **Load this PGN** (contains fork + back-rank weaknesses):
   ```
   [Event "Test Game - Multiple Mistakes"]
   [White "Tester"]
   [Black "Opponent"]

   1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4
   6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 9. d5 Ne5
   10. bxc3 Nxc4 11. Qd4 Ncd6 12. Qxg7 Qf6 13. Qxf6 Nxf6
   14. Re1+ Kd8 15. Bg5 h6 16. Bxf6+ Ke8 17. Ng5 hxg5
   ```

2. **Analyze the game**

3. **Expected Result**:
   - Multiple puzzle recommendation sections (one per major mistake)
   - Different themes for different mistakes
   - Should see 6-15 total puzzles across 2-3 mistake categories

4. **What to Check**:
   - [ ] Does the UI show multiple puzzle sections?
   - [ ] Are themes diverse (fork, pin, back-rank, etc.)?
   - [ ] Is the UI not overwhelming (reasonable number of puzzles)?

## What to Report

### For Each Test
Please note:

1. **✅ What Worked**:
   - Did puzzles appear?
   - Were themes correct?
   - Was the UI clear?

2. **❌ What Didn't Work**:
   - Puzzles didn't load?
   - Wrong theme (fork mistake → pin puzzles)?
   - UI broken/confusing?
   - Error messages?

3. **🤔 Suggestions**:
   - Too many puzzles shown?
   - Too few?
   - Confusing explanation text?
   - Better way to display?

### Critical Questions

**Theme Diversity Check**:
- Did you see different puzzle themes (fork, pin, skewer, mate threats)?
- OR did you only see one theme repeated (e.g., all fork puzzles)?

**Visual Similarity Check** (if enabled):
- Do the 3-5 puzzles for one mistake look visually similar?
- Or are they completely different board positions?

**Relevance Check**:
- Do the puzzles actually teach the concept you missed?
- OR do they feel random/unrelated?

## Technical Details (for developers testing)

### API Endpoints
```bash
# Test mistake-puzzles API directly:
curl -X POST http://localhost:3000/api/mistake-puzzles \
  -H "Content-Type: application/json" \
  -d '{
    "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    "movePlayed": "Nc3",
    "correctMove": "Ng5",
    "evalBefore": 50,
    "evalAfter": -200,
    "tacticalMotifs": ["fork"],
    "userRating": 1500
  }'

# Should return JSON with:
# - puzzles: array of 3-5 puzzles
# - themes: should include "fork", "knight-fork", etc.
# - explanation: text about why these puzzles were chosen
```

### What We're Validating

1. **Neo4j Integration**: Puzzles are fetched from graph database (not hardcoded)
2. **Theme Matching**: Tactical motifs map correctly to Lichess puzzle themes
3. **FEN Similarity**: Puzzles show visually similar positions (future enhancement)
4. **UI Integration**: Recommendations display correctly in chat interface
5. **Performance**: Puzzle loading < 2 seconds per mistake

### Known Limitations (v1)

- FEN similarity not yet integrated (coming in next version)
- Only top 3 mistakes get puzzle recommendations (to avoid UI clutter)
- Theme mapping still being expanded (may not catch all 65+ Lichess themes yet)
- No user progress tracking yet (puzzles don't remember if you've solved them)

## Expected Timeline

- **Testing**: 5-10 minutes per tester
- **Feedback Collection**: via Slack/Discord/GitHub issue
- **Iteration**: We'll fix issues and ask you to re-test

Thank you for helping make this feature production-ready! 🙏
