#!/bin/bash
# Mutation harness for the scout prep engine.
#
#   ./scripts/scout/mutate-holefinder.sh            # everything
#   ./scripts/scout/mutate-holefinder.sh joint      # screen | prep | joint | master | learn | theory | trainer | resume
#
# A green suite proves nothing until it has been watched to fail. Each mutation
# breaks exactly one guarantee and names the test that must go red.
#
# This is not ceremony. Four of the first six mutations written for this feature
# were missed by fixtures that looked thorough: a flat-50% control cannot produce
# a false discovery even with the multiple-comparison correction removed; a
# transposition whose move counters happen to match cannot detect a key that
# never dropped them; and a "you" archive containing only the hole games has a
# baseline equal to its own hole score, so every surplus is zero and the
# promotion and demotion assertions test nothing.
#
# STALE is as serious as MISS. A pattern that has rotted past its source mutates
# nothing, leaves the suite green, and reports exactly like a real coverage gap —
# two of these rotted silently when their modules were rewritten. Every mutation
# is therefore verified to have changed the file before its test is run.
#
# Run from the repo root. Restores every file on exit, including on Ctrl-C.
set -u

HF=src/lib/scout/holeFinder.ts
PS=src/lib/scout/positionStats.ts
PL=src/lib/scout/preparedLine.ts
MI=src/lib/master/ideas.ts
RH=src/lib/learn/repertoireHole.ts
WT=src/lib/theory/wikibooksTheory.ts
WI=scripts/openings/build-wikibooks-theory.mjs
TS=src/lib/learn/trainerSession.ts
TP=src/lib/learn/trainerProgress.ts

T_HOLE=src/lib/scout/__tests__/holeFinder.test.ts
T_PREP=src/lib/scout/__tests__/preparedLine.test.ts
T_JOINT=src/lib/scout/__tests__/jointReport.test.ts
T_IDEAS=src/lib/master/__tests__/ideas.test.ts
T_LEARN=src/lib/learn/__tests__/repertoireHole.test.ts
T_TLOAD=src/lib/theory/__tests__/wikibooksTheory.test.ts
T_TIMP=src/lib/theory/__tests__/wikibooksImport.test.ts
T_TRAIN=src/lib/learn/__tests__/trainerSession.test.ts
T_PROG=src/lib/learn/__tests__/trainerProgress.test.ts

GROUP="${1:-all}"
BAK=$(mktemp -d)
for f in "$HF" "$PS" "$PL" "$MI" "$RH" "$WT" "$WI" "$TS" "$TP"; do cp "$f" "$BAK/$(basename "$f")"; done
restore() { for f in "$HF" "$PS" "$PL" "$MI" "$RH" "$WT" "$WI" "$TS" "$TP"; do cp "$BAK/$(basename "$f")" "$f"; done; }
trap 'restore; rm -rf "$BAK"' EXIT

pass=0; miss=0; stale=0

# mut <file> <perl-expr> <test-file> <expected-failing-test> <label>
mut() {
  local file="$1" expr="$2" test="$3" expect="$4" label="$5"
  perl -0pi -e "$expr" "$file"
  if cmp -s "$file" "$BAK/$(basename "$file")"; then
    echo "  STALE  $label — pattern no longer matches $(basename "$file"); mutation was a no-op"
    stale=$((stale+1)); restore; return
  fi
  local out
  out=$(npx vitest run "$test" 2>&1)
  if echo "$out" | grep -q "Tests .*failed"; then
    if echo "$out" | grep -qF "$expect"; then
      echo "  PASS   $label"; pass=$((pass+1))
    else
      echo "  WEAK   $label — failed, but not via: $expect"
      echo "$out" | grep -E "^\s+×" | head -3
      miss=$((miss+1))
    fi
  else
    echo "  MISS   $label — SUITE STAYED GREEN"; miss=$((miss+1))
  fi
  restore
}

want() { [ "$GROUP" = all ] || [ "$GROUP" = "$1" ]; }

if want screen; then
echo "── screen: what makes a weakness claim legitimate"
mut "$HF" 's/\(\(i \+ 1\) \/ m\) \* q/q/' "$T_HOLE" \
  "confirms nothing on an opponent who is merely noisy" "no multiple-comparison correction"
mut "$PS" 's/\.slice\(0, 4\)\.join/.slice(0, 6).join/' "$T_HOLE" \
  "pools transpositions into one position" "no transposition pooling"
mut "$PS" 's/Math\.pow\(0\.5, ageDays \/ config\.halfLifeDays\)/1/' "$T_HOLE" \
  "weights recent games more heavily" "no recency weighting"
mut "$PS" 's/\(stat\.weight \* stat\.weight\) \/ stat\.weightSq/stat.weight/' "$T_HOLE" \
  "reports the Kish effective sample" "n_eff not Kish-corrected"
mut "$HF" 's/c\.test \? Math\.max\(0, index\.baseline - shrunk\) : 0/Math.max(0, index.baseline - shrunk)/' "$T_HOLE" \
  "refuses to recommend a line the screen never tested" "unscreened lines claim a results edge"
mut "$HF" 's/afterMoveCp - afterBestCp/afterBestCp - afterMoveCp/' "$T_HOLE" \
  "measures how much worse the position is left for the mover" "sibling loss sign flipped"
mut "$HF" 's/if \(seenPositions\.has\(key\)\) continue;//' "$T_HOLE" \
  "keeps the better of two move orders reaching the same position" "transposed duplicates reported"
mut "$PS" 's/if \(!seen\.has\(key\)\) \{/if (true) {/' "$T_HOLE" \
  "counts a repeated position once per game" "repetition double-counts"
mut "$HF" 's/evaluated >= budget/false/' "$T_HOLE" \
  "stops evaluating once the engine budget is spent" "engine budget ignored"
fi

if want prep; then
echo "── prepared lines: depth without invention"
mut "$PL" 's/faced \/ here <= config\.noveltyRate/faced === 0/' "$T_PREP" \
  "treats a move they have barely met as unfamiliar" "novelty demands a literal zero"
mut "$PL" 's/replies\.length > 0 && here >= config\.minGames/here >= config.minGames/' "$T_PREP" \
  "does not call a well-known move a novelty" "novelty claimed at the data horizon"
mut "$PL" 's/r\.san !== top\.san && //' "$T_PREP" \
  "never lists the reply a line took among its own alternatives" "branch listed in its own alternatives"
mut "$PL" 's/leader\.probability < config\.minProbability/false/' "$T_PREP" \
  "refuses to guess when they are genuinely split" "no fork — always follow the top reply"
mut "$PL" 's/probability: r\.weight \/ total/probability: r.games \/ 1e9/' "$T_PREP" \
  "weights a recent switch above an abandoned habit" "reply prediction ignores recency"
mut "$PL" 's/const bestCp = await after\(best\);.*?if \(commonCp === null\) return null;/const [bestCp, commonCp] = await Promise.all([after(best), after(common)]); if (bestCp === null || commonCp === null) return null;/s' "$T_PREP" \
  "never has two evaluations in flight at once" "two evaluations in flight (engine desync)"
fi

if want joint; then
echo "── pairing: their weakness measured against yours"
mut "$HF" 's/edge \+ \(you\?\.surplus \?\? 0\)/edge/' "$T_JOINT" \
  "ranks a line lower when you are ALSO bad there" "your surplus ignored in the ranking"
mut "$HF" 's/surplus: yourShrunk - yourIndex\.baseline/surplus: yourScore - yourIndex.baseline/' "$T_JOINT" \
  "shrinks your side by sample size like theirs" "your side not shrunk by sample size"
mut "$HF" 's/yourShrunk - yourIndex\.baseline/yourShrunk - index.baseline/' "$T_JOINT" \
  "measures each of you against your OWN baseline" "measured against THEIR baseline"
fi

if want master; then
echo "── master ideas: counted, not written"
mut "$MI" 's/: 1 - whiteScore;/: whiteScore;/' "$T_IDEAS" \
  "flips it when Black is to move" "score not flipped for Black to move"
mut "$MI" 's/if \(legal\.captured\) return false;/if (legal.captured) return true;/' "$T_IDEAS" \
  "does not count a capture" "captures counted as breaks"
mut "$MI" 's/pendingCapture && pendingCapture\.square === played\.to && pendingCapture\.by !== by/false/' "$T_IDEAS" \
  "spots a delayed recapture as a trade" "delayed recaptures missed"
mut "$MI" 's/Array\.from\(journeys\.values\(\)\)\.find\(j => j\.to === played\.from && j\.by === by\)/undefined/' "$T_IDEAS" \
  "joins a two-step manoeuvre into one journey" "piece journeys not joined"
mut "$MI" 's/if \(games < config\.minGames\) return null;//' "$T_IDEAS" \
  "returns nothing for a position the corpus barely has" "thin positions reported anyway"
mut "$MI" 's/games = best\.count;/games = Math.round(share * 1000);/' "$T_IDEAS" \
  "reports the games reaching the end" "principal line reports share as games"
fi

if want learn; then
echo "── learn: the same screen pointed at yourself"
mut "$RH" 's/m\.side === .them./m.side !== \x27them\x27/' "$T_LEARN" \
  "reports the moves under the right player" "side labels not un-flipped"
mut "$RH" 's/last\.side !== .them./last.side === \x27them\x27/' "$T_LEARN" \
  "only ever teaches a line that ends on a move I chose" "teaches a move I did not choose"
mut "$RH" 's/index\.baselineNeff > 0 \? neff \/ index\.baselineNeff : 0/c.reach/' "$T_LEARN" \
  "measures frequency from games that happened, not from a reach model" "frequency taken from the reach model"
mut "$RH" 's/return frequency \* Math\.max\(0, deficit\)/return Math.max(0, deficit)/' "$T_LEARN" \
  "ranks a frequent moderate leak above a rare severe one" "ranked on deficit alone"
mut "$RH" 's/shrinkScore\(score, neff, index\.baseline, config\.shrinkK\)/score/' "$T_LEARN" \
  "pulls a thin sample back toward my own average" "no shrinkage toward my baseline"
mut "$RH" 's/if \(!c\.test \|\| !c\.stat\) continue;/if (!c.stat) continue;/' "$T_LEARN" \
  "never teaches a position the screen did not test" "unscreened positions taught"
mut "$RH" 's/cpLoss >= config\.moveLossCp/cpLoss >= 0/' "$T_LEARN" \
  "holds its tongue below the centipawn bar rather than dressing up noise" "any centipawn counts as a better move"
mut "$RH" 's/confirmed\.length > 0 \? confirmed : all/all/' "$T_LEARN" \
  "prefers a measured line over a larger guess" "a bigger guess outranks a measurement"
mut "$RH" 's/return empty\(true\)/return empty(false)/' "$T_LEARN" \
  "separates \"not enough games\" from \"nothing is wrong\"" "thin archive reads as no weakness"
mut "$RH" 's/path\[lastIndex - 1\]\.fen/path[lastIndex].fen/' "$T_LEARN" \
  "records the decision point, not just the position after it" "parent position is the position itself"
mut "$RH" 's/const cost = await engine\.costOfMove\(parentFen, fen\);\s*const here = await engine\.evaluate\(fen\);/const [cost, here] = await Promise.all([engine.costOfMove(parentFen, fen), engine.evaluate(fen)]);/s' "$T_LEARN" \
  "never issues two evaluations at once" "two evaluations in flight (engine desync)"
fi

if want theory; then
echo "── theory: borrowed words, credited and unaltered"
mut "$WI" 's/\(\\s\*\\\.\\\.\)\?//' "$T_TIMP" \
  "reads Black's move, which is written with three dots" "SAN parser drops Black moves"
mut "$WI" 's{if \(nextHeading\) body = body.slice\(0, nextHeading.index\);}{}' "$T_TIMP" \
  "stops before the history and the theory table" "excerpt runs into history and tables"
mut "$WI" 's{if \(out && out.length \+ p.length \+ 2 > MAX_EXCERPT\) break;}{}' "$T_TIMP" \
  "never stops mid-sentence at a move number" "excerpt ignores its length cap"
mut "$WI" 's{excerpt.length > prev.x.length}{false}' "$T_TIMP" \
  "keeps the best-written page when several share a position" "shortest path beats best written"
mut "$WT" 's{data.positions\[positionKey\(fen\)\]}{data.positions[fen]}' "$T_TLOAD" \
  "matches regardless of the move counters" "lookup not transposition-pooled"
mut "$WT" 's{title\.replace\(/ /g, ._.\)}{encodeURIComponent(title)}' "$T_TLOAD" \
  "keeps the slashes and dots that make the URL work" "attribution link URL-encoded into a 404"
mut "$WT" 's{if \(loadFailed\) return null;}{}' "$T_TLOAD" \
  "does not retry a corpus that failed to load" "missing corpus re-read every request"
mut "$WT" 's{  if \(!entry\) return null;}{  if (!entry) return { name: undefined, eco: undefined, excerpt: \x27\x27, sourceUrl: \x27\x27, sourceTitle: \x27\x27, licence: data.licence, licenceUrl: data.licenceUrl };}' "$T_TLOAD" \
  "returns null when the book has nothing, rather than inventing something" "empty theory returned instead of null"
fi

if want trainer; then
echo "── trainer: the session, and what it refuses to fake"
mut "$TS" 's{line.color === .white. \? whiteToMove : !whiteToMove}{whiteToMove}' "$T_TRAIN" \
  "gives Black the odd plies" "turn order ignores the user colour"
mut "$TS" 's{if \(ply === decision && line.target\) return line.target.san;}{}' "$T_TRAIN" \
  "asks for the REPLACEMENT at the decision, not the habit" "drill asks for the habit it is replacing"
mut "$TS" 's{positionKey\(played\) === positionKey\(want\)}{san === expected}' "$T_TRAIN" \
  "grades by position, so two spellings of one move both pass" "graded on the move string, not the position"
mut "$TS" 's{if \(ok === null\) return state;}{}' "$T_TRAIN" \
  "does not spoil a run for an illegal drag" "an illegal drag costs a streak"
mut "$TS" 's{confrontMove: san,[\s\S]*?feedback: .none.,}{confrontMove: san, playedHabit, feedback: \x27wrong\x27,}' "$T_TRAIN" \
  "never flashes red at the move they always play" "confront accuses instead of observing"
mut "$TS" 's{clean \? state.streak \+ 1 : 0}{state.streak + 1}' "$T_TRAIN" \
  "resets the streak when a run was spoiled" "a spoiled run still counts as clean"
mut "$TS" 's{if \(!line.target\) return \{ ...state, act: .done. \};}{}' "$T_TRAIN" \
  "ends the session when there is nothing better to drill" "invents a drill with no replacement"
fi

if want resume; then
echo "── resume: pausing is free, resuming has to be right"
mut "$TP" 's{if \(saved.lineKey !== lineKeyOf\(line\)\) return null;}{}' "$T_PROG" \
  "refuses a session saved against a different line" "resumes another line's session"
mut "$TP" 's{now - saved.savedAt > ttlMs}{false}' "$T_PROG" \
  "expires" "resumes a session nobody remembers starting"
mut "$TP" 's{if \(state.act === .done.\) return null;}{}' "$T_PROG" \
  "never resumes a finished session" "drops the player onto a completion screen"
mut "$TP" 's{.filter\(r => r.lineKey !== key\)}{}' "$T_PROG" \
  "updates rather than stacking when the same line is repaired again" "repaired list stacks into a log"
mut "$TP" 's{`\$\{PREFIX\}.session:\$\{account.toLowerCase\(\)\}`}{`\$\{PREFIX\}.session`}' "$T_PROG" \
  "refuses another account progress" "one account resumes another's session"
fi

echo
echo "caught ${pass} · uncaught ${miss} · stale ${stale}"
[ "$miss" -eq 0 ] && [ "$stale" -eq 0 ]
