# Synthetic-tester category-balancing — generator design

**Status:** plan-first draft, 2026-05-23. Lands before any harness code changes per Aayan's 1.C.B.5 follow-up directive (Stage C prereq, Issue B Path b).

**Goal:** extend `scripts/synthetic-tester/run.ts` so it produces sweep runs balanced across all six `QuestionCategory` values (`game_review`, `opponent_prep`, `position_analysis`, `concept_explanation`, `improvement_strategy`, `meta_motivational`). Today the harness produces only position-anchored questions (mostly `game_review` / `position_analysis`) because the five existing personas all assume "you will be given context about a game in progress."

**Why path (b) over a static fixture (path a):** reusable infrastructure that outlives Stage C — Phase 3 CMIP work needs the same category-balanced generation for ongoing eval cadence. Engineering cost (~300-600 LOC) is amortized.

**Plan-first discipline:** this doc is the design artifact. Aayan reviews and approves (or amends) before any generator code is written. Same pattern as the route audit (§3.7). The "generators turn out to produce bad fixtures" risk gets contained at the design layer, not surfaced during integration testing.

---

## 1. What the current harness produces

The harness today (commit `8ae2d96`) generates one question per (game × checkpoint × persona) tuple via [`scripts/synthetic-tester/run.ts:177-203`](run.ts) (`buildPersonaContext`). The context fed to the persona's Haiku call is:

```
Game: <white> vs <black>
Move number: N (Side just played X)
FEN after move: <fen>
Recent moves: <last 8 SAN>
Engine classification: <book|excellent|good|inaccuracy|mistake|blunder>

The chess coach has already given you this analysis of the game:
<initial analysis, 1200 chars>

Reply with ONE question/comment about the position above move N,
in your persona's voice.
```

All five personas (`confused_beginner`, `curious_advanced`, `hinglish_learner`, `tilted_intermediate`, `trick_questioner`) are anchored on this context — they ask **about a specific move or position in a specific game**.

**Maps to categories:**
- ✅ `game_review` — primary use case. "Why was move 14 a blunder?" "What should I have played?"
- ✅ `position_analysis` — secondary. "Is my queen safe on d4?" "What's the threat here?"
- ❌ `opponent_prep` — never. No opponent identity in the context.
- ❌ `improvement_strategy` — never. No multi-game history in the context.
- ❌ `meta_motivational` — never. Position-anchored questions don't carry emotional/trajectory framing.
- ❌ `concept_explanation` — rarely. The advanced persona occasionally fires abstract concepts ("IQP position?") but only conditional on the position pattern matching.

So we need **new generator paths for the four "never" cases**, plus **persona/checkpoint refinement** for the two ✅ cases to ensure their questions clearly carry the right category signal (the classifier shouldn't have to guess).

---

## 2. High-level approach

Add a `--force-category=<cat>` CLI flag to `run.ts`. When set, the harness selects questions for that category exclusively. When `--force-category=all` (proposed default for Stage C), the harness produces a balanced mix — 10-15 turns per category, ~60-90 turns per sweep total.

**Per-category generation paths:**

| Category | Existing checkpoint pipeline? | New persona? | Context source |
|---|---|---|---|
| `game_review` | ✅ keep | refine existing | game + checkpoint position + engine classification |
| `position_analysis` | ✅ keep | refine existing | position + side-to-move + threats |
| `opponent_prep` | ❌ new | new (`opponent_prep_seeker`) | opponent fixture (handle + 3-5 recent games) — see §5 |
| `improvement_strategy` | ❌ new | new (`improvement_seeker`) | user-history fixture (sampled across time controls + openings) — see §6 |
| `meta_motivational` | ❌ new | new (`tilted_questioner`, but reframed) | minimal — possibly an emotional trigger ("losing streak", "rating drop") |
| `concept_explanation` | ❌ new (mostly) | new (`concept_curious`) | concept name + optional position seed |

**Generator dispatch:** a new `pickGenerator(category)` function in `run.ts` routes to either the existing position-anchored generator (for `game_review` / `position_analysis`) or one of four new generators (for the rest). The generator returns `{ question, requestBodyExtensions }` — the latter carries category-specific request fields like `opponentUsername`.

---

## 3. Category 1 — `game_review`

**Status:** ✅ existing pipeline produces this. Refine for category clarity.

### Example phrasings (3-5; spans difficulty, specificity, emotional framing)

1. **Beginner, concrete, neutral:** "wait why was move 12 bad? i thought trading bishops was good here"
2. **Beginner, concrete, frustrated:** "i lost this game and i still dont get what i did wrong at move 18"
3. **Intermediate, structural, analytical:** "the engine called move 23 a blunder but i don't see the refutation — can you walk through it?"
4. **Advanced, opening-theoretical, specific:** "after 14...Nxd5 was this the critical line of the Bg5 Sicilian or did i deviate?"
5. **Advanced, full-game, retrospective:** "looking back at the whole game, when did i first lose the thread strategically?"

### Context needed
Position FEN + move history + Stockfish classification + the prior coach's `initialAnalysis`. Already supplied by `buildPersonaContext`.

### Persona shape
Existing personas (`confused_beginner`, `curious_advanced`, `tilted_intermediate`, `hinglish_learner`) all suffice. Recommend: **append a one-line addendum to each persona** clarifying that for `game_review` category prompts they should reference a specific move number or move sequence, not just abstract position-state.

```diff
 You will be given context about a game in progress. Ask ONE short, natural question about the current position. Reply with ONLY the question text, no preamble, under 25 words. Sound like a real frustrated learner, not a test bot — typos are fine, lowercase is fine.
+
+For game_review prompts: anchor your question on a specific move number or sequence you've been told was a mistake or blunder, not just the current position state.
```

---

## 4. Category 2 — `position_analysis`

**Status:** ✅ existing pipeline produces this. Refine for category clarity.

### Example phrasings

1. **Beginner, board-state:** "is my queen actually safe on d4 right now or can he take it"
2. **Intermediate, threat-eval:** "what's white actually threatening with this knight maneuver? i don't see it"
3. **Intermediate, candidate moves:** "looking at this position, is f5 or h4 the right break here?"
4. **Advanced, structural:** "with the doubled c-pawns and open h-file, who has the long-term edge in this structure?"
5. **Advanced, prophylactic:** "what's the most annoying defensive resource for black i need to anticipate before pushing g5?"

### Context needed
Position FEN + side-to-move + (optional) prior moves for piece-trajectory context. The harness's existing `buildPersonaContext` covers this; no extra fields needed.

### Persona shape
Existing personas suffice. The differentiator vs `game_review` is **the question doesn't reference past mistakes** — it asks about the present state. Persona addendum:

```diff
+For position_analysis prompts: ask about the present position (threats, candidate moves, structural features) without referencing past moves as mistakes. Use the FEN, not the move history, as the anchor.
```

---

## 5. Category 3 — `opponent_prep` (NEW generator path)

**Status:** ❌ new generator. Doesn't compose with checkpoints — the question is about a player, not a position.

### Example phrasings

1. **Pre-game prep, concrete:** "i'm playing magnus_test_2024 tomorrow in a blitz event — what's his style, anything i should avoid?"
2. **Live opponent scouting:** "my next round is against player_xyz. i looked at his lichess and he plays a lot of King's Indians as black — how do i prep?"
3. **Patterns within an opponent's play:** "this opponent always grabs space early. how do i punish overextension against him?"
4. **Specific opening prep against a named opponent:** "AlphaPawn99 plays the London System exclusively. what's the most ambitious response for black?"
5. **Time-control specific:** "looking at OppXyz's bullet games — he flags a lot. should i go for sharper structures or wait him out?"

### Context needed
**Required:**
- `opponentUsername` (real or fixture handle)
- `opponentPlatform` (chess.com / lichess)

**Optional but high-value:**
- Recent N games for the opponent (so Scout can fetch and the validator has real data to cross-check against)
- Time class hint (`bullet` / `blitz` / `rapid` / `classical`)

### Persona shape
**New persona file:** `opponent_prep_seeker.md`. Draft:

```markdown
---
name: opponent_prep_seeker
version: 1
date_calibrated: 2026-05-23
sample_size: 0
source: scaffold
---

# System prompt
You are a 1500-1900-rated tournament player preparing for an upcoming game against a specific opponent. You name the opponent explicitly, sometimes mention the platform (chess.com / lichess), sometimes mention the time control, and ask for specific prep guidance. Your tone is focused and pragmatic — you want actionable advice, not theory.

You will be given an opponent's handle and a brief profile (their primary openings, win rate, time class). Ask ONE specific prep question, under 40 words. Reply with ONLY the message text.

# Example utterances
- "i'm playing magnus_test_2024 tomorrow in blitz — what's his style, anything sharp to avoid in the opening?"
- "next round is vs AlphaPawn99 on chess.com. he plays London exclusively as white. most ambitious black response?"
- "OppXyz has been on a hot streak in 3+0 lately. how do i punish overextension against this profile?"
- "facing player_aggro tonight — high pre-move rate, lots of king's indians. how do i prep the structures?"
- "this opponent grabs space early and always. give me a counter-system that punishes that"
```

### Generator path
1. Pick an `opponentUsername` from a new `personas/opponent_fixtures/` directory (5-10 deterministic handle fixtures, each with a sketched profile — Aayan supplies real-or-stub usernames).
2. Pick a persona (just `opponent_prep_seeker` for now; could add `tilted` variants later).
3. Build context string: opponent handle + profile summary. NOT a chess position.
4. Generate question via Haiku call.
5. Request body to `/api/chat` (or `/api/enhanced-analysis` for first-turn cases): `userMessage: <generated question>`, `opponentUsername: <handle>`, `opponentPlatform: <platform>`. **NO** `moveHistory` / `fen` / `gameEval`.

### O1 — RATIFIED (2026-05-23): 5 real + 5 stub opponent fixtures
Real opponents fetched via `scoutFetch.ts` against live chess.com / lichess APIs. Stub fixtures are deterministic JSON files committed to the harness. Real handles exercise the live integration; stubs give a stable baseline that doesn't depend on third-party uptime. Both contribute to opponent_prep sweep coverage.

---

## 6. Category 4 — `improvement_strategy` (NEW generator path)

**Status:** ❌ new generator. Doesn't compose with checkpoints — the question is about a player's trajectory across many games.

### Example phrasings

1. **Time-control specific:** "i'm 1450 in blitz but only 1280 in rapid — what's leaking my rating in longer time controls?"
2. **Opening repertoire concern:** "my english opening is at 40% win rate over the last 50 games. should i scrap it or keep grinding?"
3. **Tactical vs positional:** "i blunder a lot in endgames. what kind of training would actually help — puzzles or studying GM endgames?"
4. **Plateau diagnosis:** "i've been stuck at 1600 for six months. what specifically should i work on?"
5. **Rated-vs-unrated:** "i do way better in unrated than rated games. is that a tilt issue or a skill issue?"

### Context needed
**Required:**
- `username` (the user — the harness uses fictitious `synthtest-<runId>` UIDs today)
- A user-history fixture: 30-50 recent games with varied time controls and openings (so `userHistoryAggregates.ts` produces non-trivial output to validate against)

### Persona shape
**New persona file:** `improvement_seeker.md`. Draft:

```markdown
---
name: improvement_seeker
version: 1
date_calibrated: 2026-05-23
sample_size: 0
source: scaffold
---

# System prompt
You are a 1200-1700-rated player trying to figure out what to work on. You've been playing seriously for 6-18 months, are aware of your rating across time controls, and have noticed patterns (you tilt in fast time, your endgames are weak, your repertoire feels stale, etc.). Your tone is reflective and slightly impatient — you want a concrete prescription, not a generic "study more."

You will be given a brief summary of your recent playing pattern (time controls, win rates, repertoire). Ask ONE concrete improvement question, under 40 words. Reply with ONLY the message text.

# Example utterances
- "i'm 1450 in blitz but only 1280 in rapid. what's leaking my rating in longer time controls?"
- "my english is at 40% over 50 games. scrap it or keep grinding?"
- "stuck at 1600 for six months. concretely — what should i work on?"
- "i blunder endgames. puzzles or studying GM endgames — which actually moves the needle?"
- "way better unrated than rated. tilt problem or skill problem?"
```

### Generator path
1. Pick a user-history fixture from a new `personas/user_history_fixtures/` directory (5-10 deterministic profiles — each is a JSON with N synthetic games spanning time controls and openings). Aayan supplies the profile design; CC generates the synthetic games via deterministic seed.
2. Pick the `improvement_seeker` persona.
3. Build context: aggregated history summary (win rates by time class, opening hit list, recent rating delta).
4. Generate question via Haiku.
5. Request body to `/api/enhanced-analysis` (this is a chat-style follow-up rather than a position-analysis call): `userMessage: <generated>`, no `moveHistory` / `fen`. The route's `prepareMastermindContext` will fetch `userHistory` from a mocked Firestore (per `--mock-firestore` flag, see §10).

### O2 — RATIFIED (2026-05-23): real chess.com user histories cached to disk

**Four chess.com test users:** `Lazer_Wizard`, `JSNoverPuka`, `Chilllychess`, `gothamchess`. All chess.com platform.

**Workflow:**
1. CC writes [`scripts/synthetic-tester/load-real-user-history.ts`](load-real-user-history.ts) — a one-shot Node script that uses `scoutFetch.ts` to fetch each user's last 200 games from chess.com, transforms them into the `UserHistoryGame` shape (per `src/lib/mastermind/userHistoryAggregates.ts`), and writes them to `scripts/synthetic-tester/fixtures/user_history_cache/<username>.json`.
2. Cache is committed to git so collaborators get the same data.
3. Sweep's mocked Firestore reads from this cache file when validators request games at `users/synthtest-<username>/games`.
4. Hybrid refresh: cached fixtures by default, `--refresh-fixtures` flag triggers re-fetch from chess.com APIs. After re-fetch, cache is overwritten and recommitted.

**Failure handling:**
- chess.com rate limits during load → retry with exponential backoff (1s, 2s, 4s).
- Partial fetch for a user (chess.com returns fewer games than expected, or one archive month fails) → log the gap, move on with what was collected. Don't fail the whole load.
- Whole-user fetch fails (all retries exhausted) → log the failure with the error, write an empty cache file for that user marked as `loadFailed: true`, continue with the other users.

---

## 7. Category 5 — `meta_motivational` (NEW generator path)

**Status:** ❌ new generator. Doesn't compose with checkpoints. Often doesn't need ANY chess context — pure emotional/motivational framing.

### Example phrasings

1. **Losing streak / morale:** "i've lost 5 in a row. am i in a slump or am i just bad?"
2. **Plateau frustration:** "i've been at 1400 for months. is it worth continuing?"
3. **Coaching style request:** "be honest, am i actually improving or am i fooling myself with rating spikes?"
4. **Validation seeking:** "did i play well today even though i lost?" (often paired with optional `initialAnalysis` of the lost game)
5. **Burnout:** "i've been grinding too hard. should i take a break or push through?"

### Context needed
**Minimal.** Often just the userMessage. Optionally:
- A recent loss summary (1-line) if the question is loss-anchored
- The user's recent rating trajectory (last 7 days) if the question is plateau-anchored

### Persona shape
**Reframe existing `tilted_intermediate`** for meta_motivational mode — it already has the emotional register. Add a category-aware addendum to its system prompt.

```diff
+For meta_motivational prompts: ask about your overall improvement, slump status, plateau, or motivation. Do NOT anchor on a specific move or game position. Your tone is emotional or reflective, not analytical.
```

Plus add ONE new persona for the non-tilted meta cases:

```markdown
---
name: reflective_learner
version: 1
date_calibrated: 2026-05-23
sample_size: 0
source: scaffold
---

# System prompt
You are a player (any rating) reflecting on your chess journey. You ask questions about your trajectory, your habits, your psychology — not about specific positions. You want honesty, not coddling. Your tone is calm and a bit philosophical.

You will optionally be given a brief recent-history summary. Ask ONE reflective question, under 40 words. Reply with ONLY the message text.

# Example utterances
- "be honest — am i actually improving or am i fooling myself with the rating spikes?"
- "is it worth continuing if i've been stuck at 1400 for six months?"
- "i've been grinding too hard. take a break or push through?"
- "did i play well today even though i lost?"
- "what does 'improving at chess' even mean for someone my age and time commitment?"
```

### Generator path
1. Pick persona (`tilted_intermediate` or `reflective_learner`).
2. Optionally pick a "loss summary" snippet from a fixture pool (10 deterministic 1-line summaries: "lost a 3+0 game where i blundered a piece in the endgame", "drew a winning position by repetition", etc.).
3. Build minimal context: just the optional snippet + persona.
4. Generate question via Haiku.
5. Request body to `/api/enhanced-analysis`: `userMessage: <generated>`, no chess context. The route will degrade featureDelta correctly via the category-aware `deriveMastermindMoveContext`.

### O3 — RATIFIED (2026-05-23): three-way meta_motivational split

Roughly **40% performance trajectory** (cold context, plateau / improvement framing), **30% loss-anchored** (recent specific loss attached as a 1-line snippet), **30% existential** (questions about chess itself, not the user's performance).

The **existential** shape is the new addition vs the draft. Questions are about chess as an activity — boredom, depth fatigue, meaning, role in life — not "am I improving?" framing. Example seed: *"I'm getting bored of chess, there's so much theory and it just feels repetitive. Even Bobby Fischer openly hated chess for the last half of his life."*

**Implementation choice:** CC's judgment call on whether the existential shape composes cleanly into [`reflective_learner.md`](personas/reflective_learner.md) (one persona, two registers) or needs its own [`existential_doubter.md`](personas/existential_doubter.md). Read the prompts together; if the reflective_learner system prompt gets bloated trying to cover both shapes, split. Otherwise keep one persona with an additional example-utterance block.

**Example utterances for the existential shape** (added directly so the persona prompt has them):

- "I'm getting bored of chess, even Bobby Fischer hated it for half his life"
- "why am I doing this, what's the point of moving wooden pieces"
- "is chess just memorization at this point, every position has a known answer"
- "i look at theory and i just feel exhausted, not curious"
- "honestly is it healthy to spend this much time on a game"

---

## 8. Category 6 — `concept_explanation` (NEW generator path)

**Status:** ❌ new generator. Mostly context-free — the question is about a chess concept, not a specific game.

### Example phrasings

1. **Pattern explanation:** "what's a minority attack and when do you play it?"
2. **Term definition with example:** "explain prophylaxis like i'm 1200 — give me a concrete example"
3. **Strategic principle:** "when is the bishop pair actually worth the half-tempo?"
4. **Endgame technique:** "what's the Lucena position and why does it matter?"
5. **Openings, abstract:** "what's the difference between the Italian and Spanish in terms of long-term plans?"

### Context needed
**Usually none.** Optionally:
- A position fragment that exemplifies the concept (if the question is "show me a concrete example")
- The user's current rating (so the explanation can be calibrated)

### Persona shape
**New persona file:** `concept_curious.md`. Draft:

```markdown
---
name: concept_curious
version: 1
date_calibrated: 2026-05-23
sample_size: 0
source: scaffold
---

# System prompt
You are a player (typically 1000-1800) asking about a chess concept — a strategic principle, a tactical pattern, an opening idea, an endgame technique. You're studying actively and want explanations grounded in concrete examples, not abstract definitions. Your tone is curious and patient.

You will be given a target concept name. Ask ONE focused question about it, under 40 words. Reply with ONLY the message text.

# Example utterances
- "what's a minority attack and when do you play it?"
- "explain prophylaxis like i'm 1200 — give me a concrete example"
- "when is the bishop pair actually worth the half-tempo?"
- "what's the Lucena position and why does it matter for me?"
- "what's the long-term plan difference between Italian and Spanish?"
```

### Generator path
1. Pick a target concept from a new `personas/concept_fixtures.json` (50-80 chess concepts, deterministic seed picks per sweep). Categories cover: openings, middlegame motifs, endgame techniques, strategic principles, tactical patterns. Aayan reviews the concept list.
2. Pick the `concept_curious` persona.
3. Build minimal context: just the target concept name. Optionally a rating hint (drawn from a deterministic distribution).
4. Generate question via Haiku.
5. Request body to `/api/chat` (or `/api/enhanced-analysis` for cold-start): `userMessage: <generated>`. No chess position; no opponent.

### O4 — RATIFIED (2026-05-23): concept list scraped from three named curators

Sources:
- **Yusupov's *Build Up Your Chess* curriculum** — ~300 concepts across all skill levels (Foundation, Beyond the Basics, Mastery; orange / blue / green workbooks).
- **Jeremy Silman's *How to Reassess Your Chess*, 4th edition** — ~50-80 positional concepts (the imbalances framework + named middlegame patterns).
- **John Watson's *Modern Chess Strategy*** — ~80-120 contemporary positional concepts (rule independence, exchange sacrifices, modern dynamic play).

**Scrape sources** (publicly indexed, low-friction):
- Goodreads book pages (chapter listings, "what's inside" excerpts)
- Publisher sites (Quality Chess for Yusupov, Siles Press for Silman, Gambit Publications for Watson)
- Amazon "Look Inside" previews (TOC + selected chapters)
- Chess wikis (Chess.com / Wikipedia for the named-concept entries)
- Book TOC aggregators (Open Library, archive.org)

Dedupe across sources. Output to [`scripts/synthetic-tester/fixtures/concepts.json`](fixtures/concepts.json) with per-concept metadata:

```json
{
  "concept_id": "minority-attack",
  "name": "Minority attack",
  "source": "silman_reassess_4e",
  "level": "intermediate-advanced",
  "category": "positional_pawn_play",
  "notes": "Chapter 5 — Pawn Structure imbalances"
}
```

**Process:** CC commits the deduped fixture, surfaces in chat with source attribution + concept counts per source. Aayan reads, approves or flags specific entries to remove. Final lock after Aayan's pass.

**Fallback if a source is hard to access** (paywalled TOC, missing indexing): fall back to publisher's preview page or major bookseller's preview. If a source can't be scraped at all, surface to Aayan with what was collected from the other two and Aayan decides whether to substitute or proceed without it.

---

## 9. CLI surface

Add to `run.ts`:

```bash
# Force all turns to one category (debugging)
npx tsx scripts/synthetic-tester/run.ts --force-category=opponent_prep --questions 5 ...

# Category-balanced sweep — default for Stage C
npx tsx scripts/synthetic-tester/run.ts --force-category=balanced --questions 12 ...
# → produces 12 turns per category × 6 = 72 turns total

# Custom mix
npx tsx scripts/synthetic-tester/run.ts \
  --category-mix='game_review:20,opponent_prep:10,improvement_strategy:10,meta_motivational:5,concept_explanation:8,position_analysis:7' \
  ...
# → produces 60 turns total with the specified per-category counts
```

Three new flags:
- `--force-category <cat>` — single-category mode (debugging / per-category gold-standard authoring).
- `--force-category=balanced` — equal split (`--questions N` becomes per-category, total = N × 6).
- `--category-mix=<cat:N,cat:N,…>` — custom mix for tuning sweeps where some categories need more samples.

---

## 10. Implementation sketch

New files:
- `scripts/synthetic-tester/generators/index.ts` — `pickGenerator(category) → Generator` dispatch
- `scripts/synthetic-tester/generators/positionAnchored.ts` — wraps existing pipeline (game_review + position_analysis)
- `scripts/synthetic-tester/generators/opponentPrep.ts` — new generator
- `scripts/synthetic-tester/generators/improvementStrategy.ts` — new generator
- `scripts/synthetic-tester/generators/metaMotivational.ts` — new generator
- `scripts/synthetic-tester/generators/conceptExplanation.ts` — new generator
- `scripts/synthetic-tester/fixtures/opponents.json` — opponent profile fixtures (real + stub handles)
- `scripts/synthetic-tester/fixtures/user_histories.json` — synthetic user history profiles
- `scripts/synthetic-tester/fixtures/loss_summaries.json` — meta_motivational loss-anchor snippets
- `scripts/synthetic-tester/fixtures/concepts.json` — concept list (or import from `conceptTaxonomy.ts`)
- `scripts/synthetic-tester/personas/opponent_prep_seeker.md`
- `scripts/synthetic-tester/personas/improvement_seeker.md`
- `scripts/synthetic-tester/personas/reflective_learner.md`
- `scripts/synthetic-tester/personas/concept_curious.md`

Modified files:
- `scripts/synthetic-tester/run.ts` — CLI flag parsing, category dispatch in main loop, route picking (`/api/enhanced-analysis` vs `/api/chat` per category)
- `scripts/synthetic-tester/client.ts` — accept `requestBodyExtensions` from generators (opponentUsername, etc.)

Tests (vitest):
- `scripts/synthetic-tester/__tests__/generators.test.ts` — each generator produces a valid request body for its category. Mocked Haiku returns canned questions.
- `scripts/synthetic-tester/__tests__/categoryDispatch.test.ts` — `pickGenerator(category)` returns the right generator; balanced mode produces equal counts.

**Estimated LOC:** 400-600 across all new files + run.ts modifications. Mostly mechanical wiring + persona prompts; the chess judgment is in the persona prompts + fixture content (which Aayan reviews here in Step 1).

---

## 11. Open questions summary — for Aayan review

All seven RATIFIED on 2026-05-23. Per-question detail in §§5-8 above; condensed summary:

| # | Question | Resolution |
|---|---|---|
| **O1** | Opponent fixtures — real handles or stub handles? | **5 real + 5 stub.** Real exercises live integration; stubs give a stable baseline. |
| **O2** | User-history fixture source. | **Real chess.com fetches cached to disk.** Four test users (`Lazer_Wizard`, `JSNoverPuka`, `Chilllychess`, `gothamchess`); `load-real-user-history.ts` script populates `fixtures/user_history_cache/<username>.json`; `--refresh-fixtures` flag re-fetches. Cache committed to git. |
| **O3** | meta_motivational chess context. | **40/30/30 split** — 40% performance trajectory (cold), 30% loss-anchored, 30% existential. Existential register is new; CC's call whether it folds into `reflective_learner` or needs its own `existential_doubter.md`. |
| **O4** | Concept list source. | **Scraped from Yusupov + Silman + Watson.** Goodreads / publisher / Amazon / chess wikis as scrape surfaces. Deduped to `fixtures/concepts.json`. Aayan review-and-lock after CC surfaces. |
| **O5** | Persona file naming — folder structure or flat? | **Flat** (current pattern). No sub-folders. |
| **O6** | `meta_motivational` route choice — `/api/chat` or `/api/enhanced-analysis`? | **`/api/enhanced-analysis`** — guarantees the pipeline runs (chat fallback would skip per §3.4 / Q3). |
| **O7** | Balanced-mode default count. | **60 turns** total. Five categories at 12 turns each (game_review, opponent_prep, position_analysis, improvement_strategy, meta_motivational) + concept_explanation at 8 (no validator exists for it — citation rate is null by design; 8 turns is enough for qualitative review without wasting budget on statistical power for an unmeasurable metric). Expected cost: $8-13. Worst case: $15. |

---

## 12. Per-category citation-rate floor implications

Once the harness produces category-balanced traffic, the §11.3 floors become measurable per category. Reminder of what each generator path needs to clear:

| Category | Floor | Primary source | What the generator must enable |
|---|---|---|---|
| `opponent_prep` | **85%** | scout | opponentUsername MUST be set → scoutFetch runs → countScoutOpportunities returns >0 |
| `improvement_strategy` | **50%** | user_history | mocked Firestore returns ≥10 games → countUserHistoryOpportunities returns >0 |
| `meta_motivational` | **20%** | user_history | mocked Firestore returns ≥10 games — but lower bar because meta questions less frequently cite specific game stats |
| `game_review` | 90% (null bucket per cleanup_followups) | feature_delta | existing pipeline produces non-empty featureDelta |
| `position_analysis` | 70% (null bucket) | feature_delta | existing pipeline produces non-empty featureDelta |
| `concept_explanation` | n/a (deferred PR 1.D) | none | n/a — concept questions skip citation-rate measurement entirely |

The non-null-bucket floors (opponent_prep, improvement_strategy, meta_motivational) are the ones the new generators must enable. If sweep runs come back with `perSource: null` for these categories, the generator failed to attach the required context — that's a generator bug, not a validator gap.

---

## 12.5 Budget discipline (RATIFIED 2026-05-23)

**Hard cap: $70 for Stage C through PR 1.C merge.** Aayan funds from personal money; the $100 added to the Anthropic API account holds $30 buffer for unexpected costs and early Phase 2 testing.

**Cost shape with frugal adjustments:**

| Step | Cost |
|---|---|
| Step 2 development (all generator implementation work) | **$0** — mock-LLM mode is mandatory. Zero real API calls during development. |
| `load-real-user-history.ts` run (once) | **$0** from Anthropic. chess.com API only. |
| 6-turn dry-run after generators land | **$0.60** — **SKIP IF mock-mode tests are clean.** Reinstate only if mock tests surface wiring concerns. |
| Main 60-turn sweep | **$8-15** |
| One tune-and-rerun if needed | **$8-15** — **NOT auto-authorized.** |
| Reserve for unexpected costs / future work | **$40-50** remaining |

**Hard-stop discipline:**
- If projected spend would exceed $70 at any decision point, CC stops and surfaces to Aayan. Does not auto-proceed.
- Reruns are NOT auto-authorized. CC surfaces sweep results and any issues; Aayan explicitly authorizes any rerun.
- If first sweep surfaces multiple issues, CC stops and surfaces all of them. Aayan decides which are merge-blockers vs post-merge follow-ups. **Frugal default: most issues become post-merge follow-ups; rerun is reserved for genuine merge-blockers.**
- The reserve is for unexpected costs (a sweep with p95 outliers, an unanticipated retry storm), not for additional sweeps beyond main + one rerun.
- When a cheaper version of any step achieves the same signal, do the cheaper version. **Don't burn reserve "because it's there."**

## 13. Out of scope

- **Persona calibration against real chat traffic.** Personas today carry `sample_size: 0` (uncalibrated scaffolds). Calibration against CMIP feedback data is Phase 3 work, not Stage C prereq.
- **Multi-turn conversation flows.** Each sweep turn is a single (request → response → validation) cycle. Multi-turn conversation simulation lives in a future PR.
- **Adversarial / red-team generators.** The existing `trick_questioner` covers some of this for position-anchored categories; explicit adversarial coverage for non-position categories is a future expansion.

---

## 14. Step 2 pause points (RATIFIED 2026-05-23)

Design doc + O1-O7 ratified. Step 2 implementation proceeds with four pause points so the cost-of-iteration on bad generation stays small.

**Pause 1 — After `load-real-user-history.ts` lands.** Aayan runs it once to populate `fixtures/user_history_cache/`. Confirms games loaded successfully for all four chess.com users (`Lazer_Wizard`, `JSNoverPuka`, `Chilllychess`, `gothamchess`). chess.com API only — no Anthropic cost.

**Pause 2 — After `concepts.json` fixture lands.** Surface the deduped concept list with per-source attribution + counts. Aayan reads, flags bad entries. Lock the fixture after Aayan's pass.

**Pause 3 — After all generators implement.** CC runs each generator once in **mock mode** (no real LLM calls — zero cost) and surfaces 4-5 sample questions per category. Aayan reads, confirms realism. Iterate on persona prompts if needed (still mock mode, zero cost).

**Pause 4 — After mock-mode smoke passes.** Two paths:
- **If mock tests are clean and Aayan is confident:** skip 6-turn dry-run, surface for main sweep authorization.
- **If mock tests showed any wiring concerns:** run 6-turn dry-run ($0.60), confirm clean, then surface for main sweep authorization.

After Aayan authorizes the main sweep, CC runs the 60-turn category-balanced sweep against the preview deploy and surfaces results.

**Step 2 LOC envelope:** 400-600 across new files + `run.ts` modifications. Mock-LLM mode is **mandatory** for all CC development work — see §12.5 budget discipline.
