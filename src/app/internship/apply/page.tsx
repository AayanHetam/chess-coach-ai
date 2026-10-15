import type { Metadata } from "next";
import { Box, Container, Typography } from "@mui/material";
import { Masti } from "@/components/masti";
import InternshipNav from "../InternshipNav";
import InternshipFooter from "../InternshipFooter";
import ApplyForm from "./ApplyForm";

export const metadata: Metadata = {
  title: "Apply: Chess Masti Internship Program",
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
        }}
      >
        <Container maxWidth="md">
          {/* A small greeting in the header; the form below stays all
              business. Own block so he does not sit inline with the heading. */}
          <Box sx={{ mb: 1.5 }}>
            <Masti
              mood="wave"
              size={80}
              loops={2}
              priority
              label="Masti the Monkey, the Chess Masti coach, saying hello"
            />
          </Box>
          <Typography variant="h1" sx={{ mb: 2, color: "text.primary" }}>
            Apply to the Internship Program
          </Typography>
          <Typography sx={{ color: "text.secondary", maxWidth: "65ch" }}>
            Plan on 10–15 minutes. We read every application; expect a response
            within 7–10 days. An <strong>interview is required</strong> for
            every applicant.
          </Typography>
        </Container>
      </Box>

      <Box
        component="section"
        sx={{
          pb: { xs: 10, md: 14 },
          px: { xs: 2, md: 4 },
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
