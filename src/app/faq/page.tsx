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
  glassCard,
} from "@/app/_seo/aeoUi";

export const metadata: Metadata = {
  title: "Chess Masti AI — FAQ",
  description:
    "Answers to common questions: how the engine-first pipeline works, what Maia-2 is, how the hallucination validator catches LLM errors, and why it's free.",
  alternates: { canonical: "https://chessmasti.com/faq" },
  openGraph: {
    title: "Chess Masti AI — FAQ",
    description:
      "Engine-first pipeline, validator, Maia-2, free pricing — common questions answered.",
    url: "https://chessmasti.com/faq",
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
    title: "Chess Masti AI — FAQ",
    description: "Common questions about engine-grounded chess coaching.",
    images: ["https://chessmasti.com/social-networks-1200x630.png"],
  },
};

const QA: { q: string; a: string }[] = [
  {
    q: "Is Chess Masti AI free?",
    a: "Yes. There is no paid tier. No upsell, no premium gate. Built and maintained by Aayan Hetamsaria, a high-school student.",
  },
  {
    q: "Which LLM does it use?",
    a: "Anthropic Claude. Claude Sonnet for deep game analysis, Claude Haiku for sub-5-second follow-up chat with server-side context caching.",
  },
  {
    q: "Why does the engine run before the LLM, not after?",
    a: "Because LLMs hallucinate chess facts when asked to evaluate positions directly. Stockfish 17 produces the position evaluation, candidate moves, tactical motifs, and branch-point analysis first. The LLM's only job is to translate that into language.",
  },
  {
    q: "What is the hallucination validator?",
    a: "A separate layer that parses every coaching response for piece, square, and move references and checks each one against the live chess.js board state. Claims that don't match the actual position are rewritten or discarded before the response renders.",
  },
  {
    q: "What is Maia-2?",
    a: "A neural network from NeurIPS 2024 that predicts the moves a human at a target Elo would actually play. We deploy it as a FastAPI/PyTorch microservice on Hugging Face Spaces. It powers Twin Bot, a humanlike opponent that blunders the way humans blunder rather than playing like a weakened engine.",
  },
  {
    q: "Where do the puzzles come from?",
    a: "A Neo4j Aura graph of 100,000+ quality-filtered Lichess puzzles (popularity ≥ 60, plays ≥ 50, rating deviation ≤ 120), structured across 46 tactical themes and 4 difficulty bands.",
  },
  {
    q: "Why a graph database?",
    a: "Because puzzle recommendation is a similarity problem, not a list-lookup. Graph traversal lets us find puzzles that share themes, openings, and structural shape, then 49-dimensional FEN cosine-similarity re-ranking matches the retrieved puzzles to the geometry of the position you actually got wrong.",
  },
  {
    q: "What does Stockfish run on — your servers or my browser?",
    a: "Your browser. Stockfish 17 ships as a WebAssembly worker. No server round-trip, no rate limit, no analysis quota.",
  },
  {
    q: "Can I play live games on Chess Masti AI?",
    a: "Yes, against Lichess opponents. We use Lichess OAuth 2.0 PKCE and dual-SSE streams to mirror live games into the app without tab-switching.",
  },
  {
    q: "What does opponent scouting do?",
    a: "Paste a Lichess or Chess.com username and the dashboard returns opening trees, repertoire collisions against yours, a Tells readability index, tilt and timeout psychology profiles, and a shareable SVG player card.",
  },
  {
    q: "What's the inline-puzzle thing?",
    a: "After a coaching response, three puzzles render directly inside the same chat bubble — same board, same UI. You don't navigate away, you don't lose context. They're chosen by FEN cosine similarity to the position you just lost.",
  },
  {
    q: "Why prioritize India and Southeast Asia?",
    a: "Two reasons. The chess audience in India has grown enormously and is under-served by paid Western platforms. And Aayan, who builds the product, is closer to that user community.",
  },
  {
    q: "Is my game data private?",
    a: "Authentication uses signed JWTs in httpOnly cookies. No game data is sold; there is no advertising business model. Stockfish runs in your browser, so positions you analyse never have to leave your machine for the engine to evaluate them.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  name: "Chess Masti AI — FAQ",
  url: "https://chessmasti.com/faq",
  isPartOf: { "@id": "https://chessmasti.com/#website" },
  about: { "@id": "https://chessmasti.com/#software-app" },
  mainEntity: QA.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: {
      "@type": "Answer",
      text: a,
    },
  })),
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://chessmasti.com/" },
    { "@type": "ListItem", position: 2, name: "FAQ", item: "https://chessmasti.com/faq" },
  ],
};

export default function FaqPage() {
  return (
    <PageShell>
      <script
        id="faq-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        id="breadcrumb-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <Breadcrumb here="FAQ" />

      <H1>Frequently asked questions</H1>

      <AnswerBlock>
        Common questions about the engine-first pipeline, the validator, Maia-2, the puzzle graph,
        and why this is free.
      </AnswerBlock>

      <Box component="section" sx={{ mb: 10 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {QA.map((item) => (
            <Box key={item.q} sx={glassCard}>
              <Typography
                component="h2"
                sx={{ fontWeight: 700, color: "#fff", mb: 1, fontSize: "1rem" }}
              >
                {item.q}
              </Typography>
              <Typography
                sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.9rem", lineHeight: 1.8 }}
              >
                {item.a}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        sx={{
          ...glassCard,
          textAlign: "center",
          borderColor: `${AEO_TOKENS.ember}22`,
        }}
      >
        <Typography sx={{ fontWeight: 700, color: "#fff", fontSize: { xs: "1.25rem", md: "1.5rem" }, mb: 1 }}>
          Related reading
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 3 }}>
          Deeper dives on the pipeline, the architecture, and the competitive landscape.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
          <CtaButton href="/how-it-works">How the pipeline works</CtaButton>
          <CtaButton href="/architecture">Architecture</CtaButton>
          <CtaButton href="/vs">vs other coaches</CtaButton>
          <CtaButton href="/free-ai-chess-coach" primary>
            Try the coach
          </CtaButton>
        </Box>
      </Box>
    </PageShell>
  );
}
