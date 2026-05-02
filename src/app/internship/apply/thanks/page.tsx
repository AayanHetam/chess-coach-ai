import type { Metadata } from "next";
import { Box, Button, Container, Typography } from "@mui/material";
import { Icon } from "@iconify/react";
import InternshipNav from "../../InternshipNav";
import InternshipFooter from "../../InternshipFooter";
import { getAuthEnv } from "@/env";

export const metadata: Metadata = {
  title: "Application received — CMIP",
  description: "Your CMIP application is in. We'll be in touch about the interview.",
  robots: { index: false, follow: false },
};

export default function ThanksPage() {
  const contactEmail = getAuthEnv().cmip.contactEmail;

  return (
    <Box sx={{ overflowX: "hidden", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <InternshipNav />

      <Box
        component="section"
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          py: { xs: 12, md: 16 },
          px: { xs: 2, md: 4 },
          background: "linear-gradient(135deg, #FFFFFF 0%, #FFF8F5 30%, #FFE4D6 100%)",
        }}
      >
        <Container maxWidth="sm" sx={{ textAlign: "center" }}>
          <Box
            sx={{
              display: "inline-flex",
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
              boxShadow: "0 12px 32px rgba(255,107,53,0.35)",
            }}
          >
            <Icon icon="mdi:check-bold" width={48} color="#FFFFFF" />
          </Box>

          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              fontSize: { xs: "2rem", md: "2.6rem" },
              color: "#1a1a2e",
              mb: 2,
            }}
          >
            Application received
          </Typography>
          <Typography sx={{ color: "#444", fontSize: "1.05rem", lineHeight: 1.7, mb: 4 }}>
            Thanks — your CMIP application is in. You should see a confirmation email in your inbox
            within a few minutes (check spam if not).
          </Typography>

          <Box
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 4,
              background: "#FFFFFF",
              border: "1px solid rgba(255,107,53,0.15)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
              textAlign: "left",
            }}
          >
            <Typography
              variant="overline"
              sx={{ color: "#FF6B35", fontWeight: 700, letterSpacing: 1.5, fontSize: "0.75rem" }}
            >
              What's next
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a2e", mt: 1, mb: 1 }}>
              Interview required
            </Typography>
            <Typography sx={{ color: "#555", fontSize: "0.95rem", lineHeight: 1.6, mb: 2 }}>
              Every applicant interviews. If your application looks like a fit, we'll reach out
              within 7–10 days to schedule a real conversation about your work and the track you
              picked.
            </Typography>
            <Typography sx={{ color: "#555", fontSize: "0.95rem", lineHeight: 1.6 }}>
              Questions or didn't get the confirmation email? Write to{" "}
              <Box
                component="a"
                href={`mailto:${contactEmail}`}
                sx={{ color: "#FF6B35", fontWeight: 600, textDecoration: "none" }}
              >
                {contactEmail}
              </Box>
              .
            </Typography>
          </Box>

          <Box sx={{ display: "flex", gap: 2, justifyContent: "center", mt: 5, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              href="/internship"
              sx={{
                px: 4,
                py: 1.25,
                fontSize: "0.95rem",
                fontWeight: 700,
                borderRadius: 2.5,
                background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                textTransform: "none",
                "&:hover": { background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)" },
              }}
            >
              Back to program details
            </Button>
            <Button
              variant="outlined"
              href="/"
              sx={{
                px: 4,
                py: 1.25,
                fontSize: "0.95rem",
                fontWeight: 700,
                borderRadius: 2.5,
                borderColor: "rgba(255,107,53,0.5)",
                color: "#FF6B35",
                textTransform: "none",
                "&:hover": { borderColor: "#FF6B35", backgroundColor: "rgba(255,107,53,0.05)" },
              }}
            >
              Home
            </Button>
          </Box>
        </Container>
      </Box>

      <InternshipFooter />
    </Box>
  );
}
