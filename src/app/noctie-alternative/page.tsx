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

const URL = "https://chessmasti.com/noctie-alternative";
const HERE = "Noctie Alternative";

export const metadata: Metadata = {
  title: { absolute: "Noctie Alternative | Free AI Chess Coach with Engine-Backed Analysis" },
  description:
    "Looking for a Noctie alternative? Chess Masti AI is a free AI chess coach: Stockfish analysis, AI explanations, mistake-based puzzles, and opponent scouting.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Noctie Alternative | Chess Masti AI",
    description:
      "Noctie plays like a human at your level. Chess Masti AI coaches you through your games after you play. Different tools for different problems.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Noctie Alternative | Chess Masti AI",
    description:
      "Noctie plays like a human at your level. Chess Masti AI coaches you through your games after you play.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function NoctieAlternativePage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Noctie Alternative | Free AI Chess Coach with Engine-Backed Analysis",
      url: URL,
      description:
        "Chess Masti AI is a free AI chess coach alternative to Noctie that explains your games, validates claims against Stockfish, and turns mistakes into puzzles.",
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

      <H1>Noctie Alternative</H1>

      <AnswerBlock>
        Noctie is a humanlike chess sparring partner. Chess Masti AI is a free AI chess coach. They
        solve different problems: Noctie is for the practice game; Chess Masti is for the lesson
        afterward. If you came searching for &quot;Noctie alternative&quot; expecting a copycat,
        this is something different — and they pair well together.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Try Chess Masti free
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Who Noctie is for</SectionHeading>
        <ProseBlock>
          Noctie is a sparring partner. It plays chess in a humanlike style at a chosen strength,
          which makes it useful for practice against opponents who feel like people rather than the
          uncanny perfection of a maxed-out engine. If you want to play a casual game at your level
          without queueing against a stranger, Noctie does that.
        </ProseBlock>
        <ProseBlock>
          What Noctie does not do is coach you after the game. It is the opponent, not the teacher.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Who Chess Masti AI is for</SectionHeading>
        <ProseBlock>
          Chess Masti is the teacher. After your game — whether you played it on Lichess, Chess.com,
          Noctie, or over the board — paste the PGN in and the coach reviews it. Stockfish
          evaluates. Claude AI explains the critical moments. Your blunders turn into puzzles you
          can drill. You can ask follow-up questions in plain language.
        </ProseBlock>
        <ProseBlock>
          The point is improving. Noctie helps you accumulate the games to improve from; Chess Masti
          helps you turn those games into ratings.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Feature comparison</SectionHeading>
        <Box sx={{ overflowX: "auto" }}>
          <Box
            component="table"
            sx={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
              "& th, & td": {
                p: "0.75rem 1rem",
                borderBottom: `1px solid ${AEO_TOKENS.border}`,
                textAlign: "left",
              },
              "& th": { color: "rgba(255,255,255,0.5)", fontWeight: 600 },
              "& td": { color: "rgba(255,255,255,0.75)" },
              "& td:first-of-type": { color: "#fff", fontWeight: 500 },
            }}
          >
            <thead>
              <tr>
                <th></th>
                <th>Chess Masti AI</th>
                <th>Noctie</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Play vs. a humanlike opponent</td>
                <td>No (focus is coaching)</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
              </tr>
              <tr>
                <td>Post-game analysis with AI explanations</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>Not the focus</td>
              </tr>
              <tr>
                <td>Stockfish-backed engine evaluation</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>Not the focus</td>
              </tr>
              <tr>
                <td>Mistake-based puzzles from your games</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Follow-up question chat</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Opponent scouting (Lichess / Chess.com)</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Free</td>
                <td style={{ color: AEO_TOKENS.ember }}>Fully</td>
                <td>Limited free tier</td>
              </tr>
            </tbody>
          </Box>
        </Box>
        <Typography sx={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", mt: 1.5 }}>
          Verified at time of writing. Check Noctie&apos;s site for current pricing and feature
          changes.
        </Typography>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>The short version</SectionHeading>
        <Box sx={glassCard}>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1.5 }}>Use Noctie if:</Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 3, lineHeight: 1.8 }}>
            You want to practice chess against a humanlike opponent at a chosen rating without
            queueing for a real player.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1.5 }}>
            Use Chess Masti AI if:
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 3, lineHeight: 1.8 }}>
            You want to learn from the games you already play — wherever you played them. A free AI
            chess coach reviews your moves, explains your mistakes, and gives you puzzles to drill.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", fontStyle: "italic" }}>
            Use both if: you want a humanlike opponent for the practice game and a free AI coach for
            the review afterward.
          </Typography>
        </Box>
      </Box>

      <CrossLinkCallout
        title="See the full Chess Masti overview"
        blurb="The exact-match page covers the engine + AI + validator pipeline in more detail and includes the longer comparison and FAQ."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Try the free AI coach" sub="Paste a PGN or FEN. No account required to start." />
    </PageShell>
  );
}
