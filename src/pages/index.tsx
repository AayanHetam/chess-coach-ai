import { Box } from "@mui/material";
import Head from "next/head";
import LandingAnnouncementBar from "@/components/landing/LandingAnnouncementBar";
import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import LandingFeatures from "@/components/landing/LandingFeatures";
import DailyPuzzle from "@/components/landing/DailyPuzzle";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks";
import LandingComparison from "@/components/landing/LandingComparison";
import LandingTestimonials from "@/components/landing/LandingTestimonials";
import LandingAbout from "@/components/landing/LandingAbout";
import LandingInternship from "@/components/landing/LandingInternship";
import LandingCTA from "@/components/landing/LandingCTA";
import LandingFooter from "@/components/landing/LandingFooter";

const HOME_TITLE =
  "Chess Masti AI — engine-grounded chess coaching, free";
const HOME_DESC =
  "A chess coach that runs Stockfish 17 first, asks Claude to explain in plain English, then validates every claim against the live board. 100,000+ Lichess puzzles in a Neo4j graph. Free.";

const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Chess Masti AI",
  url: "https://chessmasti.com",
  applicationCategory: "GameApplication",
  operatingSystem: "Web",
  description:
    "Free conversational chess coaching: Stockfish 17 evaluates, Claude explains, a hallucination validator checks every claim, and adaptive puzzles come from a 100,000+ position Neo4j graph.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Engine-grounded coaching using Stockfish 17 WASM",
    "Two-tier Anthropic Claude (Sonnet for analysis, Haiku for chat)",
    "Hallucination validator backed by chess.js",
    "Maia-2 humanlike opponent (Twin Bot)",
    "Adaptive puzzles from a 100,000+ position Neo4j graph",
    "FEN cosine-similarity puzzle re-ranking",
    "Lichess OAuth 2.0 PKCE live play",
    "Opponent scouting with Stalker Score",
  ],
  creator: { "@type": "Person", name: "Aayan Hetamsaria" },
};

export default function LandingPage() {
  return (
    <Box
      sx={{
        margin: "0 !important",
        padding: "0 !important",
        maxWidth: "100% !important",
        width: "100vw",
        marginLeft: "calc(-50vw + 50%) !important",
        overflowX: "hidden",
        "& *": { scrollBehavior: "smooth" },
      }}
    >
      <Head>
        <title key="title">{HOME_TITLE}</title>
        <meta key="description" name="description" content={HOME_DESC} />
        <link key="canonical" rel="canonical" href="https://chessmasti.com/" />
        <meta key="og:title" property="og:title" content={HOME_TITLE} />
        <meta key="og:description" property="og:description" content={HOME_DESC} />
        <meta key="og:url" property="og:url" content="https://chessmasti.com/" />
        <meta key="og:type" property="og:type" content="website" />
        <meta
          key="twitter:title"
          name="twitter:title"
          content={HOME_TITLE}
        />
        <meta
          key="twitter:description"
          name="twitter:description"
          content={HOME_DESC}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD) }}
        />
      </Head>
      <LandingAnnouncementBar />
      <LandingNav />
      <LandingHero />
      <LandingInternship />
      <LandingFeatures />
      <DailyPuzzle />
      <LandingHowItWorks />
      <LandingComparison />
      <LandingTestimonials />
      <LandingAbout />
      <LandingCTA />
      <LandingFooter />
    </Box>
  );
}
