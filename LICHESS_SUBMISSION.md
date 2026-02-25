Subject: Project Submission for Related Projects - Chess Masti AI

Dear Lichess Team,

I hope this message finds you well. I'm writing to submit Chess Masti AI for consideration in your Related Projects section on database.lichess.org.

## Project Overview

**Chess Masti AI** is a free, AI-powered chess coaching platform that helps players improve through engaging, principles-based explanations rather than just engine evaluations. The project uses your Lichess Puzzle Database extensively and would be a valuable addition to your ecosystem.

## Key Features

- **AI-Powered Coaching**: Uses OpenAI GPT models to explain chess moves using fundamental principles
- **90,599 Tactical Puzzles**: Powered entirely by the Lichess Puzzle Database (CC0 licensed)
- **Multiple Chess Engines**: Stockfish, Leela Chess Zero, and Maia Chess integration
- **Practice Modes**: Puzzle Rush, Pattern Training, and thematic puzzle practice
- **Progress Tracking**: Solved puzzle filtering to prevent repetition
- **Free & Open Source**: Completely free for all users

## Lichess Integration

We heavily utilize and credit your resources:
- **Puzzle Database**: All 90,599 puzzles are sourced from your database
- **CC0 Compliance**: Proper attribution and licensing maintained
- **Server-side Filtering**: Implements excludeIds to filter solved puzzles
- **Theme Organization**: Uses your puzzle themes and difficulty classifications

## Technical Details

- **Frontend**: React 18, Next.js 15, TypeScript
- **Chess Logic**: chess.js, react-chessboard, stockfish.js
- **AI Models**: OpenAI GPT-4o, Stockfish, Maia Chess
- **License**: GNU AGPL v3 (open source)
- **Live Site**: https://chess-coach-ai-seven.vercel.app
- **GitHub**: https://github.com/AayanHetam/chess-coach-ai

## Academic Citations

The project includes proper academic citations for:
- Lichess Puzzle Database (your CC0 dataset)
- Stockfish engine
- Maia Chess (NeurIPS 2020)
- Chess Commentary Dataset (ACL 2018)

## Why Chess Masti AI?

Unlike traditional chess training sites that show cold engine evaluations, Chess Masti AI focuses on making chess learning enjoyable and accessible. The platform explains the "why" behind moves using fundamental chess principles, making improvement more engaging for players of all levels.

We believe Chess Masti AI would be a valuable addition to your Related Projects as it:
1. Showcases innovative use of your puzzle database
2. Provides free chess education to the community
3. Demonstrates proper attribution and open-source practices
4. Encourages more players to engage with chess tactics

## Request

Would you consider adding Chess Masti AI to your Related Projects section? We've prepared the following suggested entry:

```html
<li>
  <a href="https://chess-coach-ai-seven.vercel.app/">Chess Masti AI</a> – Free AI-powered chess coaching with Stockfish analysis, Maia human-move prediction, and 90K+ tactical puzzles from Lichess
</li>
```

Thank you for maintaining such an incredible open-source chess ecosystem. Your puzzle database has been instrumental in making chess education accessible to millions, and we're proud to contribute to this community.

Best regards,

Aayan Hetamsaria
Creator, Chess Masti AI
https://chess-coach-ai-seven.vercel.app
https://github.com/AayanHetam/chess-coach-ai

---

P.S. If you prefer a Pull Request instead, I'd be happy to submit one directly to the lichess-org/database repository with the suggested addition to web/index.html.tpl.
