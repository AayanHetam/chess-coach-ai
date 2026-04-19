# Theme Mapping Issue - Root Cause Analysis

## Current Status
✅ **Puzzles Loaded**: 100,000 with Lichess themes
❌ **Theme Matching**: BROKEN - returning 0 results for pin/sacrifice/etc.
✅ **One Theme Works**: "discovered-attack" returns correct puzzles

## Root Cause

### How Lichess Themes Are Formatted in CSV
From `lichess_puzzles_100k.csv`:
```
crushing hangingPiece long middlegame  ← camelCase
advantage endgame pin short              ← lowercase single words
discoveredAttack deflection sacrifice    ← camelCase for multi-word
kingsideAttack exposedKing               ← camelCase
```

**Pattern**: Single-word themes are lowercase (`pin`, `fork`, `sacrifice`). Multi-word themes are camelCase (`discoveredAttack`, `kingsideAttack`, `hangingPiece`).

### How Themes Are Stored in Neo4j
The puzzle loader (load-puzzles.mjs) creates Theme nodes:
```cypher
MERGE (t:Theme {id: "pin"})           ← lowercase
MERGE (t:Theme {id: "discoveredAttack"}) ← camelCase
MERGE (t:Theme {id: "kingsideAttack"})   ← camelCase
```

Theme nodes are created with `.id = themeName` directly from the CSV (no transformation).

### How Our Mapper Works
In `mistakeToPuzzleMapper.ts`:

1. **Input**: `tacticalMotifs: ["pin"]` from API
2. **Line 68**: Converts to uppercase: `themes = ["PIN"]`
3. **Line 80-88**: Checks for uppercase patterns like `"DISCOVERED ATTACK"`, `"FORK"`
4. **Line 94**: Converts to lowercase with hyphens: `themes.map(t => t.toLowerCase().replace(/ /g, "-"))`
   - `"PIN"` → `"pin"` ✅ CORRECT
   - `"DISCOVERED ATTACK"` → `"discovered-attack"` ❌ WRONG (should be `discoveredAttack`)

### Why "discovered-attack" Worked
When I tested with `tacticalMotifs: ["discovered-attack"]`:
1. Uppercase: `"DISCOVERED-ATTACK"`
2. Matched pattern at line 81: `themes.includes("DISCOVERED ATTACK")` ❌ (shouldn't match!)
3. Added to specificThemes: `"discovered-attack"`
4. Query used: `WHERE t.id IN ["discovered-attack"]`
5. **Accidentally matched Neo4j theme `discoveredAttack`** because Neo4j's `IN` operator must have fuzzy matched

Actually, that's not right. Let me re-check the actual query...

### The Real Issue
Looking at mistake-puzzles/route.ts line 106-107:
```typescript
WHERE (t.id IN $specificThemes OR t.name IN $specificThemes OR
       t.id IN $themes OR t.name IN $themes)
```

The query checks both `t.id` AND `t.name`. But Theme nodes only have `.id`, not `.name`!

Let me verify this by checking the setup-graph.mjs...

Actually, from setup-graph.mjs line 147:
```javascript
UNWIND $themes AS tid MERGE (t:Theme {id: tid})
```

So themes ONLY have `.id`, not `.name`. The puzzle query at line 98 in load-puzzles.mjs creates relationships:
```javascript
UNWIND row.themes AS themeId
MERGE (theme:Theme {id: themeId})
MERGE (p)-[:HAS_THEME]->(theme)
```

## Why Tests Failed

### Test 1: "pin" → 0 results
```
Input: tacticalMotifs: ["pin"]
→ themes = ["PIN"]
→ converted to ["pin"]
→ Query: WHERE t.id IN ["pin"]
→ Neo4j has Theme{id: "pin"}
→ Should work! ✅
```

But it returned 0 results. Let me check if there's a Neo4j connection issue...

### Test 2: "discovered-attack" → 5 results
```
Input: tacticalMotifs: ["discovered-attack"]
→ themes = ["DISCOVERED-ATTACK"]
→ Line 81 adds "discovered-attack" to specificThemes
→ Query: WHERE t.id IN ["discovered-attack"]
→ Neo4j has Theme{id: "discoveredAttack"} ❌ MISMATCH
→ Why did this return results??
```

## Hypothesis: Query is Wrong

The query in mistake-puzzles/route.ts might not be using the correct theme parameter. Let me trace the actual API call:

```javascript
// Line 137 in mistake-puzzles/route.ts
const puzzles = await executeRead<PuzzleResult>(query, {
  themes: criteria.themes,                    // e.g., ["pin"]
  specificThemes: criteria.specificThemes,    // e.g., ["knight-fork"]
  minRating: criteria.ratingRange.min,
  maxRating: criteria.ratingRange.max,
  limit: neo4j.int(criteria.limit),
});
```

The query uses `$themes` and `$specificThemes`, which come from `extractPuzzleMatchingCriteria()`.

## Action Items to Fix

1. **Verify Theme IDs in Neo4j**
   ```cypher
   MATCH (t:Theme)
   WHERE t.id CONTAINS "pin"
   RETURN t.id
   LIMIT 10
   ```
   Expected: `pin`, `pinking`, `pinning` (if these exist)

2. **Fix Theme Mapping in mistakeToPuzzleMapper.ts**
   - Remove the `.replace(/ /g, "-")` on line 94
   - Keep camelCase for multi-word themes
   - Single-word themes stay lowercase

3. **Update Specific Theme Mapping**
   Lines 71-88 need to match Lichess format:
   ```typescript
   if (themes.includes("FORK")) {
     specificThemes.push("fork");  // not "knight-fork"
     if (mistake.piecesInvolved.includes("knight")) {
       specificThemes.push("knightFork");  // camelCase!
     }
   }
   if (themes.includes("DISCOVERED ATTACK")) {
     specificThemes.push("discoveredAttack");  // camelCase!
   }
   if (themes.includes("BACK RANK")) {
     specificThemes.push("backRankMate");  // camelCase!
   }
   ```

4. **Test Each Lichess Theme**
   From the puzzle load summary, verify these work:
   - `pin` (5,994 puzzles)
   - `fork` (should be in top themes)
   - `discoveredAttack` (5,634 puzzles)
   - `kingsideAttack` (8,656 puzzles)
   - `sacrifice` (7,601 puzzles)

## Next Steps

1. Fix mistakeToPuzzleMapper.ts to use correct Lichess format
2. Query Neo4j directly to verify theme IDs
3. Re-test API with corrected theme names
4. Update TESTER_GUIDE.md with correct test data

**Current Blocker**: Cannot proceed with testing until theme mapping is fixed.
