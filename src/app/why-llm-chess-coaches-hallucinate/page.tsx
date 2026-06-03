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

const URL = "https://chessmasti.com/why-llm-chess-coaches-hallucinate";
const HERE = "Why LLM Chess Coaches Hallucinate";

export const metadata: Metadata = {
  title: { absolute: "Why LLM Chess Coaches Hallucinate (And How to Fix It)" },
  description:
    "Large language models hallucinate chess moves because they generate plausible text, not legal positions. Here's why it happens and what a grounded AI chess coach does differently.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Why LLM Chess Coaches Hallucinate | Chess Masti AI",
    description:
      "LLMs generate plausible text, not legal moves. Here's the failure mode and the fix.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Why LLM Chess Coaches Hallucinate | Chess Masti AI",
    description: "LLMs generate plausible text, not legal moves. Here's the failure mode and the fix.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function WhyLlmChessCoachesHallucinatePage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Why LLM Chess Coaches Hallucinate (And How to Fix It)",
      url: URL,
      description:
        "Explains why LLMs hallucinate chess moves, the most common failure modes, and how grounded AI chess coaches avoid them.",
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

      <H1>Why LLM Chess Coaches Hallucinate</H1>

      <AnswerBlock>
        Large language models hallucinate chess moves because they generate the most probable next
        text, not the most legal next move. Without an engine in the loop, an LLM will confidently
        recommend illegal moves, invent tactical lines that don&apos;t exist, and mis-identify
        pieces. The fix is to wire a chess engine in first, validate every chess claim against
        engine output, and drop or rewrite anything the engine doesn&apos;t support before showing
        it to a user.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/free-ai-chess-coach" primary>
          See a grounded AI coach
        </CtaButton>
        <CtaButton href="/analysis">Try the analysis board</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Three failure modes you&apos;ll see</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              title: "Illegal moves",
              desc: "The LLM recommends a move the position doesn't allow — a piece that's pinned, a square that's blocked, a king move into check. It looks fluent because the syntax is right; it's wrong because the LLM never checked the position.",
            },
            {
              title: "Invented tactical lines",
              desc: "The LLM describes a sequence of forced moves that wins material — except the sequence doesn't work because the opponent has a defense the LLM didn't search. The line reads cleanly. The line is fiction.",
            },
            {
              title: "Mis-identified pieces and squares",
              desc: "The LLM confuses which side has which piece, swaps file labels, or misreads the orientation of the board. These bugs are obvious to a human but routine when text generation isn't grounded in the position.",
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
        <SectionHeading>Why this happens</SectionHeading>
        <ProseBlock>
          A large language model is trained to predict the next token given prior tokens. It learns
          a distribution over chess-y text — opening names, common tactical phrases, the cadence of
          how a strong player annotates a game. Given a position description, it produces text that
          sounds like a strong player&apos;s commentary on that position.
        </ProseBlock>
        <ProseBlock>
          What it doesn&apos;t do is search the move tree. It doesn&apos;t verify that the moves it
          recommends are legal. It doesn&apos;t check whether the principal variation works. If
          most training data describes &quot;Nxf7 winning a piece&quot;-style tactics in similar
          positions, the LLM will write that sentence whether or not it actually applies to your
          board.
        </ProseBlock>
        <ProseBlock>
          The result is a tool that sounds like a coach but is statistically incentivized to be
          confidently wrong on edge cases. The pattern: high confidence, plausible reasoning,
          incorrect chess.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>The fix: ground the LLM in an engine</SectionHeading>
        <ProseBlock>
          A grounded AI chess coach runs a chess engine first — Stockfish, in Chess Masti&apos;s
          case — and reads the engine&apos;s evaluation and principal variation before generating
          any explanation. The LLM&apos;s job is to translate the engine&apos;s output into plain
          language. The engine handles correctness; the LLM handles communication.
        </ProseBlock>
        <ProseBlock>
          That&apos;s necessary but not sufficient. The LLM can still confidently invent a tactical
          line outside the engine&apos;s principal variation. So a grounded coach also needs a
          validator: a layer that checks every chess claim the LLM makes against engine output and
          drops or rewrites anything the engine doesn&apos;t support. Chess Masti runs this
          validator pipeline before showing you the response.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>How to spot a hallucinating chess coach</SectionHeading>
        <Box sx={glassCard}>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1 }}>
            Test 1: ask about an unusual position.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 2.5, lineHeight: 1.7 }}>
            Give it a weird endgame or a non-standard opening. If the explanation feels generic or
            recycled from a more common position, the coach is probably text-pattern-matching, not
            position-evaluating.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1 }}>
            Test 2: verify the recommended line.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 2.5, lineHeight: 1.7 }}>
            Take the coach&apos;s suggested variation and play it on a real engine. If the engine
            rates the result very differently from what the coach claimed, that&apos;s a
            hallucination.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1 }}>
            Test 3: ask the same question twice.
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
            Reset the chat. Ask the same question about the same position. If the two answers are
            substantively different — different recommended moves, different reasoning — the
            coach isn&apos;t grounded in a stable evaluation.
          </Typography>
        </Box>
      </Box>

      <CrossLinkCallout
        title="See how Chess Masti avoids this"
        blurb="The free AI chess coach page covers the full grounded pipeline: Stockfish evaluation, Claude AI explanations, and the validator layer that checks every claim before display."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta
        title="Try a grounded AI chess coach"
        sub="Stockfish-evaluated. Claim-validated. Free."
      />
    </PageShell>
  );
}
