# Neo4j Graph Database Loaders for Chess Masti

This directory contains scripts to load chess data into Neo4j graph database, implementing Ryan Knight's Position-as-hub architecture for adaptive coaching features.

## 📊 Graph Schema

```
┌────────────────────────────────────────────────────────────────┐
│              Position-as-Hub Architecture                      │
└────────────────────────────────────────────────────────────────┘

                        ┌──────────────┐
                   ┌────│   Position   │────┐
                   │    │  {fen: str}  │    │
                   │    └──────────────┘    │
                   │                        │
          [:FROM_POSITION]          [:FROM_POSITION]
                   │                        │
                   ▼                        ▼
           ┌──────────────┐        ┌──────────────┐
           │    Puzzle    │        │  Commentary  │
           │  {id, moves} │        │   {text}     │
           └──────────────┘        └──────────────┘
                   │                        │
            [:HAS_THEME]            [:IN_OPENING]
                   │                        │
                   ▼                        ▼
           ┌──────────────┐        ┌──────────────┐
           │    Theme     │        │   Opening    │
           │  {name}      │        │  {name,eco}  │
           └──────────────┘        └──────────────┘
                   ▲
                   │
          [:STRUGGLED_WITH]
                   │
           ┌──────────────┐
           │     User     │
           │  {id,rating} │
           └──────────────┘
                   │
            [:ATTEMPTED]
                   │
                   ▼
              (Puzzle)
```

## 🚀 Quick Start

### Prerequisites

1. **Neo4j Aura Free Tier Account**
   - Sign up at https://neo4j.com/cloud/aura/
   - Create a new database instance
   - Save your connection credentials

2. **Environment Variables**
   ```bash
   # Add to .env.local
   NEO4J_URI=bolt+s://xxxxx.databases.neo4j.io
   NEO4J_USERNAME=neo4j
   NEO4J_PASSWORD=your-password
   ```

3. **Install Dependencies**
   ```bash
   npm install neo4j-driver chess.js
   ```

### Step-by-Step Setup

#### 1. Initialize Graph Schema

```bash
# Create nodes, constraints, and indexes
node scripts/neo4j-loaders/setup-graph.mjs

# Or reset existing data first:
node scripts/neo4j-loaders/setup-graph.mjs --reset
```

**What this does:**
- Creates uniqueness constraints (Position.fen, Puzzle.id, etc.)
- Creates indexes for fast queries (rating, popularity)
- Seeds sample data (themes, openings, test user)
- Verifies setup

**Output:**
```
✓ puzzle_id constraint
✓ position_fen constraint
✓ theme_name constraint
✓ Sample themes created (9 themes)
✓ Sample openings created (5 openings)
✓ Test user created (test-user-123)
```

---

#### 2. Load Lichess Puzzles

```bash
# Load 10,000 puzzles (recommended for free tier)
node scripts/neo4j-loaders/load-puzzles.mjs --limit 10000

# Or load 100,000 puzzles (will use ~50% of free tier)
node scripts/neo4j-loaders/load-puzzles.mjs --limit 100000
```

**What this does:**
- Downloads Lichess puzzle dataset (or uses HuggingFace sample)
- Parses CSV: PuzzleId, FEN, Moves, Rating, Themes
- Creates Position nodes (deduplicated by FEN)
- Creates Puzzle nodes with metadata
- Links Puzzle → Position, Puzzle → Theme

**Data loaded:**
- ~10k-100k Puzzle nodes
- ~8k-80k unique Position nodes
- 70 Theme nodes (fork, pin, skewer, etc.)
- ~30k-300k relationships

**Sample puzzle:**
```json
{
  "puzzleId": "00001",
  "fen": "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
  "moves": "e7e6 h6h7 h8g8 h7h6",
  "rating": 1739,
  "themes": ["crushing", "hangingPiece", "long", "middlegame"]
}
```

---

#### 3. Load Commentary Data

```bash
# Load 5,000 commentary entries
node scripts/neo4j-loaders/load-commentary.mjs --limit 5000

# Or load 50,000 entries
node scripts/neo4j-loaders/load-commentary.mjs --limit 50000
```

**What this does:**
- Downloads Jhamtani Chess Commentary dataset from GitHub
- Parses JSON: {move, fen, commentary, game_info}
- Creates Commentary nodes with expert analysis
- Links Commentary → Position
- Links Commentary → Opening, Game

**Data loaded:**
- ~5k-50k Commentary nodes
- Expert move explanations
- Links to ~3k-30k positions
- Opening-specific insights

**Sample commentary:**
```json
{
  "move": "Nf3",
  "fen": "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R",
  "commentary": "White develops the knight, controlling central squares",
  "opening": "King's Knight Opening",
  "playerRating": 2000
}
```

---

## 📊 Graph Statistics

After loading all data, you'll have approximately:

| Node Type | Count (10k sample) | Count (100k full) |
|-----------|-------------------|-------------------|
| Position | 8,000 | 80,000 |
| Puzzle | 10,000 | 100,000 |
| Commentary | 5,000 | 50,000 |
| Theme | 70 | 70 |
| Opening | 50 | 3,690 |
| User | 1 (test) | Variable |

**Relationships:**
- Puzzle→Position: 10k-100k
- Puzzle→Theme: 30k-300k (avg 3 themes per puzzle)
- Commentary→Position: 5k-50k
- User→Theme (STRUGGLED_WITH): 3 (test user)

**Free Tier Capacity:**
- Nodes: 200,000 limit
- Relationships: 400,000 limit
- Recommended: 10k puzzles + 5k commentary = ~15% usage

---

## 🧪 Testing the Graph

### 1. Query Adaptive Puzzles

```bash
curl -X POST http://localhost:3000/api/adaptive-puzzles \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "themes": ["fork", "pin"],
    "difficulty": "intermediate",
    "limit": 5
  }'
```

**Expected response:**
```json
{
  "puzzles": [
    {
      "puzzleId": "abc123",
      "fen": "...",
      "moves": "e4 e5 ...",
      "rating": 1650,
      "themes": ["fork", "pin"],
      "popularity": 89
    }
  ],
  "recommendationReason": "Adaptive puzzles targeting your struggled themes: fork, pin",
  "struggledThemes": ["fork", "pin", "skewer"],
  "fallbackUsed": false
}
```

### 2. Query Commentary by FEN

```bash
curl -X POST http://localhost:3000/api/commentary-by-fen \
  -H "Content-Type: application/json" \
  -d '{
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKB1R",
    "limit": 3,
    "minRating": 1800
  }'
```

**Expected response:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKB1R",
  "commentaries": [
    {
      "text": "White controls the center with the king's pawn...",
      "move": "e4",
      "playerRating": 2000,
      "opening": "King's Pawn Opening"
    }
  ],
  "totalFound": 3,
  "avgRating": 1950
}
```

### 3. Explore in Neo4j Browser

```bash
# Open Neo4j Browser
open https://xxxxx.databases.neo4j.io:7474

# Sample queries:
```

**Query 1: Find all puzzles with fork theme**
```cypher
MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme {name: 'fork'})
RETURN p.puzzleId, p.rating, p.fen
LIMIT 10
```

**Query 2: Find commentary for starting position**
```cypher
MATCH (pos:Position)<-[:FROM_POSITION]-(c:Commentary)
WHERE pos.fen STARTS WITH 'rnbqkbnr'
RETURN c.move, c.text, c.playerRating
ORDER BY c.playerRating DESC
LIMIT 5
```

**Query 3: Adaptive puzzle recommendation**
```cypher
MATCH (u:User {id: 'test-user-123'})-[:STRUGGLED_WITH]->(t:Theme)
MATCH (p:Puzzle)-[:HAS_THEME]->(t)
WHERE NOT (u)-[:ATTEMPTED]->(p)
RETURN p.puzzleId, p.rating, collect(t.name) AS themes
ORDER BY p.rating
LIMIT 10
```

**Query 4: Position deduplication check**
```cypher
MATCH (pos:Position)<-[:FROM_POSITION]-(n)
WITH pos, count(n) AS linkCount
WHERE linkCount > 1
RETURN pos.fen, linkCount
ORDER BY linkCount DESC
LIMIT 10
```

---

## 🔧 Advanced Configuration

### Batch Size Tuning

Large batch sizes = faster loading but more memory:

```bash
# Small batches (safer for free tier)
node scripts/neo4j-loaders/load-puzzles.mjs --batch 100

# Large batches (faster)
node scripts/neo4j-loaders/load-puzzles.mjs --batch 2000
```

### Custom Data Sources

Edit the loader scripts to use your own datasets:

```javascript
// load-puzzles.mjs
const PUZZLE_CSV_URL = "https://your-custom-source.com/puzzles.csv";

// load-commentary.mjs
const DATA_DIR = "./data/your-commentary-dataset";
```

### Reset and Reload

```bash
# Clear all data and start fresh
node scripts/neo4j-loaders/setup-graph.mjs --reset

# Reload puzzles
node scripts/neo4j-loaders/load-puzzles.mjs --limit 10000

# Reload commentary
node scripts/neo4j-loaders/load-commentary.mjs --limit 5000
```

---

## 📈 Performance Tips

### 1. Use Constraints Before Loading

Always run `setup-graph.mjs` first to create constraints. This enables:
- Automatic deduplication via `MERGE`
- Faster lookups via unique indexes
- Data integrity guarantees

### 2. Batch Size Guidelines

| Free Tier | Recommended Batch Size |
|-----------|------------------------|
| < 10k nodes | 1000 |
| 10k-50k nodes | 500 |
| 50k-100k nodes | 250 |

### 3. Monitor Database Size

```cypher
// Check node counts
MATCH (n) RETURN labels(n) AS label, count(n) AS count

// Check relationship counts
MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count

// Check total database size
CALL apoc.meta.stats() YIELD nodeCount, relCount
RETURN nodeCount, relCount
```

### 4. Optimize Queries

Use `EXPLAIN` and `PROFILE` to analyze query performance:

```cypher
PROFILE
MATCH (u:User {id: $userId})-[:STRUGGLED_WITH]->(t:Theme)
MATCH (p:Puzzle)-[:HAS_THEME]->(t)
WHERE NOT (u)-[:ATTEMPTED]->(p)
RETURN p
LIMIT 10
```

---

## 🐛 Troubleshooting

### Error: "Connection refused"

**Solution:** Check Neo4j URI format
```bash
# Correct format for Aura:
NEO4J_URI=bolt+s://xxxxx.databases.neo4j.io

# NOT bolt:// or neo4j://
```

### Error: "Constraint already exists"

**Solution:** Reset database first
```bash
node scripts/neo4j-loaders/setup-graph.mjs --reset
```

### Error: "Heap space exceeded"

**Solution:** Reduce batch size
```bash
node scripts/neo4j-loaders/load-puzzles.mjs --batch 100
```

### Commentary file not found

**Solution:** The Jhamtani dataset requires manual download or uses synthetic data
```bash
# Loader will automatically generate synthetic sample if real data unavailable
node scripts/neo4j-loaders/load-commentary.mjs --limit 1000
```

---

## 📚 Resources

### Datasets
- **Lichess Puzzles:** https://database.lichess.org/#puzzles
- **HuggingFace Puzzles:** https://huggingface.co/datasets/Lichess/chess-puzzles
- **Jhamtani Commentary:** https://github.com/harsh19/ChessCommentaryGeneration
- **Paper:** https://aclanthology.org/P18-1154/

### Ryan's Chess-Graph Project
- **Repository:** https://github.com/retroryan/chess-graph
- **Tutorial:** See `docs/tutorial.md`
- **Sample Queries:** See `docs/sample-queries.md`

### Neo4j Documentation
- **Cypher Manual:** https://neo4j.com/docs/cypher-manual/current/
- **Aura Docs:** https://neo4j.com/docs/aura/
- **Constraints:** https://neo4j.com/docs/cypher-manual/current/constraints/

---

## 🎯 Next Steps

1. **Load production data:** Scale up to 100k puzzles + 50k commentary
2. **Track user progress:** Create User nodes for each registered user
3. **Record puzzle attempts:** Create ATTEMPTED relationships
4. **Detect struggled themes:** Analyze puzzle failures → create STRUGGLED_WITH links
5. **Integrate commentary into AI coach:** Fetch relevant commentary by FEN in chat API
6. **Build opening explorer:** Link games → openings → positions

---

**Generated:** March 30, 2026
**Implementation:** Claude (Anthropic)
**Based on:** Ryan Knight's Chess-Graph Architecture

