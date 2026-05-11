# Competitive Landscape — Chess Masti AI

Captured 2026-05-01. Synthesis of five parallel research passes covering ~35 competitors across the chess training/coaching market. Goal is to ground "what we don't have yet" in concrete observations from real products, not speculation.

**Methodology & caveats**

- Cluster A (big platforms) was researched against training-data knowledge — no live web. Treat headcount/price specifics as directional; verify before citing.
- Clusters B–E used live `WebSearch` + `WebFetch`. Cluster B had `WebFetch` partially permission-blocked and leaned on search-result summaries.
- Each competitor was checked against its official site, LinkedIn (where available), Reddit (r/chess, r/chessbeginners, r/chessimprovement), and YouTube. "Not found" entries were left as such rather than invented.
- Some commonly-asserted facts that turned out wrong are flagged inline (e.g., ICC was *not* acquired by Chess.com; Killer Chess Training is Aagaard's, not Hertan's; ProChessTraining is RB Ramesh's).

---

## TL;DR

1. **The closest direct lookalike is [Sensei Chess](https://senseichess.com)** — same triad of (Stockfish + LLM-explained moves + spaced-rep on user mistakes), free, multi-language, India/Brazil-flavored. Low organic awareness today, but the architectural pitch is identical to ours.
2. **The "chat follow-up that remembers prior sessions" wedge is barely contested** — only [Chessvia](https://www.chessvia.ai/) does it well, and they layer voice on top. We already have it server-side via `contextId`; it's underexposed in our marketing.
3. **"Spaced-repetition puzzles built from your own mistakes" is essentially uncontested** — Chess.com's "Puzzles from your games" is shallow; nobody else has a real pipeline. This is our strongest single differentiator.
4. **Pricing anchor is $5.99–$8.25/mo for AI tools, $40–$100/yr.** ChessMood at $59–89/mo is the premium ceiling; ChessDojo at $15/mo is the structured-training floor. Going above $10/mo without strong differentiation will face resistance.
5. **The #1 competitive risk is Chess.com bundle consolidation** — they own Aimchess + Chessable + Dr. Wolf + Magnus Trainer + Play Magnus + (as of 2024) Chess24. A Diamond tier that adds true LLM coaching to Game Review would absorb our value prop directly. Their current Game Review is templated and shallow — that's our window.
6. **Lichess is the strongest "no-paywall, serious training" anchor** — Studies are best-in-class collaborative tooling, puzzle DB is open and huge, but it has no LLM coaching layer of any kind. A Chrome-extension overlay that adds AI explanations on top of Lichess is white-space.
7. **The B2B academy adjacent we keep returning to is real but underbuilt** — [Chessido](https://chessido.com) is a stub site; the actual India-first academy SaaS players are [Chessverse.in](https://www.chessverse.in/), [Chesslang](https://chesslang.com/), and [Wise.live](https://www.wise.live/blog/chess-gaja-wise-lms-for-chess/). [Chessity](https://www.chessity.com/) is the only Western academy-adjacent platform with depth, but it's school/kid-focused.
8. **Daniel Naroditsky's death (Oct 2025) leaves an unfilled "GM explains his thinking out loud" gap.** Speedrun-style narration — explanation-while-playing — is exactly what an LLM coach can credibly approximate at scale. Genuine acquisition opening, treat with respect.
9. **Creator funnel is the dominant top-of-funnel** — [GothamChess](https://www.youtube.com/channel/UCQHX6ViZmPsWiYSFAyS0a3Q) (~7.4M subs), Hanging Pawns (~270k), Naroditsky's audience now seeking a new home. Distribution partnerships > direct competition.
10. **A Reddit bot is the best-validated organic-acquisition pattern in this space** — [ChessVision.ai's u/chessvision-ai-bot](https://chessvision.ai/docs/bots/reddit/) auto-replies to board screenshots on r/chess and won "Best Chess Startup 2020" largely from that flywheel.

---

## How chessmasti is positioned today

What we ship (per [README.md](README.md), [CLAUDE.md](CLAUDE.md), and the page/route inventory):

- **AI coach via [`callLLM()`](src/lib/llmProvider.ts)** — Claude Sonnet 4 (flagship) + Haiku 4.5 (fast). OpenAI fallback coded but not configured in production.
- **Game upload (PGN/FEN)** → [`/api/enhanced-analysis`](src/app/api/enhanced-analysis/route.ts) → principle-based move-by-move explanation
- **Follow-up chat** with `contextId` carrying prior analysis state — [`/api/chat`](src/app/api/chat/route.ts)
- **Practice vs Stockfish** (WASM in-browser) and **Maia humanlike opponent** (microservice)
- **Adaptive puzzles, mistake-puzzles (drawn from user's own blunders), similar-puzzle retrieval** — [`/api/adaptive-puzzles`](src/app/api/adaptive-puzzles), [`/api/mistake-puzzles`](src/app/api/mistake-puzzles), [`/api/similar-puzzles`](src/app/api/similar-puzzles)
- **Spaced repetition** — repetit-training page + `src/lib/spacedRepetition.ts`
- **Openings, courses, scout, database** — first-party pages
- **Game import from chess.com & lichess** — [`/api/chesscom`](src/app/api/chesscom), [`/api/lichess`](src/app/api/lichess)
- **Auth** — email/password + Google OAuth (post-school-WiFi migration; cookie sessions)
- **Profile prefs** — coachTone, playingStyle, studyGoals, favoriteOpenings, boardTheme, pieceSet (threaded into the system prompt)

Where we play: B2C, individual improver-focused, web-first, AI coaching is the headline. Likely sweet spot: ~1000–1800 ELO English-speaking adults — same band as Aimchess, DecodeChess, ChessDojo.

---

## Cluster 1 — Game platforms with built-in training

The incumbents whose training surfaces compete with our coaching layer. None offers true LLM coaching today, but Chess.com's distribution is overwhelming and consolidation risk is real.

### Chess.com
- **Positioning**: Dominant global chess platform; deepest commercial training stack (Lessons, Game Review, Insights, Puzzles, Bots, Coach matching).
- **Pricing**: Free with caps; Gold ~$5/mo, Platinum ~$7/mo, Diamond ~$14/mo or ~$99/yr.
- **Training-relevant features**: Game Review (templated NL commentary on top of engine), Lessons (structured curriculum, hundreds of GM/IM-led series), Puzzles + Puzzle Rush + Puzzle Battle (live H2H), Insights dashboard (paid), Bot personalities (Mittens), Coach bots, Vision (board-square fluency), Drills, Opening Explorer + Master Games DB, Coach matchmaking, Classroom tools.
- **Reddit sentiment**: Game Review's commentary is "sometimes useful but often generic" / repetitive across games; cheating-detection complaints recur; Diamond seen as worth-it for serious improvers.
- **Where they're weak**: Game Review carries no cross-game context about a user's repertoire or recurring weaknesses; no conversational follow-up; "Puzzles from your games" exists but is shallow; Insights is descriptive, not prescriptive. Bundling threat over LLM coaching is real but not yet shipped.

### Lichess
- **Positioning**: Free, open-source, donation-funded; the canonical "serious training without paywall" platform.
- **Pricing**: 100% free; Patron donation tier is cosmetic only.
- **Training-relevant features**: [Studies](https://lichess.org/study) (collaborative annotation, chapters, sharing — best-in-class), Practice (basic checkmates, endgames, knight tour), Puzzles (~3M open DB, themed, Glicko2-rated), [Puzzle Storm](https://lichess.org/page/storm) / Racer / Streak, [Coordinate trainer](https://lichess.org/training/coordinate), Insights dashboard, Coach directory (titled coaches only, no platform cut), unmetered Stockfish analysis, Broadcasts, Learn module.
- **Reddit sentiment**: "Lichess does for free what Chess.com charges for"; Studies praised as the killer feature for self-coached players; some complaints about no structured curriculum.
- **Where they're weak**: No LLM/NL move explanations — engine eval bar only; no spaced-repetition layer; puzzles are random from the global pool, not from user games. **Strongest white-space for an AI-tutor product.**

### Chess24
- **Positioning**: Premium video courses + live broadcasts brand. Acquired by Chess.com (Play Magnus Group deal, 2022; integration ongoing). Standalone site largely deprecated.
- **Notable**: Banter Blitz (GM plays + commentates own games live) was the signature format. GM-led courses (Giri, Svidler, etc.) now folding into Chess.com's catalog.
- **Relevance today**: Mostly an asset inside Chess.com's stack; not a standalone competitor.

### ChessKid
- **Positioning**: Chess.com for kids — safe, gamified, school-friendly under 13. COPPA-compliant.
- **Pricing**: Gold ~$49/yr; school/club site licenses sold separately via sales contact.
- **Training-relevant features**: FunMaster Mike video curriculum, leveled puzzles, kid-themed bot opponents, Workouts (mixed sets), light Game Review, **teacher dashboard with assignments + class management + progress reports**, safe-chat moderation.
- **Where they're weak**: Curriculum is fixed and video-led, not adaptive; no LLM tutor; no mistake-replay queue; older pre-teens outgrow the kid UI before they're ready for Chess.com proper — a real gap.

### Internet Chess Club (ICC)
- **Positioning**: Original premium chess server (1995); **independently relaunched in 2024 — not Chess.com-owned** (common misconception).
- **Pricing**: Historically ~$70/yr; relaunch pricing similar.
- **Notable**: Deep legacy archive of GM video lectures (Seirawan, Christiansen). Chess.FM audio commentary heritage. Niche bughouse community.
- **Relevance**: Shrinking, nostalgia-driven; not competitive for new-user acquisition. Reference for "what not to become."

### ChessBase / Playchess
- **Positioning**: Desktop-first professional chess software incumbent. ChessBase 17 + Fritz 19 + Mega Database + Playchess server + Fritztrainer DVDs.
- **Pricing**: ChessBase 17 €199–€299 one-time; Mega Database 2025 ~€199 (annual update); Fritz 19 ~€80; ChessBase Account ~€50/yr; Fritztrainer DVDs ~€30 each.
- **Notable features**: **Mega Database (10M+ professional games — no real free equivalent at that depth)**, opening repertoire builder with novelty detection, transposition handling, engine cloud (rent strong engines), Let's Check (distributed engine analysis), My Games Cloud.
- **Where they're weak vs an AI tutor**: Windows-centric, steep learning curve, not approachable below 1500 ELO; no LLM explanations; no SRS layer; mobile/web is a thin shadow of desktop. Doesn't serve the 1200–1800 improver — exactly chessmasti's sweet spot.

---

## Cluster 2 — Direct AI coach competitors (closest substitutes)

This is where head-to-head competition lives. None bundles all four of [PGN game review + LLM "why" explanations + spaced rep on user mistakes + chat follow-up].

### DecodeChess [decodechess.com](https://decodechess.com/)
- **Positioning**: AI/NLG layer over Stockfish NNUE — the canonical "engine explainer." Pre-LLM architecture.
- **Pricing**: Free 2 decoded games/day; ~$8.25/mo; ~$84.99/yr; pay-as-you-go credits.
- **Features**: Move-by-move "decoded" explanations: Threats / Best Moves / Plans / **Piece Functionality (what each piece is doing — distinctive)**. Visual game graph. **Decode-while-playing** (instructional play mode). PGN/FEN upload. Web + Android.
- **AI**: Stockfish NNUE + proprietary rule-based / NLG layer. Templated, not free-form chat.
- **Traction**: Founded 2013, Israel. Tiny team (~4). Bootstrapped, no funding.
- **Reddit sentiment**: "Tremendously useful for club players"; major complaints about bugs, broken account creation, broken PGN imports; UX feels dated.
- **Weakness**: Pre-LLM rigidity, no chat follow-up, no SRS loop, ceiling ~2000 ELO, slow shipping cadence.

### Aimchess [aimchess.com](https://aimchess.com/) (Chess.com-owned)
- **Positioning**: Personalized weakness analytics + targeted training plan over your Chess.com / Lichess / Chess24 games.
- **Pricing**: Free 40-game analysis + weekly plan; Premium $7.99/mo or $57.99/yr.
- **Features**: Auto-pull from chess.com/lichess/chess24, performance breakdowns (Openings, Tactics, Endings, Advantage Capitalization, Resourcefulness, Time Mgmt), **Scouting (40-game opponent prep report)**, **Advantage Capitalization replay (replay won-games-you-blew vs Stockfish)**, **Visualization training**, personalized weekly study plan, iOS + Android.
- **AI**: Engine + analytics/heuristics. Not LLM-based.
- **Traction**: 100k+ users by ~2021; acquired by Play Magnus 2021 → Chess.com 2022. Now sub-brand.
- **Reddit sentiment**: Worth-it for serious improvers; opening misclassifications recur; "why pay 3rd-party for chess.com data?" criticism is common.
- **Weakness**: No "why" explanations, no LLM, no conversational layer, no puzzles from mistakes; redundancy risk with parent Chess.com.

### Sensei Chess [senseichess.com](https://senseichess.com/) — **closest direct lookalike**
- **Positioning**: AI-powered chess coach pulling chess.com / lichess games into LLM-explained mistake review with spaced-rep flashcards. **Free.**
- **Pricing**: 100% free.
- **Features**: chess.com/lichess sync, move-by-move LLM insights, recurring-mistake detection, **auto-generated flashcards from mistake positions**, spaced repetition review, **multi-language (Hindi, Kannada, Tamil, Portuguese)**.
- **AI**: Marketed as a custom fine-tuned model + Stockfish + LLM explanations. Hybrid almost identical to ours.
- **Traction**: Founder Santosh Iyer. No disclosed funding/headcount/users. Very low organic awareness — Reddit returns no substantive threads.
- **Weakness**: No revenue path obvious; no Maia-style humanlike opponent; appears review-focused (not play-focused); founder/team depth not externally validated.
- **Why this matters**: Architectural pitch is the same as ours. If they raise funding or get a YouTuber feature, they could lap us on price.

### Chessvia [chessvia.ai](https://www.chessvia.ai/)
- **Positioning**: Voice-first conversational AI coach ("Chessy") with customizable persona; talks aloud, listens, remembers prior sessions.
- **Pricing**: Marketing claims "$2–$3/hour equivalent" of personalized coaching; concrete tiers not surfaced.
- **Features**: **Voice input + voice output (TTS+STT)**, **customizable coach personality**, chess.com/lichess game sync, real-time feedback during games, **cross-session memory**, **Chrome extension overlay on chess.com/lichess**, ChessviaGPT in GPT marketplace.
- **AI**: LLM-based with TTS/STT layer. Specific model not disclosed.
- **Weakness**: Heavy marketing tone vs. validated user base; thin organic discussion; voice UX is novel but unproven for chess (notation-heavy explanations are awkward audibly).

### Dr. Wolf (Chess.com-owned) [chess.com Dr. Wolf](https://www.chess.com/play/apps/drwolf)
- **Positioning**: Beginner-friendly conversational chess tutor mobile app — patient/witty in-play commentary + 50+ structured lessons.
- **Pricing**: Free tier; Premium $5.99/mo or $39.99/yr (cheapest in this cluster).
- **Features**: **Live spoken (audio) commentary on every move while playing**, 50+ interactive lessons, post-game analysis, hints/undo, iOS + Android (mobile-only — no web app).
- **Traction**: ~9.4M Android downloads; acquired by Chess.com 2021.
- **Reddit sentiment**: Beginners love it; hard ceiling ~1300–1500 ELO; "lessons are what's free elsewhere."
- **Weakness**: No chess.com/lichess history sync, no SRS loop, mobile-only, likely deprioritized inside Chess.com.

### ChessFactor [chessfactor.com](https://www.chessfactor.com/)
- **Positioning**: Free GM/IM-led video courses with interactive exercises + Lichess integration. "Chessable Lite," not an AI coach.
- **Pricing**: Fully free since pivot from subscription; YouTube-ad-monetized.
- **Notable**: Free GM-quality video content with structured paths (rare); Lichess library cross-publishing is unique distribution.
- **Weakness**: Not AI; not personalized to user games. Adjacent rather than competitor.

### Magnus Trainer / Play Magnus (Chess.com group)
- **Positioning**: Gamified mobile chess curriculum branded around Magnus Carlsen — 250+ lessons, mini-games, **play-Magnus-at-different-ages humanlike-ish bots**.
- **Pricing**: Free tier + monthly/annual/lifetime tiers; per-module purchases.
- **Notable**: Magnus brand is the biggest celebrity moat in chess education. XP/beans gamification more aggressive than chessmasti's serious-coach framing.
- **Weakness**: No personalization to user games; no LLM; clear ceiling above intermediate.

### Chessroots [chessroots.com](https://www.chessroots.com/)
- **Positioning**: Niche opening explorer over an 800M-game database with **"Transpose" feature** (find alternative move orders to the same position).
- **Pricing**: Free 15 supporter-feature uses/day; Supporter ~£2/mo.
- **Notable**: Transpose is genuinely distinctive vs. chess.com / lichess opening explorers.
- **Weakness**: Hobby project; recently took down server "due to lack of supporters" — sustainability risk.

### Listudy [listudy.org](https://listudy.org/en)
- **Positioning**: Free, open-source spaced-repetition trainer for openings, endgames, and tactics — "Anki for chess."
- **Pricing**: Free.
- **Features**: SRS (Leitner) on uploaded PGN or imported Lichess studies; play vs Stockfish; community-shared studies.
- **Notable**: Canonical free SRS chess tool. Closest open-source comparable to Chessable's MoveTrainer.
- **Weakness**: No "why" explanations; user supplies positions. Slice of Chessable, not a coach.

---

## Cluster 3 — Course / structured training platforms

Direct competition for "I want a system to improve at chess." None personalizes content to *your* PGNs.

### Chessable [chessable.com](https://www.chessable.com/) (Chess.com-owned)
- **Positioning**: Spaced-repetition-as-MoveTrainer marketplace. De facto standard for opening drilling.
- **Pricing**: Courses $20–$200 individually; Chessable PRO ~$74.99/yr (or ~$115 for 2 years).
- **Features**: **MoveTrainer interactive board with SRS over variation trees** (Quick / New / Review modes), author videos paired to lines, course marketplace (600+ courses, top-GM authors incl. Caruana, Giri, Aagaard), opening explorer per course, custom user decks, mobile + web with offline mode (PRO), milestones/streaks/quizzes, community/forum threads per course.
- **Pedagogy**: Heavy memorization + SRS; not adaptive to user games.
- **Traction**: $82.9M Chess.com acquisition (Dec 2022) via Play Magnus deal. Hundreds of thousands of courses sold.
- **Reddit sentiment**: Excellent for opening prep; "creates Chessable players who know forced lines but flounder out of book"; small board on mobile; PRO paywall creep.
- **Weakness**: No personalization to user games; no LLM/NL feedback; memorization-heavy, not understanding-heavy; no chat follow-up.

### ChessMood [chessmood.com](https://chessmood.com/)
- **Positioning**: GM-led video course platform with structured "Step-by-Step" improvement path (Armenian-GM team led by GM Avetik Grigoryan).
- **Pricing**: Essential ~$59/mo (~$49/mo annualized = ~$588/yr); Pro ~$89/mo with **live group lessons + "Play vs the GM" events**. 30-day money-back.
- **Features**: 500+ video hours, 10k+ quizzes/exercises, structured progression, downloadable PGN homework, Pro forums, mobile + web.
- **Traction**: 20+ team; reported $1M+ ARR. Hundreds-of-thousands YouTube subscriber base feeding the funnel.
- **Reddit sentiment**: "Logical and well-sequenced if you do the work"; "really expensive — hard to justify vs Chessable + free YouTube."
- **Weakness**: One-size-fits-all linear path; no PGN-of-yours analysis; video-heavy = passive; forum Q&A is async, not on-demand.

### Killer Chess Training [killerchesstraining.com](https://killerchesstraining.com/)
- **Positioning**: Live cohort academy with daily Zoom webinars from elite GMs — anchored by **GM Jacob Aagaard** (not Hertan; common misattribution) and the Quality Chess publishing ecosystem.
- **Pricing**: 1-month ~€149 / $175; 1-year ~€749 / $890. ~$1.40/hour given 6-day-a-week live classes.
- **Features**: Daily live webinars, recorded archive for members, weekly homework + tournaments, training camps (Aagaard, Sokolov, Shankland), guest spots from Anand and Gelfand, **free ChessTempo Gold included**, course bundles à la carte, forum.
- **Notable**: Highest density of elite-GM live instruction in the market.
- **Weakness**: Synchronous schedule; trainer can't review every student's games during webinar; pricey; no SRS / mistake-driven puzzles.

### ProChessTraining [prochesstraining.com](https://prochesstraining.com/)
- **Positioning**: Indian-rooted live group coaching academy founded by **GM RB Ramesh** (Praggnanandhaa's coach) with rating-grouped weekly classes from a strong GM/IM lineup.
- **Pricing**: From ~$50/month; annual members get a free monthly bonus session.
- **Features**: 3 group classes/week (1hr each), weekly seminar (Indian + US time-zone slots), recordings retained ~2 months, **rating-segmented cohorts**, structured course tracks, separately-purchased test series.
- **Notable**: Ramesh's pedigree (FIDE Trainer of the Year 2018, Indian National Team coach 2012–2018). Co-founded with GM Surya Ganguly + GM Magesh. ~25+ GM/IM coaches.
- **Weakness**: Synchronous group classes (zero on-demand); no personalization; no SRS; rigid refund policy.

### ChessDojo [chessdojo.club](https://www.chessdojo.club/)
- **Positioning**: Cohort-and-task-based "0–2500" structured training program by GM Jesse Kraai, IM Kostya Kavutskiy, IM David Pruess. Active study heavy, not video-binge.
- **Pricing**: ~$15/mo or ~$100–$120/yr (cheapest of the structured-training tier).
- **Features**: **Rating-cohort task lists** (assigned books, courses, puzzle sets, endgames), **sparring (play set positions repeatedly with cohort partners)**, **annotated game submissions + peer/sensei review**, **Discord community segmented by cohort**, own Game Database + Game Editor + Opening Scout + Annotation Workshop, opening course PGNs, **tests + graduation requirements per cohort**, podcast (Dojo Talks).
- **Notable**: Cohort/Discord accountability is distinctive. Curriculum spans 16 cohorts.
- **Weakness**: Game review is human-bottlenecked (sensei wait times); no automated personalized analysis; cohort matching can underdeliver off-peak; heavy reliance on user motivation.

### ICC video courses [chessclub.com](https://www.chessclub.com/)
- **Status**: Independently relaunched 2024; **not Chess.com-owned**. Legacy GM video archive (Seirawan, Christiansen). Marginally relevant for new-user acquisition.

### Forward Chess [forwardchess.com](https://forwardchess.com/)
- **Positioning**: Cross-publisher interactive ebook reader for chess books (Quality Chess, NIC, Everyman, Thinkers Publishing, Chess Stars).
- **Pricing**: App free; books $1.99–$24.99; ChessPublishing periodicals $19.99–$99.99/yr.
- **Features**: 484+ ebooks across publishers, interactive board with Stockfish, "try a move" + engine response, FEN copy/paste, cross-platform (iOS/Android/Win/Mac — single-purchase), bookmarks/annotations, autoscroll.
- **Notable**: Multi-publisher catalog is unique — Chessable is single-platform. No SRS though.
- **Weakness**: Reader, not coach; no personalization, no SRS.

### Chess.com Lessons (the structured lesson module)
- **Positioning**: Structured-course module bundled with Chess.com membership (Gold/Platinum/Diamond).
- **Notable**: Sheer scale + integration with the largest chess platform. Several hundred lesson series, 100+ instructors. Naroditsky Speedruns and Building Habits widely loved.
- **Reddit sentiment**: "Beginner lessons are great fundamentals; intermediate/advanced are dated, bland, lecture-heavy — improvers go to YouTube instead."
- **Weakness**: Static curriculum, not adaptive; challenges aren't built from your mistakes.

---

## Cluster 4 — Tactics & puzzle specialists

Direct competition for our adaptive/mistake/similar-puzzles surface and repetit-training. **Spaced repetition is rare among the giants — only Chess Tempo (premium) and ChessVision.ai Flashcards offer it. Lichess and Chess.com do not.**

### Chess Tempo [chesstempo.com](https://chesstempo.com/)
- **Positioning**: Serious-improver's tactics + endgame trainer. Deepest customization; highest-quality puzzle pool sourced from master games.
- **Pricing**: Free tier (limited, ads); Standard / Gold / Platinum ~$4–$8/mo annualized.
- **Features**: Tactics trainer (Standard / Blitz / Mixed / Theme), **endgame trainer (3–7 piece, vs computer with rated feedback)**, custom sets, **SRS for tactics + opening repertoire (rare)**, **"Guess the Move" master replay**, engine variations on premium, **problem comments threads**, **user-rated puzzle quality voting**, theme/motif/difficulty filters, mistake review sets.
- **Reddit sentiment**: "Vastly superior" puzzle quality vs Chess.com; harder, more defensive/endgame-realistic, timed forcing real-game calculation. Major complaint: dated UI.
- **Weakness**: No personalized NL coaching; no mistake-from-your-games puzzle generation; no narrative explanation; no mobile-first experience; weak beginner onramp.

### ChessPuzzle.net [chesspuzzle.net](https://chesspuzzle.net/)
- **Positioning**: Curated curriculum-driven puzzle academy by Martin Bennedik. Skill tree from fundamentals to advanced.
- **Pricing**: Free with ads; Premium ~€3.99/mo unlocks Puzzle Academy.
- **Features**: **Puzzle Academy (8 courses, 271 levels, 105 skills, 6 areas)** — adaptive skill tree, **per-pattern strength tracking that personalizes next training set**, themed tactics, endgames, **founder-authored explanatory blog/video per puzzle**, **Puzzle Climb (3-lives survival)**, leaderboards, strength/weakness tracking.
- **Reddit sentiment**: Niche but loyal; "treasure" for lower-rated players who find Lichess/Chess.com too random; UI consistently flagged as confusing eyesore.
- **Weakness**: No AI explanation; no puzzles from user's own games; weak UI; no mobile-first; thin social.

### Lichess Puzzle Storm / Racer / Streak
- **Positioning**: Free social/gamified puzzle modes layered on Lichess's open ~3M-puzzle DB.
- **Pricing**: 100% free.
- **Features**: **Storm** (race the clock, combo bonus, –10s/fail), **Racer** (multiplayer race vs friends/randoms — only major site with synchronous H2H puzzle race), **Streak** (one life, progressive difficulty), 60+ themes, opening-tagged filtering, dashboard with weakest/strongest themes (closest free thing to a personalized weakness map), **private Racer rooms with friends**.
- **Notable**: SR is community-requested but [not built in](https://github.com/lichess-org/lila/issues/14055).
- **Weakness**: No SRS, no NLP coaching, no mistake-from-your-games, no curriculum, themes are auto-tagged so noisy.

### Chess.com Tactics Trainer / Puzzle Rush / Puzzle Battle
- **Positioning**: Mass-market gamified puzzle suite inside the largest chess platform.
- **Pricing**: Free 3 daily puzzles; Gold/Platinum/Diamond unlocks.
- **Features**: Daily Puzzle, Custom Puzzles (theme + rating range), Learning Puzzles, **Puzzle Rush (3min / 5min / Survival, 3 strikes out)**, **Puzzle Battle (live H2H ELO-matched, 3min, 3 mistakes)**, themed pattern library, mistake replay within session, mobile + web parity, **friend challenges**.
- **Notable**: **Puzzle Battle synchronous H2H is the most popular live competitive puzzle mode in chess.** Survival mode is the de-facto benchmark score.
- **Weakness**: No deep personalized weakness diagnosis; no LLM coaching; no puzzles auto-generated from a user's actual mistakes (Game Review only points them out).

### CT-ART (Convekta / ChessOK / Peshka)
- **Positioning**: Classic master-tactics drill software; downloadable Russian/Soviet-school course.
- **Pricing**: ~€24.99 one-time. No subscription.
- **Features**: 10,000+ hand-curated GM exercises 1700–2400, theme-based study, hint system, **partial-credit scoring on suboptimal-winning moves**, position search, 6 UI languages.
- **Notable**: Hand-curated by GMs (rare in 2026); complete offline (no account, no internet).
- **Weakness**: No personalization, no cloud, no mobile-first, no SRS, no community.

### Chessity [chessity.com](https://www.chessity.com/) (also B2B)
- **Positioning**: Kid-friendly chess learning + school plans (Netherlands-rooted). Hybrid B2C + B2B.
- **Pricing**: 21-day free trial, then auto-converts. Family plan ~2x individual covers up to 5 accounts. **Group/school per-seat pricing** scales with volume.
- **Features**: Lessons, themed puzzles, tournaments, Chessto AI mascot, **teacher dashboard for class management** (designed so non-chess-playing teachers can run classes), mobile app (March 2024), **ready-to-use school workshop**.
- **Traction**: Founded 2011, Driebergen NL. 2-10 employees per LinkedIn. Han Schut (CM, 9-course Chessable author) closely associated.
- **Weakness**: Locked into kid/school positioning; weak adult-improver narrative; small team limits velocity; brand strength is regional (NL/EU).

### ChessVision.ai [chessvision.ai](https://chessvision.ai/)
- **Positioning**: Computer-vision board scanner — turns any image / PDF / video frame into an analyzable position. Utility, not a tactics trainer per se.
- **Pricing**: Free core scanner with limits; Premium ~$5.99/mo or $45.99/yr.
- **Features**: Browser extension, mobile scanner app, **eBook (PDF) reader for chess books**, **YouTube video search by position** ("find all moments where this position appears"), position library with annotation, opening repertoire builder, **Flashcards SR on saved positions**, **[Reddit bot u/chessvision-ai-bot](https://chessvision.ai/docs/bots/reddit/)**.
- **Notable**: Won "Best Chess Startup 2020." Reddit bot is a viral acquisition flywheel — replies to board screenshots on r/chess automatically.
- **Weakness**: It's a utility, not a coach. Complementary, not directly competitive — but **acquisition-channel pattern is gold**.

---

## Cluster 5 — B2B academy SaaS + indirect competitors

The B2B academy market and the creator/specialty-tools ecosystem.

### Chessido [chessido.com](https://chessido.com/)
- **Status**: Effectively a stub site. The "India-first B2B academy SaaS" pitch from the marketing screenshots isn't corroborated by any indexed page. **The actual academy SaaS players in India are below.**

### Chessverse.in / Chesslang / Wise.live (real B2B academy comps)
- **[Chessverse.in](https://www.chessverse.in/)**: White-label academy SaaS, batches/cohorts, virtual classrooms, student management, **ReflexBuilder AI puzzles**. Explicitly India-targeted.
- **[Chesslang](https://chesslang.com/)**: Software for chess coaches — assignment workflow, game area, tournaments. Used by online coaches.
- **[Wise.live](https://www.wise.live/blog/chess-gaja-wise-lms-for-chess/)**: General LMS that publicly cites Chess Gaja academy as a client (35% enrollment lift).

If a B2B pivot ever lands, these are the targets to study — not Chessido.

### Chessodoro [chessodoro.com](https://chessodoro.com/)
- **Positioning**: Asynchronous human-coach service: FIDE-titled coach reviews your games weekly + ships a "Monthly Focus Plan" video.
- **Pricing**: $59/mo monthly or $468/yr ($39/mo effective). 7-day money-back.
- **Features**: Weekly game-review videos, monthly focus plan, custom training plan, direct text messaging with coach, optional video calls. Markets against $50–200/hr private coaches.
- **Weakness**: Coach throughput cap (one human per student weekly) — can't match always-on AI; price floor ~$39/mo above AI tools.

### Chess Coach Pro
- **Status**: Not academy software. Solo-developer iOS app — ~4,500 puzzles + 16 openings, fully offline, no IAP, no subscription. Despite the name, no calendar/billing/roster product.

### Chess.com Coach Matchmaking & Lichess Coach Directory
- **What they are**: Discovery surfaces, not products. Marketplaces connecting students with human coaches. Chess.com is open application; Lichess is gated to titled players only.
- **Pricing**: Free to browse; lessons billed off-platform. ~$30–90/hr on Chess.com (most $40–50/hr); titled GMs/IMs £70–£150/hr.
- **Why they matter**: They're the upstream funnel — every dollar spent on a $40–50/hr human coach is convertible at $10–20/mo with AI.

### GothamChess (Levy Rozman) [YouTube](https://www.youtube.com/channel/UCQHX6ViZmPsWiYSFAyS0a3Q)
- **Positioning**: Largest chess creator — daily YouTube uploads + Chessable courses + NYT-bestselling book "How To Win at Chess" + merch.
- **Traction**: ~7.42M subscribers (April 2026); first chess channel past 1B views; YouTube ad income alone ~$88K–$120K/yr (not counting Twitch / Chessable royalties / book / merch).
- **Why he matters**: Captures intent at "I want to improve" before any SaaS sees it. Once a viewer wants to actually train, they leave the channel — that handoff is exactly what an AI tutor wants.

### Hanging Pawns (Stjepan Tomić)
- **Positioning**: Long-form, structured opening + improvement YouTube — closer to a textbook than entertainment. ~270K subs.
- **Why he matters**: Adult improvers who finish a Hanging Pawns playlist are explicitly asking "now what do I drill?" — strong handoff opportunity.

### Daniel Naroditsky (1995–2025)
- **Status**: Tragically passed away Oct 19, 2025 at age 29. ~494K YouTube subs and ~340K Twitch followers at time of death.
- **Why this matters**: His **Speedrun format** (GM playing up the rating ladder narrating his thinking in real time) was the gold standard for explanation-while-playing. His audience now has no equivalent. The pedagogical gap he leaves — "GM explains his thinking out loud" — is exactly what an LLM coach can credibly approximate at scale. Treat sensitively, but the competitive ceiling for explanatory creator content has softened.

### Forward Chess / Chess Position Trainer / OpeningTree
- **[Forward Chess](https://forwardchess.com/)** (covered in Cluster 3): cross-publisher ebook reader.
- **[Chess Position Trainer](https://www.chesspositiontrainer.com/)**: Desktop repertoire-builder with **true SRS for openings + gap-detection analytics**. ~$39.90 one-time. Niche but focused.
- **[OpeningTree](https://www.openingtree.com/)**: Free tool — ingests your Chess.com / Lichess history → renders **your real opening tree with W/D/L per branch**. Diagnostic only ("where am I bleeding rating?") — natural integration target rather than competitor.

---

## Feature gap inventory

What chessmasti has that's defensible:
- **AI move explanations grounded in 25+ chess principles** (Claude Sonnet 4 + Haiku 4.5; principle-based "why," not just engine eval) — only Sensei Chess and DecodeChess attempt this; Sensei is unfunded, DecodeChess is pre-LLM.
- **Spaced-rep puzzles built from the user's own mistakes** — Chess.com's "Puzzles from your games" is shallow; nobody else does this systematically.
- **Maia humanlike opponent** — ML-driven move-prediction at human ratings; rare (only Magnus Trainer's age-tuned bots are vaguely similar, and they're heuristic).
- **Conversational chat follow-up with `contextId`-cached prior analysis** — only Chessvia matches; ours is text-based, theirs is voice-first.
- **Stockfish WASM in-browser (zero install)** — most competitors are mobile-first or sync-based.

### Notable features competitors have that chessmasti doesn't

Grouped by theme. Source competitor in parentheses; one-liner judgment on strategic fit follows.

**UX / modality**
- **Voice input + voice output for the AI coach** (Chessvia, Dr. Wolf) — high differentiation, low-medium build
- **Native mobile app (iOS + Android)** (Aimchess, Dr. Wolf, ChessVision.ai) — table stakes for the long term
- **Browser extension overlay on chess.com / lichess** (Chessvia) — high leverage; brings our coach to where users already play
- **Offline mode** (Chessable PRO) — table stakes for mobile
- **Multi-language coach** (Sensei Chess: Hindi, Tamil, Kannada, Portuguese; CT-ART: 6 languages) — direct unlock for India + Brazil markets

**Content surface**
- **Master Games Database (10M+ pro games, searchable)** (ChessBase Mega DB) — content moat; would need licensing
- **Live broadcast viewer with engine commentary** (Chess.com, Lichess, ICC) — engagement hook, off-strategy for our coaching pitch
- **Cross-publisher ebook reader / chess book content** (Forward Chess) — content sales channel
- **Opening repertoire builder with novelty detection** (ChessBase) — depth tooling for serious players
- **Transposition handling in opening trees** (ChessBase, Chessroots' "Transpose")
- **GM video courses** (Chessable, ChessMood, Chess.com Lessons) — content-sales business model, not a feature
- **Personal opening tree from your own games (W/D/L per branch)** (OpeningTree) — diagnostic surface; cheap to build and it's free reach

**Pedagogy**
- **Structured lesson tree / curriculum with progress tracking** (Chess.com Lessons, ChessMood Step-by-Step, ChessDojo cohorts)
- **Skill tree with per-pattern strength tracking** (ChessPuzzle.net's 271-level / 105-skill taxonomy) — sophisticated; high signal/effort
- **Decoded-play mode (decode while playing the engine)** (DecodeChess) — natural extension of our practice surface
- **"Piece Functionality" output (what each piece is doing)** (DecodeChess) — interesting analytical layer
- **Visualization training (gradually harder mental visualization)** (Aimchess) — niche but distinctive
- **Coordinate trainer** (Lichess) — table-stakes board fluency tool
- **Endgame trainer with 3–7 piece tablebase positions** (Chess Tempo, Lichess Practice)
- **"Guess the Move" master-game replay** (Chess Tempo)
- **Custom user-defined puzzle sets / themes** (Chess Tempo)
- **Sparring positions (play set positions repeatedly with partners)** (ChessDojo)
- **Annotated game submissions with sensei review** (ChessDojo) — could be AI-replicated
- **Tests + graduation requirements per level** (ChessDojo)
- **Auto-generated weekly study plan** (Aimchess) — natural fit for our LLM
- **Scouting / opponent prep report from their public games** (Aimchess) — distinctive
- **Advantage Capitalization replay (replay won-games-you-blew vs Stockfish)** (Aimchess) — clever framing of an existing capability
- **Insights dashboard (phase accuracy, time mgmt, blunder patterns)** (Lichess, Chess.com, Aimchess) — descriptive baseline; we don't surface this

**Social / competitive**
- **Live H2H Puzzle Battle (synchronous)** (Chess.com Puzzle Battle) — engagement engine
- **Multiplayer Puzzle Racer (private rooms with friends)** (Lichess Racer)
- **Puzzle Storm / Streak / Survival modes** (Lichess, Chess.com)
- **Daily Puzzle + streak gamification** (Chess.com, Lichess)
- **Leaderboards (puzzle, training, rated)** (Chess.com, Lichess, ChessTempo)
- **Cohort / Discord community accountability** (ChessDojo)
- **User-rated puzzle quality voting + comment threads** (Chess Tempo)
- **Bot personalities (Mittens-style)** (Chess.com) — viral acquisition channel; persona-tuned LLM coaches could fill this
- **CAPS / accuracy score** (Chess.com) — table-stakes metric

**Specialty / unique**
- **Vision OCR — scan board from image, PDF, or video frame** (ChessVision.ai) — acquisition channel + ebook reading
- **YouTube position search** (ChessVision.ai)
- **Reddit bot for board-screenshot replies** (ChessVision.ai u/chessvision-ai-bot) — **best-validated organic acquisition pattern in this market**
- **eBook reader mode for PDF chess books** (ChessVision.ai)
- **"Play vs the GM" live events** (ChessMood Pro) — community/engagement, off-strategy
- **Auto-novelty detection in opening prep** (ChessBase) — pro-tier depth

**B2B (off-strategy today, parking for the academy pivot in [FUTURE_IDEAS.md](FUTURE_IDEAS.md))**
- **Teacher / coach dashboard with assignments and progress reports** (ChessKid, Chessity, Chessverse.in, Chesslang)
- **Class / batch / cohort management with rating-segmented enrollment** (ProChessTraining, Chessverse.in)
- **Family / group / school per-seat pricing** (Chessity)
- **COPPA-compliant kids mode + safe-chat moderation** (ChessKid)
- **White-label academy branding** (Chessverse.in)
- **School workshop kit for non-chess-playing teachers** (Chessity)

### Bundling / competitive risks to monitor

1. **Chess.com merging Aimchess + Chessable + Game Review into a true LLM coach** is the #1 risk. They have all the assets. They haven't shipped LLM-grade explanations yet — that's our window. Watch chess.com release notes for any "Game Review v2 / Insights with explanations / Coach personality" announcements; treat as a signal to accelerate.
2. **Sensei Chess raising funding** — same architectural pitch as ours, free, multi-lingual. If they get featured by GothamChess or raise a seed round, we lose the "free isn't sustainable" argument quickly.
3. **An incumbent (Chessable or Chess.com) shipping mistake-derived puzzles** — closes our biggest single differentiator.
4. **Chrome browser-extension overlays from Chessvia** — they're already at chess.com and lichess. If the voice UX gets actually good, beginners will adopt it before discovering us.

### Acquisition channel opportunities

1. **Reddit board-screenshot bot** — replicate the ChessVision.ai pattern. Auto-reply with brief AI explanation + link. Validated to work as a flywheel.
2. **Creator partnerships with mid-tier YouTubers (~50K–500K subs)** — Hanging Pawns audience handoff is the cleanest segment fit. GothamChess scale is out of reach without a co-marketing budget.
3. **Naroditsky-shaped explanatory content** — "GM-style speedrun narration" is a content format we can credibly produce by recording an AI-coached game session. Respectfully — not exploiting, filling a real gap his audience now has.
4. **OpeningTree integration / SSO** — they're free and diagnostic-only; we're the natural "now go fix it" layer.

---

## Sources

Direct profiles cite their sources inline above. High-leverage external references gathered from this pass:

- Aimchess: [aimchess.com](https://aimchess.com/) · [Chess.com SheldonOfOsaka review](https://www.chess.com/blog/SheldonOfOsaka/aimchess-a-review) · [Play Magnus acquisition press](https://playmagnusgroup.com/chess-training-and-analytics-startup-aimchess-joins-play-magnus-group/)
- DecodeChess: [decodechess.com](https://decodechess.com/) · [Tracxn](https://tracxn.com/d/companies/decodechess/__rn4ibwlbgikmw3zirMIRSWVGQdDiWLHcTfUTcA4hqME) · [Chess Advisor review](https://thechessadvisor.com/software-review/decodechess/)
- Sensei Chess: [senseichess.com](https://senseichess.com/) · [CircleChess Chessable-alternatives roundup](https://circlechess.com/blog/chessable-alternatives-with-ai-powered-personalized-coaching/)
- Chessvia: [chessvia.ai](https://www.chessvia.ai/) · [Chrome extension](https://chromewebstore.google.com/detail/chessvia-ai-%E2%80%94-chess-ai-an/ckamenpfeomcecgbdfocajafbdkmppic)
- Dr. Wolf: [chess.com Dr. Wolf hub](https://www.chess.com/play/apps/drwolf) · [acquisition news](https://www.chess.com/news/view/dr-wolf-joins-chess-com)
- Chessable: [chessable.com PRO](https://www.chessable.com/pro/) · [Chess.com Acquires Play Magnus](https://www.chess.com/news/view/chesscom-acquires-pmg) · [$82.9M deal coverage](https://frontofficesports.com/top-chess-player-platform-join-forces-in-82-9m-deal/)
- ChessMood: [Plans](https://chessmood.com/become-a-pro) · [Chessentials review](https://chessentials.com/is-chessmood-all-its-cracked-to-be-an-honest-review/)
- Killer Chess Training: [killerchesstraining.com](https://killerchesstraining.com/) · [Michel's Blog review](https://michelschessblog.com/2024/03/26/review-killer-chess-training/)
- ProChessTraining: [prochesstraining.com](https://prochesstraining.com/) · [ChessBase India launch](https://www.chessbase.in/news/Launch-of-Pro-Chess-Training)
- ChessDojo: [chessdojo.club](https://www.chessdojo.club/) · [Chess.com user review](https://www.chess.com/blog/GoldsmanB/my-review-of-the-chess-dojo-training-program)
- Chess Tempo: [memberships](https://chesstempo.com/memberships/) · [Lichess forum thread](https://lichess.org/forum/general-chess-discussion/why-many-people-consider-chesstempo-the-best-website-for-chess-puzzles-)
- ChessPuzzle.net: [puzzle academy](https://chesspuzzle.net/Academy)
- Lichess Storm/Racer/Streak: [Storm page](https://lichess.org/page/storm) · [SR feature request #14055](https://github.com/lichess-org/lila/issues/14055)
- Chess.com Puzzle Battle: [feature announcement](https://www.chess.com/news/view/new-feature-puzzle-battle)
- Chessity: [chessity.com](https://www.chessity.com/) · [school plan](https://www.chessity.com/en/school) · [LinkedIn](https://www.linkedin.com/company/chessity)
- ChessVision.ai: [chessvision.ai](https://chessvision.ai/) · [Reddit bot](https://chessvision.ai/docs/bots/reddit/)
- Chessodoro: [chessodoro.com](https://chessodoro.com/)
- Chessverse / Chesslang / Wise.live: [chessverse.in](https://www.chessverse.in/) · [chesslang.com](https://chesslang.com/) · [wise.live Chess Gaja case](https://www.wise.live/blog/chess-gaja-wise-lms-for-chess/)
- GothamChess: [YouTube](https://www.youtube.com/channel/UCQHX6ViZmPsWiYSFAyS0a3Q) · [income estimate](https://hafi.pro/income/gothamchess) · [Wikipedia](https://en.wikipedia.org/wiki/Levy_Rozman)
- Naroditsky tributes: [US Chess](https://new.uschess.org/news/gm-daniel-naroditsky-1995-2025) · [Chess.com](https://www.chess.com/news/view/grandmaster-daniel-naroditsky-dies-at-29) · [ChessBase obituary](https://en.chessbase.com/post/daniel-naroditsky-1995-2)
- OpeningTree / Chess Position Trainer: [openingtree.com](https://www.openingtree.com/) · [chesspositiontrainer.com](https://www.chesspositiontrainer.com/)
