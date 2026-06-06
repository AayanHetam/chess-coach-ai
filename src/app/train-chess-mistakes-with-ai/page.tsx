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

const URL = "https://chessmasti.com/train-chess-mistakes-with-ai";
const HERE = "Train Chess Mistakes with AI";

export const metadata: Metadata = {
  title: { absolute: "Train Your Chess Mistakes with AI | Drill the Patterns You Keep Missing" },
  description:
    "Train your own chess mistakes with AI. Chess Masti turns the moves you blundered into puzzle drills so you practice the exact patterns you keep missing. Free.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Train Your Chess Mistakes with AI | Chess Masti AI",
    description: "Your blunders become drills. Practice the exact patterns you keep missing. Free.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Train Your Chess Mistakes with AI | Chess Masti AI",
    description: "Your blunders become drills. Practice the exact patterns you keep missing. Free.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function TrainChessMistakesWithAiPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Train Your Chess Mistakes with AI | Drill the Patterns You Keep Missing",
      url: URL,
      description:
        "Chess Masti AI turns your real blunders into puzzle drills so you practice the patterns you actually keep missing.",
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

      <H1>Train Your Chess Mistakes with AI</H1>

      <AnswerBlock>
        The fastest way to improve at chess is to practice the exact patterns you keep missing —
        not random puzzles from a corpus. Chess Masti AI turns your own blunders into puzzle
        drills automatically: lose to a knight fork once, practice five fork positions next. The
        training loop is what moves rating points; pattern recognition is built one mistake at a
        time.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Analyze a game and drill the mistakes
        </CtaButton>
        <CtaButton href="/practice">Open practice mode</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Why your mistakes are the best puzzles</SectionHeading>
        <ProseBlock>
          Standard puzzle sites give you a random sequence — a back-rank mate from someone
          else&apos;s game, a Russian endgame from 1985. The patterns are real but they aren&apos;t
          your patterns. Your blunders cluster: most players lose to the same handful of mistakes
          over and over.
        </ProseBlock>
        <ProseBlock>
          Drilling random tactics is fine. Drilling your own tactics is faster. The pattern your
          brain just failed to see in a real game is the exact pattern most worth reinforcing while
          it&apos;s fresh.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>How Chess Masti turns mistakes into drills</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              n: 1,
              title: "Find the moment",
              desc: "Stockfish evaluates your game. The biggest evaluation swings are the moments worth training — blunders that lost material or missed a winning tactic.",
            },
            {
              n: 2,
              title: "Convert the position",
              desc: "Chess Masti takes the position from one move before your mistake. Now it's a puzzle: the engine's best move is the solution. You see it before you played; now you play it again with the answer not yet visible.",
            },
            {
              n: 3,
              title: "Drill it",
              desc: "Solve the puzzle. If you got it right this time, the pattern is one repetition stronger. If you got it wrong, try again — the system shows the solution and explains why.",
            },
            {
              n: 4,
              title: "Pattern stacks",
              desc: "Over a few games, the same kinds of mistakes start clustering. Knight forks. Back-rank weakness. Passed pawn miscalculation. The drill set self-organizes around your real weaknesses.",
            },
          ].map((item) => (
            <Box key={item.n} sx={{ ...glassCard, display: "flex", gap: 3, alignItems: "flex-start" }}>
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
                {item.n}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 700, color: "#fff", mb: 0.5 }}>{item.title}</Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.9rem", lineHeight: 1.8 }}>
                  {item.desc}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What this is not</SectionHeading>
        <ProseBlock>
          This is not a replacement for tactics training on a curated set. Chess Masti&apos;s drill
          set is built from your real games — if you only play 10 games a month, you only have 10
          games&apos; worth of mistakes to drill. That&apos;s often enough for the patterns to
          accumulate, but for raw volume, pair it with a tactics trainer (Lichess puzzles,
          Chessable, etc.).
        </ProseBlock>
        <ProseBlock>
          This is also not a spaced-repetition system in the strict Anki sense. The drills are
          available for repeat practice, but interval-based scheduling is on the roadmap, not in
          the product today.
        </ProseBlock>
      </Box>

      <CrossLinkCallout
        title="See the full pipeline"
        blurb="The free AI chess coach page covers how the engine + AI + mistake-detection + puzzle generation all fit together."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Drill your own mistakes" sub="Paste a PGN. Find your blunder. Practice the exact pattern. Free." />
    </PageShell>
  );
}
