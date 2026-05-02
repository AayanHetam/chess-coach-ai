import type { Metadata } from "next";
import { Box, Button, Container, Typography } from "@mui/material";
import { Icon } from "@iconify/react";
import InternshipNav from "./InternshipNav";
import InternshipFooter from "./InternshipFooter";

export const metadata: Metadata = {
  title: "Chess Masti Internship Program (CMIP) — Apply",
  description:
    "Join the Chess Masti Internship Program. Work on AI-powered chess education with real users — engineering, content, growth, or research tracks.",
  openGraph: {
    title: "Chess Masti Internship Program (CMIP)",
    description:
      "Build the future of AI-powered chess education. Apply to engineer, coach, grow, or research with us.",
    type: "website",
    url: "/internship",
    siteName: "Chess Masti",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chess Masti Internship Program (CMIP)",
    description:
      "Build the future of AI-powered chess education. Apply to engineer, coach, grow, or research with us.",
  },
};

const tracks: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: "mdi:code-braces",
    title: "Engineering",
    body: "Frontend, backend, AI/LLM integrations, and infra. Ship features that real players use every day.",
  },
  {
    icon: "mdi:chess-knight",
    title: "Chess Content & Coaching",
    body: "Curriculum, puzzle curation, and coaching playbooks that turn raw analysis into things people actually learn from.",
  },
  {
    icon: "mdi:account-group",
    title: "Growth & Community",
    body: "Outreach, content, social, partnerships. Help more people find a coach that meets them where they are.",
  },
  {
    icon: "mdi:flask-outline",
    title: "Research",
    body: "Chess pedagogy, AI behavior, and learning outcomes. Turn questions like \"does this actually help people improve?\" into evidence.",
  },
];

const benefits: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: "mdi:rocket-launch",
    title: "Real ownership",
    body: "Ship features and writeups that go live to actual users. No throwaway intern projects.",
  },
  {
    icon: "mdi:account-tie",
    title: "Mentorship",
    body: "Direct, weekly 1:1 feedback on your work — not a Slack channel and a prayer.",
  },
  {
    icon: "mdi:certificate",
    title: "Letter of recommendation",
    body: "On successful completion, a specific, honest letter of recommendation written by someone who actually saw your work.",
  },
  {
    icon: "mdi:earth",
    title: "Remote & flexible",
    body: "Work from anywhere on a schedule that fits around school. We care about output, not hours-at-desk.",
  },
  {
    icon: "mdi:chart-line",
    title: "Live product, real users",
    body: "Chess Masti is in production. Your work shows up in metrics, support emails, and the Discord — fast.",
  },
];

const processSteps: Array<{ n: number; title: string; body: string; emphasized?: boolean }> = [
  { n: 1, title: "Apply", body: "Tell us about you, the track that fits, and what you've built or coached before." },
  { n: 2, title: "Application Review", body: "We read every application. Expect a response within 7–10 days." },
  {
    n: 3,
    title: "Interview (Required)",
    body: "Every applicant interviews. It's a real conversation about your work and the track you're aiming for — not a riddle round.",
    emphasized: true,
  },
  { n: 4, title: "Offer & Onboarding", body: "If it's a fit, we send an offer, set up access, and pair you with a mentor in your first week." },
];

export default function InternshipPage() {
  return (
    <Box sx={{ overflowX: "hidden" }}>
      <InternshipNav />

      {/* Hero */}
      <Box
        component="section"
        sx={{
          minHeight: { xs: "70vh", md: "80vh" },
          display: "flex",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
          pt: { xs: 14, md: 18 },
          pb: { xs: 10, md: 14 },
          background:
            "linear-gradient(135deg, #FFFFFF 0%, #FFF8F5 30%, #FFE4D6 70%, #FFDBC9 100%)",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: "10%",
            right: "-5%",
            width: { xs: 200, md: 500 },
            height: { xs: 200, md: 500 },
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,107,53,0.08) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            bottom: "5%",
            left: "-10%",
            width: { xs: 250, md: 600 },
            height: { xs: 250, md: 600 },
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,140,66,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <Container maxWidth="md" sx={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <Typography
            variant="overline"
            sx={{
              color: "#FF6B35",
              fontWeight: 700,
              letterSpacing: 2,
              fontSize: "0.85rem",
            }}
          >
            CMIP — Chess Masti Internship Program
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              mt: 2,
              mb: 3,
              fontSize: { xs: "2.2rem", md: "3.4rem" },
              lineHeight: 1.1,
              color: "#1a1a2e",
            }}
          >
            Chess Masti{" "}
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
          <Typography
            variant="h6"
            sx={{
              color: "#444",
              fontWeight: 400,
              maxWidth: 720,
              mx: "auto",
              mb: 5,
              fontSize: { xs: "1.05rem", md: "1.2rem" },
              lineHeight: 1.5,
            }}
          >
            Help build the future of AI-powered chess education. Real product, real users, real ownership.
          </Typography>

          <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              variant="contained"
              size="large"
              href="/internship/apply"
              sx={{
                px: 4,
                py: 1.5,
                fontSize: "1rem",
                fontWeight: 700,
                borderRadius: 2.5,
                background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                boxShadow: "0 8px 24px rgba(255,107,53,0.35)",
                textTransform: "none",
                "&:hover": {
                  background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                  boxShadow: "0 10px 28px rgba(255,107,53,0.45)",
                },
              }}
            >
              Apply Now
            </Button>
            <Button
              variant="outlined"
              size="large"
              href="#process"
              sx={{
                px: 4,
                py: 1.5,
                fontSize: "1rem",
                fontWeight: 700,
                borderRadius: 2.5,
                borderColor: "rgba(255,107,53,0.5)",
                color: "#FF6B35",
                textTransform: "none",
                "&:hover": { borderColor: "#FF6B35", backgroundColor: "rgba(255,107,53,0.05)" },
              }}
            >
              See the Process
            </Button>
          </Box>
        </Container>
      </Box>

      {/* About the program */}
      <Box
        component="section"
        sx={{
          py: { xs: 8, md: 12 },
          px: { xs: 2, md: 4 },
          background: "#FFFFFF",
        }}
      >
        <Container maxWidth="md">
          <Typography
            variant="overline"
            sx={{
              display: "block",
              textAlign: "center",
              color: "#FF6B35",
              fontWeight: 700,
              letterSpacing: 2,
              fontSize: "0.8rem",
              mb: 1.5,
            }}
          >
            About the Program
          </Typography>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              textAlign: "center",
              mb: 5,
              fontSize: { xs: "1.8rem", md: "2.4rem" },
              color: "#1a1a2e",
            }}
          >
            What we're building
          </Typography>

          <Box sx={{ "& p": { color: "#444", lineHeight: 1.8, fontSize: "1.05rem", mb: 3 } }}>
            <Typography component="p">
              Chess Masti is an AI-powered chess coaching platform: deep game analysis, adaptive
              puzzles, opening prep, and conversational coaching that actually understands the
              position you're stuck on. It's live, used by real players, and improving every week.
            </Typography>
            <Typography component="p">
              CMIP brings on students and early-career contributors who love chess, building,
              teaching, or some combination of all three. We look for curiosity, taste, and the
              kind of motivation that doesn't need a manager standing over it.
            </Typography>
            <Typography component="p">
              You'll work on real product, real content, and real outreach — not busywork. Whether
              you ship code, write a coaching plan, or design a study, your work gets in front of
              actual users and feedback comes back fast.
            </Typography>
          </Box>
        </Container>
      </Box>

      {/* Tracks */}
      <Box
        component="section"
        sx={{
          py: { xs: 8, md: 12 },
          px: { xs: 2, md: 4 },
          background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8F5 100%)",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 6 }}>
            <Typography
              variant="overline"
              sx={{ color: "#FF6B35", fontWeight: 700, letterSpacing: 2, fontSize: "0.8rem" }}
            >
              Tracks
            </Typography>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 800,
                mt: 1,
                fontSize: { xs: "1.8rem", md: "2.4rem" },
                color: "#1a1a2e",
              }}
            >
              Pick where you'll have the most impact
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
              gap: 3,
            }}
          >
            {tracks.map((t) => (
              <Box
                key={t.title}
                sx={{
                  p: 3.5,
                  borderRadius: 4,
                  background: "#FFFFFF",
                  border: "1px solid rgba(255,107,53,0.1)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 2,
                  }}
                >
                  <Icon icon={t.icon} width={26} color="#FFFFFF" />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: "#1a1a2e" }}>
                  {t.title}
                </Typography>
                <Typography sx={{ color: "#555", fontSize: "0.95rem", lineHeight: 1.6 }}>
                  {t.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* What you'll get */}
      <Box
        component="section"
        sx={{
          py: { xs: 8, md: 12 },
          px: { xs: 2, md: 4 },
          background: "#FFFFFF",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 6 }}>
            <Typography
              variant="overline"
              sx={{ color: "#FF6B35", fontWeight: 700, letterSpacing: 2, fontSize: "0.8rem" }}
            >
              What You'll Get
            </Typography>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 800,
                mt: 1,
                fontSize: { xs: "1.8rem", md: "2.4rem" },
                color: "#1a1a2e",
              }}
            >
              Worth your time
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
              gap: 3,
            }}
          >
            {benefits.map((b) => (
              <Box
                key={b.title}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  border: "1px solid rgba(0,0,0,0.06)",
                  background: "#FFFCFA",
                }}
              >
                <Icon icon={b.icon} width={28} color="#FF6B35" />
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 1.5, mb: 0.5, color: "#1a1a2e", fontSize: "1.05rem" }}>
                  {b.title}
                </Typography>
                <Typography sx={{ color: "#555", fontSize: "0.92rem", lineHeight: 1.6 }}>
                  {b.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Process */}
      <Box
        id="process"
        component="section"
        sx={{
          py: { xs: 8, md: 12 },
          px: { xs: 2, md: 4 },
          background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8F5 100%)",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 6 }}>
            <Typography
              variant="overline"
              sx={{ color: "#FF6B35", fontWeight: 700, letterSpacing: 2, fontSize: "0.8rem" }}
            >
              Process
            </Typography>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 800,
                mt: 1,
                fontSize: { xs: "1.8rem", md: "2.4rem" },
                color: "#1a1a2e",
              }}
            >
              How it works
            </Typography>
            <Typography sx={{ color: "#555", mt: 1.5, fontSize: "0.95rem" }}>
              Heads up: an interview is required for every applicant — it's not a screening pass.
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" },
              gap: 3,
            }}
          >
            {processSteps.map((s) => (
              <Box
                key={s.n}
                sx={{
                  p: 3,
                  borderRadius: 4,
                  position: "relative",
                  background: s.emphasized
                    ? "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
                    : "#FFFFFF",
                  color: s.emphasized ? "#FFFFFF" : "inherit",
                  border: s.emphasized
                    ? "2px solid #FF8C42"
                    : "1px solid rgba(0,0,0,0.06)",
                  boxShadow: s.emphasized
                    ? "0 12px 32px rgba(255,107,53,0.25)"
                    : "0 4px 16px rgba(0,0,0,0.04)",
                  transform: { md: s.emphasized ? "translateY(-8px)" : "none" },
                }}
              >
                {s.emphasized && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -12,
                      left: 16,
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 1.5,
                      background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                      color: "#FFFFFF",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: 1,
                    }}
                  >
                    REQUIRED
                  </Box>
                )}
                <Typography
                  sx={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    color: s.emphasized ? "#FF8C42" : "#FF6B35",
                  }}
                >
                  STEP {s.n}
                </Typography>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    mt: 0.5,
                    mb: 1.5,
                    color: s.emphasized ? "#FFFFFF" : "#1a1a2e",
                  }}
                >
                  {s.title}
                </Typography>
                <Typography
                  sx={{
                    color: s.emphasized ? "rgba(255,255,255,0.85)" : "#555",
                    fontSize: "0.92rem",
                    lineHeight: 1.6,
                  }}
                >
                  {s.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Commitment */}
      <Box
        component="section"
        sx={{
          py: { xs: 8, md: 12 },
          px: { xs: 2, md: 4 },
          background: "#FFFFFF",
        }}
      >
        <Container maxWidth="md">
          <Box
            sx={{
              p: { xs: 3, md: 5 },
              borderRadius: 4,
              border: "1px solid rgba(255,107,53,0.15)",
              background: "linear-gradient(135deg, #FFFFFF 0%, #FFF8F5 100%)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
              <Icon icon="mdi:clock-outline" width={28} color="#FF6B35" />
              <Typography variant="h5" sx={{ fontWeight: 700, color: "#1a1a2e" }}>
                Commitment
              </Typography>
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
                gap: 3,
                mt: 3,
              }}
            >
              <Box>
                <Typography sx={{ color: "#FF6B35", fontWeight: 700, fontSize: "0.8rem", letterSpacing: 1 }}>
                  REMOTE
                </Typography>
                <Typography sx={{ color: "#333", mt: 0.5, fontSize: "0.95rem" }}>
                  Work from anywhere with a decent internet connection.
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ color: "#FF6B35", fontWeight: 700, fontSize: "0.8rem", letterSpacing: 1 }}>
                  HOURS
                </Typography>
                <Typography sx={{ color: "#333", mt: 0.5, fontSize: "0.95rem" }}>
                  ~5–10 hrs/week. Flexible schedule, set with your mentor.
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ color: "#FF6B35", fontWeight: 700, fontSize: "0.8rem", letterSpacing: 1 }}>
                  DURATION
                </Typography>
                <Typography sx={{ color: "#333", mt: 0.5, fontSize: "0.95rem" }}>
                  Minimum 8 weeks. Extensions are common for strong contributors.
                </Typography>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* CTA */}
      <Box
        component="section"
        sx={{
          py: { xs: 10, md: 14 },
          px: { xs: 2, md: 4 },
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          color: "#FFFFFF",
          textAlign: "center",
        }}
      >
        <Container maxWidth="md">
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              mb: 2,
              fontSize: { xs: "1.8rem", md: "2.6rem" },
            }}
          >
            Ready to apply?
          </Typography>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.8)",
              fontSize: { xs: "1rem", md: "1.1rem" },
              maxWidth: 560,
              mx: "auto",
              mb: 4,
              lineHeight: 1.6,
            }}
          >
            Tell us about you and the track you'd like to join. Applications take 10–15 minutes;
            we read every one.
          </Typography>
          <Button
            variant="contained"
            size="large"
            href="/internship/apply"
            sx={{
              px: 5,
              py: 1.75,
              fontSize: "1.05rem",
              fontWeight: 700,
              borderRadius: 2.5,
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              boxShadow: "0 10px 32px rgba(255,107,53,0.4)",
              textTransform: "none",
              "&:hover": {
                background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                boxShadow: "0 12px 36px rgba(255,107,53,0.5)",
              },
            }}
          >
            Start your application
          </Button>
        </Container>
      </Box>

      <InternshipFooter />
    </Box>
  );
}
