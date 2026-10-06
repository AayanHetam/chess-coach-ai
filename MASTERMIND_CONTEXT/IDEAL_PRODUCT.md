# The ideal /analysis coach

**Written:** 2026-10-06. **Status:** the target, described in its own right, before any pathway. The companion document (`IDEAL_PRODUCT_PATHWAY.md`, next) excavates a route from the code as it stands to this target, element by element, with costs. Where that route is not reasonable, this document changes, not the route.

## Why this exists

The coach we ship is accurate and it is not useful. Every layer added to `/api/chat` over the last six months (the contract, the sentence referee, the four-part shape, the 100-word budget, the player-colour filter, the eight-message window, the validator pipeline) removes a way of being wrong. None of them adds a way of being worth reading. The result answers one kind of question well ("why was my move N bad") and squeezes or deletes every other kind. Accuracy is the floor of a coaching product. This document describes the house.

It is written from the player's side, with no reference to what the code can do today. That is the point of writing it first.

## The product in one paragraph

A coach who studied your game before you sat down. He shows you, on the board, where the game turned: what you meant by the move, what it actually did, and the line that proves it. You can ask him anything about the game, from either side, at any depth, and he answers with proof you can play through, or tells you in one clause what he would need to check. He names the pattern behind each mistake, gives you one check to run before the next move like it, and remembers it next game. He is fast, he fits on your phone, and he is Masti.

## Principles, in priority order

1. **Chess correctness is the floor.** No invented move, line or evaluation, ever. Inherited, and it stays.
2. **The board is the medium.** Anything that can be shown on the board is shown there, and the words are the caption. A sentence that could have been an arrow is a defect.
3. **Any question, from either side, at any depth.** The coach takes the player's question on its own terms. "Why", "what if", "compare", "from Black's side", "what's the plan", "flip the board" and "test me" are all first-class.
4. **Proof over assertion.** Every concrete claim carries something the player can play through or see. When a claim cannot be proved from what the coach has, he says what he would need, in one clause, and answers from what he does have.
5. **Teach the transfer.** A mistake is named as a pattern, with a trigger and a check, and it is tracked across games. The point of a review is the next game.
6. **The player's depth.** The default answer is short. Depth is one tap or one question away and is never withheld.
7. **Masti is the coach, and there is one of him.** Warm, reactive, funny when it fits, never childish. He is not a mascot standing beside a coach. The seven attitudes are retired: one voice, calibrated by the player's level, with no picker.

## The experience, in scenes

### Scene 1: arrival, the first ten seconds

Before any model text, the player sees the board at the decisive moment, the evaluation arc with the turning points marked, and one line from Masti that tells the story of the game ("You were better until move 23. One check cost the game."). Masti's mood matches the result. Nothing else: no wall of text, no cards, no greeting paragraph.

### Scene 2: the turning points

Each key moment is a scene on the board, not a card in a list. The board jumps there. The move the player played is drawn in one colour and the move they missed in another. The eval bar swings. Two short lines: what you meant, and what it actually did. Under them, the proof line with a Play control and one plain-words caption per move as it plays. One tap opens the why, the solution and the outcome. A "Lesson" note names the pattern and the check. At the decisive moment Masti asks one diagnosing question ("What did you think Black's threat was here?") and the lesson changes with the answer. The other moments offer the question as a chip. Four chips: Play it, What if, Quiz me, Defend it.

### Scene 3: any move

Every ply, the player's and the opponent's, has the strip under the board: verdict, evaluations, what the move does, and the engine's preference drawn. (This is true in the current build and the ideal keeps it.)

### Scene 4: the conversation

A real conversation, described in the next section.

### Scene 5: leaving

A recap: the patterns from this game (at most three), the one habit to practise, a drill set built from this game's positions, and, over time, the trend ("third game in a row you handled the back rank").

## What a human coach does with one game, and where each lands

A coach with one game and one hour runs through a known set of moves. Each one is placed here as in the ideal, in later, or out, with the data it needs.

| The coach's move | In the ideal? | How, and what it needs |
| --- | --- | --- |
| Checks the preparation: where the player or the opponent left theory | In, on request only | The opening intent, and never pushed. Most players do not need theory help, and a review that opens with "you left book on move 6" is the wrong first sentence for them. The book edge is a fact from the master tree, available when asked, and never a key moment by itself. |
| Explains the opening's why: where the pieces belong, which pawn breaks, which plans follow from the structure | In, on request only | The opening and plan intents, as teaching claims drawn on the board (target squares, breaks, routes). Needs a per-opening plan source beyond the corpus, which the pathway must price. Same rule: answered when asked, never volunteered in the review. |
| Pinpoints the two or three turning points | In, exists | Scene 2. |
| Diagnoses the thought process: "What were you calculating?" "What did you think the threat was?" | In, new | The coach asks at the decisive moment by default, and the other key moments carry a "Why did I play this?" chip that asks it on demand. The player's reply is classified into a root cause (a blind spot for a move type, rushing, misjudging the position, a calculation slip) and the lesson and the homework follow the cause, not the eval drop. This is the single biggest gap between the product and a coach. |
| Translates the evaluation into human terms | In | A number is never shown alone. Each eval carries its positional reason, computed from the position (a trapped piece, a weak colour complex, an open file), in the moment's "what happens" line. |
| What-if drills: "You played Ne4. What if Rc1? Calculate three moves." | In | The quiz and what-if intents. The player plays their line on the board, the engine checks it, the coach says where it diverges. |
| Active defence training: sets up the position before the blunder and plays the winning side | In | Sparring mode (below). The coach plays the winning side at a chosen strength, the player defends, Masti comments. |
| Points out missed structural ideas: colour complexes, outposts, open files | In | The plan and concept intents, from computed positional facts, drawn as highlights. |
| Connects the structure to a master game | Later (decided 2026-10-06) | Needs a large fetched master-game repository with a structure index. The master tree covers openings only. Out of the first build. |
| Reviews time management from the clocks | Out (decided 2026-10-06) | Removed from the ideal. |
| Assesses tilt: a blunder followed by a collapse | Out (decided 2026-10-06) | Removed from the ideal. |
| Prescribes targeted homework | In | Scene 5. A drill set built from this game's positions and the diagnosed cause, run in puzzle mode, tracked by spaced repetition. |

Out of the ideal: anything that needs the coach to have watched the player think in real time (a live session's body language, a spoken calculation). The diagnosing question is the product's substitute.

## The conversation

### What the player can ask, and what each ask gets

| Intent | Example | The ideal answer contains |
| --- | --- | --- |
| Verdict | "Why was 23. Qxd5 a mistake?" | What you meant, what happened, the proof line drawn and playable, the lesson. (The current four parts, kept.) |
| What if | "What about 23. Bxf7+ instead?" | The move is evaluated right then. Its refutation is drawn and playable, next to the engine's choice, with the difference in plain words. |
| Compare | "Nf3 or Nc3 here?" | Two lines side by side, the plan each supports, which the engine prefers and by how much. |
| Plan | "What's my plan in this position?" | The strategic read: targets, pawn breaks, piece routes, drawn as arrows and highlighted squares, ending in the first concrete move. |
| Perspective | "Look at it from Black's side." "What was my opponent thinking?" | The same quality of answer with every fact re-read for the other colour, including the opponent's best and worst moments. |
| Opening | "What opening was this? Where did I leave theory?" | The name, the main ideas for both sides, the move where the game left book, and what to study. Only when asked. The review never leads with theory. |
| Endgame | "How do I win this rook endgame?" | The technique, the key squares, the winning plan, and the exact result when a tablebase can give one. |
| Concept | "What is a minority attack?" | The definition in plain words, with this game's example when one exists, labelled as teaching. |
| Action | "Flip the board." "Go to move 20." "Play the line again." | The action happens. One line acknowledges it. |
| Walkthrough | "Walk me through the endgame." | A guided step: the board advances, each move is captioned, and it pauses where the player should think. |
| Try it | "Let me try from here." | Sparring against the engine from the position, with Masti commenting on the player's moves. |
| Quiz | "Test me." | A position from this game. The player moves on the board and is graded against the engine. |
| Diagnose (the coach asks) | "What did you think my opponent's threat was?" | The player answers in words or by pointing at the board. The coach names the root cause and the lesson follows from it. |
| Defend it | "Let me defend from before the blunder." | Sparring mode from the position before the mistake, the coach on the winning side, Masti commenting on each defensive try. |
| Master game | "Show me how a master handled this structure." | A master game with the same structure, stepped through on the board. Later: needs a fetched master repository with a structure index. |
| Progress | "Am I improving? What should I work on?" | Patterns across the player's recent games on chess.com or Lichess, with numbers that are real, and one thing to practise. |
| Preference | "Keep it short from now on." "Always coach me as Black." | Remembered for the session and offered as a saved preference. |

### What the coach can do

- Move the board to a ply.
- Flip the orientation.
- Draw arrows and highlights, each tagged with whose idea it is (yours, the engine's, a threat, a target).
- Play a line on the board.
- Evaluate a move or a line now, within seconds.
- Open the game's continuation or an alternative as an exploration.
- Start sparring from a position.
- Make a puzzle from a position.
- Save a preference.
- Ask the player a question and act on the answer.
- Enter a mode (puzzle, sparring, walkthrough, explorer) and bring the result back into the conversation.

### The unit of an answer: a moment

The coach's output is made of moments, not paragraphs. A moment is:

- a board state (a ply of the game, or an exploration position)
- annotations (arrows, highlighted squares, each tagged with whose idea it is)
- one line: the idea
- one line: what happens
- the proof: a line to play, with its evaluation
- optionally a lesson (the pattern's name and the check)
- optionally a question the player can answer on the board
- the actions on offer

An answer is one to three moments. Anything beyond the two lines per moment is behind a tap. A question that is not about a position (an opening's name, what to study) gets a single moment with no board change and the same two-line discipline.

## One page, many stages

`/analysis` is a stage, and the other surfaces of the site are its scenes. The board is the one persistent element. The conversation persists beneath every mode. A mode is a state of the page, never a navigation.

| Mode | What takes the screen | Built from | How it ends |
| --- | --- | --- | --- |
| Review (default) | The transcript of moments | The current page | Never ends. Every other mode returns here at the same ply. |
| Puzzle | The position as a puzzle: the toolbar, the hint stages, the coach bubble, the session rail | The `/puzzles` components | Solved or given up. The result enters the conversation as a moment ("Solved in two tries. The first try hung the rook."). |
| Sparring | The position as a game: the clock optional, the opponent at a chosen strength on the winning side | The `/play` components | Resigned, drawn, won, or stopped. The result and the critical moment of the sparring game enter the conversation. |
| Walkthrough | The board stepping through a line with one caption per move, pausing where the player should think | The proof line's Play control, extended | The line ends. The transcript keeps the walkthrough as one collapsible moment. |
| Explorer | The opening tree at the move where the game left book, only when the player asks for it | The Masters and Moves views that already exist as words in the header | The player taps back, or asks a question, which returns to Review with the answer. |
| Recap | The patterns, the habit, the drill set, the trend | New | Leaves to the drill set (puzzle mode) or closes the session. |

Transition rules:

- The board never unmounts and never moves. The right column (the whole screen below the board on a phone) crossfades or slides to the mode's panel. The shared element is the board, so the eye never loses its place.
- Entering a mode is a chip or a coach action, never a page load. Leaving is one tap, always back to Review at the ply you left.
- A mode's outcome is written into the conversation as a moment, so the transcript stays the record of the session.
- No new chrome. A mode brings its own panel and nothing above the board.
- The same pattern serves the diagnosing question: the composer becomes the answer box for that question, and the board accepts a tap as an answer.

## Presentation grammar

- **Board first.** Two arrow colours (yours, the engine's), highlighted squares for threats and targets, an eval bar that animates between moments, the material ledger. The board is the diagram. There are no inline mini boards.
- **Captions, not paragraphs.** At rest a moment shows two lines, and every line earns its place by saying something the board cannot show. A line that restates the arrow is cut. The why, the solution and the outcome open on a tap.
- **Every move is tappable,** wherever it appears, and tapping moves the board.
- **Phone first.** The board and the current caption are on screen together, always. The transcript scrolls beneath a board that shrinks while the player reads, or in a sheet that rises over it.
- **One board, one conversation.** Two columns on desktop, nothing above the board, nothing pinned above the transcript, nothing under the board that changes height. (The current layout rule, kept.)
- **Masti reacts.** Mood changes with what is on screen. No headings, no bullet walls, no emoji, bold once at most.

## The accuracy model: keeping the floor without censoring

Today the coach is forbidden from saying anything the review did not prove, and a referee deletes sentences it cannot license. The ideal keeps the floor and changes the enforcement.

- **The coach proposes, the app computes.** Any move or line the coach wants to cite is played out by the rules engine and evaluated by the chess engine before it is shown. A claim that fails the check goes back to the coach with the result, so the player never sees a hole where a sentence was.
- **Facts and teaching are different claim classes.** Concrete claims about this game (moves, evaluations, pieces on squares, tactics) must be computed. General chess teaching (definitions, principles, the typical plans of a named opening) is allowed, labelled as teaching, and may not carry an evaluation.
- **Unknowns are said once, in a clause,** then the answer continues from what is known.
- **Everything drawn on the board is computed by the app,** never typed by the model. (Inherited, stays.)

## Memory and progression

- **Within a session:** the side, the depth, standing preferences, what has already been explained.
- **Across games:** the player's chess.com or Lichess account is the repository. The coach fetches recent games from the platform (the scout and rating code already talk to both APIs), computes the top three recurring patterns, the openings played and the trend, and stores only what consent allows. The product never asks the player to build a game library by hand.
- **Calibrated by level,** same product, different default depth: beginners get safety and counting, intermediates get the opponent's forcing replies, advanced players get candidate moves and the critical line.

## Speed

- Arrival: the story is on the board within a second of the engine finishing, and the model's words stream in after.
- A follow-up: first words under two seconds, complete under five.
- A what-if: evaluated and drawn within two seconds.
- An action: immediate.

## What it is not

- A chatbot with a board next to it.
- A game-review clone: a glyph per move and "the best move was X" with no why.
- An essay generator.
- A chess encyclopedia. It teaches through this game.

## The bar

A 60-question test set across the intents above, on ten real games at four rating bands, judged for usefulness and for accuracy:

- Zero invented moves or evaluations. (The current bar, kept.)
- At least 90% of questions answered on their own terms. (Today: one intent.)
- A what-if answered for any legal move.
- A side switch in one message, with no re-review.
- Median prose per answer at rest of 60 words or fewer, with the board carrying the rest.
- A follow-up under five seconds, a what-if under two.
- Players at 800 and at 1800 both call the review useful, on a small live panel.
- Every key moment carries a diagnosing question, and the drill set at the end is built from this game.
- Entering and leaving a mode keeps the board in place, with no layout shift (the CLS budget the e2e suite already holds).

## Decisions taken (2026-10-06)

1. **Sparring** is in, as a mode built from `/play`.
2. **Cross-game memory** comes from the player's chess.com or Lichess account, fetched, with nothing to build by hand. Master games, when they come, come from a large fetched repository.
3. **One Masti.** The seven attitudes are retired as confusing.
4. **Opening theory is never pushed.** Most players do not need it. It is answered when asked and is never a key moment on its own.
5. **Two lines per moment,** and every line must be purposeful.
6. **Master games** are later.
7. **The diagnosing question** is asked at the decisive moment by default and offered as a chip at the other key moments. (Open to change: see below.)
8. **Time management and tilt** are removed.

## Still open

- **The diagnosing question's cadence.** Asking at every key moment is more coaching and more friction, since each question stops the review until the player answers or skips. The default above asks once, at the moment that decided the game, and leaves the others one tap away. Change it if the once-per-game feels thin.

## Next

`IDEAL_PRODUCT_PATHWAY.md`: for each element above, what exists, what has to change, what has to be built, and the cost. Where the cost is unreasonable, this document changes.
