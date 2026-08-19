<a href="https://chessmasti.com">
<img width="120" height="120" src="https://github.com/AayanHetam/chess-coach-ai/blob/main/public/android-chrome-192x192.png" alt="Chess Masti AI Logo">
</a>

<h3 align="center">Chess Masti AI</h3>

<p align="center">
<a href="https://chessmasti.com/" target="_blank" rel="noopener noreferrer"><strong>chessmasti.com</strong></a>
<br />
<em>Engine-grounded chess coaching. Free.</em>
<br />
<br />
<a href="https://chessmasti.com/how-it-works">How it works</a>
·
<a href="https://chessmasti.com/architecture">Architecture</a>
·
<a href="https://chessmasti.com/vs">Compare</a>
·
<a href="https://chessmasti.com/faq">FAQ</a>
·
<a href="https://github.com/AayanHetam/chess-coach-ai/issues">Issues</a>
</p>

<p align="center">
<a href="https://www.gnu.org/licenses/agpl-3.0">
<img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPL v3">
</a>
<img src="https://img.shields.io/badge/Copyright-2024--2026%20Aayan%20Hetamsaria-blue.svg" alt="Copyright 2024-2026 Aayan Hetamsaria">
</p>

> **Note on licensing.** The code is **open source** under [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0). Chess Masti AI is derived from [Chesskit](https://github.com/GuillaumeSD/Chesskit) and, through it, [lichess](https://github.com/lichess-org/lila) — both AGPL — so the same terms carry through. If you run a modified version as a network service, AGPL §13 requires you to offer your users its source. Some bundled piece sets and sounds are under their own, stricter terms; see [COPYING.md](COPYING.md) for the exception list.

## What this is

Chess Masti AI is a free, conversational chess coach built around one mental model: **every chess fact in a coaching response must be derivable from an authoritative source, not from the LLM's parameters.** That's enforced by an engine-first pipeline plus a hallucination validator on every output.

The product runs at [chessmasti.com](https://chessmasti.com).

## How the coaching pipeline works

1. **Stockfish 17** runs in your browser as a WebAssembly worker. It produces the position evaluation, candidate moves, tactical motifs, and branch-point analysis. No server round-trip, no rate limit.
2. **Claude Sonnet** (Anthropic) receives the engine's structured digest — never the raw board — and writes the coaching response. **Claude Haiku** handles sub-5-second follow-up chat with server-side context caching.
3. A **hallucination validator** parses every response and checks every piece, square, and move reference against the live `chess.js` board state. Claims that don't check out are rewritten or discarded before display.
4. Three **adaptive puzzles** render directly inside the coaching reply, retrieved from a Neo4j Aura graph of 100,000+ quality-filtered Lichess puzzles and re-ranked by 49-dimensional FEN cosine similarity to the position you just lost.

Detailed walkthrough: **[chessmasti.com/how-it-works](https://chessmasti.com/how-it-works)**.

## Differentiators

- **Engine-first, not LLM-first.** Stockfish runs before the LLM speaks. The LLM never invents chess facts; it paraphrases the engine's verdict.
- **Hallucination validator.** Every coaching response is verified against `chess.js` before it renders. The trust layer most AI chess coaches skip.
- **Maia-2 humanlike opponent.** Twin Bot uses [Maia-2](https://maiachess.com/) (NeurIPS 2024) to play like a human at a target Elo, optionally mirroring a specific Lichess player's repertoire.
- **Adaptive puzzle retrieval.** 100,000+ Lichess puzzles in a Neo4j graph, joined with 298,000+ Jhamtani expert-commentary pairs. Recommendations come from graph traversal plus FEN cosine re-ranking against your actual mistake — not a generic theme bucket.
- **Live Lichess play.** OAuth 2.0 PKCE plus dual-SSE streams. No tab-switching.
- **Opponent scouting.** Lichess / Chess.com username → opening trees, repertoire collisions, "Stalker Score" exploitability index, tilt and timeout psychology profiles.
- **Free.** No paid tier, no upsell, no advertising.

## Stack

- **Application**: Next.js 15 (App Router for API + content; Pages Router for interactive surfaces), TypeScript, deployed on Vercel.
- **Engine**: Stockfish 17 WASM, in-browser Web Worker.
- **LLM**: Anthropic Claude Sonnet (flagship analysis) + Haiku (fast chat) via a single tier-based `callLLM()` boundary.
- **Validator**: `chess.js` for board-state verification.
- **Humanlike opponent**: Maia-2 as a FastAPI/PyTorch microservice on Hugging Face Spaces, called via API proxy.
- **Puzzle retrieval**: Neo4j Aura graph + 49-dimensional FEN cosine similarity re-ranking.
- **Live play**: Lichess OAuth 2.0 PKCE, dual-SSE.
- **Persistence**: Firestore (server-side via Firebase Admin SDK), IndexedDB (client-side), Neo4j Aura.
- **Auth**: Signed JWT in httpOnly cookie, bcrypt for passwords, server-routed Google OAuth.
- **Monitoring**: Sentry.

Full architecture: **[chessmasti.com/architecture](https://chessmasti.com/architecture)**.

## Compared with other AI chess coaches

See **[chessmasti.com/vs](https://chessmasti.com/vs)** for the honest comparison against Sensei Chess, Noctie, Chessvia, DecodeChess, and Chess.com Coach — including where each of them is genuinely stronger.

## Local development

Requirements: Node.js 18+, npm.

```bash
git clone https://github.com/AayanHetam/chess-coach-ai.git
cd chess-coach-ai
npm install
cp .env.example .env.local
# Add ANTHROPIC_API_KEY (and optionally MAIA_API_URL, NEO4J_URI/USERNAME/PASSWORD,
# SESSION_SECRET, GOOGLE_OAUTH_CLIENT_ID/SECRET, etc.) to .env.local
npm run dev
```

Pre-commit check: `npx tsc --noEmit` (the build's TypeScript and ESLint checks are intentionally non-blocking; `tsc --noEmit` is the real gate).

## Maintainer

Built and maintained by **Aayan Hetamsaria**, a high-school student. Priority markets are India and Southeast Asia. There is no paid tier and no plan to introduce one.

## License & contact

License: **[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0)**. Free to use, study, modify and redistribute; derivative works must stay AGPL, and running a modified version as a network service obliges you to offer its source to your users (§13). Bundled piece sets and sounds keep their own licenses — see [COPYING.md](COPYING.md).

For partnerships or coverage, file an issue or reach the maintainer through the contact links at [chessmasti.com](https://chessmasti.com).
