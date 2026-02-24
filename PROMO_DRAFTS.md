# Promotion Drafts for Chess Masti AI

## Twitter/X Post Draft

> I built Chess Masti AI — an AI-powered chess coach that explains the *why* behind every move using fundamental chess principles, not just cold engine evals.
>
> It uses Stockfish + Claude to give real-time, personalized coaching: principle violations, opening repertoire drilling, opponent scouting, puzzle training, and more.
>
> Key features:
> - 25+ chess principles detected in real-time
> - Opening course system (Vienna Game + more coming)
> - Opponent scout (like OpeningTree) with prep recommendations
> - 9,000+ curated puzzles from Lichess
> - Spaced repetition for openings
>
> Built on the chess commentary dataset from @harsh_jhamtani & @VarunGangal et al. (ACL 2018) — their work on generating move-by-move commentary from large-scale forum data was a key inspiration.
>
> Paper: https://aclanthology.org/P18-1154/
> Repo: https://github.com/harsh19/ChessCommentaryGeneration
>
> Stack: Next.js 15, React 18, TypeScript, MUI, Stockfish.js, Anthropic Claude, Jotai
>
> #chess #AI #NLP #machinelearning

**Notes:**
- Adjust @ handles to the correct Twitter handles for Harsh Jhamtani and Varun Gangal
- Add a screenshot or short video demo for engagement
- If the repo is public by then, include the repo link
- Reference tweet style Varun suggested: https://x.com/DimitrisPapail/status/2019826268653375687

---

## Blog Post / Substack Outline

### Title Ideas
- "How I Built an AI Chess Coach That Actually Teaches You Why"
- "Chess Masti AI: Making Chess Fun with AI-Powered Coaching"
- "From Engine Evals to Real Coaching: Building an AI Chess Teacher"

### Outline

**1. The Problem**
- Traditional chess tools show engine evaluations (+0.3, -1.2) but never explain *why*
- Beginners and intermediates can't learn from raw centipawn scores
- Chess should be fun ("masti"), not intimidating

**2. The Inspiration**
- Jhamtani, Gangal et al.'s ACL 2018 paper on chess commentary generation
- Their dataset of 298K+ move-commentary pairs from forums showed that natural language chess explanations are possible and valuable
- Wanted to take this further: real-time, interactive, principle-based coaching

**3. The Architecture**
- Next.js 15 + React 18 frontend
- Stockfish.js for engine analysis (running in-browser)
- Anthropic Claude for natural language coaching
- 25+ chess principles as the coaching framework
- Surprise-based analysis: flag moves where the engine's best move differs from the played move

**4. Key Features Deep Dive**
- **AI Coach Chat**: Real-time move explanations grounded in principles
- **Opening Courses**: Chessly-style repertoire drilling with spaced repetition (Vienna Game: 10 chapters, 417 lines)
- **Opponent Scout**: Fetch games from Chess.com/Lichess, build opening trees, find exploitable lines
- **Puzzle Training**: 9,292 curated puzzles across 46 themes and 4 difficulty bands
- **Enhanced FEN Tracking**: Rich position metadata for smarter commentary

**5. Challenges & Lessons**
- LLM hallucinations in chess (illegal moves, wrong piece names) — mitigations via FEN validation
- Balancing engine depth vs. response time
- Making AI explanations sound coaching-like, not robotic
- Turbopack limitations with dynamic imports

**6. What's Next**
- More opening courses (Sicilian, Queen's Gambit, etc.)
- Multiplayer coaching sessions
- Fine-tuned models on the commentary dataset
- Community contributions

**7. Try It / Cite It**
- Link to repo (when public)
- Citation info for academics
- Acknowledgment of Jhamtani, Gangal et al. (ACL 2018)

---

## Varun's Suggestions Checklist
- [x] Citation section added to README.md
- [x] CITATION.cff file created (GitHub "Cite this repository" button)
- [x] Jhamtani et al. (2018) cited in README + CITATION.cff
- [x] Their repo linked in Acknowledgments
- [ ] Write and publish tweet/thread (use draft above)
- [ ] Write and publish blog post (use outline above)
- [ ] Make repo public (currently private)
- [ ] Share with Varun for retweet/repost
