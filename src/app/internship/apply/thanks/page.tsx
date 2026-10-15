import type { Metadata } from "next";
import { Box, Button, Container, Link, Typography } from "@mui/material";
import { Masti } from "@/components/masti";
import { RADIUS } from "@/theme/tokens";
import InternshipNav from "../../InternshipNav";
import InternshipFooter from "../../InternshipFooter";
import { getAuthEnv } from "@/env";

export const metadata: Metadata = {
  title: "Application received: CMIP",
  description:
    "Your CMIP application is in. We'll be in touch about the interview.",
  robots: { index: false, follow: false },
};

export default function ThanksPage() {
  const contactEmail = getAuthEnv().cmip.contactEmail;

  return (
    <Box
      sx={{
        overflowX: "hidden",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <InternshipNav />

      <Box
        component="section"
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          py: { xs: 12, md: 16 },
          px: { xs: 2, md: 4 },
        }}
      >
        <Container maxWidth="sm" sx={{ textAlign: "center" }}>
          {/* The confirmation state: the generic check glyph becomes the
              coach celebrating. The heading right under him says what
              happened, so the figure carries a plain name, not a caption. */}
          <Box sx={{ mb: 2 }}>
            <Masti
              mood="excited"
              size={150}
              loops={3}
              priority
              label="Masti the Monkey, the Chess Masti coach, jumping with excitement"
            />
          </Box>

          <Typography variant="h1" sx={{ color: "text.primary", mb: 2 }}>
            Application received
          </Typography>
          <Typography sx={{ color: "text.secondary", mb: 4 }}>
            Thanks, your CMIP application is in. You should see a confirmation
            email in your inbox within a few minutes (check spam if not).
          </Typography>

          <Box
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: `${RADIUS.card}px`,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              textAlign: "left",
            }}
          >
            <Typography
              variant="h6"
              component="h2"
              sx={{ color: "text.primary", mb: 1 }}
            >
              What's next: the interview
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
              Every applicant interviews. If your application looks like a fit,
              we'll reach out within 7–10 days to schedule a real conversation
              about your work and the track you picked.
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Questions or didn't get the confirmation email? Write to{" "}
              <Link
                href={`mailto:${contactEmail}`}
                underline="always"
                sx={{ color: "text.primary", fontWeight: 600 }}
              >
                {contactEmail}
              </Link>
              .
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 2,
              justifyContent: "center",
              mt: 5,
              flexWrap: "wrap",
            }}
          >
            <Button variant="contained" href="/internship">
              Back to program details
            </Button>
            <Button variant="outlined" color="inherit" href="/">
              Back home
            </Button>
          </Box>
        </Container>
      </Box>

      <InternshipFooter />
    </Box>
  );
}
