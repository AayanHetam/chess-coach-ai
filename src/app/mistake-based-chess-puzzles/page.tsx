import type { Metadata } from "next";
import Script from "next/script";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  AEO_TOKENS,
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
  glassCard,
} from "@/app/_seo/aeoUi";

const URL = "https://chessmasti.com/mistake-based-chess-puzzles";
const HERE = "Mistake-Based Chess Puzzles";

export const metadata: Metadata = {
  title: { absolute: "Mistake-Based Chess Puzzles | Free Puzzles from Your Own Games" },
  description:
    "Mistake-based chess puzzles are drills generated from positions you actually got wrong. Chess Masti AI turns your blunders into puzzles automatically, free.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Mistake-Based Chess Puzzles | Chess Masti AI",
    description:
      "Drill your own mistakes. Free puzzles generated from the positions you keep losing.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mistake-Based Chess Puzzles | Chess Masti AI",
    description: "Free chess puzzles generated from the positions you keep losing.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function MistakeBasedChessPuzzlesPage() {
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Mistake-Based Chess Puzzles | Free Puzzles from Your Own Games",
      url: URL,
      description:
        "Chess Masti AI turns the positions you lose into puzzle drills — free, engine-validated, and matched to your own mistakes via FEN cosine similarity over a 100,000-puzzle Neo4j graph.",
      isPartOf: { "@id": "https://chessmasti.com/#website" },
      about: { "@id": "https://chessmasti.com/#software-app" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Chess Masti AI",
          item: "https://chessmasti.com",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: HERE,
          item: URL,
        },
      ],
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

      <H1>Mistake-Based Chess Puzzles</H1>

      <AnswerBlock>
        Mistake-based chess puzzles are drills generated from the positions you actually got wrong
        in your own games — not a random corpus. Chess Masti AI automatically converts your
        biggest blunders into puzzles, then matches them against a 100,000-puzzle Neo4j graph by
        49-dimensional FEN cosine similarity so you drill the geometry of your specific mistake,
        not a generic theme bucket. Free, engine-validated, no subscription.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Analyze a game
        </CtaButton>
        <CtaButton href="/practice">Open practice mode</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Why mistake-based puzzles work better than random ones</SectionHeading>
        <ProseBlock>
          Standard puzzle apps give you a randomized sequence: a back-rank mate from someone
          else&apos;s game, a Russian endgame from 1985. The patterns are real but they aren&apos;t
          your patterns. Your blunders cluster — most players lose to the same handful of mistakes
          on repeat.
        </ProseBlock>
        <ProseBlock>
          Drilling the position your brain just failed to see is the highest-leverage repetition
          you can do, because the pattern is fresh and the mistake is yours. Drilling random
          tactics from someone else&apos;s corpus is fine; drilling your own is faster.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>How a mistake becomes a puzzle</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              n: 1,
              title: "Stockfish flags the blunder",
              desc: "Every move you played gets a centipawn-loss score. The moves with the biggest evaluation drop are the candidates — that's where the lesson is.",
            },
            {
              n: 2,
              title: "The position one move before becomes the puzzle",
              desc: "The puzzle prompt is the board state right before your mistake. Stockfish's preferred move is the solution. You see the position; you solve it without the answer visible.",
            },
            {
              n: 3,
              title: "Similarity search finds 3 nearby positions",
              desc: "The Neo4j graph of 100,000+ Lichess puzzles gets queried for puzzles in your skill band and the relevant tactical theme, then re-ranked by 49-dimensional FEN cosine similarity. The output: three puzzles whose geometry matches the one you just got wrong.",
            },
            {
              n: 4,
              title: "Drill them inline",
              desc: "Puzzles render directly inside the coaching message — same chat bubble, same chess board. No tab switch, no flow break. Solve, miss, solve again. The SM-2 spaced-repetition scheduler files the position away for later review.",
            },
          ].map((step) => (
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
        <SectionHeading>What this is not</SectionHeading>
        <ProseBlock>
          This is not a replacement for tactics training on a curated set. Chess Masti&apos;s
          mistake-puzzle set is built from your real games — if you only play 10 games a month,
          you only have 10 games&apos; worth of mistakes to drill. For raw volume, pair it with
          Lichess puzzles, Chessable, or Chess Tempo.
        </ProseBlock>
        <ProseBlock>
          Also worth flagging: not every mistake makes a clean puzzle. Strategic errors and
          positional drift don&apos;t convert to single-solution drills the way tactical blunders
          do. The puzzle generator skips those (correctly).
        </ProseBlock>
      </Box>

      <CrossLinkCallout
        title="See the bigger pipeline"
        blurb="Mistake puzzles are the training-loop half of the free AI chess coach. The other half is the engine-first explanation pipeline. The main page covers how Stockfish, Claude, and the validator fit together."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta
        title="Turn your mistakes into puzzles"
        sub="Paste a PGN. The biggest blunders become drills automatically. Free."
      />
    </PageShell>
  );
}
