# Lichess Puzzle Database Scaling Plan

## Current Status (As of Now)

### ✅ What We Have Built

**Hierarchical Theme Taxonomy:**
- **75 hierarchical theme nodes** across 4 levels (0-3)
- **57 parent-child relationships** (:SUBTHEME_OF)
- **Working graph traversal queries** for progressive learning

**Theme Hierarchy Breakdown:**
```
Level 0 (Root themes): 17 themes
  - Fork, Pin, Skewer, Discovered Attack, Double Attack
  - Sacrifice, Deflection, Removal of Defender, Trapped Piece
  - Back Rank, Mating Attack, Endgame, Zugzwang
  - Interference, Clearance, X-Ray Attack, Intermediate Move, Quiet Move

Level 1 (Specific categories): 33 themes
  - Knight Fork, Bishop Fork, Queen Fork, Pawn Fork
  - Absolute Pin, Relative Pin
  - Queen Sacrifice, Rook Sacrifice, Minor Piece Sacrifice
  - Mate in 1, Mate in 2, Mate in 3, Smothered Mate
  - Pawn Endgame, Rook Endgame, Queen Endgame
  - etc.

Level 2 (Very specific): 19 themes
  - King+Rook Knight Fork, King+Queen Knight Fork
  - Bishop Absolute Pin, Rook Absolute Pin
  - Queen Sacrifice for Mate, Queen Sacrifice for Attack
  - Opposition, Triangulation, Lucena Position, Philidor Position
  - etc.

Level 3 (Ultra-specific): 6 themes
  - f7 Knight Fork, c7 Knight Fork
  - Bishop Trapped on a7/h7
  - Knight Trapped on Edge
  - Discovered Check with Capture
  - etc.
```

**Current Puzzles in Database:**
- **10 sample puzzles** loaded
- Puzzles linked to OLD flat themes (not hierarchical yet)
- Sample themes from Lichess CSV: `crushing hangingPiece long middlegame`

---

## ❌ What's Missing for Full Lichess Database

### 1. **Lichess Theme Mapping**

**Problem:** Lichess uses different theme names than our hierarchy!

**Lichess theme examples from CSV:**
```
- "crushing hangingPiece long middlegame"
- "advantage endgame short"
- "advantage master middlegame short"
- "advantage middlegame sacrifice short"
- "crushing endgame short zugzwang"
- "advantage fork middlegame short"
- "advantage endgame mate mateIn2 short"
```

**Lichess themes are:**
- **Space-separated tags** (not hierarchical)
- **Mix of tactical + contextual**:
  - Tactical: `fork`, `pin`, `hangingPiece`, `sacrifice`, `zugzwang`
  - Contextual: `crushing`, `advantage`, `short`, `long`, `master`
  - Game phase: `opening`, `middlegame`, `endgame`
  - Mating: `mate`, `mateIn1`, `mateIn2`, `mateIn3`

**What we need:** A mapping table from Lichess flat themes → Our hierarchical themes

### 2. **Theme Mapping Table**

We need to create `lichess-theme-mapping.json`:

```json
{
  "lichess_to_hierarchy": {
    "fork": ["fork"],
    "knightFork": ["knight-fork", "fork"],
    "queenFork": ["queen-fork", "fork"],
    "pin": ["pin"],
    "absolutePin": ["absolute-pin", "pin"],
    "hangingPiece": ["trapped-piece"],
    "sacrifice": ["sacrifice"],
    "queenSacrifice": ["queen-sacrifice", "sacrifice"],
    "rookSacrifice": ["rook-sacrifice", "sacrifice"],
    "mate": ["mating-attack"],
    "mateIn1": ["mate-in-1", "mating-attack"],
    "mateIn2": ["mate-in-2", "mating-attack"],
    "mateIn3": ["mate-in-3", "mating-attack"],
    "smotheredMate": ["smothered-mate", "mating-attack"],
    "backRankMate": ["back-rank-mate", "back-rank"],
    "discoveredAttack": ["discovered-attack"],
    "discoveredCheck": ["discovered-check", "discovered-attack"],
    "doubleCheck": ["double-check", "double-attack"],
    "deflection": ["deflection"],
    "clearance": ["clearance"],
    "interference": ["interference"],
    "xRayAttack": ["x-ray"],
    "zugzwang": ["zugzwang"],
    "intermezzo": ["intermediate-move"],
    "quietMove": ["quiet-move"],
    "trappedPiece": ["trapped-piece"],

    // Contextual themes (don't map to tactical hierarchy)
    "crushing": null,
    "advantage": null,
    "short": null,
    "long": null,
    "master": null,
    "opening": null,
    "middlegame": null,
    "endgame": null
  }
}
```

### 3. **Missing Themes in Our Hierarchy**

Lichess has ~100+ theme tags. Our hierarchy has 75 themes. We're missing:

**Common Lichess themes NOT in our taxonomy:**
- `hangingPiece` (we have `trapped-piece` but it's not quite the same)
- `attackingF2F7` (specific square attacks)
- `doubleBishopMate`, `dovetailMate`, `hookMate` (mating patterns)
- `promotion`, `underPromotion` (pawn promotion tactics)
- `capturingDefender`, `exposedKing` (specific tactical motifs)
- `kingsideAttack`, `queensideAttack` (strategic themes)
- `defensiveMove`, `counterplay` (defensive themes)
- `endgamePatterns` (specific endgame motifs)

**We need to:**
1. Add these missing themes to our taxonomy
2. Place them in the correct hierarchical level
3. Update `theme-taxonomy.json`

---

## 📋 Action Plan to Scale to 4M+ Puzzles

### Phase 1: Complete Theme Taxonomy (1-2 days)

**Tasks:**
1. ✅ Download full Lichess theme list (check their GitHub/docs)
2. ✅ Identify ALL ~100 Lichess themes
3. ✅ Map each Lichess theme to our hierarchy (or create new nodes)
4. ✅ Expand `theme-taxonomy.json` with missing themes
5. ✅ Re-run `setup-graph.mjs` to load expanded taxonomy

**Estimated new theme count:** ~120-150 themes total

### Phase 2: Create Theme Mapping Logic (1 day)

**File to create:** `scripts/neo4j-loaders/map-lichess-themes.mjs`

```javascript
// Pseudo-code
function mapLichessThemeToHierarchy(lichessThemeString) {
  // Input: "crushing fork middlegame short"
  // Output: ["knight-fork", "fork"] (if we can infer it's a knight fork)
  //         OR just ["fork"] (if we can't tell which type)

  const tags = lichessThemeString.split(" ");
  const hierarchicalThemes = [];

  for (const tag of tags) {
    const mapped = LICHESS_THEME_MAP[tag];
    if (mapped) {
      hierarchicalThemes.push(...mapped);
    }
  }

  return [...new Set(hierarchicalThemes)]; // Remove duplicates
}
```

### Phase 3: Update Puzzle Loader (1 day)

**Update `load-puzzles.mjs` to:**

1. Parse Lichess theme tags from CSV
2. Map each tag to hierarchical themes
3. Link puzzle to ALL levels of hierarchy

```javascript
// For each puzzle:
const lichessThemes = puzzle.themes.split(" "); // ["fork", "middlegame", "short"]
const hierarchicalThemes = lichessThemes
  .flatMap(tag => mapLichessThemeToHierarchy(tag))
  .filter(t => t); // Remove nulls

// Link to each theme AND all its ancestors
for (const themeId of hierarchicalThemes) {
  // Get theme and all ancestors
  const ancestors = await getThemeAncestors(themeId);

  for (const ancestor of ancestors) {
    await session.run(`
      MATCH (p:Puzzle)
      WHERE p.puzzleId = "${puzzle.puzzleId}"
      MATCH (t:Theme)
      WHERE t.id = "${ancestor.id}"
      MERGE (p)-[:HAS_THEME]->(t)
    `);
  }
}
```

**Result:** Each puzzle will be linked to 2-5 theme nodes (specific → general)

Example:
```
Puzzle "f7 knight fork" → Links to:
  - Theme: f7 Knight Fork (level 3)
  - Theme: King+Rook Knight Fork (level 2)
  - Theme: Knight Fork (level 1)
  - Theme: Fork (level 0)
```

### Phase 4: Download Full Lichess Dataset (Variable time)

**Options:**

**Option A: Full Download (Slow but Complete)**
- Download from https://database.lichess.org/
- File: `lichess_db_puzzle.csv.zst` (~450MB compressed, ~3GB uncompressed)
- Contains **4+ million puzzles**
- Requires `zstd` decompression tool

**Option B: HuggingFace Subset (Fast but Limited)**
- Use HuggingFace datasets: https://huggingface.co/datasets/Lichess/chess-puzzles
- Pre-processed samples (10k, 100k, 1M puzzles)
- Already in CSV format

**Option C: Progressive Loading (Recommended)**
- Start with 10k puzzles (test)
- Scale to 100k puzzles (validate)
- Scale to 1M+ puzzles (production)

### Phase 5: Load Puzzles with Hierarchical Linking (Hours to days depending on size)

**Neo4j Aura Free Tier Limitations:**
- **Node limit:** Not officially published, but likely ~1M nodes
- **Relationship limit:** Likely ~5-10M relationships
- **Storage:** ~50GB

**For 1 million puzzles:**
- 1M Puzzle nodes
- ~3M Position nodes (many puzzles share positions)
- 150 Theme nodes
- ~4M Puzzle→Theme relationships (avg 4 themes per puzzle)
- ~1M Puzzle→Position relationships
- **Total:** ~8-9M relationships

**This should fit in Neo4j Aura Free Tier!**

**Loading strategy:**
- Batch size: 100 puzzles at a time (not 1000 due to individual MERGE requirement)
- Estimated time: ~10-20 hours for 1M puzzles (due to Neo4j Aura limitations)
- Use progress tracking and resume capability

---

## 🚀 Immediate Next Steps (What to Do NOW)

### Step 1: Expand Theme Taxonomy

**I recommend:** Let me create an expanded `theme-taxonomy-v2.json` with ALL Lichess themes mapped.

This will add:
- Mating patterns (dovetailMate, hookMate, arabian mate, etc.)
- Piece-specific tactics (hangingPiece, exposedKing, etc.)
- Strategic themes (kingsideAttack, queensideAttack, etc.)
- Endgame motifs (opposition, triangulation, etc.)

**Estimated:** +50 new themes → **125 total themes**

### Step 2: Create Mapping Logic

Create `map-lichess-themes.mjs` to translate Lichess flat tags → our hierarchy.

### Step 3: Update Puzzle Loader

Modify `load-puzzles.mjs` to:
- Parse Lichess themes
- Map to hierarchy
- Link to ALL levels (child → parent → grandparent)

### Step 4: Test with 1000 Puzzles

Load 1k puzzles and verify:
- Each puzzle links to 2-5 hierarchical themes
- Progressive queries work
- Recommendation algorithm finds similar puzzles

### Step 5: Scale to 100k → 1M Puzzles

Once validated, scale up gradually.

---

## 📊 Expected Final State

**After completing all phases:**

```
Database Contents:
├── 1,000,000 Puzzle nodes
├── 3,000,000 Position nodes
├── 125 Theme nodes (hierarchical)
├── 4,000,000 Puzzle→Theme relationships (multi-level)
├── 1,000,000 Puzzle→Position relationships
└── 100 Theme→Theme relationships (hierarchy)

Total: 4M nodes, 5M relationships
```

**Query Performance:**
- Find puzzles for specific mistake: <100ms
- Progressive learning path: <50ms
- Similar patterns: <200ms

**Why this works:**
- Themes are indexed (fast lookup)
- Relationships are directional (fast traversal)
- Position FEN is indexed (fast position match)
- Graph structure enables multi-hop queries efficiently

---

## 🎯 Answer to Your Questions

### "Have subcategories been made?"

**YES and NO:**

✅ **YES - Hierarchical structure exists:**
- 75 themes across 4 levels
- 57 parent-child relationships
- Fork → Knight Fork → King+Rook Fork → f7 Fork

❌ **NO - Not linked to puzzles yet:**
- Current 10 puzzles link to OLD flat themes
- Haven't mapped Lichess themes → our hierarchy
- Need to re-process puzzles with new linking logic

### "How many subcategories?"

**Currently:** 75 themes with 57 hierarchical links

**After expansion:** ~125 themes with ~100 hierarchical links

**Breakdown:**
- Level 0 (Root): 20 themes
- Level 1 (Category): 45 themes
- Level 2 (Specific): 35 themes
- Level 3 (Ultra-specific): 20 themes
- Level 4 (Position-specific): 5 themes

### "Can the model access every puzzle when needed?"

**Not yet, but the architecture is ready!**

**What works:**
- ✅ Hierarchical theme structure
- ✅ Graph traversal queries
- ✅ Progressive learning paths

**What's needed:**
1. ✅ Map Lichess themes → our hierarchy (2 days)
2. ✅ Update puzzle loader (1 day)
3. ✅ Load full dataset (variable, 1-7 days)

**Then YES - every puzzle will be accessible through:**
- Direct theme match
- Hierarchical traversal (specific → general)
- Pattern similarity (future)
- Position embeddings (future)

---

## 💡 Recommendation

**Start small, validate, then scale:**

1. **This week:** Expand taxonomy + create mapping (2 days)
2. **Next week:** Load 10k puzzles with hierarchical linking (test)
3. **Week after:** Load 100k puzzles (validate performance)
4. **Month 2:** Scale to 1M+ puzzles (production)

**The architecture we built supports the full Lichess database - we just need to process the data!**
