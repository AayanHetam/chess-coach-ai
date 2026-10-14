import type { Metadata } from "next";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Masti } from "@/components/masti";

/**
 * The site's 404. In a mixed Pages + App Router app the App Router's
 * not-found serves every unmatched URL, so this is the one that renders (a
 * pages/404.tsx never would). It sits inside app/layout.tsx, whose
 * ThemeRegistry is the site theme in its light mode, so every colour here
 * comes from that theme's palette rather than the dark product chrome.
 */

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <Box
      component="main"
      sx={{
        maxWidth: 640,
        mx: "auto",
        px: 2.5,
        pt: 8,
        pb: 12,
        textAlign: "center",
        color: "text.primary",
      }}
    >
      <Masti
        mood="defeated"
        size={180}
        loops={2}
        label="Masti the Monkey, facepalming after walking into a missing page"
      />
      <Typography variant="h1" sx={{ mt: 2.5, mb: 1 }}>
        That square is off the board.
      </Typography>
      <Typography sx={{ mb: 3.5, color: "text.secondary" }}>
        The page you asked for does not exist, or it moved. Masti checked twice.
      </Typography>
      <Box
        component="nav"
        aria-label="Ways back"
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 1.5,
        }}
      >
        <Button component={Link} href="/" variant="contained">
          Back home
        </Button>
        <Button
          component={Link}
          href="/puzzles"
          variant="outlined"
          color="inherit"
        >
          Solve a puzzle
        </Button>
        <Button
          component={Link}
          href="/analysis"
          variant="outlined"
          color="inherit"
        >
          Analyze a game
        </Button>
      </Box>
    </Box>
  );
}
