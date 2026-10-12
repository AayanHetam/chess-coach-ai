import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { Masti, MastiAvatar } from "@/components/masti";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

/** The content pages' palette: the site tokens, by the names the pages use. */
export const AEO_TOKENS = {
  bg: SURFACE.page,
  surface: SURFACE.raised,
  border: LINE.hairline,
  ember: ACCENT.main,
  radius: `${RADIUS.card}px`,
} as const;

/** A card: a solid raised surface with a hairline. (The name is historical.) */
export const glassCard = {
  background: AEO_TOKENS.surface,
  border: `1px solid ${AEO_TOKENS.border}`,
  borderRadius: AEO_TOKENS.radius,
  p: { xs: 3, md: 4 },
};

export function CtaButton({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      component={Link}
      href={href}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: 3,
        minHeight: 44,
        borderRadius: `${RADIUS.pill}px`,
        fontWeight: 600,
        fontSize: TYPE.bodySmall.fontSize,
        textDecoration: "none",
        transition: `background-color ${MOTION.hover}, color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
        "&:active": { transform: MOTION.pressScale },
        ...(primary
          ? {
              background: ACCENT.main,
              color: TEXT.onAccent,
              "&:hover": { background: ACCENT.hover },
            }
          : {
              border: `1px solid ${LINE.strong}`,
              color: TEXT.primary,
              "&:hover": {
                borderColor: TEXT.secondary,
                background: "rgba(255,255,255,0.06)",
              },
            }),
      }}
    >
      {children}
    </Box>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="h2"
      sx={{
        fontSize: { xs: "1.5rem", md: "2rem" },
        fontWeight: 600,
        letterSpacing: "-0.015em",
        color: TEXT.primary,
        mb: 3,
      }}
    >
      {children}
    </Typography>
  );
}

export function Breadcrumb({ here }: { here: string }) {
  return (
    <Box
      component="nav"
      aria-label="Breadcrumb"
      sx={{
        mb: 4,
        display: "flex",
        alignItems: "center",
        gap: 1,
        fontSize: "0.85rem",
        color: TEXT.tertiary,
      }}
    >
      {/* Masti's face marks every page as his, the way the brand mark does elsewhere. */}
      <MastiAvatar mood="wave" size={20} ring={false} decorative />
      <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
        Chess Masti AI
      </Link>
      <span>/</span>
      <span style={{ color: TEXT.secondary }}>{here}</span>
    </Box>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        background: AEO_TOKENS.bg,
        minHeight: "100vh",
        color: TEXT.primary,
      }}
    >
      <Box
        sx={{
          maxWidth: 800,
          mx: "auto",
          px: { xs: 2, md: 4 },
          py: { xs: 6, md: 10 },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function AnswerBlock({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: { xs: "1.0625rem", md: "1.1875rem" },
        lineHeight: 1.6,
        color: TEXT.primary,
        mb: 4,
      }}
    >
      {children}
    </Typography>
  );
}

export function ProseBlock({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ lineHeight: 1.6, color: TEXT.secondary, mb: 2 }}>
      {children}
    </Typography>
  );
}

/**
 * The headline row. On tablets and up Masti waves from the right of the H1,
 * so every page in this family opens with the coach it is about; on phones
 * the headline keeps the whole width. Decorative: the H1 already says it.
 */
export function H1({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 3,
        mb: 3,
      }}
    >
      <Typography
        component="h1"
        sx={{
          fontSize: { xs: "2.5rem", md: "3.5rem" },
          fontWeight: 700,
          lineHeight: 1.07,
          letterSpacing: "-0.025em",
          color: TEXT.primary,
          minWidth: 0,
        }}
      >
        {children}
      </Typography>
      <Box sx={{ display: { xs: "none", md: "block" }, flexShrink: 0 }}>
        <Masti mood="wave" size={132} loops={2} replayOnHover decorative />
      </Box>
    </Box>
  );
}

export function CtaRow({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 10 }}>
      {children}
    </Box>
  );
}

export function CrossLinkCallout({
  title,
  blurb,
  href,
  cta,
}: {
  title: string;
  blurb: string;
  href: string;
  cta: string;
}) {
  return (
    <Box sx={{ ...glassCard, mb: 10 }}>
      <Typography
        sx={{ fontWeight: 600, color: TEXT.primary, mb: 1, fontSize: "1.1rem" }}
      >
        {title}
      </Typography>
      <Typography sx={{ color: TEXT.secondary, mb: 3, lineHeight: 1.6 }}>
        {blurb}
      </Typography>
      <CtaButton href={href} primary>
        {cta}
      </CtaButton>
    </Box>
  );
}

export function FooterCta({ title, sub }: { title: string; sub: string }) {
  return (
    <Box sx={{ ...glassCard, textAlign: "center" }}>
      {/* The closing ask is Masti's: he is the coach the button leads to. */}
      <Box sx={{ display: "flex", justifyContent: "center", mb: 1.5 }}>
        <Masti mood="excited" size={120} loops={2} replayOnHover decorative />
      </Box>
      <Typography
        sx={{
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: TEXT.primary,
          fontSize: { xs: "1.25rem", md: "1.5rem" },
          mb: 1,
        }}
      >
        {title}
      </Typography>
      <Typography sx={{ color: TEXT.secondary, mb: 3 }}>{sub}</Typography>
      <Box
        sx={{
          display: "flex",
          gap: 2,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <CtaButton href="/analysis" primary>
          Analyze a game
        </CtaButton>
        <CtaButton href="/free-ai-chess-coach">Free AI chess coach</CtaButton>
      </Box>
    </Box>
  );
}

export function buildWebPageJsonLd({
  name,
  url,
  description,
}: {
  name: string;
  url: string;
  description: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    url,
    description,
    isPartOf: { "@id": "https://chessmasti.com/#website" },
  };
}

export function buildBreadcrumbJsonLd({
  here,
  url,
}: {
  here: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Chess Masti AI",
        item: "https://chessmasti.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: here,
        item: url,
      },
    ],
  };
}
