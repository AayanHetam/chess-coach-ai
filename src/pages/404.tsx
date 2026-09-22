import Head from "next/head";
import Link from "next/link";
import { Box, Button, Stack, Typography } from "@mui/material";
import { Masti } from "@/components/masti";

/**
 * The site's 404. Layout supplies the nav pill and the backdrop (this route is
 * not self-chromed), so the page is just Masti, one line, and three ways out.
 * Static by design: a 404 page cannot use data fetching.
 */
export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title key="title">Page not found — Chess Masti AI</title>
        <meta key="robots" name="robots" content="noindex" />
      </Head>
      <Box
        sx={{
          minHeight: "70dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 3,
          py: 8,
          textAlign: "center",
        }}
      >
        <Box sx={{ maxWidth: 520 }}>
          <Masti
            mood="defeated"
            size={180}
            loops={2}
            label="Masti the Monkey, dizzy after walking into a missing page"
          />
          <Typography
            component="h1"
            sx={{
              mt: 2,
              fontSize: { xs: "1.6rem", md: "2rem" },
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "rgba(255,255,255,0.95)",
            }}
          >
            That square is off the board.
          </Typography>
          <Typography
            sx={{
              mt: 1,
              color: "rgba(255,255,255,0.62)",
              fontSize: "0.98rem",
              lineHeight: 1.6,
            }}
          >
            The page you asked for does not exist, or it moved. Masti checked
            twice.
          </Typography>
          <Stack
            direction="row"
            spacing={1.5}
            justifyContent="center"
            sx={{ mt: 3.5, flexWrap: "wrap", rowGap: 1.5 }}
          >
            <Button
              component={Link}
              href="/"
              variant="contained"
              disableElevation
              sx={{
                bgcolor: "#F97316",
                color: "#0A0A0A",
                fontWeight: 700,
                px: 3,
                borderRadius: "999px",
                "&:hover": { bgcolor: "#FB923C" },
              }}
            >
              Back home
            </Button>
            <Button
              component={Link}
              href="/puzzles"
              variant="outlined"
              sx={{
                color: "rgba(255,255,255,0.92)",
                borderColor: "rgba(255,255,255,0.18)",
                fontWeight: 600,
                px: 3,
                borderRadius: "999px",
              }}
            >
              Solve a puzzle
            </Button>
            <Button
              component={Link}
              href="/analysis"
              variant="outlined"
              sx={{
                color: "rgba(255,255,255,0.92)",
                borderColor: "rgba(255,255,255,0.18)",
                fontWeight: 600,
                px: 3,
                borderRadius: "999px",
              }}
            >
              Analyze a game
            </Button>
          </Stack>
        </Box>
      </Box>
    </>
  );
}
