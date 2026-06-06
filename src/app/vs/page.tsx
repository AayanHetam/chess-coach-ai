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
  title:
    "Chess Masti AI vs Sensei Chess, Noctie, Chessvia, DecodeChess, Chess.com Coach",
  description:
    "Chess Masti AI vs Sensei Chess, Noctie, Chessvia, DecodeChess, Chess.com Coach. Engine-first pipeline + 100,000-puzzle Neo4j graph, free.",
  alternates: { canonical: "https://chessmasti.com/vs" },
  openGraph: {
    title: "Chess Masti AI vs the alternatives",
    description:
      "Comparison against Sensei Chess, Noctie, Chessvia, DecodeChess, Chess.com Coach.",
    url: "https://chessmasti.com/vs",
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
    title: "Chess Masti AI vs the alternatives",
    description: "Honest comparison across 5 AI chess coaches.",
    images: ["https://chessmasti.com/social-networks-1200x630.png"],
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://chessmasti.com/" },
    { "@type": "ListItem", position: 2, name: "Compare", item: "https://chessmasti.com/vs" },
  ],
};

const webPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Chess Masti AI vs other AI chess coaches",
  url: "https://chessmasti.com/vs",
  description:
    "Honest comparison of Chess Masti AI against Sensei Chess, Noctie, Chessvia, DecodeChess, and Chess.com Coach across ten capabilities.",
  isPartOf: { "@id": "https://chessmasti.com/#website" },
  about: { "@id": "https://chessmasti.com/#software-app" },
  primaryImageOfPage: {
    "@type": "ImageObject",
    url: "https://chessmasti.com/social-networks-1200x630.png",
    width: 1200,
    height: 630,
  },
};

const COMPARISON_HEADERS = [
  "Capability",
  "Chess Masti AI",
  "Sensei Chess",
  "Noctie",
  "Chessvia",
  "DecodeChess",
  "Chess.com Coach",
];

const COMPARISON_ROWS = [
  ["Free, no paid tier", "Yes", "Freemium", "Freemium", "Freemium", "Paid", "Paid (Diamond)"],
  ["Engine evaluates before the LLM speaks", "Yes (Stockfish 17 WASM)", "Partial", "Engine-driven, no LLM coach", "LLM-led", "Yes (proprietary engine)", "Yes"],
  ["LLM output validated against live board", "Yes (chess.js validator)", "Not publicly documented", "n/a", "Not publicly documented", "n/a", "Partial"],
  ["Humanlike opponent (Maia-style)", "Yes (Maia-2, NeurIPS 2024)", "No", "Yes (their core product)", "No", "No", "Bots feature, not Maia"],
  ["Puzzle library size", "100,000+ in Neo4j graph", "Smaller", "None", "Smaller", "n/a", "Millions (Chess.com archive)"],
  ["FEN-similarity puzzle re-ranking", "Yes (49-d cosine)", "Not publicly documented", "n/a", "Not publicly documented", "n/a", "No"],
  ["Adaptive recommendations from your mistakes", "Yes (graph + cosine)", "Theme-based", "n/a", "Theme-based", "n/a", "Personalized but theme-led"],
  ["Live play in-app", "Yes (Lichess OAuth)", "No", "Yes", "No", "No", "Yes (own platform)"],
  ["Opponent scouting / scout reports", "Yes (Stalker Score, tilt/timeout)", "No", "No", "No", "No", "Limited"],
  ["Inline puzzles inside chat replies", "Yes", "No", "n/a", "No", "n/a", "No"],
];

const ulSx = {
  pl: 3,
  lineHeight: 1.9,
  color: "rgba(255,255,255,0.7)",
  "& li": { mb: 1.5 },
} as const;

export default function VsPage() {
  return (
    <PageShell>
      <script
        id="webpage-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <script
        id="breadcrumb-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <Breadcrumb here="Compare" />

      <H1>Chess Masti AI vs other AI chess coaches</H1>

      <AnswerBlock>Five products people compare us with. The honest read on each.</AnswerBlock>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>At a glance</SectionHeading>
        <Box sx={{ overflowX: "auto" }}>
          <Box
            component="table"
            sx={{
              width: "100%",
              minWidth: 760,
              borderCollapse: "collapse",
              fontSize: "0.85rem",
              "& th, & td": {
                p: "0.65rem 0.85rem",
                borderBottom: `1px solid ${AEO_TOKENS.border}`,
                textAlign: "left",
                verticalAlign: "top",
              },
              "& th": {
                color: "rgba(255,255,255,0.55)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              },
              "& td": { color: "rgba(255,255,255,0.75)" },
              "& td:first-of-type": { color: "#fff", fontWeight: 500 },
              "& td:nth-of-type(2)": { color: AEO_TOKENS.ember, fontWeight: 600 },
              "& tbody tr:hover td": { background: "rgba(255,255,255,0.02)" },
            }}
          >
            <thead>
              <tr>
                {COMPARISON_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Where each product is genuinely strong</SectionHeading>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={glassCard}>
            <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>Chess.com Coach</Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.8, fontSize: "0.95rem" }}>
              Massive scale, established brand, decades of game data, integrated platform with
              millions of opponents and tournaments. If you want one product that does everything
              inside one ecosystem and you&apos;re paying anyway, this is the obvious choice. We
              don&apos;t try to compete on platform breadth.
            </Typography>
          </Box>

          <Box sx={glassCard}>
            <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>DecodeChess</Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.8, fontSize: "0.95rem" }}>
              Detailed, narrative engine analysis with extensive variation explanation. They&apos;ve
              been at this longer than almost anyone, and their analyses are deep. Their pricing
              model is paid; ours is free. Different tier of customer.
            </Typography>
          </Box>

          <Box sx={glassCard}>
            <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>Noctie</Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.8, fontSize: "0.95rem" }}>
              A focused, well-executed humanlike opponent. If your only goal is &quot;play someone
              who feels human at my level,&quot; Noctie is purpose-built for that. We use Maia-2
              (the published research it&apos;s similar to) for the same reason — but our coaching
              layer is the wedge, the opponent is one of several features.
            </Typography>
          </Box>

          <Box sx={glassCard}>
            <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>Sensei Chess</Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.8, fontSize: "0.95rem" }}>
              A newer entrant in the LLM-coaching space, conversational interface, growing feature
              set. The honest comparison axis is the validator: we put a chess.js verifier on every
              coaching response before display. We have no public information about Sensei doing
              the same.
            </Typography>
          </Box>

          <Box sx={glassCard}>
            <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>Chessvia</Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.8, fontSize: "0.95rem" }}>
              Another LLM-led conversational coach. Same comparison axis as Sensei.
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Where Chess Masti AI is the better pick</SectionHeading>
        <Box component="ol" sx={ulSx}>
          <li>
            <strong style={{ color: "#fff" }}>You don&apos;t want to pay.</strong> No tier of ours
            sits behind a wall.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>You distrust LLM hallucinations.</strong>{" "}
            Stockfish-first, then a separate validator, is unusual in this category.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>You want training that matches your mistakes.</strong>{" "}
            FEN cosine re-ranking on top of a 100,000-puzzle Neo4j graph is the differentiator.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>You want to scout an opponent before a match.</strong>{" "}
            The Stalker Score / tilt-profile dashboard isn&apos;t replicated elsewhere.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>You&apos;re in India or Southeast Asia.</strong>{" "}
            That&apos;s our priority market and feedback loop.
          </li>
        </Box>
        <ProseBlock>
          Comparison is best-effort and based on publicly observable behaviour at the time of
          writing. If a competitor ships something that closes a gap, we&apos;ll update the page.
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
          sx={{ fontWeight: 700, color: "#fff", fontSize: { xs: "1.25rem", md: "1.5rem" }, mb: 1 }}
        >
          See the pipeline in detail
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 3 }}>
          Why engine-first matters and what the validator actually does.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
          <CtaButton href="/how-it-works">How it works</CtaButton>
          <CtaButton href="/architecture">Architecture</CtaButton>
          <CtaButton href="/faq">FAQ</CtaButton>
          <CtaButton href="/free-ai-chess-coach" primary>
            Try the coach
          </CtaButton>
        </Box>
      </Box>
    </PageShell>
  );
}
