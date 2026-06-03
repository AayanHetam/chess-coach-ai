import type { Metadata } from "next";
import Script from "next/script";
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

const URL = "https://chessmasti.com/how-to-analyze-lichess-game-with-ai";
const HERE = "How to Analyze a Lichess Game with AI";

const STEPS = [
  {
    n: 1,
    title: "Find the game on Lichess",
    desc: "Open the game on lichess.org. Any rated, casual, or import will work — the analysis only needs the PGN.",
  },
  {
    n: 2,
    title: "Open the PGN export",
    desc: "Click the gear icon below the board, then choose \"PGN\" → \"Copy PGN to clipboard.\" On mobile, the same menu lives behind the share button. You can also use the URL trick: append /pgn to the game URL to download the PGN directly.",
  },
  {
    n: 3,
    title: "Paste into the AI coach",
    desc: "Open Chess Masti's analysis board. Paste the PGN into the import field. The engine starts evaluating immediately — Stockfish runs in your browser, so the game stays on your machine for the engine step.",
  },
  {
    n: 4,
    title: "Read the explanations at critical moves",
    desc: "Click through the moves. At each significant evaluation swing, the AI coach explains what happened: the plan, the mistake, the theme you missed. The explanations are validated against the engine before they're shown, so they don't hallucinate moves.",
  },
  {
    n: 5,
    title: "Ask follow-up questions",
    desc: "If something isn't clear — \"why was castling kingside bad here?\" or \"what's the right plan against this pawn structure?\" — ask the coach in plain language. The chat holds context across the whole game.",
  },
  {
    n: 6,
    title: "Convert blunders into puzzles",
    desc: "Your worst mistakes become drills. Practice the exact positions until the pattern sticks. This is where rating points come from — explanation without practice is comfort food.",
  },
];

export const metadata: Metadata = {
  title: { absolute: "How to Analyze a Lichess Game with AI | Step-by-Step Guide" },
  description:
    "Step-by-step guide to analyzing a Lichess game with an AI chess coach. Export the PGN, paste it in, get engine analysis and explanations — free.",
  alternates: { canonical: URL },
  openGraph: {
    title: "How to Analyze a Lichess Game with AI | Chess Masti AI",
    description: "Step-by-step: export your Lichess PGN, paste it in, get engine + AI explanations.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Analyze a Lichess Game with AI | Chess Masti AI",
    description: "Step-by-step: export your Lichess PGN, paste it in, get engine + AI explanations.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function HowToAnalyzeLichessGameWithAiPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "How to Analyze a Lichess Game with AI | Step-by-Step Guide",
      url: URL,
      description: "How to use Chess Masti AI (free) to analyze a Lichess game step by step.",
    }),
    buildBreadcrumbJsonLd({ here: HERE, url: URL }),
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "How to Analyze a Lichess Game with AI",
      description:
        "Export the PGN from Lichess, paste it into Chess Masti, and get free engine + AI analysis.",
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
        <Script
          key={i}
          id={`ld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <Breadcrumb here={HERE} />

      <H1>How to Analyze a Lichess Game with AI</H1>

      <AnswerBlock>
        To analyze a Lichess game with AI: open the game on lichess.org, click the gear icon and
        copy the PGN, then paste it into a free AI chess coach like Chess Masti AI. You&apos;ll get
        Stockfish engine evaluation and natural-language explanations for every critical move — all
        free, no account required, and your game data never leaves the browser for the engine step.
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
        <SectionHeading>Lichess&apos; built-in analysis vs. an AI coach</SectionHeading>
        <ProseBlock>
          Lichess&apos;s computer analysis is excellent and free — it uses Stockfish and gives you
          move classifications (inaccuracy, mistake, blunder). What it doesn&apos;t do is explain
          anything in plain language. You see the eval numbers; the interpretation is on you.
        </ProseBlock>
        <ProseBlock>
          An AI chess coach adds the interpretation layer. The engine work is comparable; the
          difference is whether you walk away from the review knowing why the move was bad or just
          that it was.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Tips that help the AI analysis</SectionHeading>
        <Box sx={glassCard}>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1 }}>
            Annotate as you import.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 2.5, lineHeight: 1.7 }}>
            If you remember what you were thinking on a critical move, mention it. The coach can
            address your actual reasoning instead of guessing.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1 }}>
            Focus on the worst 2–3 moments.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 2.5, lineHeight: 1.7 }}>
            Don&apos;t try to understand every move. The biggest evaluation swings teach the most.
            Ask the coach to explain them and convert them into puzzles.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1 }}>
            Compare openings, not just tactics.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
            Most rated losses start in the opening or transition phase. Ask the coach to identify
            the move where you fell out of preparation.
          </Typography>
        </Box>
      </Box>

      <CrossLinkCallout
        title="Want the deeper feature walkthrough?"
        blurb="The free AI chess coach page covers the pipeline (Stockfish + Claude + validator), the FAQ, and a fuller comparison to other tools."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Analyze your Lichess game now" sub="Paste the PGN. No account required to start." />
    </PageShell>
  );
}
