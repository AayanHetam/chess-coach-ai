import { Box } from "@mui/material";
import { PageTitle } from "@/components/pageTitle";
import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import LandingFeatures from "@/components/landing/LandingFeatures";
import DailyPuzzle from "@/components/landing/DailyPuzzle";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks";
import LandingComparison from "@/components/landing/LandingComparison";
import LandingTestimonials from "@/components/landing/LandingTestimonials";
import LandingCTA from "@/components/landing/LandingCTA";
import LandingFooter from "@/components/landing/LandingFooter";

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
      <PageTitle title="Chess Coach AI - Your AI Chess Coach That Actually Understands Chess" />
      <LandingNav />
      <LandingHero />
      <LandingFeatures />
      <DailyPuzzle />
      <LandingHowItWorks />
      <LandingComparison />
      <LandingTestimonials />
      <LandingCTA />
      <LandingFooter />
    </Box>
  );
}
