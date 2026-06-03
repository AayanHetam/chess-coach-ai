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
} from "@/app/_seo/aeoUi";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const URL = "https://chessmasti.com/free-chess-analysis";
const HERE = "Free Chess Analysis";

export const metadata: Metadata = {
  title: { absolute: "Free Chess Analysis | Stockfish + AI Explanations from Chess Masti" },
  description:
    "Free chess analysis means analyzing your games without paying for a subscription. Chess Masti AI runs Stockfish for accuracy and Claude AI for explanations — fully free.",
  alternates: {
    canonical: "https://chessmasti.com/free-ai-chess-coach",
  },
  openGraph: {
    title: "Free Chess Analysis | Chess Masti AI",
    description: "Analyze any chess game free. Stockfish accuracy plus AI explanations.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Chess Analysis | Chess Masti AI",
    description: "Analyze any chess game free. Stockfish accuracy plus AI explanations.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function FreeChessAnalysisPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Free Chess Analysis | Stockfish + AI Explanations from Chess Masti",
      url: URL,
      description:
        "Free chess analysis means analyzing your games without paying for a subscription. Chess Masti AI runs Stockfish and Claude AI — fully free.",
    }),
    buildBreadcrumbJsonLd({ here: HERE, url: URL }),
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

      <H1>Free Chess Analysis</H1>

      <AnswerBlock>
        Free chess analysis means analyzing your games without a subscription, credit cap, or move
        limit. Chess Masti AI offers fully free chess analysis powered by Stockfish (the world&apos;s
        strongest open-source engine) and Claude AI (which explains the engine output in plain
        language). Paste a PGN from Lichess, Chess.com, or any other source. The engine runs in your
        browser. The coach explains every critical move.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Analyze a game now
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What does free chess analysis actually include?</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              title: "Full Stockfish evaluation",
              desc: "Every move evaluated by Stockfish. Centipawn loss, best line, and move classification (inaccuracy, mistake, blunder) for the whole game. Engine runs locally in your browser via WebAssembly — your games stay private.",
            },
            {
              title: "Natural-language explanations",
              desc: "Claude AI reads the engine output and explains what happened. Not just 'best move is Nf3' but 'the knight protects e5 and prepares a kingside attack while denying Black the d4 break.'",
            },
            {
              title: "Mistake puzzles",
              desc: "Your worst blunders automatically become drills. Practice the exact positions you keep getting wrong until the pattern sticks.",
            },
            {
              title: "Follow-up questions",
              desc: "Ask the coach anything about the position. The chat holds context across your whole game so you can dig into the specific moment that confused you.",
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
        <SectionHeading>How to analyze a chess game free</SectionHeading>
        <ProseBlock>
          1. Copy the PGN from Lichess, Chess.com, or your tournament platform. Most sites have an
          export-PGN button on the game review page.
        </ProseBlock>
        <ProseBlock>
          2. Paste the PGN into Chess Masti&apos;s analysis board. The engine starts evaluating
          immediately. There is no upload step and no server round-trip for the engine work.
        </ProseBlock>
        <ProseBlock>
          3. Click through the moves. At critical moments, the coach explains what happened. Convert
          any mistake into a puzzle with one tap if you want to drill it later.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Why use this instead of Lichess analysis?</SectionHeading>
        <ProseBlock>
          Lichess analysis is excellent and free — it&apos;s the gold standard for raw engine
          evaluation. What it does not do is explain anything in plain language. You get the
          numbers; you have to figure out what they mean yourself.
        </ProseBlock>
        <ProseBlock>
          Chess Masti adds the explanation layer on top of comparable engine accuracy. If you want
          numbers, Lichess is great. If you want to learn from your games without becoming an
          engine-output translator, the explanation layer matters.
        </ProseBlock>
      </Box>

      <CrossLinkCallout
        title="See how the full free AI chess coach works"
        blurb="The exact-match page covers the engine + AI pipeline in more detail, including how Chess Masti verifies its explanations against Stockfish before showing them to you."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Start your free chess analysis" sub="Paste a PGN. The engine runs in your browser." />
    </PageShell>
  );
}
