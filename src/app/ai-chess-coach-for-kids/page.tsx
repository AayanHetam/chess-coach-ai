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
} from "@/app/_seo/aeoUi";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const URL = "https://chessmasti.com/ai-chess-coach-for-kids";
const HERE = "AI Chess Coach for Kids";

export const metadata: Metadata = {
  title: {
    absolute: "AI Chess Coach for Kids | Free, Plain-Language Game Reviews",
  },
  description:
    "A free AI chess coach for kids: clear explanations of mistakes, puzzles tailored to what they got wrong, and no jargon. Parent-friendly, no in-app purchases.",
  alternates: { canonical: URL },
  openGraph: {
    title: "AI Chess Coach for Kids | Chess Masti AI",
    description:
      "Clear, kid-friendly game reviews. No jargon, no in-app purchases. Free.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Chess Coach for Kids | Chess Masti AI",
    description:
      "Clear, kid-friendly game reviews. No jargon, no in-app purchases. Free.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function AiChessCoachForKidsPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "AI Chess Coach for Kids | Free, Plain-Language Game Reviews",
      url: URL,
      description:
        "Free AI chess coach tuned for kid-friendly explanations and parent-friendly access.",
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

      <H1>AI Chess Coach for Kids</H1>

      <AnswerBlock>
        Kids need a chess coach that explains things clearly and turns mistakes
        into something they can practice. Chess Masti AI is free, ad-free during
        analysis, and explains every move in plain language. It works well for
        scholastic players, club kids, and parents who want to help their child
        review games without becoming a chess teacher themselves.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Try the AI coach
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What makes it kid-friendly</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              title: "Clear explanations, not engine jargon",
              desc: 'The coach explains moves in words a 9-year-old can follow: "this knight protects two squares near the king" instead of "+0.5 centipawn advantage." If you can read, you can use it.',
            },
            {
              title: "Mistake puzzles that fit a short attention span",
              desc: "Each puzzle is one position. The kid solves it or doesn't. Either way it's quick. Better for a 15-minute review session than wading through a 40-move analysis.",
            },
            {
              title: "Free coaching",
              desc: "Chess Masti's coaching features are free and unlimited.",
            },
            {
              title: "Parents don't need to be chess players",
              desc: "If you don't know what a fork is, that's fine. Paste your kid's PGN, read the explanation together, and you'll learn alongside them. The coach is the teacher; you're the partner.",
            },
          ].map((item) => (
            <Box key={item.title} sx={glassCard}>
              <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>
                {item.title}
              </Typography>
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "0.9rem",
                  lineHeight: 1.8,
                }}
              >
                {item.desc}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Honest notes for parents</SectionHeading>
        <ProseBlock>
          The chat is powered by an LLM (Claude AI). It produces text responses.
          The system prompt is tuned for clarity and patience, but kids may
          still encounter the occasional dry or technical answer. If you want to
          vet the tone before handing it to a younger child, run a few of their
          games through first.
        </ProseBlock>
        <ProseBlock>
          Account features (saved games, personalization) require sign-in. For
          kids under 13, COPPA and similar regulations apply — handle the
          account from a parent address rather than giving a child unsupervised
          account creation. The analysis board itself works without an account,
          so you don&apos;t need to register to get coaching.
        </ProseBlock>
        <ProseBlock>
          Chess Masti is not a chess-teaching curriculum for absolute beginners
          — it&apos;s a coach for kids who already play. If your child has never
          played a full game yet, start with a learn-to-play resource and come
          back here once they have a few games to review.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>How to use it as a coach for your kid</SectionHeading>
        <ProseBlock>
          1. After their game (Lichess, Chess.com, or club games written down),
          grab the PGN.
        </ProseBlock>
        <ProseBlock>
          2. Paste it in. Sit next to them. Click through the moves together.
          Stop at the biggest eval swings — those are where the lesson is.
        </ProseBlock>
        <ProseBlock>
          3. Read the explanation together. Ask the chat a follow-up question if
          they don&apos;t understand: &quot;why was that bad?&quot; or
          &quot;what could I have done instead?&quot;
        </ProseBlock>
        <ProseBlock>
          4. Convert the worst mistake into a puzzle. Drill it five times. One
          lesson per game is plenty.
        </ProseBlock>
      </Box>

      <CrossLinkCallout
        title="See the full Chess Masti walkthrough"
        blurb="The free AI chess coach page covers the full feature set, including how the engine + AI pipeline works."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta
        title="Coach your kid's chess games"
        sub="Paste a PGN. Sit together. Read the lesson."
      />
    </PageShell>
  );
}
