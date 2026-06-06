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
  AEO_TOKENS,
} from "@/app/_seo/aeoUi";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const URL = "https://chessmasti.com/how-to-analyze-chess-com-game-with-ai";
const HERE = "How to Analyze a Chess.com Game with AI";

const STEPS = [
  {
    n: 1,
    title: "Open the finished game on Chess.com",
    desc: "Go to chess.com/games/archive (or your profile → Games) and click into the game you want to review. Any time control works — bullet to daily.",
  },
  {
    n: 2,
    title: "Export the PGN",
    desc: "Below the move list, click the share icon (or \"...\" menu on mobile). Choose \"PGN\" and either download or copy. You can also append /pgn4 to the game URL on desktop to grab the PGN directly. PGN format is universal — every analysis tool reads it.",
  },
  {
    n: 3,
    title: "Open Chess Masti's analysis board",
    desc: "Free, no login required. The board accepts a PGN, FEN, or starts blank. Paste the PGN from step 2. Stockfish starts evaluating in your browser immediately — your game stays on your machine for the engine work.",
  },
  {
    n: 4,
    title: "Walk through the critical moves",
    desc: "Click forward through the moves. At each significant evaluation swing the AI coach explains what happened in plain language: what your plan was, where the mistake came in, and what the right idea was. Claims are validated against Stockfish before they're shown, so the coach doesn't make up moves.",
  },
  {
    n: 5,
    title: "Ask follow-up questions",
    desc: "If you don't understand why a move was bad — \"is g6 always weak here?\" or \"why couldn't I take the bishop?\" — ask in plain language. The chat holds the whole game in context, so you can reference earlier moves without re-explaining.",
  },
  {
    n: 6,
    title: "Drill the patterns you missed",
    desc: "Your biggest blunders become puzzles automatically. Practice the exact positions until the pattern sticks. This is what actually moves your rating — explanation without practice is comfort food.",
  },
];

export const metadata: Metadata = {
  title: { absolute: "How to Analyze a Chess.com Game with AI | Step-by-Step Guide" },
  description:
    "Step-by-step guide to analyzing your Chess.com games with an AI coach. Export PGN, paste in, get Stockfish + AI explanations — free, no login required.",
  alternates: { canonical: URL },
  openGraph: {
    title: "How to Analyze a Chess.com Game with AI | Chess Masti AI",
    description: "Export your Chess.com PGN, paste it in, get engine + AI explanations.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Analyze a Chess.com Game with AI | Chess Masti AI",
    description: "Export your Chess.com PGN, paste it in, get engine + AI explanations.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function HowToAnalyzeChessComGameWithAiPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "How to Analyze a Chess.com Game with AI | Step-by-Step Guide",
      url: URL,
      description: "How to use Chess Masti AI (free) to analyze a Chess.com game.",
    }),
    buildBreadcrumbJsonLd({ here: HERE, url: URL }),
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "How to Analyze a Chess.com Game with AI",
      description: "Export the PGN from Chess.com, paste it into Chess Masti, get free analysis.",
      step: STEPS.map((s) => ({
        "@type": "HowToStep",
        position: s.n,
        name: s.title,
        text: s.desc,
      })),
    },
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

      <H1>How to Analyze a Chess.com Game with AI</H1>

      <AnswerBlock>
        To analyze a Chess.com game with AI: open the game, export the PGN via the share menu, then
        paste it into a free AI chess coach like Chess Masti AI. You&apos;ll get Stockfish
        evaluation plus natural-language explanations of every critical move — without using your
        Chess.com Game Review quota or paying for Diamond. The engine runs in your browser; the
        game data never has to leave your device for the analysis step.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Open the analysis board
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>The 6 steps</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {STEPS.map((step) => (
            <Box key={step.n} sx={{ ...glassCard, display: "flex", gap: 3, alignItems: "flex-start" }}>
              <Box
                sx={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: `${AEO_TOKENS.ember}22`,
                  border: `1px solid ${AEO_TOKENS.ember}44`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  color: AEO_TOKENS.ember,
                  fontSize: "0.9rem",
                }}
              >
                {step.n}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 700, color: "#fff", mb: 0.5 }}>{step.title}</Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.9rem", lineHeight: 1.8 }}>
                  {step.desc}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Chess.com Game Review vs. an external AI coach</SectionHeading>
        <ProseBlock>
          Chess.com&apos;s built-in Game Review is solid and stays in-platform. The trade-offs:
          some features are gated behind a Diamond membership, and the free tier limits how many
          reviews per day. If you want unlimited reviews without paying, exporting the PGN to a
          free external AI coach is the cleanest path.
        </ProseBlock>
        <ProseBlock>
          The engine work is comparable either way — both use Stockfish. What you&apos;re trading
          is in-platform convenience for unlimited free use plus, in Chess Masti&apos;s case, a
          training loop that turns blunders into puzzles.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Tips for better Chess.com game analysis</SectionHeading>
        <Box sx={glassCard}>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1 }}>
            Pick the loss, not the win.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 2.5, lineHeight: 1.7 }}>
            Wins teach less than losses. Analyze the games you wish you could replay.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1 }}>
            Bring your reasoning.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 2.5, lineHeight: 1.7 }}>
            If you remember what you were thinking on the move that lost the game, type it into the
            chat. The coach can respond to your actual logic instead of guessing.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1 }}>
            Convert the worst blunder to a puzzle.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
            One drill per game review keeps the habit lightweight. The pattern repetition is what
            actually compounds.
          </Typography>
        </Box>
      </Box>

      <CrossLinkCallout
        title="Want the full pipeline overview?"
        blurb="The free AI chess coach page covers the Stockfish + Claude + validator architecture, the FAQ, and how this compares to other analysis tools."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Analyze your Chess.com game now" sub="Paste the PGN. No login. No quota." />
    </PageShell>
  );
}
