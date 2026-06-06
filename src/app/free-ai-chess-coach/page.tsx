import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  AEO_TOKENS,
  AnswerBlock,
  Breadcrumb,
  CtaButton,
  CtaRow,
  H1,
  PageShell,
  SectionHeading,
  buildBreadcrumbJsonLd,
  buildWebPageJsonLd,
  glassCard,
} from "@/app/_seo/aeoUi";

// ─── metadata ────────────────────────────────────────────────────────────────

const URL = "https://chessmasti.com/free-ai-chess-coach";
const HERE = "Free AI Chess Coach";

export const metadata: Metadata = {
  title: {
    absolute: "Free AI Chess Coach | Analyze Games, Ask Questions, Train Mistakes",
  },
  description:
    "Chess Masti AI is a free AI chess coach. Stockfish evaluates the position, Claude explains it, and your mistakes become drills. No subscription required.",
  alternates: {
    canonical: URL,
  },
  openGraph: {
    title: "Free AI Chess Coach | Chess Masti AI",
    description:
      "Chess Masti AI is a free AI chess coach. Stockfish evaluates the position, Claude explains it, and your mistakes become drills.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Chess Coach | Chess Masti AI",
    description:
      "Chess Masti AI is a free AI chess coach. Stockfish evaluates the position, Claude explains it, and your mistakes become drills.",
    images: ["/og/free-ai-chess-coach"],
  },
};

// ─── structured data ─────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "What is the best free AI chess coach?",
    a: "Chess Masti AI is a strong option for a free AI chess coach. It combines Stockfish engine analysis with Claude AI explanations, converts your blunders into practice puzzles, and lets you ask follow-up questions in plain language — all without a subscription.",
  },
  {
    q: "Is Chess Masti AI really free?",
    a: "Yes. Game analysis, coach chat, mistake-based puzzles, and opponent scouting are all free. There is no subscription, paywall, or credit system.",
  },
  {
    q: "How does Chess Masti AI work?",
    a: "You import a game PGN or paste a FEN position. Stockfish evaluates each move in your browser. Claude AI reads the evaluation and explains what happened, why the move was a mistake, and what you should have played instead. You can ask follow-up questions and convert your worst mistakes into practice puzzles.",
  },
  {
    q: "What is the difference between Chess Masti AI and a chess engine?",
    a: "A chess engine like Stockfish tells you the best move and gives a numerical score. Chess Masti AI uses Stockfish for accuracy but then explains the position in natural language — the plan behind the move, the theme you missed, and what to train next. It is the difference between a calculator and a teacher.",
  },
  {
    q: "Can I analyze my Lichess or Chess.com games with Chess Masti AI?",
    a: "Yes. Paste the PGN from any platform — Lichess, Chess.com, or any other source — into the analysis board. You can also paste a FEN string to analyze a specific position.",
  },
  {
    q: "Does Chess Masti AI verify its chess explanations?",
    a: "Yes. Chess Masti AI runs a validation pipeline before showing you analysis. Tactical and positional claims are checked against Stockfish output so the coach does not hallucinate moves or incorrect evaluations.",
  },
  {
    q: "Is Chess Masti AI a better free option than DecodeChess?",
    a: "They serve different needs. DecodeChess is strong at explaining a single position in depth. Chess Masti AI adds a training loop: it turns your mistakes into drills, lets you ask follow-up questions in conversational language, and includes opponent scouting. If you want to close the gap between understanding and improvement, Chess Masti AI is worth trying.",
  },
];

const faqPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

// ─── page-specific component ──────────────────────────────────────────────────

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <Box sx={{ ...glassCard, flex: "1 1 220px" }}>
      <Typography sx={{ fontSize: "2rem", mb: 1 }}>{icon}</Typography>
      <Typography sx={{ fontWeight: 700, color: "#fff", mb: 0.5 }}>{title}</Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" }}>{desc}</Typography>
    </Box>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function FreeAiChessCoachPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Free AI Chess Coach | Analyze Games, Ask Questions, Train Mistakes",
      url: URL,
      description:
        "Chess Masti AI is a free AI chess coach that helps you analyze games, ask follow-up questions, and train from your own mistakes.",
    }),
    faqPageJsonLd,
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

      <H1>Free AI Chess Coach</H1>

      <AnswerBlock>
        Chess Masti AI is a free AI chess coach that helps you analyze games, ask follow-up
        questions, and train from your own mistakes. Stockfish evaluates the position,{" "}
        <strong style={{ color: "#fff" }}>Claude explains it in natural language</strong>, and
        Chess Masti checks chess claims before showing them to you. No subscription. No paywall.
        Paste a PGN or FEN and your session starts immediately.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Analyze a game
        </CtaButton>
        <CtaButton href="/practice">Train your mistakes</CtaButton>
        <CtaButton href="/scout">Scout an opponent</CtaButton>
      </CtaRow>

      {/* ── What is the best free AI chess coach? ── */}
      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What is the best free AI chess coach?</SectionHeading>
        <Typography sx={{ lineHeight: 1.9, color: "rgba(255,255,255,0.7)", mb: 2 }}>
          The best free AI chess coach is one that does three things: tells you what went wrong,
          explains why in plain language, and gives you something to practice. Most chess tools
          stop at the first step.
        </Typography>
        <Typography sx={{ lineHeight: 1.9, color: "rgba(255,255,255,0.7)" }}>
          Chess Masti AI closes the loop. Stockfish handles evaluation accuracy. Claude AI handles
          the explanation. And your biggest mistakes automatically become puzzles you can drill
          until the pattern sticks — all free.
        </Typography>
      </Box>

      {/* ── What can you do for free? ── */}
      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What can you do for free?</SectionHeading>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          <FeatureCard
            icon="♟"
            title="Game analysis"
            desc="Paste any PGN. Get move-by-move evaluation with natural-language explanations from Claude AI."
          />
          <FeatureCard
            icon="💬"
            title="Coach chat"
            desc="Ask follow-up questions about any position. The coach holds context across your whole game."
          />
          <FeatureCard
            icon="🎯"
            title="Mistake puzzles"
            desc="Your worst blunders become drills. Practice the exact positions you keep getting wrong."
          />
          <FeatureCard
            icon="🔍"
            title="Opponent scouting"
            desc="See your opponent's opening tendencies, weak squares, and patterns before you play."
          />
        </Box>
      </Box>

      {/* ── How it works ── */}
      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>How Chess Masti AI works</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              step: "1",
              title: "Import your game or position",
              desc: "Paste a PGN from Lichess, Chess.com, or anywhere else. Or paste a FEN string to start from a specific position.",
            },
            {
              step: "2",
              title: "Stockfish evaluates every move",
              desc: "The analysis runs in your browser using Stockfish WASM — no data sent to a server for the engine work. Every move gets a centipawn score and classification.",
            },
            {
              step: "3",
              title: "Claude explains what happened",
              desc: "The AI coach reads the Stockfish output and explains each critical moment: what the plan was, where it broke down, and what you should have played instead. Claims are checked before they reach you.",
            },
          ].map((item) => (
            <Box key={item.step} sx={{ ...glassCard, display: "flex", gap: 3, alignItems: "flex-start" }}>
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
                {item.step}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 700, color: "#fff", mb: 0.5 }}>{item.title}</Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem", lineHeight: 1.7 }}>
                  {item.desc}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Why not just use a chess engine? ── */}
      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Why not just use a chess engine?</SectionHeading>
        <Typography sx={{ lineHeight: 1.9, color: "rgba(255,255,255,0.7)", mb: 2 }}>
          Stockfish can tell you the best move in any position. What it cannot do is explain why
          the move is best, what theme you missed, or how to avoid the same mistake next time.
        </Typography>
        <Typography sx={{ lineHeight: 1.9, color: "rgba(255,255,255,0.7)" }}>
          A chess engine is a calculator. Chess Masti AI is a calculator with a teacher attached.
          The engine provides the ground truth; the AI coach translates it into something you can
          act on. And because the coach reads Stockfish output before explaining it, the
          explanations stay accurate.
        </Typography>
      </Box>

      {/* ── Comparison ── */}
      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Chess Masti AI vs other free chess analysis tools</SectionHeading>
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
                <th>Tool</th>
                <th>Best for</th>
                <th>Free?</th>
                <th>AI explanations</th>
                <th>Training loop</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Chess Masti AI</td>
                <td>Free full-loop coaching</td>
                <td style={{ color: AEO_TOKENS.ember }}>✓ Fully free</td>
                <td>Claude AI</td>
                <td>Mistake puzzles + chat</td>
              </tr>
              <tr>
                <td>DecodeChess</td>
                <td>Deep position explanation</td>
                <td>Limited free tier</td>
                <td>Yes</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Lichess analysis</td>
                <td>Engine evaluation</td>
                <td>✓ Free</td>
                <td>No</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Noctie</td>
                <td>Human-style sparring</td>
                <td>Limited free tier</td>
                <td>No</td>
                <td>No</td>
              </tr>
            </tbody>
          </Box>
        </Box>
        <Typography sx={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", mt: 1.5 }}>
          Competitor details verified at time of writing. Check each product&apos;s site for current pricing.
        </Typography>
      </Box>

      {/* ── FAQ ── */}
      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Frequently asked questions</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {FAQ_ITEMS.map((item) => (
            <Box key={item.q} sx={glassCard}>
              <Typography
                component="h3"
                sx={{ fontWeight: 700, color: "#fff", mb: 1, fontSize: "1rem" }}
              >
                {item.q}
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.9rem", lineHeight: 1.8 }}>
                {item.a}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Footer CTA ── */}
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
          Try the free AI chess coach
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 3 }}>
          Paste a PGN or FEN. No account required to start.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
          <CtaButton href="/analysis" primary>
            Analyze a game
          </CtaButton>
          <CtaButton href="/practice">Train mistakes</CtaButton>
        </Box>
      </Box>
    </PageShell>
  );
}
