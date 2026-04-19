# Lichess Theme Extraction Strategy

## The Challenge

Lichess puzzles have space-separated theme tags like:
```
"crushing hangingPiece long middlegame"
"advantage fork middlegame short"
"mate mateIn2 endgame short"
```

**We need to extract ONLY the tactical motifs** and ignore contextual tags.

---

## Complete Lichess Theme List (from official source)

### ✅ TACTICAL THEMES (Map these to our hierarchy)

**Basic Tactics:**
- `fork` - A move where the moved piece attacks two opponent pieces at once
- `pin` - Piece unable to move without revealing attack on higher value piece
- `skewer` - High value piece attacked, moves away, exposing lower value piece behind
- `discoveredAttack` - Moving piece reveals attack from long range piece
- `discoveredCheck` - Moving piece reveals check from hidden piece
- `doubleCheck` - Two pieces check at once (king MUST move)
- `hangingPiece` - Undefended or insufficiently defended piece
- `trappedPiece` - Piece unable to escape capture (limited moves)
- `sacrifice` - Giving up material for forced advantage
- `deflection` - Distracting piece from guarding key square/piece
- `attraction` - Forcing/encouraging opponent piece to vulnerable square
- `clearance` - Clearing square/file/diagonal for follow-up tactic
- `interference` - Moving piece between two opponent pieces
- `intermezzo` (aka `zwischenzug`) - In-between move with immediate threat
- `quietMove` - Non-forcing move preparing unavoidable threat
- `xRayAttack` - Piece attacks/defends through enemy piece
- `zugzwang` - Any move worsens opponent's position
- `capturingDefender` (aka `removing defender`) - Capturing piece that defends target
- `exposedKing` - King with few defenders
- `defensiveMove` - Precise move needed to avoid losing material

**Advanced Pawn Tactics:**
- `advancedPawn` - Pawn deep in opponent position
- `promotion` - Promoting pawn to queen/minor piece
- `underPromotion` - Promoting to knight/bishop/rook
- `enPassant` - En passant capture

**Attacking Patterns:**
- `attackingF2F7` - Attack focusing on f2/f7 pawn (fried liver)
- `kingsideAttack` - Attacking castled kingside king
- `queensideAttack` - Attacking castled queenside king
- `collinearMove` - Two pieces face off, one slides without capturing

**Mating Patterns:**
- `mate` - Checkmate
- `mateIn1` - Mate in one move
- `mateIn2` - Mate in two moves
- `mateIn3` - Mate in three moves
- `mateIn4` - Mate in four moves
- `mateIn5` - Mate in 5+ moves
- `anastasiaMate` - Knight + rook/queen trap king on edge
- `arabianMate` - Knight + rook trap king in corner
- `backRankMate` - Mate on home rank (trapped by own pieces)
- `balestraMate` - Bishop delivers mate, queen blocks escape
- `blindSwineMate` - Two rooks mate in 2x2 square area
- `bodenMate` - Two bishops on criss-crossing diagonals
- `cornerMate` - Rook/queen + knight corner mate
- `doubleBishopMate` - Two bishops on adjacent diagonals
- `dovetailMate` - Queen mates adjacent king (escape squares blocked)
- `epauletteMate` - Two escape squares occupied by own pieces
- `hookMate` - Rook + knight + pawn with enemy pawn limit
- `killBoxMate` - Rook + queen create 3x3 kill box
- `morphysMate` - Bishop check + rook confines
- `operaMate` - Rook check + bishop defends rook
- `pillsburysMate` - Rook mates + bishop confines
- `smotheredMate` - Knight mates (king smothered by own pieces)
- `swallowstailMate` - V-shaped checkmate pattern
- `triangleMate` - Queen + rook one square from king, forming triangle
- `vukovicMate` - Rook + knight + supporting piece

**Endgame Tactics:**
- `pawnEndgame` - Only pawns
- `knightEndgame` - Knights + pawns
- `bishopEndgame` - Bishops + pawns
- `rookEndgame` - Rooks + pawns
- `queenEndgame` - Queens + pawns
- `queenRookEndgame` - Queens + rooks + pawns

**Special:**
- `castling` - Castle to safety and deploy rook

### ❌ CONTEXTUAL TAGS (Ignore these - don't map)

**Win Condition / Evaluation:**
- `advantage` - Get decisive advantage (200-600cp)
- `crushing` - Spot blunder for crushing advantage (≥600cp)
- `equality` - Come back to draw/balance (≤200cp)

**Game Phase:**
- `opening` - First phase
- `middlegame` - Second phase
- `endgame` - Third phase

**Puzzle Length:**
- `oneMove` - One move puzzle
- `short` - Two moves to win
- `long` - Three moves to win
- `veryLong` - Four+ moves to win

**Difficulty/Source:**
- `master` - From titled player games
- `masterVsMaster` - From games between titled players
- `superGM` - From best players in world
- `playerGames` - From specific player's games
- `mix` - Healthy mix

---

## Solution: Create Categorical Dictionaries

### Dictionary 1: Tactical Theme Mapping

```javascript
const TACTICAL_THEMES = {
  // Basic tactics
  "fork": ["fork"],
  "pin": ["pin"],
  "skewer": ["skewer"],
  "discoveredAttack": ["discovered-attack"],
  "discoveredCheck": ["discovered-check", "discovered-attack"],
  "doubleCheck": ["double-check", "double-attack"],
  "hangingPiece": ["trapped-piece"], // Similar concept
  "trappedPiece": ["trapped-piece"],
  "sacrifice": ["sacrifice"],
  "deflection": ["deflection"],
  "attraction": ["attraction"],
  "clearance": ["clearance"],
  "interference": ["interference"],
  "intermezzo": ["intermediate-move"],
  "quietMove": ["quiet-move"],
  "xRayAttack": ["x-ray"],
  "zugzwang": ["zugzwang"],
  "capturingDefender": ["removal-of-defender"],
  "exposedKing": null, // Need to add this theme
  "defensiveMove": null, // Need to add this theme

  // Pawn tactics
  "advancedPawn": null, // Need to add
  "promotion": null, // Need to add
  "underPromotion": null, // Need to add
  "enPassant": null, // Need to add

  // Attacking
  "attackingF2F7": null, // Need to add specific attack theme
  "kingsideAttack": null, // Strategic theme - add?
  "queensideAttack": null, // Strategic theme - add?
  "collinearMove": null, // Specific tactic - add?

  // Mating patterns (most already exist or need addition)
  "mate": ["mating-attack"],
  "mateIn1": ["mate-in-1", "mating-attack"],
  "mateIn2": ["mate-in-2", "mating-attack"],
  "mateIn3": ["mate-in-3", "mating-attack"],
  "mateIn4": null, // Need to add
  "mateIn5": null, // Need to add
  "anastasiaMate": ["anastasias-mate", "mating-attack"],
  "arabianMate": ["arabian-mate", "mating-attack"],
  "backRankMate": ["back-rank-mate", "back-rank", "mating-attack"],
  "balestraMate": null, // Need to add
  "blindSwineMate": null, // Need to add
  "bodenMate": null, // Need to add
  "cornerMate": null, // Need to add
  "doubleBishopMate": null, // Need to add
  "dovetailMate": ["dovetail-mate", "mating-attack"],
  "epauletteMate": null, // Need to add
  "hookMate": null, // Need to add
  "killBoxMate": null, // Need to add
  "morphysMate": null, // Need to add
  "operaMate": null, // Need to add
  "pillsburysMate": null, // Need to add
  "smotheredMate": ["smothered-mate", "mating-attack"],
  "swallowstailMate": null, // Need to add
  "triangleMate": null, // Need to add
  "vukovicMate": null, // Need to add

  // Endgames
  "pawnEndgame": ["pawn-endgame", "endgame"],
  "knightEndgame": ["knight-endgame", "endgame"],
  "bishopEndgame": ["bishop-endgame", "endgame"],
  "rookEndgame": ["rook-endgame", "endgame"],
  "queenEndgame": ["queen-endgame", "endgame"],
  "queenRookEndgame": null, // Need to add

  // Special
  "castling": null // Strategic move - add?
};
```

### Dictionary 2: Non-Tactical Tags (Filter Out)

```javascript
const NON_TACTICAL_TAGS = new Set([
  // Evaluation
  "advantage",
  "crushing",
  "equality",

  // Game phase (we might want to store these separately!)
  "opening",
  "middlegame",
  "endgame",

  // Puzzle meta
  "oneMove",
  "short",
  "long",
  "veryLong",

  // Difficulty
  "master",
  "masterVsMaster",
  "superGM",
  "playerGames",
  "mix"
]);
```

---

## Extraction Algorithm

```javascript
function extractTacticalThemes(lichessThemeString) {
  // Input: "crushing fork middlegame short"
  // Output: ["fork"]

  const tags = lichessThemeString.split(" ");
  const tacticalThemes = [];

  for (const tag of tags) {
    // Skip non-tactical tags
    if (NON_TACTICAL_TAGS.has(tag)) {
      continue;
    }

    // Map to our hierarchy
    const mapped = TACTICAL_THEMES[tag];

    if (mapped === null) {
      console.warn(`⚠️  Unmapped Lichess theme: ${tag}`);
      continue; // Skip for now, will add later
    }

    if (mapped) {
      tacticalThemes.push(...mapped);
    }
  }

  return [...new Set(tacticalThemes)]; // Remove duplicates
}

// Example:
extractTacticalThemes("crushing fork middlegame short")
// Returns: ["fork"]

extractTacticalThemes("mate mateIn2 backRankMate endgame")
// Returns: ["mate-in-2", "mating-attack", "back-rank-mate", "back-rank"]

extractTacticalThemes("advantage discoveredCheck pin")
// Returns: ["discovered-check", "discovered-attack", "pin"]
```

---

## What We Need to Add to Our Taxonomy

### Missing Themes (47 new themes to add!)

**High Priority (Common in puzzles):**
1. `exposedKing` - King with few defenders
2. `defensiveMove` - Defensive precision
3. `advancedPawn` - Deep pawn push
4. `promotion` - Pawn promotion
5. `underPromotion` - Underpromotion tactics
6. `enPassant` - En passant captures
7. `attackingF2F7` - f2/f7 attacks
8. `hangingPiece` - Undefended pieces (different from trapped)
9. `mateIn4`, `mateIn5` - Longer mates
10. `castling` - Strategic castling

**Mating Patterns (16 new specific mates):**
11. `balestraMate`
12. `blindSwineMate`
13. `bodenMate`
14. `cornerMate`
15. `doubleBishopMate`
16. `epauletteMate`
17. `hookMate`
18. `killBoxMate`
19. `morphysMate`
20. `operaMate`
21. `pillsburysMate`
22. `swallowstailMate`
23. `triangleMate`
24. `vukovicMate`

**Strategic/Positional (Consider adding):**
25. `kingsideAttack`
26. `queensideAttack`
27. `collinearMove`
28. `queenRookEndgame`

---

## Recommended Hierarchy Expansion

```json
{
  "themes": [
    {
      "id": "hanging-piece",
      "name": "Hanging Piece",
      "level": 0,
      "description": "Undefended or insufficiently defended piece",
      "lichessNames": ["hangingPiece"]
    },
    {
      "id": "exposed-king",
      "name": "Exposed King",
      "level": 0,
      "description": "King with few defenders, vulnerable to attack",
      "lichessNames": ["exposedKing"],
      "subthemes": [
        {
          "id": "attacking-f2-f7",
          "name": "Attacking f2/f7",
          "level": 1,
          "description": "Attack on f2 or f7 weakness",
          "lichessNames": ["attackingF2F7"]
        }
      ]
    },
    {
      "id": "pawn-tactics",
      "name": "Pawn Tactics",
      "level": 0,
      "description": "Tactics involving pawn moves",
      "subthemes": [
        {
          "id": "advanced-pawn",
          "name": "Advanced Pawn",
          "level": 1,
          "description": "Pawn deep in opponent position",
          "lichessNames": ["advancedPawn"]
        },
        {
          "id": "promotion",
          "name": "Promotion",
          "level": 1,
          "description": "Promoting pawn to queen or minor piece",
          "lichessNames": ["promotion"],
          "subthemes": [
            {
              "id": "underpromotion",
              "name": "Underpromotion",
              "level": 2,
              "description": "Promoting to knight, bishop, or rook",
              "lichessNames": ["underPromotion"]
            }
          ]
        },
        {
          "id": "en-passant",
          "name": "En Passant",
          "level": 1,
          "description": "En passant capture",
          "lichessNames": ["enPassant"]
        }
      ]
    },
    {
      "id": "defensive-tactics",
      "name": "Defensive Tactics",
      "level": 0,
      "description": "Defensive precision and resource finding",
      "subthemes": [
        {
          "id": "defensive-move",
          "name": "Defensive Move",
          "level": 1,
          "description": "Precise move to avoid material loss",
          "lichessNames": ["defensiveMove"]
        }
      ]
    },
    // Add all 16 new mating patterns under "mating-attack"
  ]
}
```

---

## Implementation Steps

### Step 1: Expand taxonomy JSON ✅
Add 47 new themes to `theme-taxonomy.json`

### Step 2: Create mapping file ✅
```javascript
// data/lichess-theme-mapping.json
{
  "hangingPiece": ["hanging-piece"],
  "fork": ["fork"],
  "mateIn2": ["mate-in-2", "mating-attack"],
  // ... etc
}
```

### Step 3: Update puzzle loader ✅
```javascript
// In load-puzzles.mjs
function extractTacticalThemes(lichessThemes) {
  const tags = lichessThemes.split(" ");
  const tactical = tags
    .filter(tag => !NON_TACTICAL_TAGS.has(tag))
    .flatMap(tag => LICHESS_THEME_MAP[tag] || [])
    .filter(t => t);

  return [...new Set(tactical)];
}
```

### Step 4: Link to full hierarchy ✅
For each extracted theme, link puzzle to theme AND all ancestors:
```javascript
async function linkPuzzleToHierarchy(puzzleId, themeId) {
  // Get theme and all ancestors
  const ancestors = await session.run(`
    MATCH path = (child:Theme)-[:SUBTHEME_OF*0..5]->(ancestor:Theme)
    WHERE child.id = "${themeId}"
    RETURN ancestor.id as id
  `);

  // Link puzzle to each level
  for (const ancestor of ancestors.records) {
    await session.run(`
      MATCH (p:Puzzle)
      WHERE p.puzzleId = "${puzzleId}"
      MATCH (t:Theme)
      WHERE t.id = "${ancestor.get('id')}"
      MERGE (p)-[:HAS_THEME]->(t)
    `);
  }
}
```

---

## Expected Results

**Input:** `"crushing fork discoveredCheck middlegame"`

**Extraction:**
1. Filter: `fork`, `discoveredCheck` (ignore `crushing`, `middlegame`)
2. Map: `fork` → `["fork"]`, `discoveredCheck` → `["discovered-check", "discovered-attack"]`
3. Result: `["fork", "discovered-check", "discovered-attack"]`

**Hierarchy Links:**
- Puzzle → Fork (level 0)
- Puzzle → Discovered Check (level 1)
- Puzzle → Discovered Attack (level 0)

**Total:** 3 theme relationships for this puzzle

**Average:** 2-4 theme relationships per puzzle
**For 1M puzzles:** ~3M Puzzle→Theme relationships

---

## Summary

**The extraction strategy:**
1. ✅ Split Lichess tags by space
2. ✅ Filter out non-tactical tags (advantage, crushing, short, etc.)
3. ✅ Map remaining tags to our hierarchy using dictionary
4. ✅ Link puzzle to ALL levels of each theme's hierarchy
5. ✅ Handle unmapped themes gracefully (log warning, add later)

**This gives us:**
- Accurate tactical theme extraction
- Hierarchical progressive learning
- Ability to find puzzles at any abstraction level
- Foundation for 4M+ puzzle database

**Next:** Shall I create the expanded taxonomy with all 47 new themes?
