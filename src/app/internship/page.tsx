import type { Metadata } from "next";
import { Box, Button, Container, Typography } from "@mui/material";
import {
  Award,
  BookOpen,
  ChartLine,
  Clock,
  Code,
  FlaskConical,
  Globe,
  Rocket,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Masti } from "@/components/masti";
import { ACCENT, RADIUS, TYPE } from "@/theme/tokens";
import InternshipNav from "./InternshipNav";
import InternshipFooter from "./InternshipFooter";

export const metadata: Metadata = {
  title: "Chess Masti Internship Program (CMIP): Apply",
  description:
    "Join the Chess Masti Internship Program. Work on chess coaching with real users, in an engineering, content, growth, or research track.",
  openGraph: {
    title: "Chess Masti Internship Program (CMIP)",
    description:
      "Help build Masti, a free chess coach people use every day. Apply to engineer, coach, grow, or research with us.",
    type: "website",
    url: "/internship",
    siteName: "Chess Masti",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chess Masti Internship Program (CMIP)",
    description:
      "Help build Masti, a free chess coach people use every day. Apply to engineer, coach, grow, or research with us.",
  },
};

const tracks: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Code,
    title: "Engineering",
    body: "Frontend, backend, the coaching model, and infra. Ship features that real players use every day.",
  },
  {
    icon: BookOpen,
    title: "Chess content and coaching",
    body: "Curriculum, puzzle curation, and coaching playbooks that turn raw analysis into things people actually learn from.",
  },
  {
    icon: Users,
    title: "Growth and community",
    body: "Outreach, content, social, partnerships. Help more people find a coach that meets them where they are.",
  },
  {
    icon: FlaskConical,
    title: "Research",
    body: 'Chess pedagogy, coach behavior, and learning outcomes. Turn questions like "does this actually help people improve?" into evidence.',
  },
];

const benefits: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Rocket,
    title: "Real ownership",
    body: "Ship features and writeups that go live to actual users. No throwaway intern projects.",
  },
  {
    icon: UserCheck,
    title: "Mentorship",
    body: "Direct, weekly 1:1 feedback on your work, not a Slack channel and a prayer.",
  },
  {
    icon: Award,
    title: "Letter of recommendation",
    body: "On successful completion, a specific, honest letter of recommendation written by someone who actually saw your work.",
  },
  {
    icon: Globe,
    title: "Remote and flexible",
    body: "Work from anywhere on a schedule that fits around school. We care about output, not hours-at-desk.",
  },
  {
    icon: ChartLine,
    title: "Live product, real users",
    body: "Chess Masti is in production. Your work shows up quickly in metrics, support emails, and the Discord.",
  },
];

const processSteps: Array<{
  n: number;
  title: string;
  body: string;
  emphasized?: boolean;
}> = [
  {
    n: 1,
    title: "Apply",
    body: "Tell us about you, the track that fits, and what you've built or coached before.",
  },
  {
    n: 2,
    title: "Application review",
    body: "We read every application. Expect a response within 7–10 days.",
  },
  {
    n: 3,
    title: "Interview",
    body: "Every applicant interviews. It's a real conversation about your work and the track you're aiming for, not a riddle round.",
    emphasized: true,
  },
  {
    n: 4,
    title: "Offer and onboarding",
    body: "If it's a fit, we send an offer, set up access, and pair you with a mentor in your first week.",
  },
];

const commitment: Array<{ label: string; body: string }> = [
  {
    label: "Remote",
    body: "Work from anywhere with a decent internet connection.",
  },
  {
    label: "Hours",
    body: "About 5–10 hours a week. Flexible schedule, set with your mentor.",
  },
  {
    label: "Duration",
    body: "Minimum 8 weeks. Extensions are common for strong contributors.",
  },
];

/** A card on the light content theme: one raised surface with a hairline. */
const cardSx = {
  p: { xs: 2, md: 3 },
  borderRadius: `${RADIUS.card}px`,
  bgcolor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
} as const;

const sectionSx = {
  py: { xs: 8, md: 12 },
  px: { xs: 2, md: 4 },
} as const;

function SectionTitle({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Box sx={{ textAlign: "center", mb: 6 }}>
      <Typography variant="h2" sx={{ color: "text.primary" }}>
        {children}
      </Typography>
      {sub ? (
        <Typography
          sx={{
            color: "text.secondary",
            mt: 1.5,
            maxWidth: "65ch",
            mx: "auto",
          }}
        >
          {sub}
        </Typography>
      ) : null}
    </Box>
  );
}

function CardIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Box sx={{ display: "flex", color: "text.secondary", mb: 2 }}>
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
    </Box>
  );
}

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
          pt: { xs: 14, md: 18 },
          pb: { xs: 10, md: 14 },
        }}
      >
        <Container maxWidth="md" sx={{ textAlign: "center" }}>
          {/* The coach fronts the program. Sized by the size prop (inline
              width/height), and 150px cannot overflow a phone column, so no
              breakpoint sizing is needed. One short burst, then the still. */}
          <Box sx={{ mb: 2 }}>
            <Masti
              mood="wave"
              size={150}
              loops={3}
              priority
              label="Masti the Monkey, the Chess Masti coach, saying hello"
            />
          </Box>
          <Typography variant="h1" sx={{ mb: 3, color: "text.primary" }}>
            Chess Masti Internship Program
          </Typography>
          <Typography
            sx={{
              color: "text.secondary",
              maxWidth: "65ch",
              mx: "auto",
              mb: 5,
              fontSize: { xs: TYPE.body.fontSize, md: TYPE.h4.fontSize },
            }}
          >
            Help build Masti, a free chess coach people use every day. Real
            product, real users, real ownership.
          </Typography>

          <Box
            sx={{
              display: "flex",
              gap: 2,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Button variant="contained" size="large" href="/internship/apply">
              Apply now
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              size="large"
              href="#process"
            >
              See the process
            </Button>
          </Box>
        </Container>
      </Box>

      {/* About the program */}
      <Box component="section" sx={sectionSx}>
        <Container maxWidth="md">
          <Typography
            variant="h2"
            sx={{ textAlign: "center", mb: 5, color: "text.primary" }}
          >
            What we&apos;re building
          </Typography>

          <Box
            sx={{
              "& p": {
                color: "text.secondary",
                mb: 3,
                maxWidth: "65ch",
                mx: "auto",
              },
            }}
          >
            <Typography component="p">
              Chess Masti is a free chess coach: deep game analysis, adaptive
              puzzles, opening prep, and a coach you can talk to about the
              position you&apos;re stuck on. It&apos;s live, used by real
              players, and improving every week.
            </Typography>
            <Typography component="p">
              CMIP, the Chess Masti Internship Program, brings on students and
              early-career contributors who love chess, building, teaching, or
              some combination of all three. We look for curiosity, taste, and
              the kind of motivation that doesn&apos;t need a manager standing
              over it.
            </Typography>
            <Typography component="p">
              You&apos;ll work on real product, real content, and real outreach,
              not busywork. Whether you ship code, write a coaching plan, or
              design a study, your work gets in front of actual users and
              feedback comes back fast.
            </Typography>
          </Box>
        </Container>
      </Box>

      {/* Tracks */}
      <Box component="section" sx={sectionSx}>
        <Container maxWidth="lg">
          <SectionTitle>
            Pick where you&apos;ll have the most impact
          </SectionTitle>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                lg: "repeat(4, 1fr)",
              },
              gap: 3,
            }}
          >
            {tracks.map((t) => (
              <Box key={t.title} sx={cardSx}>
                <CardIcon icon={t.icon} />
                <Typography
                  variant="h6"
                  component="h3"
                  sx={{ mb: 1, color: "text.primary" }}
                >
                  {t.title}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {t.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* What you'll get */}
      <Box component="section" sx={sectionSx}>
        <Container maxWidth="lg">
          <SectionTitle>Worth your time</SectionTitle>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
              },
              gap: 3,
            }}
          >
            {benefits.map((b) => (
              <Box key={b.title} sx={cardSx}>
                <CardIcon icon={b.icon} />
                <Typography
                  variant="h6"
                  component="h3"
                  sx={{ mb: 0.5, color: "text.primary" }}
                >
                  {b.title}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {b.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Process */}
      <Box id="process" component="section" sx={sectionSx}>
        <Container maxWidth="lg">
          <SectionTitle sub="An interview is required for every applicant. It's a real conversation, not a screening pass.">
            How it works
          </SectionTitle>

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
                  ...cardSx,
                  // The featured step carries a stronger edge, not a lift.
                  ...(s.emphasized ? { borderColor: "text.secondary" } : null),
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.5,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    Step {s.n}
                  </Typography>
                  {s.emphasized && (
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: 24,
                        px: 1,
                        py: 0.25,
                        borderRadius: `${RADIUS.small}px`,
                        bgcolor: ACCENT.tint,
                        color: "text.primary",
                        fontSize: TYPE.caption.fontSize,
                        fontWeight: 500,
                      }}
                    >
                      Required
                    </Box>
                  )}
                </Box>
                <Typography
                  variant="h6"
                  component="h3"
                  sx={{ mb: 1.5, color: "text.primary" }}
                >
                  {s.title}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {s.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Commitment */}
      <Box component="section" sx={sectionSx}>
        <Container maxWidth="md">
          <Box sx={{ ...cardSx, p: { xs: 3, md: 5 } }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}
            >
              <Box sx={{ display: "flex", color: "text.secondary" }}>
                <Clock size={20} strokeWidth={1.75} aria-hidden="true" />
              </Box>
              <Typography
                variant="h3"
                component="h2"
                sx={{ color: "text.primary" }}
              >
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
              {commitment.map((c) => (
                <Box key={c.label}>
                  <Typography sx={{ ...TYPE.label, color: "text.secondary" }}>
                    {c.label}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "text.primary", mt: 0.5 }}
                  >
                    {c.body}
                  </Typography>
                </Box>
              ))}
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
          textAlign: "center",
        }}
      >
        <Container maxWidth="md">
          {/* Near the call to action: an idea, not a cheer (the thanks page
              owns the celebration). Plays once when scrolled into view. */}
          <Box sx={{ mb: 2 }}>
            <Masti
              mood="idea"
              size={120}
              loops={2}
              label="Masti the Monkey, the Chess Masti coach, having an idea"
            />
          </Box>
          <Typography variant="h2" sx={{ mb: 2, color: "text.primary" }}>
            Ready to apply?
          </Typography>
          <Typography
            sx={{
              color: "text.secondary",
              maxWidth: "65ch",
              mx: "auto",
              mb: 4,
            }}
          >
            Tell us about you and the track you&apos;d like to join.
            Applications take 10–15 minutes; we read every one.
          </Typography>
          <Button variant="contained" size="large" href="/internship/apply">
            Start your application
          </Button>
        </Container>
      </Box>

      <InternshipFooter />
    </Box>
  );
}
