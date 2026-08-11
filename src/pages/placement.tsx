import Head from "next/head";
import { Box } from "@mui/material";
import PlacementTest from "@/components/placement/PlacementTest";
import { NavPill } from "@/components/ui/NavPill";

const PAGE_TITLE = "Find your chess rating — Chess Masti AI";
const PAGE_DESC =
  "Take a free 20-puzzle adaptive placement test to find your chess rating and unlock a personalized training plan.";

/**
 * Placement-test page. Bridges onboarding → the learning dashboard: a logged-in
 * user takes the 20-puzzle adaptive test, which measures their rating + weakness
 * map and seeds the curriculum, then routes to /learn.
 */
export default function PlacementPage() {
  return (
    <>
      <Head>
        <title key="title">{PAGE_TITLE}</title>
        <meta key="description" name="description" content={PAGE_DESC} />
        <link
          key="canonical"
          rel="canonical"
          href="https://chessmasti.com/placement"
        />
      </Head>
      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          pt: 2,
          px: { xs: 2, md: 3 },
          background:
            "radial-gradient(1200px 600px at 50% -10%, rgba(249,115,22,0.12), transparent 60%), linear-gradient(180deg, #0A0B0F 0%, #0E1016 100%)",
        }}
      >
        <NavPill />
        <PlacementTest />
      </Box>
    </>
  );
}
