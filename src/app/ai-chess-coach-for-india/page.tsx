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

const URL = "https://chessmasti.com/ai-chess-coach-for-india";
const HERE = "AI Chess Coach for India";

export const metadata: Metadata = {
  title: { absolute: "AI Chess Coach for India | Free AI Chess Coaching by an Indian Founder" },
  description:
    "A free AI chess coach for Indian players: works on low-bandwidth connections, no subscription, no GST surprise. Built by an Indian founder for Indian club, school, and rated players.",
  alternates: { canonical: URL },
  openGraph: {
    title: "AI Chess Coach for India | Chess Masti AI",
    description:
      "Free AI chess coach built by an Indian founder. No subscription, no GST surprise, works on low bandwidth.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Chess Coach for India | Chess Masti AI",
    description: "Free AI chess coach built by an Indian founder. No subscription, no GST.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function AiChessCoachForIndiaPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "AI Chess Coach for India | Free AI Chess Coaching by an Indian Founder",
      url: URL,
      description: "Free AI chess coach built by an Indian founder for Indian players.",
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

      <H1>AI Chess Coach for India</H1>

      <AnswerBlock>
        Chess Masti AI is a free AI chess coach built in India for chess players who want serious
        analysis without the subscription tax. Engine runs in your browser (Stockfish WASM, no
        cloud-engine quota). The coach explains every critical move in plain English. No GST
        surprise at checkout — there&apos;s no checkout. Just paste a PGN and start.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/analysis" primary>
          Try Chess Masti AI
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Why it fits the Indian chess landscape</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              title: "Built for the budget that matters",
              desc: "Most international chess coaching sites charge $10-30/month. That's a real cost for a school student or club player in India. Chess Masti is fully free with no analysis cap, no Diamond tier, and no upsell during reviews.",
            },
            {
              title: "Works on low bandwidth",
              desc: "Stockfish runs locally in your browser — the engine work doesn't need a fast connection. The AI explanations are small text payloads. The app is usable on 4G in a tier-2 city without the spinners every chess platform shows when bandwidth is tight.",
            },
            {
              title: "Plain-English explanations",
              desc: "The coach explains positions in straightforward English without assuming opening jargon. Useful for players whose first language isn't English but who can read it fluently.",
            },
            {
              title: "Indian player workflows",
              desc: "Supports PGN import from Lichess and Chess.com — the two platforms most Indian rated players use. Opponent scouting works on Lichess and Chess.com usernames. Save your games and revisit them later.",
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
        <SectionHeading>Who&apos;s building it</SectionHeading>
        <ProseBlock>
          Chess Masti AI is built by Aayan Hetamsaria, growing up in urban India. The product is
          designed around the gap between Indian chess talent (which is enormous) and Indian access
          to one-on-one coaching (which is expensive). The goal: a serious AI coach for the kid in
          Pune or the club player in Chennai who can&apos;t justify a monthly subscription but
          still wants real chess feedback.
        </ProseBlock>
        <ProseBlock>
          The product is live at chessmasti.com — that&apos;s the URL, you&apos;re on it now. It
          will stay free for personal use.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Three workflows it&apos;s built for</SectionHeading>
        <ProseBlock>
          <strong style={{ color: "#fff" }}>1. School and club rated player.</strong> Review your
          tournament games. The coach flags the moves that cost you rating points and turns them
          into puzzle drills.
        </ProseBlock>
        <ProseBlock>
          <strong style={{ color: "#fff" }}>2. Online improver.</strong> Lichess or Chess.com games,
          a few per day. Bulk-paste PGNs, focus on the worst loss, drill the mistake.
        </ProseBlock>
        <ProseBlock>
          <strong style={{ color: "#fff" }}>3. Coach support tool.</strong> If you teach chess —
          school club, after-school class, online students — use Chess Masti to demonstrate
          mistakes in their own games. The training-loop is the part most coaches don&apos;t have
          time to build by hand.
        </ProseBlock>
      </Box>

      <CrossLinkCallout
        title="See the full Chess Masti overview"
        blurb="The main free AI chess coach page covers the pipeline, the feature set, and a longer comparison to other tools."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Start coaching your games" sub="Free. No subscription. No GST. Paste a PGN." />
    </PageShell>
  );
}
