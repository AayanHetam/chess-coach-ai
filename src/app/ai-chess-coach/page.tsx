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
} from "@/app/_seo/aeoUi";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const URL = "https://chessmasti.com/ai-chess-coach";
const HERE = "AI Chess Coach";

export const metadata: Metadata = {
  title: { absolute: "AI Chess Coach | Engine-Grounded Coaching from Chess Masti AI" },
  description:
    "An AI chess coach reviews your moves, explains your mistakes in plain language, and trains you on what you got wrong. Chess Masti AI does all three — free.",
  alternates: {
    canonical: "https://chessmasti.com/free-ai-chess-coach",
  },
  openGraph: {
    title: "AI Chess Coach | Chess Masti AI",
    description:
      "An AI chess coach reviews your moves, explains your mistakes, and trains you on what you got wrong.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Chess Coach | Chess Masti AI",
    description:
      "An AI chess coach reviews your moves, explains your mistakes, and trains you on what you got wrong.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function AiChessCoachPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "AI Chess Coach | Engine-Grounded Coaching from Chess Masti AI",
      url: URL,
      description:
        "An AI chess coach reviews your moves, explains your mistakes, and trains you on what you got wrong. Chess Masti AI does all three.",
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

      <H1>AI Chess Coach</H1>

      <AnswerBlock>
        An AI chess coach reviews your games, explains why each move worked or did not, and trains
        you on the exact mistakes you keep making. Chess Masti AI is a free AI chess coach that runs
        Stockfish for accuracy, uses Claude AI for the explanations, and turns your blunders into
        targeted puzzle drills. Paste a PGN or FEN and your session starts immediately.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Try the AI coach
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What is an AI chess coach?</SectionHeading>
        <ProseBlock>
          A chess engine like Stockfish tells you the best move. An AI chess coach goes further: it
          reads the engine output, explains what the position is asking for in natural language, and
          tells you why your move was wrong, what the right plan was, and how to avoid the same
          mistake in similar positions.
        </ProseBlock>
        <ProseBlock>
          The engine handles ground truth. The AI handles teaching. That combination — the
          calculator and the teacher together — is what makes an AI chess coach worth using over a
          raw engine.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>How AI chess coaches work</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              title: "Engine evaluates the position",
              desc: "Stockfish (or another strong engine) produces a numerical score and a principal variation for each move. This is the ground truth.",
            },
            {
              title: "AI reads the evaluation",
              desc: "A large language model — for Chess Masti, Claude — reads the engine output, the position, and your move history. It identifies critical moments where evaluation changed sharply.",
            },
            {
              title: "AI explains in your language",
              desc: "Instead of a number, you get a paragraph: what the plan was, where it broke down, the tactical or positional theme you missed, and what to look for next time.",
            },
            {
              title: "Coach checks itself",
              desc: "Chess Masti runs a validator before showing you the explanation. Tactical claims are checked against engine output so the coach does not hallucinate moves or evaluations.",
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
        <SectionHeading>Is an AI chess coach worth it?</SectionHeading>
        <ProseBlock>
          Yes — if the AI is grounded in an actual engine and verifies its claims. A raw LLM that
          guesses chess moves will hallucinate lines that look plausible but are illegal, blundering,
          or analytically wrong. The chess world has been burned by this enough times that
          "AI-generated chess advice" is a fair thing to be skeptical of.
        </ProseBlock>
        <ProseBlock>
          An AI chess coach that wires the engine in first — like Chess Masti AI — gets you the
          explanation without the hallucination. And because it is free, there is no downside to
          trying it on your next bad loss.
        </ProseBlock>
      </Box>

      <CrossLinkCallout
        title="The full feature set lives on the main page"
        blurb="The exact-match page covers what you can do, how it works, the engine vs. coach distinction, comparison to other tools, and a longer FAQ. If you want the comprehensive overview, start there."
        href="/free-ai-chess-coach"
        cta="See the free AI chess coach page"
      />

      <FooterCta title="Try the AI chess coach" sub="Paste a PGN or FEN. No account required to start." />
    </PageShell>
  );
}
