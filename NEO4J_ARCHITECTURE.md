# Chess Masti Neo4j Architecture: From Mistakes to Mastery

## Vision

**Goal:** Given a user's in-game mistake, find the most pedagogically valuable puzzles that will help them avoid similar mistakes in future games.

**Challenge:** Lichess puzzles are purely tactical, but user mistakes are often positional/strategic. We need a multi-layered approach.

---

## Architecture Layers

### Layer 0: Current Schema (Position-as-Hub)

```
(Puzzle)-[:FROM_POSITION]->(Position {fen})
(Puzzle)-[:HAS_THEME]->(Theme {name})
(Commentary)-[:FROM_POSITION]->(Position {fen})
(User)-[:STRUGGLED_WITH]->(Theme)
```

**What it's good for:**
- ✅ Finding puzzles with same tactical themes
- ✅ Finding commentary for exact positions
- ✅ Tracking user's weak themes

**What it's missing:**
- ❌ No hierarchical theme taxonomy (Fork → Knight Fork → King+Rook Fork)
- ❌ No position similarity (two different FENs can be structurally similar)
- ❌ No piece patterns or structures
- ❌ No mistake type classification

---

### Layer 1: Hierarchical Theme Taxonomy (Implement First)

**Problem:** Current themes are flat. "fork" is too broad, we need granularity.

**Solution:** Multi-level theme hierarchy

```cypher
// Level 0: Root tactical categories
(Fork:ThemeRoot {name: "Fork"})
(Pin:ThemeRoot {name: "Pin"})
(DiscoveredAttack:ThemeRoot {name: "Discovered Attack"})

// Level 1: Piece-specific
(Fork)-[:HAS_SUBTHEME]->(KnightFork:Theme {
  name: "Knight Fork",
  level: 1,
  description: "Fork using knight movement"
})

// Level 2: Target-specific
(KnightFork)-[:HAS_SUBTHEME]->(KingRookFork:Theme {
  name: "King+Rook Fork",
  level: 2,
  description: "Knight forks king and rook"
})

// Level 3: Position-specific
(KingRookFork)-[:HAS_SUBTHEME]->(F7Fork:Theme {
  name: "f7 King+Rook Fork",
  level: 3,
  description: "Knight on e5/g5 forks king and rook via f7",
  commonSquares: ["e5", "g5", "f7"]
})

// Connect puzzles at all relevant levels
(Puzzle {id: "00123"})-[:HAS_THEME]->(F7Fork)
(Puzzle {id: "00123"})-[:HAS_THEME]->(KingRookFork)
(Puzzle {id: "00123"})-[:HAS_THEME]->(KnightFork)
(Puzzle {id: "00123"})-[:HAS_THEME]->(Fork)
```

**Query for Progressive Learning:**
```cypher
// Start with user's specific mistake
MATCH (user:User {id: $userId})-[:MADE_MISTAKE]->(mistake:Mistake)
MATCH (mistake)-[:INVOLVES_THEME]->(specificTheme:Theme)

// Find puzzles at increasing levels of abstraction
MATCH path = (specificTheme)-[:HAS_SUBTHEME*0..3]->(broaderTheme:Theme)
MATCH (broaderTheme)<-[:HAS_THEME]-(puzzle:Puzzle)

// User hasn't solved yet
WHERE NOT (user)-[:SOLVED]->(puzzle)

// Appropriate difficulty
AND puzzle.rating BETWEEN $userRating - 100 AND $userRating + 200

RETURN
  puzzle,
  length(path) as abstractionLevel,
  specificTheme.name as originalTheme,
  broaderTheme.name as practiceTheme

// First puzzles are specific (length=0), later puzzles are abstract (length=3)
ORDER BY abstractionLevel ASC, puzzle.popularity DESC
LIMIT 10
```

---

### Layer 2: Piece Patterns & Structures (Bridging Tactical/Positional)

**Problem:** FEN is too specific. Two positions with different piece locations can have same tactical/strategic themes.

**Solution:** Extract patterns from positions and create pattern nodes

```cypher
// Pattern types
(Pattern {
  type: "knight_outpost",
  squares: ["d5", "e5", "d4", "e4"],
  description: "Knight on strong central square, cannot be challenged by pawns",
  category: "piece_placement"
})

(Pattern {
  type: "isolated_queen_pawn",
  file: "d",
  description: "Queen pawn with no adjacent pawns",
  category: "pawn_structure"
})

(Pattern {
  type: "rook_seventh_rank",
  description: "Rook on opponent's seventh rank",
  category: "piece_activity"
})

(Pattern {
  type: "weak_back_rank",
  description: "King on back rank with limited escape squares",
  category: "king_safety"
})

// Connect positions to patterns
(Position {fen: "..."})-[:HAS_PATTERN]->(Pattern {type: "knight_outpost"})
(Position {fen: "..."})-[:HAS_PATTERN]->(Pattern {type: "weak_back_rank"})

// Connect patterns to themes
(Pattern {type: "weak_back_rank"})-[:ENABLES_THEME]->(Theme {name: "Back Rank Mate"})
(Pattern {type: "knight_outpost"})-[:ENABLES_THEME]->(Theme {name: "Knight Fork"})
```

**Pattern Extraction (done during puzzle/commentary loading):**

```javascript
// Pseudo-code for pattern detection
function extractPatterns(fen) {
  const board = parseFEN(fen);
  const patterns = [];

  // Check for outposts
  for (const knight of board.pieces.knights) {
    if (isOutpost(knight, board)) {
      patterns.push({
        type: "knight_outpost",
        square: knight.square,
        color: knight.color
      });
    }
  }

  // Check for pawn structures
  const pawnStructure = analyzePawnStructure(board);
  if (pawnStructure.isolatedPawns.length > 0) {
    patterns.push({
      type: "isolated_pawn",
      file: pawnStructure.isolatedPawns[0].file
    });
  }

  // Check for back rank weakness
  if (hasBackRankWeakness(board, 'white')) {
    patterns.push({type: "weak_back_rank_white"});
  }

  return patterns;
}
```

**Query with Pattern Matching:**
```cypher
// Find puzzles with similar patterns to user's mistake
MATCH (userMistake:Mistake)-[:AT_POSITION]->(mistakePos:Position)
MATCH (mistakePos)-[:HAS_PATTERN]->(pattern:Pattern)

// Find other puzzles sharing these patterns
MATCH (pattern)<-[:HAS_PATTERN]-(puzzlePos:Position)<-[:FROM_POSITION]-(puzzle:Puzzle)

RETURN puzzle, collect(pattern.type) as sharedPatterns
ORDER BY size(sharedPatterns) DESC
```

---

### Layer 3: Mistake Classification

**Problem:** Not all mistakes are equal. A blunder (losing material) is different from a missed opportunity.

**Solution:** Classify user mistakes

```cypher
(Mistake {
  id: "mistake_123",
  gameId: "game_456",
  moveNumber: 15,
  movePlayed: "Nc3",
  moveBest: "Nd2",
  evalBefore: -0.3,
  evalAfter: -2.1,
  evalDelta: 1.8,
  timestamp: datetime()
})

// Mistake type classification
(MistakeType {
  name: "Tactical Blunder",
  description: "Hanging piece or allowing forced tactic",
  evalThreshold: 2.0
})

(MistakeType {
  name: "Positional Inaccuracy",
  description: "Suboptimal plan or piece placement",
  evalThreshold: 0.5
})

(MistakeType {
  name: "Missed Win",
  description: "Failed to find winning continuation",
  evalThreshold: 3.0
})

// Relationships
(Mistake)-[:IS_TYPE]->(MistakeType)
(Mistake)-[:AT_POSITION]->(Position {fen: $fenBeforeMove})
(Mistake)-[:INVOLVES_THEME]->(Theme {name: "hanging piece"})
(Mistake)-[:MADE_BY]->(User)
```

**Auto-classification on mistake recording:**
```javascript
async function classifyMistake(moveData) {
  const evalDelta = Math.abs(moveData.evalAfter - moveData.evalBefore);

  let mistakeType;
  if (evalDelta > 3.0) {
    mistakeType = "Tactical Blunder";
  } else if (evalDelta > 1.0) {
    mistakeType = "Tactical Inaccuracy";
  } else if (evalDelta > 0.5) {
    mistakeType = "Positional Inaccuracy";
  } else {
    mistakeType = "Minor Inaccuracy";
  }

  // Detect tactical themes using chess engine
  const threats = await analyzeThreats(moveData.position);
  const themes = detectThemesFromThreats(threats);

  return {
    mistakeType,
    themes,
    patterns: extractPatterns(moveData.position)
  };
}
```

---

### Layer 4: Position Embeddings (Future - ML Required)

**Problem:** Even with patterns, we can't capture all positional nuances. A machine learning model can learn what "similar" means.

**Solution:** Use chess neural network (Lc0, Maia, Stockfish NNUE) to generate position embeddings

```cypher
// Add embedding vector to positions
(Position {
  fen: "...",
  embedding: [0.23, -0.15, 0.87, ...] // 512 dimensions from Lc0/Maia
})

// Neo4j vector index (requires Neo4j 5.13+)
CREATE VECTOR INDEX position_similarity
FOR (p:Position) ON p.embedding
OPTIONS {indexConfig: {
  `vector.dimensions`: 512,
  `vector.similarity_function`: 'cosine'
}}

// Find similar positions
MATCH (mistakePos:Position {fen: $userMistakeFEN})
CALL db.index.vector.queryNodes(
  'position_similarity',
  $k,  // number of results
  mistakePos.embedding
) YIELD node as similarPos, score

MATCH (similarPos)<-[:FROM_POSITION]-(puzzle:Puzzle)
WHERE NOT (user)-[:SOLVED]->(puzzle)
RETURN puzzle, score
ORDER BY score DESC
```

**Benefits:**
- ✅ Finds positionally similar positions even with different pieces
- ✅ Captures strategic concepts (space, initiative, compensation)
- ✅ Works when tactical themes don't match

---

## Query Patterns for Mistake → Puzzle Recommendation

### Query 1: Exact Theme Match (Easiest)
```cypher
// User made tactical blunder involving a fork
MATCH (user:User {id: $userId})
MATCH (mistake:Mistake)-[:MADE_BY]->(user)
WHERE mistake.id = $mistakeId

MATCH (mistake)-[:INVOLVES_THEME]->(theme:Theme)
MATCH (theme)<-[:HAS_THEME]-(puzzle:Puzzle)

WHERE NOT (user)-[:SOLVED]->(puzzle)
AND puzzle.rating BETWEEN user.rating - 100 AND user.rating + 100

RETURN puzzle
ORDER BY puzzle.popularity DESC
LIMIT 5
```

### Query 2: Progressive Difficulty via Theme Hierarchy
```cypher
// First puzzle: very specific
// Last puzzle: more general but same skill

MATCH (user:User {id: $userId})
MATCH (mistake:Mistake {id: $mistakeId})-[:MADE_BY]->(user)
MATCH (mistake)-[:INVOLVES_THEME]->(specificTheme:Theme)

// Get theme hierarchy (specific to general)
MATCH path = (specificTheme)-[:HAS_SUBTHEME*0..3]->(broadTheme:Theme)

MATCH (broadTheme)<-[:HAS_THEME]-(puzzle:Puzzle)
WHERE NOT (user)-[:SOLVED]->(puzzle)

// Create sequence: specific → abstract
WITH puzzle, length(path) as level, path
ORDER BY level ASC, puzzle.popularity DESC

// Return 5 puzzles with increasing abstraction
WITH collect(puzzle)[0..5] as puzzleSequence
UNWIND range(0, size(puzzleSequence)-1) as idx
RETURN puzzleSequence[idx] as puzzle, idx + 1 as sequenceNumber
```

### Query 3: Pattern-Based Similarity
```cypher
// Find puzzles sharing similar patterns

MATCH (mistake:Mistake {id: $mistakeId})-[:AT_POSITION]->(pos:Position)
MATCH (pos)-[:HAS_PATTERN]->(pattern:Pattern)

// Find puzzles with overlapping patterns
MATCH (pattern)<-[:HAS_PATTERN]-(otherPos:Position)<-[:FROM_POSITION]-(puzzle:Puzzle)

WITH puzzle, collect(DISTINCT pattern.type) as patterns
WHERE size(patterns) >= 2  // At least 2 shared patterns

RETURN puzzle, patterns
ORDER BY size(patterns) DESC, puzzle.popularity DESC
LIMIT 10
```

### Query 4: Composite Score (Best UX)
```cypher
// Combine theme match, pattern match, and difficulty

MATCH (user:User {id: $userId})
MATCH (mistake:Mistake {id: $mistakeId})-[:MADE_BY]->(user)

// Theme score
OPTIONAL MATCH (mistake)-[:INVOLVES_THEME]->(theme:Theme)<-[:HAS_THEME]-(puzzle:Puzzle)
WITH user, mistake, puzzle, count(theme) as themeScore

// Pattern score
OPTIONAL MATCH (mistake)-[:AT_POSITION]->(:Position)-[:HAS_PATTERN]->(pattern:Pattern)
    <-[:HAS_PATTERN]-(:Position)<-[:FROM_POSITION]-(puzzle)
WITH user, mistake, puzzle, themeScore, count(DISTINCT pattern) as patternScore

// Filter and rank
WHERE NOT (user)-[:SOLVED]->(puzzle)
AND puzzle.rating BETWEEN user.rating - 150 AND user.rating + 150

// Composite score
WITH puzzle,
     themeScore * 3 + patternScore * 2 as relevanceScore,
     abs(puzzle.rating - user.rating) as difficultyDiff

RETURN puzzle
ORDER BY relevanceScore DESC, difficultyDiff ASC, puzzle.popularity DESC
LIMIT 10
```

---

## Implementation Roadmap

### Phase 1: Theme Hierarchy (This Week)
1. ✅ Fix UNWIND issue in loaders
2. Create theme taxonomy JSON file
3. Update setup-graph.mjs to create hierarchical themes
4. Update load-puzzles.mjs to link puzzles to all theme levels
5. Test progressive puzzle query

### Phase 2: Pattern Extraction (Next 2 Weeks)
1. Write pattern detection functions (knight outposts, pawn structures, etc.)
2. Add pattern nodes to schema
3. Run pattern extraction on all loaded puzzles
4. Test pattern-based similarity queries

### Phase 3: Mistake Recording API (Week 3-4)
1. Create `/api/record-mistake` endpoint
2. Classify mistake type (blunder, inaccuracy, etc.)
3. Extract patterns from mistake position
4. Link mistake to themes and patterns
5. Return recommended puzzles

### Phase 4: Position Embeddings (Month 2)
1. Set up Lc0/Maia inference server
2. Generate embeddings for all positions
3. Store embeddings in Neo4j
4. Create vector index
5. Test embedding-based similarity

### Phase 5: Custom Puzzle Generation (Future)
1. Given a mistake pattern, generate variations
2. Use chess engine to verify puzzle validity
3. Store generated puzzles in graph
4. Track effectiveness of generated vs real puzzles

---

## Answering Your Questions

### Q: How does graph database improve similarity scoring?

**A: Multi-hop traversal + structural matching**

Example: User hangs a piece to a knight fork on f7

```cypher
// Bad approach (flat search):
// Just search for "fork" theme → 10,000 puzzles

// Good approach (graph traversal):
MATCH (mistake)-[:INVOLVES_THEME]->(:Theme {name: "Knight Fork"})
    -[:HAS_SUBTHEME]->(:Theme {name: "f7 Fork"})  // More specific
MATCH (mistake)-[:AT_POSITION]->(pos)-[:HAS_PATTERN]->
    (:Pattern {type: "weak_f7_square"})  // Structural match

// Now only 50 highly relevant puzzles
```

**Speed:** Graph databases are optimized for relationship traversal. Finding "puzzles 2-3 hops away through theme hierarchy" is O(1) vs O(n) in SQL.

### Q: What about positional mistakes?

**A: Commentary dataset + patterns + embeddings**

For positional mistakes where no tactical theme exists:

1. **Commentary fallback:** Find commentary on similar positions explaining strategic concepts
2. **Pattern matching:** Even without tactics, patterns like "isolated pawn", "knight outpost", "weak squares" can match
3. **Embeddings (future):** Maia/Lc0 can find strategically similar positions

Example:
```cypher
// User plays dubious plan in isolated queen pawn structure
MATCH (mistake:Mistake {type: "Positional Inaccuracy"})
    -[:AT_POSITION]->(pos:Position)
    -[:HAS_PATTERN]->(pattern:Pattern {type: "isolated_queen_pawn"})

// Find commentary explaining IQP strategy
MATCH (pattern)<-[:HAS_PATTERN]-(commentaryPos:Position)
    <-[:FROM_POSITION]-(commentary:Commentary)
WHERE commentary.text CONTAINS "isolated" OR commentary.text CONTAINS "blockade"

RETURN commentary.text as strategicAdvice
```

### Q: Can we separate puzzles into groups and subgroups?

**A: Yes! That's exactly what the theme hierarchy does**

```
Forks (10,000 puzzles)
├── Knight Forks (4,000 puzzles)
│   ├── King+Rook Forks (800 puzzles)
│   │   ├── f7 King+Rook Forks (120 puzzles)
│   │   └── c7 King+Rook Forks (80 puzzles)
│   └── King+Queen Forks (300 puzzles)
├── Bishop Forks (200 puzzles)
└── Queen Forks (1,500 puzzles)
```

Each puzzle exists in **multiple hierarchies simultaneously**:
- Tactical theme hierarchy (fork → knight fork → specific fork)
- Pattern hierarchy (weak back rank → f7 weakness → exposed king)
- Opening hierarchy (Sicilian → Open Sicilian → Dragon)

---

## Key Insight: Graph vs Traditional DB

**Traditional DB (PostgreSQL):**
```sql
SELECT * FROM puzzles
WHERE theme = 'fork'
AND rating BETWEEN 1400 AND 1600
LIMIT 10;
-- ❌ Finds puzzles, but no similarity ranking
-- ❌ Can't traverse "similar but not identical" themes
-- ❌ Multi-join hell for patterns + themes + user history
```

**Graph DB (Neo4j):**
```cypher
MATCH (mistake)-[:INVOLVES_THEME]->(t1:Theme)-[:SIMILAR_TO*1..2]-(t2:Theme)
MATCH (t2)<-[:HAS_THEME]-(puzzle)
WHERE NOT (user)-[:SOLVED]->(puzzle)
RETURN puzzle
ORDER BY shortestPath(mistake, puzzle) ASC
-- ✅ Finds related themes through graph traversal
-- ✅ Can explore "2 hops away" patterns
-- ✅ Natural fit for recommendation systems
```

---

## Next Step: Let's Implement Theme Hierarchy

Would you like me to:
1. **Create the theme taxonomy JSON** (fork → knight fork → king+rook fork → f7 fork)?
2. **Update setup-graph.mjs** to create hierarchical theme relationships?
3. **Test the progressive puzzle query** to see puzzles ranging from specific to abstract?

This would be the foundation for everything else!
