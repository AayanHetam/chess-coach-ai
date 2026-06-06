import type { Metadata } from "next";
import {
  AnswerBlock,
  Breadcrumb,
  CrossLinkCallout,
  CtaButton,
  CtaRow,
  FooterCta,
  H1,
  PageShell,
  ProseBlock,
  SectionHeading,
  buildBreadcrumbJsonLd,
  buildWebPageJsonLd,
  glassCard,
} from "@/app/_seo/aeoUi";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const URL = "https://chessmasti.com/stockfish-ai-chess-coach";
const HERE = "Stockfish + AI Chess Coach";

export const metadata: Metadata = {
  title: { absolute: "Stockfish AI Chess Coach | Engine Accuracy, AI Explanations" },
  description:
    "Stockfish is the strongest open-source chess engine. Chess Masti AI pairs Stockfish evaluation with Claude AI explanations to give you a free Stockfish AI chess coach.",
  alternates: {
    canonical: "https://chessmasti.com/free-ai-chess-coach",
  },
  openGraph: {
    title: "Stockfish AI Chess Coach | Chess Masti AI",
    description: "Stockfish for accuracy, Claude AI for explanations. Free.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stockfish AI Chess Coach | Chess Masti AI",
    description: "Stockfish for accuracy, Claude AI for explanations. Free.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function StockfishAiChessCoachPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Stockfish AI Chess Coach | Engine Accuracy, AI Explanations",
      url: URL,
      description:
        "Chess Masti AI pairs Stockfish engine evaluation with Claude AI explanations. Free Stockfish AI chess coach.",
    }),
    buildBreadcrumbJsonLd({ here: HERE, url: URL }),
  ];

  return (
    <PageShell>
      {schemas.map((schema, i) => (
        <script
          key={i}
          id={`ld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <Breadcrumb here={HERE} />

      <H1>Stockfish AI Chess Coach</H1>

      <AnswerBlock>
        Stockfish is the world&apos;s strongest open-source chess engine. Chess Masti AI is a free
        Stockfish AI chess coach: it runs Stockfish directly in your browser for accuracy, then uses
        Claude AI to explain what the engine is seeing. The result is an AI coach whose advice is
        engine-backed, not engine-flavored guesswork — and the chess claims are validated against
        Stockfish before they reach you.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Try the Stockfish coach
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Why Stockfish?</SectionHeading>
        <ProseBlock>
          Stockfish has been the strongest open-source engine for over a decade. It is what every
          serious chess site uses for evaluation — Lichess, Chess.com analysis features, broadcast
          eval bars on grandmaster games. When something says &quot;the engine evaluates this at
          +0.7,&quot; it is almost always Stockfish.
        </ProseBlock>
        <ProseBlock>
          For an AI chess coach, that matters because the AI&apos;s explanations are only as good as
          the engine it builds on. A coach that pairs Stockfish with a strong LLM gets you ground-truth
          accuracy plus natural-language teaching in one loop.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>How Chess Masti uses Stockfish</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              title: "Runs in your browser",
              desc: "Stockfish ships as a WebAssembly worker. Your games are evaluated locally — no upload, no server round-trip for engine work, no game data leaving your device for the evaluation step.",
            },
            {
              title: "Engine output, then explanation",
              desc: "For each move, Stockfish produces an evaluation and a principal variation. Claude AI reads that output before writing the explanation, so the coach never makes up moves the engine didn't suggest.",
            },
            {
              title: "Claims are validated",
              desc: "Before showing you an explanation, Chess Masti's validator pipeline checks tactical and positional claims against Stockfish output. If the LLM tries to assert something the engine doesn't support, the claim is rewritten or dropped.",
            },
            {
              title: "Mistake-based puzzles use engine truth",
              desc: "When your blunders become drills, the solution is the engine's best move — not a guess. The drill is correct by construction.",
            },
          ].map((item) => (
            <Box key={item.title} sx={glassCard}>
              <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>{item.title}</Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.9rem", lineHeight: 1.8 }}>
                {item.desc}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Stockfish alone vs. Stockfish + AI coach</SectionHeading>
        <ProseBlock>
          Running Stockfish by itself — through the Lichess analysis board or a desktop GUI like
          ChessBase — gives you the strongest possible evaluation. What you do not get is an
          explanation of why a move is best, what plan it serves, or what theme you missed.
        </ProseBlock>
        <ProseBlock>
          Pairing Stockfish with an AI coach closes that gap. The engine still tells you the truth;
          the AI translates it into something you can act on. For learners and improving players,
          the translation layer is where the actual training value comes from.
        </ProseBlock>
      </Box>

      <CrossLinkCallout
        title="See the full pipeline"
        blurb="The free AI chess coach page covers how Stockfish, Claude, and the validator pipeline fit together end-to-end, plus comparison to other free analysis tools."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta
        title="Coach yourself with Stockfish + AI"
        sub="Paste a PGN. Engine runs locally. Coach explains every critical move."
      />
    </PageShell>
  );
}
