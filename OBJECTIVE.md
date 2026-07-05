# Objective
The Master Games panel on /analysis shows, for every candidate move, which data source produced it (MC/HN/FC source initials) and how often it occurs (occurrence count) — the "infinitely relevant" tracker that was lost — and the June-6 engine-cursor desync report is either reproduced-and-fixed or proven already-fixed with a regression test.

# Acceptance criteria
- [ ] Each candidate move row in the Master Games panel renders its source initials (curated/MC, Lichess/HN, chessdb/FC — read the source chain in the master-games lib to get the real names) and an occurrence count, restored from the pre-loss implementation (`git log --all --oneline -- <panel files>` to find it) or re-implemented cleanly.
- [ ] The data comes from the actual source chain (curated → Lichess → chessdb.cn fallback per the repo's master-games strategy) — no hardcoded labels.
- [ ] Desync check: reproduce the June-6 report (moving through game history while the Master Games panel is open desyncs board vs engine cursor). If it reproduces on current main, fix it; either way add a regression test around move-handler replay on displayFen (the ae4cf45 fix pattern).
- [ ] PR #147's features (in-panel move-history strip + up/down keyboard nav) are evaluated against current main: if the panel still lacks them and they don't conflict with the glass chrome, incorporate them (its branch feat/master-games-panel-nav is the reference); if superseded, record why in the backlog.
- [ ] Component tests cover: source initials render per source type, occurrence count renders, keyboard nav (if incorporated).
- [ ] .loop/objective-smoke.sh exists: /analysis returns 200 on the deployed site.
- [ ] npx tsc --noEmit clean; npm test green; SKIP_ENV_VALIDATION=true npm run build succeeds.

# In scope
- The Master Games panel components (MasterGamesTakeover and friends), master-games data lib read-mostly, tests, .loop/objective-smoke.sh.

# Out of scope / do not touch
- The engine/eval pipeline, chessdb/Lichess fetch contracts (labels only — do not change sourcing), analysis coach, glass chrome pattern, package.json dependencies.

# Test budget
4.00 — data-source verification may hit chessdb.cn live; no LLM spend expected.
