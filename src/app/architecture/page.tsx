import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  AEO_TOKENS,
  AnswerBlock,
  Breadcrumb,
  CtaButton,
  H1,
  PageShell,
  ProseBlock,
  SectionHeading,
  glassCard,
} from "@/app/_seo/aeoUi";

export const metadata: Metadata = {
  title: "Chess Masti AI — architecture (Stockfish 17, Claude, Maia-2, Neo4j)",
  description:
    "Next.js 15 on Vercel, Stockfish 17 WASM, two-tier Claude, Maia-2 on Hugging Face, hallucination validator, Neo4j with FEN cosine re-ranking.",
  alternates: { canonical: "https://chessmasti.com/architecture" },
  openGraph: {
    title: "Chess Masti AI architecture",
    description:
      "Stockfish 17 WASM, two-tier Claude, Maia-2, Neo4j with FEN cosine re-ranking, hallucination validator.",
    url: "https://chessmasti.com/architecture",
    type: "article",
    siteName: "Chess Masti AI",
    images: [
      {
        url: "https://chessmasti.com/social-networks-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Chess Masti AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ChessMastiAI",
    creator: "@ChessMastiAI",
    title: "Chess Masti AI architecture",
    description: "Engineering deep-dive on the chess coaching pipeline.",
    images: ["https://chessmasti.com/social-networks-1200x630.png"],
  },
};

const techArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "Chess Masti AI architecture",
  description:
    "Engineering description of the chess coaching pipeline: Stockfish 17 WASM, two-tier Claude, Maia-2, hallucination validator, Neo4j with FEN cosine re-ranking.",
  author: { "@type": "Person", name: "Aayan Hetamsaria" },
  url: "https://chessmasti.com/architecture",
  mainEntityOfPage: "https://chessmasti.com/architecture",
  isPartOf: { "@id": "https://chessmasti.com/#website" },
  about: { "@id": "https://chessmasti.com/#software-app" },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://chessmasti.com/",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Architecture",
      item: "https://chessmasti.com/architecture",
    },
  ],
};

const codeInline = {
  background: "rgba(255,255,255,0.08)",
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: "0.9em",
} as const;

const ulSx = {
  pl: 3,
  lineHeight: 1.9,
  color: "rgba(255,255,255,0.7)",
  "& li": { mb: 1.5 },
} as const;

export default function ArchitecturePage() {
  return (
    <PageShell>
      <script
        id="techarticle-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleJsonLd) }}
      />
      <script
        id="breadcrumb-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <Breadcrumb here="Architecture" />

      <H1>Architecture</H1>

      <AnswerBlock>
        Chess Masti AI is built around one mental model: every chess fact in a
        coaching response must be derivable from an authoritative source, not
        from the LLM&apos;s parameters. This page walks through the pieces that
        enforce that.
      </AnswerBlock>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Application layer</SectionHeading>
        <ProseBlock>
          Next.js 15 (App Router for API + new content surfaces, Pages Router
          for legacy interactive pages), TypeScript, deployed on Vercel. Sentry
          for error monitoring. Auth is a signed JWT in an httpOnly cookie (
          <Box component="code" sx={codeInline}>
            cm_session
          </Box>
          ); email/password uses bcrypt; Google OAuth is server-routed through
          chessmasti.com so the browser never hits Firebase domains directly.
        </ProseBlock>
        <ProseBlock>Persistence is split across three layers:</ProseBlock>
        <Box component="ul" sx={ulSx}>
          <li>
            <strong style={{ color: "#fff" }}>Firestore</strong> (server-side,
            via Firebase Admin SDK) for user accounts, saved games, and the
            openings repertoire.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>IndexedDB</strong> (browser, via{" "}
            <Box component="code" sx={codeInline}>
              idb
            </Box>
            ) for puzzle progress and SM-2 spaced-repetition state.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>Neo4j Aura</strong> for the puzzle
            graph (described below).
          </li>
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Engine layer (in-browser)</SectionHeading>
        <ProseBlock>
          <strong style={{ color: "#fff" }}>Stockfish 17</strong> ships as a
          WebAssembly worker. It evaluates positions on your machine, not on our
          servers, which means no rate limit, no quota, and no privacy concern
          about your game data leaving the browser for analysis. We layer three
          structured passes on top of raw eval output:
        </ProseBlock>
        <Box component="ol" sx={ulSx}>
          <li>
            <strong style={{ color: "#fff" }}>Tactical motif detection</strong>{" "}
            — pins, forks, skewers, discovered attacks, back-rank patterns,
            deflections.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>
              Candidate-move gap analysis
            </strong>{" "}
            — how large was the eval gap between the move played and
            Stockfish&apos;s preferred line, and was the preferred line forcing
            or quiet?
          </li>
          <li>
            <strong style={{ color: "#fff" }}>Branch-point analysis</strong> —
            was this move the position&apos;s decision pivot?
          </li>
        </Box>
        <ProseBlock>
          The LLM is never given the raw board. It receives a structured digest
          from this layer.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>LLM layer (server-side)</SectionHeading>
        <ProseBlock>Two tiers, selected by latency budget:</ProseBlock>
        <Box component="ul" sx={ulSx}>
          <li>
            <strong style={{ color: "#fff" }}>Flagship: Claude Sonnet.</strong>{" "}
            Deep multi-section game analysis. Used by{" "}
            <Box component="code" sx={codeInline}>
              /api/enhanced-analysis
            </Box>
            .
          </li>
          <li>
            <strong style={{ color: "#fff" }}>Fast: Claude Haiku.</strong>{" "}
            Sub-5-second follow-up chat. Used by{" "}
            <Box component="code" sx={codeInline}>
              /api/chat
            </Box>
            . The flagship analysis call writes a server-side context cache
            keyed by{" "}
            <Box component="code" sx={codeInline}>
              contextId
            </Box>
            ; subsequent fast-tier calls hit that cache instead of
            reconstructing from scratch.
          </li>
        </Box>
        <ProseBlock>
          Every server-side LLM call funnels through a single{" "}
          <Box component="code" sx={codeInline}>
            callLLM(tier)
          </Box>{" "}
          function. Callsites pass a tier (
          <Box component="code" sx={codeInline}>
            &quot;flagship&quot; | &quot;fast&quot;
          </Box>
          ), never a model name — that boundary is what makes model upgrades
          safe.
        </ProseBlock>
        <ProseBlock>
          The system prompt is centralized and versioned (
          <Box component="code" sx={codeInline}>
            PROMPT_VERSION
          </Box>
          ), so before/after evals on coaching quality are reproducible.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Validator layer</SectionHeading>
        <ProseBlock>
          The piece that most &quot;AI chess coach&quot; products skip. After
          the LLM returns and before the response renders, a validator:
        </ProseBlock>
        <Box component="ol" sx={ulSx}>
          <li>
            Parses the response for every piece reference (e.g. &quot;the rook
            on f1&quot;), square reference (e.g. &quot;control of d4&quot;), and
            SAN move (e.g. &quot;11. d5!&quot;).
          </li>
          <li>
            Loads the live{" "}
            <Box component="code" sx={codeInline}>
              chess.js
            </Box>{" "}
            board state for the position the user is asking about.
          </li>
          <li>
            Checks each claim. Is there a rook on f1? Is d5 a legal move in this
            position? Does the bishop on c4 actually attack h7?
          </li>
          <li>Discards or rewrites claims that don&apos;t check out.</li>
        </Box>
        <ProseBlock>
          The validator runs unconditionally. It is the reason coaching output
          is safe to act on during a game.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Maia-2 microservice</SectionHeading>
        <ProseBlock>
          Twin Bot uses <strong style={{ color: "#fff" }}>Maia-2</strong>{" "}
          (NeurIPS 2024), a neural network trained on Lichess data to predict
          human moves at a target Elo. We don&apos;t run the model in our
          application backend — it lives as a FastAPI/PyTorch microservice on
          Hugging Face Spaces, called via an API proxy from Vercel. A daily cron
          pings the Hugging Face endpoint to keep it warm. Twin Bot can
          optionally be seeded with a public Lichess username&apos;s opening
          tree so the bot mirrors a specific player&apos;s repertoire as well as
          their target rating.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Retrieval layer (Neo4j)</SectionHeading>
        <ProseBlock>
          The puzzle graph in{" "}
          <strong style={{ color: "#fff" }}>Neo4j Aura</strong> holds 100,000+
          Lichess puzzles, filtered by quality (popularity ≥ 60, plays ≥ 50,
          rating deviation ≤ 120) and structured across 46 tactical themes and 4
          difficulty bands.
        </ProseBlock>
        <ProseBlock>Recommendation is a two-stage process:</ProseBlock>
        <Box component="ol" sx={ulSx}>
          <li>
            <strong style={{ color: "#fff" }}>Graph traversal.</strong> Given
            the user&apos;s skill band, the tactical theme of their mistake, and
            their recent solve history, traverse the graph to find candidate
            puzzles in the right band and theme.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>
              49-dimensional FEN cosine-similarity re-ranking.
            </strong>{" "}
            Project the FEN of the position the user just lost into a
            49-dimensional vector, project each candidate puzzle&apos;s start
            FEN into the same space, rank by cosine similarity, return the top
            3.
          </li>
        </Box>
        <ProseBlock>
          The output: training that matches the geometry of your mistake, not
          just its category.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Live play</SectionHeading>
        <ProseBlock>
          Lichess OAuth 2.0 PKCE for sign-in. Dual-SSE streams (one for the
          game, one for board events) mirror the Lichess live game into the app,
          so you can analyse, chat with the coach, and play in the same surface.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Things we don&apos;t do</SectionHeading>
        <ProseBlock>
          Free coaching. No advertising. No selling game data. No fine-tuned
          proprietary chess LLM (a fine-tuned LLM still hallucinates; the
          validator is what we trust).
        </ProseBlock>
      </Box>

      <Box
        sx={{
          ...glassCard,
          textAlign: "center",
          borderColor: `${AEO_TOKENS.ember}22`,
        }}
      >
        <Typography
          sx={{
            fontWeight: 700,
            color: "#fff",
            fontSize: { xs: "1.25rem", md: "1.5rem" },
            mb: 1,
          }}
        >
          Related reading
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 3 }}>
          The user-facing pipeline overview, the comparison, and the FAQ.
        </Typography>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <CtaButton href="/how-it-works">How it works</CtaButton>
          <CtaButton href="/vs">vs other coaches</CtaButton>
          <CtaButton href="/faq">FAQ</CtaButton>
          <CtaButton href="/free-ai-chess-coach" primary>
            Try the coach
          </CtaButton>
        </Box>
      </Box>
    </PageShell>
  );
}
