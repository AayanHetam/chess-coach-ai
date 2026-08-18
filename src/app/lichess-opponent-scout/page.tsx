import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  AEO_TOKENS,
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

const URL = "https://chessmasti.com/lichess-opponent-scout";
const HERE = "Lichess Opponent Scout";

export const metadata: Metadata = {
  title: { absolute: "Lichess Opponent Scout | Free Pre-Game Opponent Analysis" },
  description:
    "A free Lichess opponent scout: paste any Lichess username and get opening trees, repertoire collisions against yours, a Tells readout, and tilt/timeout psychology profiles in seconds.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Lichess Opponent Scout | Chess Masti AI",
    description:
      "Free opponent scout for Lichess. Opening trees, Tells, tilt profile, repertoire collisions. Seconds, not hours.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lichess Opponent Scout | Chess Masti AI",
    description: "Free opponent scout for Lichess. Tells, tilt profile, repertoire collisions.",
    images: ["/og/free-ai-chess-coach"],
  },
};

export default function LichessOpponentScoutPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Lichess Opponent Scout | Free Pre-Game Opponent Analysis",
      url: URL,
      description:
        "Free Lichess opponent scout. Opening tendencies, Tells, psychological tilt profile, repertoire collisions — pre-game prep in seconds.",
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

      <H1>Lichess Opponent Scout</H1>

      <AnswerBlock>
        A Lichess opponent scout pulls a player&apos;s public Lichess game history and turns it into
        pre-game prep: their opening tendencies, the lines where they over- and under-perform, a
        Tells readout that quantifies how readable they are, and a psychology profile that flags
        tilt and time-trouble patterns. Chess Masti AI does all of this free. Paste any Lichess
        username; the dashboard renders in seconds.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/scout" primary>
          Scout a Lichess opponent
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What you get when you scout a Lichess player</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            {
              title: "Opening repertoire tree",
              desc: "Their actual move frequencies as both White and Black, drilled by ECO code. The tree shows what they play, how often, and what they score in each line. Filter by minimum sample size so you don't prep against a fluke.",
            },
            {
              title: "Repertoire collisions vs. yours",
              desc: "Paste your Lichess username too and the tool finds the lines where you over-perform and they under-perform. These are the lines you should be willing to play if you reach them.",
            },
            {
              title: "Tells",
              desc: "A 0-100 readability index. A high Tells score means predictable openings, narrow repertoire, time-trouble, or tilt-loss patterns. Low means they're solid across the board and you'll have to outplay them.",
            },
            {
              title: "Tilt and timeout psychology",
              desc: "How often they lose on time, lose after losing, lose long endgames, win by checkmate vs. resignation. The pattern tells you whether to grind or to complicate.",
            },
            {
              title: "Novelty / deviation finder",
              desc: "Specific game moments where this opponent deviated from their own book. The deviations are usually mistakes; knowing them gives you concrete prep.",
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
        <SectionHeading>Why bother scouting an online opponent?</SectionHeading>
        <ProseBlock>
          Lichess publishes every rated game. That means every opponent you face online has a
          public training corpus you can study — except no one studies it because the analysis
          would take hours per opponent. The scout collapses those hours into seconds.
        </ProseBlock>
        <ProseBlock>
          For arranged matches (team leagues, tournaments, club games) the value is obvious. But
          even for a quick blitz session, knowing your opponent over-performs in the Sicilian
          Najdorf and crumbles against the London System changes how you open. Same player, your
          choice of line, different outcome distribution.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>How to use the scout</SectionHeading>
        <ProseBlock>
          1. Open <Box component="a" href="/scout" sx={{ color: AEO_TOKENS.ember, textDecoration: "none" }}>/scout</Box> and paste a Lichess username.
        </ProseBlock>
        <ProseBlock>
          2. Optionally paste your own Lichess username to unlock the repertoire-collision panel.
        </ProseBlock>
        <ProseBlock>
          3. The dashboard renders the opening tree, Tells, tilt profile, and (if you
          supplied your username) the collision panel. Drill into specific lines to see exact game
          counts and scores.
        </ProseBlock>
        <ProseBlock>
          4. Share the report. Each scout can be saved as a snapshot and shared as a public link
          via <Box component="a" href="/share/scout/[id]" sx={{ color: AEO_TOKENS.ember, textDecoration: "none" }}>/share/scout/&lt;id&gt;</Box> — useful for prep with a coach or teammate.
        </ProseBlock>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>What about Chess.com?</SectionHeading>
        <ProseBlock>
          Same scout works on Chess.com usernames too — just select &quot;Chess.com&quot; in the
          platform dropdown. The data pipeline is different (Chess.com&apos;s archive API vs.
          Lichess&apos;s database export) but the dashboard is identical.
        </ProseBlock>
      </Box>

      <CrossLinkCallout
        title="See the full free AI chess coach"
        blurb="The scout is one piece of the bigger free chess coach pipeline — game analysis with engine-grounded AI explanations, mistake-based puzzles, and follow-up chat. The main page covers the rest."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta
        title="Scout a Lichess opponent free"
        sub="Paste a username. The dashboard renders in seconds. No login required."
      />
    </PageShell>
  );
}
