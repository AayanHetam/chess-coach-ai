---
id: OBJ-NN              # required in queue files — sort key + branch name
slug: kebab-slug        # required in queue files
model: opus             # claude model for loop iterations (opus|sonnet)
max_iters: 40
budget: 8.00            # USD product-API test spend cap (see budget policy below)
base: origin/main       # ref the objective builds on (a feature branch for resume-work objectives)
---
# Objective
<One sentence, behavior-level. What the world looks like when this is done — on chessmasti.com, not on a branch.>

# Acceptance criteria
# The concrete, checkable bar. The loop cannot exit until every box is genuinely met
# AND a critique pass finds nothing new. Be demanding. This is the quality floor.
# v2 ships unattended when this passes — the criteria ARE the review.
- [ ] <specific thing that must be true, e.g. no console errors on the three main flows>
- [ ] <handles empty / null / error states cleanly>
- [ ] <matches the existing pattern in src/...>
- [ ] npx tsc --noEmit clean; npm test green; SKIP_ENV_VALIDATION=true npm run build succeeds

# In scope
- <what this objective is allowed to touch>

# Out of scope / do not touch
- hallucination validator chess.js cross-check
- Maia API contract (stays on Hugging Face Spaces, never Vercel serverless)
- Stockfish-before-LLM ordering
- Neo4j retrieval shape + 49-dim FEN cosine re-ranking
- two-tier Sonnet/Haiku split + context caching
- inline puzzle chat-bubble UX

# Test budget
# $10 is a hard escalation line: crossing it requires a 'budget-over-10-justification:' line
# here stating what the extra evals prove that cheaper checks cannot. Without it, the loop
# stops product-API spend at $10 and finishes on existing evidence.
# budget-over-10-justification: <only if budget > 10>

# Prod smoke
# If the change is prod-visible, the loop maintains .loop/objective-smoke.sh (curl checks
# against the deployed site). It runs automatically post-deploy; red = automatic revert.
