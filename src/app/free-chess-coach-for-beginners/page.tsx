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

const URL = "https://chessmasti.com/free-chess-coach-for-beginners";
const HERE = "Free Chess Coach for Beginners";

export const metadata: Metadata = {
  title: { absolute: "Free Chess Coach for Beginners | Stockfish + AI Explanations" },
  description:
    "A free chess coach for beginners: paste your game, get plain-language explanations of your mistakes, and drill the patterns you keep missing. No subscription, no signup.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Free Chess Coach for Beginners | Chess Masti AI",
    description: "Plain-language game review and mistake drills. Free, no signup.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Chess Coach for Beginners | Chess Masti AI",
    description: "Plain-language game review and mistake drills. Free, no signup.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function FreeChessCoachForBeginnersPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Free Chess Coach for Beginners | Stockfish + AI Explanations",
      url: URL,
      description:
        "Chess Masti AI is a free AI chess coach designed to work well for beginners: plain-language explanations, no jargon required.",
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

      <H1>Free Chess Coach for Beginners</H1>

      <AnswerBlock>
        The best free chess coach for beginners is one that explains things in plain language and
        doesn&apos;t assume you already speak engine. Chess Masti AI is free, requires no signup,
        and explains your mistakes the way a patient teacher would: what you were trying to do,
        what went wrong, and exactly what to try next time. Paste a game and start in under a
        minute.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Try the beginner-friendly coach
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What beginners actually need</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              title: "Plain explanations, not just numbers",
              desc: "Engine output like '+1.2' or 'Best: Nf3' is useless if you don't know why. A coach for beginners explains the *idea* — protect the king, develop a piece, watch the f7 weakness — not just the number.",
            },
            {
              title: "Identifies your real mistakes",
              desc: "Beginners blunder pieces, miss tactics, and play move-by-move with no plan. A good coach catches all three patterns and names them clearly. Chess Masti's mistake-detection finds the moves where your eval dropped the most and explains each one.",
            },
            {
              title: "Repetition that sticks",
              desc: "Understanding a mistake once doesn't fix it. Practicing the exact pattern five times does. Chess Masti turns each blunder into a puzzle automatically so you can drill the exact position that confused you.",
            },
            {
              title: "No paywalls in the middle",
              desc: "Most chess sites have free tiers that hit a wall right when the coaching gets useful. Chess Masti is fully free — no analysis quotas, no Diamond-locked features, no credit cap.",
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
        <SectionHeading>A beginner-friendly review workflow</SectionHeading>
        <ProseBlock>
          1. Play your game wherever — Lichess, Chess.com, or in person. If in person, transcribe
          the moves into a PGN; one game takes a few minutes.
        </ProseBlock>
        <ProseBlock>
          2. Paste the PGN into Chess Masti. Skim the eval bar. Find the move with the biggest drop.
          That&apos;s where the lesson is — not in the small mistakes.
        </ProseBlock>
        <ProseBlock>
          3. Read the coach&apos;s explanation. Ask a follow-up question if anything&apos;s unclear:
          &quot;what would have been better than my move?&quot; or &quot;is there a name for this
          kind of mistake?&quot;
        </ProseBlock>
        <ProseBlock>
          4. Convert that one moment into a puzzle. Drill it now. Don&apos;t analyze every move —
          one good lesson per game is enough.
        </ProseBlock>
      </Box>

      <CrossLinkCallout
        title="See the full free AI chess coach page"
        blurb="The main page covers everything Chess Masti does — game analysis, mistake puzzles, chat, opponent scouting — and how the engine + AI pipeline works."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Get a coach that explains things clearly" sub="Paste a PGN. No signup. Built to work for beginners." />
    </PageShell>
  );
}
