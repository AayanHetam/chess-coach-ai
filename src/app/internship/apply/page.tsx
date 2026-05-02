import type { Metadata } from "next";
import { Box, Container, Typography } from "@mui/material";
import InternshipNav from "../InternshipNav";
import InternshipFooter from "../InternshipFooter";
import ApplyForm from "./ApplyForm";

export const metadata: Metadata = {
  title: "Apply — Chess Masti Internship Program",
  description: "Apply to the Chess Masti Internship Program (CMIP).",
  robots: { index: false, follow: false },
};

export default function ApplyPage() {
  return (
    <Box sx={{ overflowX: "hidden" }}>
      <InternshipNav />

      <Box
        component="section"
        sx={{
          pt: { xs: 14, md: 16 },
          pb: { xs: 6, md: 8 },
          px: { xs: 2, md: 4 },
          background: "linear-gradient(135deg, #FFFFFF 0%, #FFF8F5 100%)",
        }}
      >
        <Container maxWidth="md">
          <Typography
            variant="overline"
            sx={{ color: "#FF6B35", fontWeight: 700, letterSpacing: 2, fontSize: "0.85rem" }}
          >
            CMIP — Apply
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              mt: 1,
              mb: 2,
              fontSize: { xs: "2rem", md: "2.8rem" },
              color: "#1a1a2e",
            }}
          >
            Apply to the{" "}
            <Box
              component="span"
              sx={{
                background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Internship Program
            </Box>
          </Typography>
          <Typography sx={{ color: "#555", fontSize: "1.05rem", lineHeight: 1.6 }}>
            Plan on ~10–15 minutes. We read every application; expect a response within 7–10 days.
            An <strong>interview is required</strong> for every applicant.
          </Typography>
        </Container>
      </Box>

      <Box
        component="section"
        sx={{
          pb: { xs: 10, md: 14 },
          px: { xs: 2, md: 4 },
          background: "#FAFAFA",
        }}
      >
        <Container maxWidth="md">
          <ApplyForm />
        </Container>
      </Box>

      <InternshipFooter />
    </Box>
  );
}
