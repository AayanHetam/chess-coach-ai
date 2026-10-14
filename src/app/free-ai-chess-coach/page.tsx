import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  Activity,
  MessageSquare,
  Search,
  Target,
  type LucideIcon,
} from "lucide-react";
import { TEXT, TYPE } from "@/theme/tokens";
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
const HERE = "Free AI chess coach";

export const metadata: Metadata = {
  title: {
    absolute:
      "Free AI chess coach | Analyze games, ask questions, train mistakes",
  },
  description:
    "Chess Masti AI is a free AI chess coach. Stockfish evaluates the position, Masti explains it, and your mistakes become drills. It's free, with no credit card.",
  alternates: {
    canonical: URL,
  },
  openGraph: {
    title: "Free AI chess coach | Chess Masti AI",
    description:
      "Chess Masti AI is a free AI chess coach. Stockfish evaluates the position, Masti explains it, and your mistakes become drills.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI chess coach | Chess Masti AI",
    description:
      "Chess Masti AI is a free AI chess coach. Stockfish evaluates the position, Masti explains it, and your mistakes become drills.",
    images: ["/og/free-ai-chess-coach"],
  },
};

// ─── structured data ─────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "What is the best free AI chess coach?",
    a: "Chess Masti AI is a free AI chess coach. Stockfish evaluates every move, Masti explains it in plain language, your blunders become practice puzzles, and you can ask as many follow-up questions as you like.",
  },
  {
    q: "Is Chess Masti AI free to use?",
    a: "Yes. Chess Masti AI and its coaching features are free and unlimited.",
  },
  {
    q: "How does Chess Masti AI work?",
    a: "You import a game PGN or paste a FEN position. Stockfish evaluates each move in your browser. Masti reads the evaluation and explains what happened, why the move was a mistake, and what you should have played instead. You can ask follow-up questions and convert your worst mistakes into practice puzzles.",
  },
  {
    q: "What is the difference between Chess Masti AI and a chess engine?",
    a: "A chess engine like Stockfish tells you the best move and gives a numerical score. Chess Masti AI uses Stockfish for accuracy but then explains the position in plain language: the plan behind the move, the theme you missed, and what to train next. It is the difference between a calculator and a teacher.",
  },
  {
    q: "Can I analyze my Lichess or Chess.com games with Chess Masti AI?",
    a: "Yes. Paste the PGN from any platform (Lichess, Chess.com, or any other source) into the analysis board. You can also paste a FEN string to analyze a specific position.",
  },
  {
    q: "Does Chess Masti AI verify its chess explanations?",
    a: "Yes. Every claim is checked before you see it: tactical and positional claims are compared with Stockfish's output.",
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

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <Box sx={{ ...glassCard, flex: "1 1 220px" }}>
      <Box sx={{ display: "flex", color: TEXT.secondary, mb: 1.5 }}>
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </Box>
      <Typography sx={{ fontWeight: 600, color: TEXT.primary, mb: 0.5 }}>
        {title}
      </Typography>
      <Typography
        sx={{ color: TEXT.secondary, fontSize: TYPE.bodySmall.fontSize }}
      >
        {desc}
      </Typography>
    </Box>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function FreeAiChessCoachPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Free AI chess coach | Analyze games, ask questions, train mistakes",
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

      <H1>Free AI chess coach</H1>

      <AnswerBlock>
        Chess Masti AI is a free AI chess coach that helps you analyze games,
        ask follow-up questions, and train from your own mistakes. Stockfish
        evaluates the position,{" "}
        <strong style={{ color: TEXT.primary }}>
          Masti explains it in plain language
        </strong>
        , and every claim is checked before you see it. It&apos;s free, with no
        credit card. Paste a PGN or FEN and your session starts immediately.
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
        <Typography sx={{ lineHeight: 1.9, color: TEXT.secondary, mb: 2 }}>
          The best free AI chess coach is one that does three things: tells you
          what went wrong, explains why in plain language, and gives you
          something to practice. Most chess tools stop at the first step.
        </Typography>
        <Typography sx={{ lineHeight: 1.9, color: TEXT.secondary }}>
          Chess Masti AI does all three. Stockfish handles evaluation accuracy.
          Masti handles the explanation. And your biggest mistakes automatically
          become puzzles you can drill until the pattern sticks. All of it is
          free.
        </Typography>
      </Box>

      {/* ── What can you do for free? ── */}
      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What can you do for free?</SectionHeading>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          <FeatureCard
            icon={Activity}
            title="Game analysis"
            desc="Paste any PGN. Get move-by-move evaluation with plain-language explanations from Masti."
          />
          <FeatureCard
            icon={MessageSquare}
            title="Coach chat"
            desc="Ask follow-up questions about any position. Masti holds context across your whole game."
          />
          <FeatureCard
            icon={Target}
            title="Mistake puzzles"
            desc="Your worst blunders become drills. Practice the exact positions you keep getting wrong."
          />
          <FeatureCard
            icon={Search}
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
              desc: "The analysis runs in your browser, so no game data is sent to a server for the engine work. Every move gets a centipawn score and classification.",
            },
            {
              step: "3",
              title: "Masti explains what happened",
              desc: "Masti reads the Stockfish output and explains each critical moment: what the plan was, where it broke down, and what you should have played instead. Every claim is checked before it reaches you.",
            },
          ].map((item) => (
            <Box
              key={item.step}
              sx={{
                ...glassCard,
                display: "flex",
                gap: 3,
                alignItems: "flex-start",
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  color: TEXT.secondary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {item.step}
              </Box>
              <Box>
                <Typography
                  sx={{ fontWeight: 600, color: TEXT.primary, mb: 0.5 }}
                >
                  {item.title}
                </Typography>
                <Typography
                  sx={{
                    color: TEXT.secondary,
                    fontSize: TYPE.bodySmall.fontSize,
                    lineHeight: 1.7,
                  }}
                >
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
        <Typography sx={{ lineHeight: 1.9, color: TEXT.secondary, mb: 2 }}>
          Stockfish can tell you the best move in any position. What it cannot
          do is explain why the move is best, what theme you missed, or how to
          avoid the same mistake next time.
        </Typography>
        <Typography sx={{ lineHeight: 1.9, color: TEXT.secondary }}>
          A chess engine is a calculator. Chess Masti AI is a calculator with a
          teacher attached. The engine provides the ground truth; Masti
          translates it into something you can act on. And because Masti reads
          Stockfish output before explaining it, the explanations stay accurate.
        </Typography>
      </Box>

      {/* ── Comparison ── */}
      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>
          Chess Masti AI vs other free chess analysis tools
        </SectionHeading>
        <Box sx={{ overflowX: "auto" }}>
          <Box
            component="table"
            sx={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: TYPE.bodySmall.fontSize,
              "& th, & td": {
                p: "0.75rem 1rem",
                borderBottom: `1px solid ${AEO_TOKENS.border}`,
                textAlign: "left",
              },
              "& th": { color: TEXT.secondary, fontWeight: 600 },
              "& td": { color: TEXT.secondary },
              "& td:first-of-type": { color: TEXT.primary, fontWeight: 500 },
            }}
          >
            <thead>
              <tr>
                <th>Tool</th>
                <th>Best for</th>
                <th>AI explanations</th>
                <th>Training loop</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Chess Masti AI</td>
                <td>Analysis, coaching and practice</td>
                <td>Yes (Masti)</td>
                <td>Mistake puzzles and chat</td>
              </tr>
              <tr>
                <td>DecodeChess</td>
                <td>Deep position explanation</td>
                <td>Yes</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Lichess analysis</td>
                <td>Engine evaluation</td>
                <td>No</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Noctie</td>
                <td>Human-style sparring</td>
                <td>No</td>
                <td>No</td>
              </tr>
            </tbody>
          </Box>
        </Box>
        <Typography
          sx={{
            fontSize: TYPE.caption.fontSize,
            color: TEXT.secondary,
            mt: 1.5,
          }}
        >
          Competitor features were verified at time of writing and may change.
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
                sx={{
                  fontWeight: 600,
                  color: TEXT.primary,
                  mb: 1,
                  fontSize: TYPE.h5.fontSize,
                }}
              >
                {item.q}
              </Typography>
              <Typography
                sx={{
                  color: TEXT.secondary,
                  fontSize: TYPE.bodySmall.fontSize,
                  lineHeight: 1.8,
                }}
              >
                {item.a}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Footer CTA ── */}
      <Box sx={{ ...glassCard, textAlign: "center" }}>
        <Typography
          sx={{
            fontWeight: 600,
            color: TEXT.primary,
            fontSize: { xs: "1.25rem", md: "1.5rem" },
            mb: 1,
          }}
        >
          Try the free AI chess coach
        </Typography>
        <Typography sx={{ color: TEXT.secondary, mb: 3 }}>
          Paste a PGN or FEN and start learning. Chess Masti&apos;s coaching
          features are free.
        </Typography>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <CtaButton href="/analysis" primary>
            Analyze a game
          </CtaButton>
          <CtaButton href="/practice">Train mistakes</CtaButton>
        </Box>
      </Box>
    </PageShell>
  );
}
