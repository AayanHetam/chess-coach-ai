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

const URL = "https://chessmasti.com/best-free-ai-chess-coach";
const HERE = "Best Free AI Chess Coach";

export const metadata: Metadata = {
  title: { absolute: "Best Free AI Chess Coach in 2026 | Honest Ranking" },
  description:
    "An honest ranking of the best free AI chess coaches in 2026. What they do well, what they don't, and which one to pick based on what you're trying to improve.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Best Free AI Chess Coach in 2026 | Chess Masti AI",
    description:
      "An honest ranking of free AI chess coaches. What each does well, what they don't, and which one to pick.",
    url: URL,
    images: [{ url: "/og/free-ai-chess-coach" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Free AI Chess Coach in 2026 | Chess Masti AI",
    description:
      "An honest ranking of free AI chess coaches. What each does well, what they don't, and which one to pick.",
    images: ["/og/free-ai-chess-coach"],
  },
};

const ENTRIES = [
  {
    rank: 1,
    name: "Chess Masti AI",
    href: "/free-ai-chess-coach",
    pitch: "Best overall free AI chess coach with a training loop",
    body: "Stockfish engine analysis paired with Claude AI explanations. Your worst mistakes become puzzles automatically. You can ask follow-up questions in plain language. Opponent scouting is included. The validator pipeline checks claims against engine output before showing them to you. Fully free with no analysis cap.",
    bestFor: "Players who want to actually improve, not just understand a single position.",
  },
  {
    rank: 2,
    name: "Lichess analysis",
    href: null,
    pitch: "Best free pure-engine evaluation",
    body: "Free, fast, and uses Stockfish. The analysis board is excellent for raw engine work — annotation, move classification, opening explorer, masters database. What you don't get is natural-language explanation or a structured training loop. You see the numbers and have to interpret them yourself.",
    bestFor: "Players who already read engine output fluently and want the strongest free engine tool.",
  },
  {
    rank: 3,
    name: "DecodeChess (free tier)",
    href: "/decodechess-alternative",
    pitch: "Best deep explanation of a single position",
    body: "AI-generated narrative explanations of chess positions. Strong on single-position depth. The constraint is the free tier — the full feature set requires a subscription. Best for occasional deep dives rather than reviewing whole games.",
    bestFor: "Players who want a thorough writeup of one critical moment.",
  },
  {
    rank: 4,
    name: "Chess.com Game Review (limited free)",
    href: null,
    pitch: "Best if you already play on Chess.com",
    body: "Game review with engine analysis and basic insights. Some features are gated behind a Diamond membership; the free tier is limited in how many reviews per day. Best for casual reviews of your Chess.com games if you don't want to leave the platform.",
    bestFor: "Players who only play on Chess.com and want light analysis in-platform.",
  },
];

export default function BestFreeAiChessCoachPage() {
  const schemas = [
    buildWebPageJsonLd({
      name: "Best Free AI Chess Coach in 2026 | Honest Ranking",
      url: URL,
      description:
        "Ranked comparison of free AI chess coaches in 2026 with honest assessment of what each does well and which to pick.",
    }),
    buildBreadcrumbJsonLd({ here: HERE, url: URL }),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: ENTRIES.map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: e.name,
        description: e.pitch,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "LearningResource",
      name: "Best Free AI Chess Coach in 2026 | Honest Ranking",
      url: URL,
      description:
        "An honest ranking of the free AI chess coaches available in 2026 with criteria, comparisons, and decision guidance for players choosing one.",
      learningResourceType: "Comparison guide",
      educationalLevel: "Beginner to Intermediate",
      educationalUse: "Self-study",
      teaches: [
        "How to evaluate a free AI chess coach",
        "When to use an engine-only tool vs an AI coach",
        "Why a training loop matters more than explanation alone",
      ],
      audience: {
        "@type": "EducationalAudience",
        audienceType: "Chess players evaluating coaching tools",
      },
      about: {
        "@type": "Thing",
        name: "AI chess coaching",
      },
      inLanguage: "en",
      isAccessibleForFree: true,
      isPartOf: { "@id": "https://chessmasti.com/#website" },
      provider: { "@id": "https://chessmasti.com/#organization" },
    },
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

      <H1>Best Free AI Chess Coach in 2026</H1>

      <AnswerBlock>
        The best free AI chess coach is the one that does three things well: evaluates positions
        accurately, explains them in language you understand, and gives you something to practice.
        Most tools stop at one of the three. The ranking below is honest about which tools cover
        which step and who each is best for. Chess Masti AI tops it because it closes the full loop
        — but if you only need part of the loop, the lower-ranked options may be a better fit.
      </AnswerBlock>

      <CtaRow>
        <CtaButton href="/free-ai-chess-coach" primary>
          Top pick: free AI chess coach
        </CtaButton>
        <CtaButton href="/analysis">Analyze a game now</CtaButton>
      </CtaRow>

      <Box component="section" sx={{ mb: 8 }}>
        <SectionHeading>Ranking criteria</SectionHeading>
        <ProseBlock>
          Three buckets, weighted equally:
        </ProseBlock>
        <Box component="ol" sx={{ pl: 3, color: "rgba(255,255,255,0.7)", lineHeight: 2 }}>
          <li><strong style={{ color: "#fff" }}>Engine accuracy.</strong> Is the underlying evaluation Stockfish or comparable? Can it be trusted?</li>
          <li><strong style={{ color: "#fff" }}>Explanation quality.</strong> Does the tool translate the engine output into plain language that helps you actually understand the position?</li>
          <li><strong style={{ color: "#fff" }}>Training loop.</strong> After you understand the mistake, does the tool give you something to practice? Without the loop, explanation is entertainment, not improvement.</li>
        </Box>
        <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.85rem", mt: 2 }}>
          Bias disclosure: this ranking is published by Chess Masti AI. The criteria are honest, but
          the #1 slot is our own product. Cross-check by reading neutral reviews.
        </Typography>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>The ranking</SectionHeading>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {ENTRIES.map((entry) => (
            <Box key={entry.rank} sx={glassCard}>
              <Box sx={{ display: "flex", gap: 2.5, alignItems: "flex-start", mb: 2 }}>
                <Box
                  sx={{
                    flexShrink: 0,
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: entry.rank === 1 ? `${AEO_TOKENS.ember}22` : "rgba(255,255,255,0.05)",
                    border: `1px solid ${entry.rank === 1 ? AEO_TOKENS.ember + "55" : AEO_TOKENS.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    color: entry.rank === 1 ? AEO_TOKENS.ember : "rgba(255,255,255,0.6)",
                  }}
                >
                  #{entry.rank}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography
                    component={entry.href ? "a" : "span"}
                    href={entry.href ?? undefined}
                    sx={{
                      fontWeight: 700,
                      color: "#fff",
                      fontSize: "1.1rem",
                      textDecoration: "none",
                      display: "block",
                      "&:hover": entry.href ? { color: AEO_TOKENS.ember } : {},
                    }}
                  >
                    {entry.name}
                  </Typography>
                  <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.9rem", mt: 0.5 }}>
                    {entry.pitch}
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.8, mb: 2 }}>
                {entry.body}
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", fontStyle: "italic" }}>
                <strong style={{ color: "rgba(255,255,255,0.75)" }}>Best for:</strong> {entry.bestFor}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", mt: 3 }}>
          Verified at time of writing. Free tiers and pricing change — check each product&apos;s site
          before deciding.
        </Typography>
      </Box>

      <Box component="section" sx={{ mb: 10 }}>
        <SectionHeading>Which one should you pick?</SectionHeading>
        <Box sx={glassCard}>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1.5 }}>
            If you&apos;re trying to improve →
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 3, lineHeight: 1.8 }}>
            Chess Masti AI. The training loop is what moves ratings. Explanation alone is comfort
            food.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1.5 }}>
            If you can already read engine output →
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 3, lineHeight: 1.8 }}>
            Lichess analysis. Fast, free, no fluff. You don&apos;t need an LLM telling you what
            +1.2 means.
          </Typography>
          <Typography sx={{ color: "#fff", fontWeight: 600, mb: 1.5 }}>
            If you want one deep position writeup →
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
            DecodeChess on its free tier, or pay for the full version if it&apos;s worth it to you.
          </Typography>
        </Box>
      </Box>

      <CrossLinkCallout
        title="See the full Chess Masti walkthrough"
        blurb="The main page covers the pipeline (Stockfish → Claude → validator), feature breakdown, FAQ, and how it differs from a raw chess engine."
        href="/free-ai-chess-coach"
        cta="Open the free AI chess coach page"
      />

      <FooterCta title="Try the top pick" sub="Paste a PGN or FEN. No account required to start." />
    </PageShell>
  );
}
