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

const URL = "https://chessmasti.com/ai-chess-coach-vs-chess-engine";
const HERE = "AI Chess Coach vs Chess Engine";

export const metadata: Metadata = {
  title: { absolute: "AI Chess Coach vs Chess Engine | What's the Difference?" },
  description:
    "A chess engine evaluates positions. An AI chess coach evaluates and explains them. Here's what each is for, how they differ, and why you usually want both.",
  alternates: { canonical: URL },
  openGraph: {
    title: "AI Chess Coach vs Chess Engine | Chess Masti AI",
    description:
      "Engines evaluate. Coaches explain. Here's what each is for and why you usually want both.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Chess Coach vs Chess Engine | Chess Masti AI",
    description: "Engines evaluate. Coaches explain. Here's what each is for and why you usually want both.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function AiChessCoachVsChessEnginePage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "AI Chess Coach vs Chess Engine | What's the Difference?",
      url: URL,
      description:
        "Compares chess engines (evaluation) and AI chess coaches (evaluation + explanation + training). Practical guide.",
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

      <H1>AI Chess Coach vs Chess Engine</H1>

      <AnswerBlock>
        A chess engine tells you the best move and a numerical score. An AI chess coach reads that
        evaluation and explains it in plain language — what the plan was, why your move failed, and
        what to look for next time. Engines are calculators. AI coaches are calculators with
        teachers attached. Most serious players use both: the engine for ground truth, the coach to
        translate it into something to act on.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Try an AI coach on a real game
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What a chess engine does</SectionHeading>
        <ProseBlock>
          A chess engine takes a position and tells you the best move it can calculate. Modern
          engines like Stockfish search millions of positions per second using alpha-beta pruning,
          neural-network evaluation (NNUE), and decades of tuning. The output is a number — usually
          in centipawns — and a sequence of moves called the principal variation.
        </ProseBlock>
        <ProseBlock>
          Engines are extraordinarily accurate. They are also opaque. &quot;+0.7&quot; tells you
          that one side is slightly better; it does not tell you why, what the plan is, or what
          mistake led to this evaluation in the first place.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What an AI chess coach does</SectionHeading>
        <ProseBlock>
          An AI chess coach uses an engine for evaluation, then layers a language model on top to
          explain what the evaluation means. The LLM reads the engine output, the move history, and
          the position, and writes a paragraph that describes what is happening: the plan, the
          tactical theme, the mistake, the correct idea.
        </ProseBlock>
        <ProseBlock>
          A good AI coach validates its claims against the engine before showing them to you — this
          is the difference between a coach that is right and a coach that just sounds right. Chess
          Masti AI runs a validator pipeline that drops or rewrites claims the engine doesn&apos;t
          support, which keeps the explanations honest.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Side by side</SectionHeading>
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
                <th>Chess engine (Stockfish)</th>
                <th>AI chess coach</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Output format</td>
                <td>Score + best line</td>
                <td>Explanation + score + best line</td>
              </tr>
              <tr>
                <td>Accuracy</td>
                <td>Authoritative</td>
                <td>Inherits engine accuracy + risks LLM hallucination</td>
              </tr>
              <tr>
                <td>Explains why</td>
                <td>No</td>
                <td>Yes (that&apos;s the point)</td>
              </tr>
              <tr>
                <td>Identifies your plan</td>
                <td>No</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Names the theme you missed</td>
                <td>No</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Answers follow-up questions</td>
                <td>No</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Turns mistakes into puzzles</td>
                <td>No</td>
                <td>Some coaches do (Chess Masti AI does)</td>
              </tr>
              <tr>
                <td>Best for</td>
                <td>Ground-truth evaluation</td>
                <td>Learning from games</td>
              </tr>
            </tbody>
          </Box>
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>The hallucination risk (and how to dodge it)</SectionHeading>
        <ProseBlock>
          The honest concern with AI chess coaches is hallucination. A raw LLM that gets asked
          &quot;why is this move best?&quot; can write a confident, fluent answer that is also
          completely wrong — invented tactical lines, mis-identified pieces, illegal moves. This is
          a real risk that has burned the chess world several times.
        </ProseBlock>
        <ProseBlock>
          The fix is to wire the engine in first and then validate the LLM&apos;s claims against
          engine output. Chess Masti AI does this — every tactical and positional claim runs through
          a validator pipeline before it reaches you. Not every AI chess coach does this, so when
          evaluating one, ask: does it run a chess engine first? Does it validate claims?
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>So which should you use?</SectionHeading>
        <Box sx={glassCard}>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1.5 }}>
            Engine only (e.g., Lichess analysis):
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 3, lineHeight: 1.8 }}>
            Use this if you already read engine output fluently. Faster, less noise, no LLM risk.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1.5 }}>
            AI coach (e.g., Chess Masti AI):
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 3, lineHeight: 1.8 }}>
            Use this if you want to learn from your games. The explanation layer is where the
            actual training value lives. Make sure the coach validates claims against an engine —
            this is non-negotiable.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", fontStyle: "italic" }}>
            Most improving players benefit from both: the AI coach for game review and explanation,
            the raw engine for deep-dive position analysis.
          </Typography>
        </Box>
      </Box>

      <CrossLinkCallout
        title="See how Chess Masti combines them"
        blurb="The free AI chess coach page walks through how Stockfish, Claude AI, and the validator pipeline fit together end-to-end."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Try the engine + coach combo" sub="Paste a PGN. Stockfish evaluates. Claude explains. Free." />
    </PageShell>
  );
}
