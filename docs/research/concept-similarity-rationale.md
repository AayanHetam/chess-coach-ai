# Why Concept-Matched + Structurally-Analogous Puzzles Reinforce Chess Principles

**Status:** Part A1 synthesis (gates the concept-first retrieval build).
**Audience:** engineering + product, informing the rewrite of `src/lib/fenSimilarity.ts` and `src/app/api/similar-puzzles/route.ts`.

---

## TL;DR

The cognitive-science literature on analogical transfer and chess expertise converges on a single design prescription for practice-item retrieval:

> Two examples reinforce the same skill most effectively when they share the **deep (functional) structure** of the target concept while varying the **surface (perceptual) structure** enough to force abstraction.

Surface-only similarity (the current 50-dim handcrafted FEN cosine) produces *near-duplicates* that feel like practice but mostly drill pattern recall. Concept-only retrieval (matching by Lichess theme tag alone) produces examples that share the lesson but may be so visually unlike the missed position that the learner fails to map the principle across. The sweet spot — concept match first, structural analogy second — is predicted to yield the best retention-per-minute for deliberate practice. This justifies the two-stage retrieval in Part B4 of the plan.

---

## 1. Analogical transfer: surface vs. deep structure

**Gick & Holyoak (1980, 1983).** The canonical work. In the "tumor/radiation" and "fortress/dictator" studies, subjects who saw one source analog transferred poorly to a structurally-isomorphic target unless either (a) they were given a second source sharing the same *deep* structure but different *surface* features, or (b) the experimenter explicitly hinted at the analogy. The 1983 "schema induction" paper is the load-bearing result: **two cases with shared deep structure and varied surface detail produce a usable abstract schema; one case or two near-identical cases do not.**

Prescription for chess retrieval:

- Showing a student two back-rank mates with *identical* pawn shells (surface-clone) teaches them "recognize this exact picture," not "recognize back-rank weakness."
- Showing two back-rank mates with *different* piece counts, different attacker (rook vs. queen), different defender geometry, same underlying mechanism, is what induces the schema.
- This is exactly Stage 3 (MMR diversity pass) in the plan.

**Chi, Feltovich & Glaser (1981).** Expert physicists categorize problems by deep principle (conservation of energy, Newton's 2nd law); novices categorize by surface features (inclined planes, pulleys, springs). The training implication is that novices cannot yet self-organize by principle — the retrieval system must do it for them by serving problems tagged with the principle.

Prescription: Lichess theme tags ("middlegame", "short", "endgame") are *surface* categories. The concept taxonomy in Part B1 (back-rank mate, deflection, overloaded piece, IQP) is the *deep* category. The system must tag by the latter before matching.

---

## 2. Chess-specific evidence

**Chase & Simon (1973).** Masters recall mid-game positions vastly better than novices, but only when the position is from a real game — random positions equalize the two groups. Conclusion: expert memory is organized around meaningful *chunks* (pawn chains, king-safety geometry, piece coordination), not pixel-like board states.

**Gobet's Template Theory (Gobet & Simon, 1996; Gobet 1998).** Refines Chase–Simon: experts hold ~300k templates — parameterized schemas where slots (e.g., "knight on f5 square") can vary while the functional gestalt stays fixed. Training builds templates by *exposing the same functional pattern in many surface variants*.

Prescription:

- A learned embedding trained with **triplet loss over concept-labeled triples** (Part B3) approximates template matching: positive pairs share the template, hard negatives share surface cues but different templates. This is a direct operationalization of Gobet's theory.
- Handcrafted material/pawn-structure features (the current 50-dim) sit closer to Chase–Simon's raw-board level than to templates — they are below the abstraction the student is trying to learn.

**Sala & Gobet (2017, meta-analysis).** Chess-training far-transfer effects to general cognitive skills are weak; *near-transfer within chess* is where training pays off — and near-transfer is maximized by deliberate, concept-targeted practice rather than volume. This argues that precision of retrieval matters more than corpus size: **a 50-puzzle concept-correct drill beats a 500-puzzle theme-correct drill.** Corollary for the 100K-puzzle claim: the corpus is plenty; the bottleneck is labeling.

**de Groot (1946/1965).** Expert players don't calculate more variations than intermediates — they *see the right candidate moves first*. Candidate-move perception is exactly what tactical-motif recognition trains. The Chess Intelligence Layer already in `src/app/api/enhanced-analysis/route.ts:569-599` aligns with this; extending it into the concept classifier (Part B2) continues the same theory.

---

## 3. Spacing, interleaving, and variability

**Rohrer & Taylor (2007); Kornell & Bjork (2008).** Interleaved practice of concept types (A/B/C/A/B/C) produces worse in-session performance but substantially better retention and transfer than blocked practice (A/A/A/B/B/B). The mechanism is *discriminative contrast*: the learner must re-select the right schema each trial.

**Carpenter, Cepeda, Rohrer, Kang & Pashler (2012), and the Bjorks' "desirable difficulties" line.** Spacing and retrieval practice compound: items revisited at expanding intervals after partial forgetting yield outsized retention.

Prescription:

- The existing SM-2 implementation in `src/lib/spacedRepetition.ts` should be **extended from openings-only to concept-level puzzle drilling** — schedule the next reinforcement when the concept's ease factor calls for it, not when the user clicks "next puzzle." (Noted for a future plan; not in this scope.)
- Part B4 Stage 3's diversity pass (max-marginal-relevance across surface features within a concept) is the interleaving principle applied within a single recommendation batch.

---

## 4. How this maps to concrete design choices

| Research finding | Design consequence in this project |
|---|---|
| Deep-structure match > surface match for transfer (Gick & Holyoak) | Stage 1 is a *hard* concept filter, not a weighted blend. Cross-concept candidates are excluded, not down-weighted. |
| Novices can't self-organize by principle (Chi et al.) | Concept label must be **surfaced in the UI** (Part C2) so the student sees the abstract category while drilling the concrete instance. |
| Expert templates are parameterized schemas (Gobet) | Learned 128-dim embedding trained with concept-aware triplets — NOT a handcrafted structural vector. The 50-dim vector is retired. |
| Near-transfer > far-transfer; precision > volume (Sala & Gobet) | Invest in labeling quality (detector + LLM reconciliation) over corpus expansion. 100K well-labeled > 500K noisily-labeled. |
| Interleaving beats blocking (Rohrer) | Stage 3 MMR diversity within a concept batch. Future work: interleave *across* the student's 2–3 weakest concepts, not drill one to exhaustion. |
| Candidate-move perception is the expert skill (de Groot) | The motif detector's outputs ("fork square = f7", "back-rank target = g8") are the concrete teachables; the LLM explanation grounds on them, reducing hallucination. This is already live and the concept layer extends it. |

---

## 5. Threats to this thesis (and the mitigation)

1. **"What if the 50-dim cosine is already capturing enough deep structure?"** Unlikely given its features (material counts, pawn weaknesses, king safety) are all *position-state* features, not *mechanism* features. A pin and a fork with identical material and pawn structure would score ~1.0. Mitigation: the retrieval-eval step (Part E2) directly measures Recall@10 of same-concept puzzles against a held-out set; if the current cosine beats the concept-first system, the thesis is falsified and we stop.

2. **"Lichess theme tags might already be good enough deep categories."** Partially. Tags like `backRankMate`, `pin`, `fork` are deep; tags like `short`, `middlegame`, `mate` are surface. The concept taxonomy (Part B1) subsets Lichess tags to the deep ones and adds strategic/endgame concepts Lichess lacks.

3. **"Learned embedding could collapse surface features and lose the diversity signal."** Real risk with naive contrastive training. Mitigation: the triplet objective uses **hard negatives that share surface but differ in concept**; this is precisely the pressure that prevents collapse onto surface. Monitor via the 200-position human spot-check (Part B3 eval).

4. **"The research is about human novices; our users may be stronger."** Sala & Gobet show near-transfer benefits hold across skill levels for in-domain practice; Gobet's templates are stronger with expertise, not weaker. The concept-first retrieval should help more as users improve, not less.

---

## 6. Verdict on the gate

The analogical-transfer literature, the chess-expertise literature, and the spacing/interleaving literature **all point the same direction**: concept-matched, surface-varied examples are the highest-yield practice format. No credible body of work favors surface-cosine-only retrieval for learning.

**Gate: PASS.** Proceed to Part B (build the concept classifier, learned embedding, and two-stage retrieval).

---

## References (load-bearing)

- Chase, W. G., & Simon, H. A. (1973). Perception in chess. *Cognitive Psychology*, 4(1), 55–81.
- Chi, M. T. H., Feltovich, P. J., & Glaser, R. (1981). Categorization and representation of physics problems by experts and novices. *Cognitive Science*, 5(2), 121–152.
- de Groot, A. D. (1965). *Thought and Choice in Chess*. Mouton.
- Gick, M. L., & Holyoak, K. J. (1980). Analogical problem solving. *Cognitive Psychology*, 12(3), 306–355.
- Gick, M. L., & Holyoak, K. J. (1983). Schema induction and analogical transfer. *Cognitive Psychology*, 15(1), 1–38.
- Gobet, F., & Simon, H. A. (1996). Templates in chess memory: A mechanism for recalling several boards. *Cognitive Psychology*, 31(1), 1–40.
- Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories: Is spacing the "enemy of induction"? *Psychological Science*, 19(6), 585–592.
- Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science*, 35, 481–498.
- Sala, G., & Gobet, F. (2017). Does far transfer exist? Negative evidence from chess, music, and working memory training. *Current Directions in Psychological Science*, 26(6), 515–520.
