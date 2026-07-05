import { Box } from "@mui/material";
import Head from "next/head";
import LandingAnnouncementBar from "@/components/landing/LandingAnnouncementBar";
import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import LandingFeatures from "@/components/landing/LandingFeatures";
import DailyPuzzle from "@/components/landing/DailyPuzzle";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks";
import LandingExtensionCallout from "@/components/landing/LandingExtensionCallout";
import LandingComparison from "@/components/landing/LandingComparison";
import LandingTestimonials from "@/components/landing/LandingTestimonials";
import LandingAbout from "@/components/landing/LandingAbout";
import LandingInternship from "@/components/landing/LandingInternship";
import LandingCTA from "@/components/landing/LandingCTA";
import LandingFooter from "@/components/landing/LandingFooter";
import { InternalHomeCard } from "@/components/intern/InternalHomeCard";
import { homePageJsonLd } from "@/app/_seo/JsonLd";

const HOME_TITLE =
  "Chess Masti AI — engine-grounded chess coaching, free";
const HOME_DESC =
  "AI chess coach: Stockfish 17 evaluates first, Claude explains, a hallucination validator checks every claim. 100,000+ Lichess puzzles in a Neo4j graph. Free.";
const HOME_OG_IMAGE = "https://chessmasti.com/social-networks-1200x630.png";

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

        <meta key="og:type" property="og:type" content="website" />
        <meta
          key="og:site_name"
          property="og:site_name"
          content="Chess Masti AI"
        />
        <meta key="og:title" property="og:title" content={HOME_TITLE} />
        <meta
          key="og:description"
          property="og:description"
          content={HOME_DESC}
        />
        <meta key="og:url" property="og:url" content="https://chessmasti.com/" />
        <meta key="og:image" property="og:image" content={HOME_OG_IMAGE} />
        <meta
          key="og:image:width"
          property="og:image:width"
          content="1200"
        />
        <meta
          key="og:image:height"
          property="og:image:height"
          content="630"
        />

        <meta
          key="twitter:card"
          name="twitter:card"
          content="summary_large_image"
        />
        <meta
          key="twitter:site"
          name="twitter:site"
          content="@ChessMastiAI"
        />
        <meta
          key="twitter:creator"
          name="twitter:creator"
          content="@ChessMastiAI"
        />
        <meta key="twitter:title" name="twitter:title" content={HOME_TITLE} />
        <meta
          key="twitter:description"
          name="twitter:description"
          content={HOME_DESC}
        />
        <meta
          key="twitter:image"
          name="twitter:image"
          content={HOME_OG_IMAGE}
        />

        {homePageJsonLd.map((node) => (
          <script
            key={node["@id"]}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
          />
        ))}
      </Head>
      <LandingAnnouncementBar />
      <LandingNav />
      {/* Renders only for logged-in CMIP interns; renders nothing for customers. */}
      <InternalHomeCard />
      <LandingHero />
      <LandingInternship />
      <LandingFeatures />
      <DailyPuzzle />
      <LandingHowItWorks />
      <LandingExtensionCallout />
      <LandingComparison />
      <LandingTestimonials />
      <LandingAbout />
      <LandingCTA />
      <LandingFooter />
    </Box>
  );
}
