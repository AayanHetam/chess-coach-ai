# Contributing to Chess Masti AI

Thanks for your interest in contributing! Chess Masti AI ([chessmasti.com](https://chessmasti.com)) is a free, open-source chess learning platform licensed under the [GNU AGPL-3.0](LICENSE).

## Development setup

Requirements: Node.js 18+, npm.

```bash
git clone https://github.com/AayanHetam/chess-coach-ai.git
cd chess-coach-ai
npm install
cp .env.example .env.local   # then fill in the keys you need (ANTHROPIC_API_KEY at minimum for AI features)
npm run dev                  # http://127.0.0.1:3000
```

Most of the app runs without external services; features backed by an unconfigured service (AI coach, Maia, Neo4j puzzles) degrade or disable themselves. Check `/api/health/llm` before assuming an AI issue is a code issue.

## Before you open a PR

- `npx tsc --noEmit` must be clean — this is the real type gate.
- `npm test` (Vitest) must pass; CI runs both on every PR.
- Write or update tests alongside behavioral changes.
- **Chess correctness is non-negotiable.** Legal-move, draw, and mate detection bugs are always highest priority — never ship a change that can render an illegal move or a wrong chess claim.
- Keep PRs focused on one change. For larger features, open an issue first to discuss direction.

## Licensing

- Code contributions are accepted under **AGPL-3.0**, the project's license. The project descends from [Chesskit](https://github.com/GuillaumeSD/Chesskit); lineage and attribution are documented in [COPYING.md](COPYING.md).
- Note that some bundled artwork (e.g. certain piece sets) carries separate non-commercial/no-derivatives licenses — see [COPYING.md](COPYING.md). The *code* is open source; those assets are not covered by the AGPL grant.

## Questions

File an issue, or reach the maintainer through the contact links at [chessmasti.com](https://chessmasti.com).
