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

### Open question O1
**Are the opponent fixtures real chess.com / lichess handles or stub handles backed by mocked Scout data?**

- **Real handles:** sweep traffic hits the live chess.com / lichess APIs through `scoutFetch.ts`. Authentic data but adds per-sweep network cost + rate-limit risk + brittleness if the handle goes private.
- **Stub handles:** mock `scoutFetch.fetchOpponentGames` for sweep runs (via env flag or test mode). Deterministic, free, but the sweep no longer exercises the live Scout integration.

**Default proposal:** real handles for ~3 fixtures (production-truthy) + stub for the rest (deterministic baseline). Mix gives both signals. Awaiting Aayan's call.

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

### Open question O2
**Where does the user-history fixture come from?** Two options:

- **(a) Mocked Firestore:** harness writes fixture games into a mocked Firestore that `getAdminFirestore` returns. Bypasses real Firestore entirely. Deterministic, free.
- **(b) Real Firestore test collection:** harness writes fixture games into `users/synthtest-<runId>/games` subcollection in a dedicated Firebase Admin project. Costs ~$0 (low volume) but adds setup complexity and a real Firestore dependency for sweep runs.

**Default proposal:** Option (a) mocked Firestore, gated behind `--mock-firestore` flag (default on for sweeps, off for live testing). Awaiting Aayan's call.

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

### Open question O3
**Should meta_motivational questions ever carry chess context (a recent game), or always be context-free?**

Tradeoff: context-free is purer (forces the route's degraded-mode path to be exercised); some-context is more realistic (real users often anchor "did i play well today" on the day's game).

**Default proposal:** 70% context-free, 30% anchored on a recent-loss snippet. Both flavors get represented. Awaiting Aayan's call.

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

### Open question O4
**Concept list source.** Three options:

- **(a) Hand-curated by Aayan:** ~80 concepts spanning the chess taxonomy. Highest quality. ~2-3 hours of work.
- **(b) Imported from existing concept taxonomy:** the repo already has [`src/lib/concept/conceptTaxonomy.ts`](../../src/lib/concept/conceptTaxonomy.ts) for the reinforcement-puzzle pipeline. ~120 concepts (`themes` mostly). Sampling from there is free and keeps the eval coupled to the production concept vocabulary.
- **(c) Hybrid:** import from taxonomy + Aayan hand-adds 20-30 concepts that aren't in the taxonomy (modern opening trends, named GM ideas, etc.).

**Default proposal:** Option (b) — import from `conceptTaxonomy.ts`. The classifier was trained against the same vocabulary; staying coupled is a feature for Stage C. Awaiting Aayan's call.

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

| # | Question | Default proposal |
|---|---|---|
| **O1** | Opponent fixtures — real handles or stub handles? | Mix: 3 real (production-truthy) + 5-7 stub (deterministic baseline). |
| **O2** | User-history fixture source — mocked Firestore or real Firestore test collection? | Option (a) mocked Firestore via `--mock-firestore` flag. |
| **O3** | meta_motivational chess context — always context-free or sometimes anchored? | 70% context-free, 30% anchored on recent-loss snippet. |
| **O4** | Concept list source — hand-curate, import from taxonomy, hybrid? | Option (b) import from `conceptTaxonomy.ts`. |
| **O5** | Persona file naming — folder structure or flat? | Flat (current pattern). Subdivide into `personas/<category>/` only if list grows past ~15 personas. |
| **O6** | `meta_motivational` route choice — `/api/chat` (no contextId) fallback path or `/api/enhanced-analysis`? | `/api/enhanced-analysis` — the route's flag-on wing fires; chat fallback would skip the pipeline per §3.4 / Q3. |
| **O7** | Balanced-mode default count — 10? 15? 20 per category? | 12 per category × 6 = 72 turns per sweep. Cost: ~$7-18 per sweep at ratified per-turn cost. Matches §11.2 cost envelope ($5-12.50 was per 50 turns; 72 turns scales to $7-18). |

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

## 13. Out of scope

- **Persona calibration against real chat traffic.** Personas today carry `sample_size: 0` (uncalibrated scaffolds). Calibration against CMIP feedback data is Phase 3 work, not Stage C prereq.
- **Multi-turn conversation flows.** Each sweep turn is a single (request → response → validation) cycle. Multi-turn conversation simulation lives in a future PR.
- **Adversarial / red-team generators.** The existing `trick_questioner` covers some of this for position-anchored categories; explicit adversarial coverage for non-position categories is a future expansion.

---

## 14. Pause for review

Aayan reviews this design doc, ratifies the 7 open questions (O1-O7), confirms persona prompt drafts, then signs off on generator implementation in Step 2.

After Step 2 ships, Aayan smoke-tests in Step 3 (run with `--force-category=opponent_prep` etc., read 3-5 sample questions per category, confirm realism). If smoke surfaces bad generation, iterate on prompts and re-test.

**Step 2 LOC envelope:** 400-600 across the new files + run.ts modifications. Cost-of-iteration is small per-file; the design doc is the load-bearing artifact.
