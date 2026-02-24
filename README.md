<a href="https://github.com/your-username/chess-masti-ai">
<img width="120" height="120" src="https://github.com/your-username/chess-masti-ai/blob/main/public/android-chrome-192x192.png" alt="Chess Masti AI Logo">
</a>

<h3 align="center">Chess Masti AI</h3>

<p align="center">
<a href="https://chess-masti-ai.com/" target="_blank" rel="noopener noreferrer"><strong>chess-masti-ai.com</strong></a>
<br />
<em>Make Chess Fun with AI-Powered Coaching</em>
<br />
<br />
<a href="https://github.com/your-username/chess-masti-ai/issues">Report Bug</a>
·
<a href="https://github.com/your-username/chess-masti-ai/issues">Request Feature</a>
</p>

## About

**Chess Masti AI** brings the joy back to chess learning. We believe chess should be **fun, engaging, and accessible** to everyone. Unlike boring traditional chess sites that just show cold engine evaluations, Chess Masti AI makes learning **enjoyable** by explaining the **WHY** behind moves using fundamental chess principles.

**"Masti"** means *fun* and *enjoyment* - and that's exactly what we bring to chess improvement!

### What Makes Chess Masti AI Special

Transform your chess journey with:
- **Fun-First Learning**: Chess principles explained in an engaging, enjoyable way
- **Smart Adaptation**: AI coaching that matches your skill level and keeps you motivated
- **Intelligent Feedback**: Learn WHY moves work through colorful, easy-to-understand explanations
- **Celebration of Progress**: Every improvement is recognized and celebrated
- **Playful Mastery**: Serious improvement through enjoyable, masti-filled sessions

### Core Features

- **AI Masti Coach** - Your fun, encouraging chess companion
- **25+ Chess Principles** - Learn the fundamentals that make chess beautiful
- **Smart Analysis** - Pinpoint exactly where to improve (without the overwhelm!)
- **Colorful Feedback** - Visual, engaging explanations that stick
- **Instant Coaching** - Real-time feedback as you explore positions  
- **Fun Practice Mode** - Enjoy games against Stockfish at your level
- **Progress Tracking** - Save and celebrate your chess journey
- **Play Anywhere** - Desktop, tablet, mobile - the masti never stops!

<img src="https://github.com/your-username/chess-masti-ai/blob/main/assets/showcase.png" />

## How the Masti Works

1. **Upload Your Game** - Import PGN files or enter moves manually
2. **AI Magic** - Our Masti AI analyzes each move through fun principles
3. **Learn & Enjoy** - Get engaging explanations that make sense AND stick
4. **Practice & Play** - Apply your new knowledge in enjoyable practice sessions

## Experience the Masti

Ready to make chess fun? Try Chess Masti AI at [chess-masti-ai.com](https://chess-masti-ai.com)

## Tech Stack

- **Frontend**: React 18, Next.js 15, TypeScript
- **UI**: Material-UI (MUI) with colorful, engaging designs
- **Chess Engine**: Stockfish.js for powerful analysis
- **AI Brain**: Anthropic Claude for intelligent, fun coaching
- **State Management**: Jotai for smooth interactions
- **Deployment**: AWS with CDK for reliable masti delivery

## Start Your Masti Journey Locally

### What You Need

- Node.js 18+ and npm
- Git
- A love for chess and fun

### Get Started

```bash
# Clone the repository
git clone https://github.com/your-username/chess-masti-ai.git
cd chess-masti-ai

# Install dependencies
npm install

# Set up your environment
cp .env.example .env.local
# Add your Anthropic API key to .env.local

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to begin.

### Available Commands

```bash
npm run dev     # Start the development server
npm run build   # Build for production
npm run start   # Start production server
npm run lint    # Keep the code clean
npm run deploy  # Deploy to AWS
```

## Join the Community

We'd love your contributions to make chess even more fun! Here's how:

1. **Fork the repository** - Make it yours!
2. **Create a feature branch**: `git checkout -b feature/more-masti`
3. **Add your masti** and test it thoroughly
4. **Commit with joy**: `git commit -m 'Add more chess masti!'`
5. **Share the fun**: `git push origin feature/more-masti`
6. **Open a Pull Request** - Let's celebrate together!

### Guidelines

- Keep it fun and engaging
- Write code that brings joy to chess learning
- Test across devices - masti should work everywhere
- Follow TypeScript best practices
- Ensure all checks pass

## Citation

If you use Chess Masti AI in your research, blog posts, articles, or papers, please cite it as:

```bibtex
@software{hetamsaria2026chessmastiai,
  author       = {Hetamsaria, Aayan},
  title        = {Chess Masti AI: AI-Powered Chess Coaching},
  year         = {2026},
  url          = {https://github.com/AayanHetam/chess-coach-ai}
}
```

This project builds on the chess commentary dataset introduced by Jhamtani et al. (2018). If you use or reference the commentary aspects, please also cite their work:

```bibtex
@inproceedings{jhamtani-etal-2018-learning,
  title     = "Learning to Generate Move-by-Move Commentary for Chess Games from Large-Scale Social Forum Data",
  author    = "Jhamtani, Harsh and Gangal, Varun and Hovy, Eduard and Neubig, Graham and Berg-Kirkpatrick, Taylor",
  booktitle = "Proceedings of the 56th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)",
  month     = jul,
  year      = "2018",
  address   = "Melbourne, Australia",
  publisher = "Association for Computational Linguistics",
  url       = "https://aclanthology.org/P18-1154/",
  doi       = "10.18653/v1/P18-1154",
  pages     = "1661--1671"
}
```

## License

Chess Masti AI is licensed under the GNU Affero General Public License 3. See [COPYING.md](COPYING.md) for details.

## Citations & Acknowledgments

Chess Masti AI builds upon many amazing open-source projects and datasets. We're grateful to these creators and provide proper citations below.

### AI Models & APIs

#### OpenAI GPT Models
- Used for move explanations, puzzle explanations, and coaching commentary
- Models: GPT-4o, GPT-4o-mini
- Website: https://openai.com/

#### Anthropic Claude (Optional)
- Alternative AI model for coaching explanations
- Website: https://anthropic.com/

### Chess Engines

#### Stockfish
- Primary chess engine for position evaluation and move analysis
- Stockfish.js (WebAssembly version) v10.0.2
- https://stockfishchess.org/
- ```bibtex
@misc{stockfish,
  title = {Stockfish: A strong open-source chess engine},
  author = {Stockfish developers},
  year = {2024},
  url = {https://stockfishchess.org/}
}
```

#### Leela Chess Zero (Lc0)
- Neural network chess engine, optional for users
- https://lczero.org/
- ```bibtex
@misc{lczero,
  title = {Leela Chess Zero: A neural network chess engine},
  author = {Leela Chess Zero team},
  year = {2024},
  url = {https://lczero.org/}
}
```

#### Maia Chess
- Human-like neural network chess engine for predicting human moves
- McIlroy-Young et al. (2020)
- https://maiachess.com/
- ```bibtex
@inproceedings{mcilroy-young2020maia,
  title={Maia: A Human-like Neural Network Chess Engine},
  author={McIlroy-Young, Reid and Sen, Siddhartha and Yedidia, Jon and McKee, Kellan and Ghassemi, Marzyeh and Perkins, Risi and Leslie, David},
  booktitle={Advances in Neural Information Processing Systems},
  pages={8429--8440},
  year={2020},
  url={https://arxiv.org/abs/2009.04374}
}
```

### Datasets

#### Lichess Puzzle Database
- 90,599 tactical puzzles across 70 themes, CC0 licensed
- https://database.lichess.org/#puzzles
- ```bibtex
@misc{lichess_puzzles,
  title = {Lichess Puzzle Database},
  author = {Lichess},
  year = {2026},
  url = {https://database.lichess.org/},
  note = {CC0 licensed, last updated February 2026}
}
```

#### Chess Commentary Dataset
- Large-scale chess commentary from social forums
- Jhamtani et al. (ACL 2018)
- https://github.com/harsh19/ChessCommentaryGeneration
- ```bibtex
@inproceedings{jhamtani-etal-2018-learning,
  title     = {Learning to Generate Move-by-Move Commentary for Chess Games from Large-Scale Social Forum Data},
  author    = {Jhamtani, Harsh and Gangal, Varun and Hovy, Eduard and Neubig, Graham and Berg-Kirkpatrick, Taylor},
  booktitle = {Proceedings of the 56th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)},
  month     = {jul},
  year      = {2018},
  address   = {Melbourne, Australia},
  publisher = {Association for Computational Linguistics},
  url       = {https://aclanthology.org/P18-1154/},
  doi       = {10.18653/v1/P18-1154},
  pages     = {1661--1671}
}
```

### Libraries & Frameworks

#### Core Technologies
- **React 18** - UI framework
- **Next.js 15** - React framework
- **TypeScript** - Type-safe JavaScript
- **Material-UI (MUI) v7** - React component library

#### Chess Libraries
- **chess.js v1.3.1** - Chess game logic and validation
  - https://github.com/jhlywa/chess.js
- **react-chessboard v4.7.3** - Interactive chessboard component
  - https://github.com/Clariity/react-chessboard
- **stockfish.js v10.0.2** - WebAssembly Stockfish engine
  - https://github.com/nmrugg/stockfish.js

#### State Management & Data
- **Jotai v2.11.0** - Atomic state management
- **React Query (TanStack Query) v5.75.5** - Server state management
- **IndexedDB (idb v8.0.1)** - Client-side storage for puzzle progress

#### UI & Visualization
- **Recharts v2.15.0** - Chart library for analytics
- **React Markdown v10.1.0** - Markdown rendering
- **React Syntax Highlighter v15.6.1** - Code highlighting
- **TinyColor2 v1.6.0** - Color manipulation

#### Development Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript** - Static type checking

### Icons & Assets
- **Material Icons** - Icon set (Google)
- **Iconify** - Icon components
- **FontSource Roboto** - Font loading

### Deployment & Infrastructure
- **AWS Cloud Development Kit (CDK)** - Infrastructure as code
- **Vercel** - Hosting platform (if applicable)
- **Firebase** - Authentication and analytics (if applicable)

---

### Special Thanks

To the entire chess and open-source community that makes projects like this possible:
- Lichess for providing free, high-quality chess data and puzzles
- The Stockfish team for the world's strongest open-source chess engine
- The Maia research team for human-like chess AI
- All contributors to the chess.js and react-chessboard libraries
- The React, Next.js, and TypeScript teams for amazing developer tools

---

<p align="center">
Made with chess and passion by chess lovers, for chess lovers.<br/>
<em>Let's make chess fun together!</em>
</p>
