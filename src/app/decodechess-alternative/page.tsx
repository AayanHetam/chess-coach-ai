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

const URL = "https://chessmasti.com/decodechess-alternative";
const HERE = "DecodeChess Alternative";

export const metadata: Metadata = {
  title: { absolute: "DecodeChess Alternative | Free AI Chess Coach with a Training Loop" },
  description:
    "Looking for a DecodeChess alternative? Chess Masti AI is a free AI chess coach that explains positions and turns your mistakes into puzzles — closing the training loop.",
  alternates: { canonical: URL },
  openGraph: {
    title: "DecodeChess Alternative | Chess Masti AI",
    description:
      "DecodeChess explains positions. Chess Masti AI explains positions and closes the training loop. Free.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DecodeChess Alternative | Chess Masti AI",
    description:
      "DecodeChess explains positions. Chess Masti AI explains positions and closes the training loop. Free.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function DecodeChessAlternativePage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "DecodeChess Alternative | Free AI Chess Coach with a Training Loop",
      url: URL,
      description:
        "Chess Masti AI is a free AI chess coach alternative to DecodeChess that explains positions and turns mistakes into puzzles.",
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

      <H1>DecodeChess Alternative</H1>

      <AnswerBlock>
        DecodeChess explains chess positions in depth using AI. Chess Masti AI does that too — and
        also turns your mistakes into puzzle drills so you actually train the patterns you keep
        missing. Both are AI chess coaches; the difference is whether the loop ends at the
        explanation or continues into practice. Chess Masti is free.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Try Chess Masti free
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Who DecodeChess is for</SectionHeading>
        <ProseBlock>
          DecodeChess is good at one specific job: taking a single chess position and explaining
          what is happening in detail. The narrative analysis is thorough and the engine work
          underneath is sound. If you want a deep written analysis of a critical game position and
          you do not need anything else, DecodeChess does that well.
        </ProseBlock>
        <ProseBlock>
          The constraint is the subscription. The free tier is limited; the deeper analysis features
          and unlimited use require paying. Check their site for current pricing — it may have
          changed since this was written.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Who Chess Masti AI is for</SectionHeading>
        <ProseBlock>
          Chess Masti is for the player who wants to improve, not just understand. The pipeline:
          Stockfish evaluates your game, Claude AI explains every critical moment, and your worst
          mistakes automatically become puzzles you can drill. The training loop is the difference —
          explanation alone does not move ratings; practice on your own mistakes does.
        </ProseBlock>
        <ProseBlock>
          Everything is free, with no analysis cap. You can also ask follow-up questions about any
          position, scout your next opponent&apos;s opening tendencies, and import games from
          Lichess or Chess.com directly.
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
                <th>DecodeChess</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>AI position explanations</td>
                <td>Yes (Claude AI)</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Engine evaluation</td>
                <td>Stockfish (WASM, in-browser)</td>
                <td>Stockfish</td>
              </tr>
              <tr>
                <td>Free for full game analysis</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>Limited free tier</td>
              </tr>
              <tr>
                <td>Mistake-based puzzles</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Follow-up question chat</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Opponent scouting</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Claim validation against engine</td>
                <td style={{ color: AEO_TOKENS.ember }}>Yes</td>
                <td>Not documented</td>
              </tr>
            </tbody>
          </Box>
        </Box>
        <Typography sx={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", mt: 1.5 }}>
          Verified at time of writing. Check DecodeChess&apos; site for current pricing and feature
          changes.
        </Typography>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>The short version</SectionHeading>
        <Box sx={glassCard}>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1.5 }}>
            Use DecodeChess if:
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 3, lineHeight: 1.8 }}>
            You want deep narrative analysis of a single position and a polished writeup of what is
            happening on the board.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1.5 }}>
            Use Chess Masti AI if:
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
            You want a free AI chess coach that explains your games, lets you ask follow-up
            questions, and converts your blunders into drills you can actually practice.
          </Typography>
        </Box>
      </Box>

      <CrossLinkCallout
        title="See the full Chess Masti overview"
        blurb="The exact-match page covers the engine + AI + validator pipeline in more detail and includes the longer comparison and FAQ."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Try the free alternative" sub="Paste a PGN or FEN. No account required to start." />
    </PageShell>
  );
}
