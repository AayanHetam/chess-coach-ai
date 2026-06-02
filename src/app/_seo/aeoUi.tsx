import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "next/link";

export const AEO_TOKENS = {
  bg: "#08080f",
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  ember: "#FF6B2B",
  radius: "1.5rem",
} as const;

export const glassCard = {
  background: AEO_TOKENS.surface,
  border: `1px solid ${AEO_TOKENS.border}`,
  borderRadius: AEO_TOKENS.radius,
  backdropFilter: "blur(12px)",
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
        display: "inline-block",
        px: 3,
        py: 1.5,
        borderRadius: "0.75rem",
        fontWeight: 600,
        fontSize: "0.95rem",
        textDecoration: "none",
        transition: "all 180ms ease-out",
        ...(primary
          ? {
              background: AEO_TOKENS.ember,
              color: "#fff",
              "&:hover": { background: "#ff8050", transform: "translateY(-1px)" },
            }
          : {
              border: `1px solid ${AEO_TOKENS.border}`,
              color: "rgba(255,255,255,0.75)",
              "&:hover": { borderColor: "rgba(255,255,255,0.2)", color: "#fff" },
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
        fontWeight: 700,
        color: "#fff",
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
      sx={{ mb: 4, display: "flex", gap: 1, fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}
    >
      <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
        Chess Masti AI
      </Link>
      <span>/</span>
      <span style={{ color: "rgba(255,255,255,0.7)" }}>{here}</span>
    </Box>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ background: AEO_TOKENS.bg, minHeight: "100vh", color: "rgba(255,255,255,0.85)" }}>
      <Box sx={{ maxWidth: 800, mx: "auto", px: { xs: 2, md: 4 }, py: { xs: 6, md: 10 } }}>
        {children}
      </Box>
    </Box>
  );
}

export function AnswerBlock({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: { xs: "1.05rem", md: "1.2rem" },
        lineHeight: 1.8,
        color: "rgba(255,255,255,0.75)",
        mb: 4,
      }}
    >
      {children}
    </Typography>
  );
}

export function ProseBlock({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ lineHeight: 1.9, color: "rgba(255,255,255,0.7)", mb: 2 }}>
      {children}
    </Typography>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component="h1"
      sx={{
        fontSize: { xs: "2.5rem", md: "3.5rem" },
        fontWeight: 800,
        lineHeight: 1.1,
        color: "#fff",
        mb: 3,
      }}
    >
      {children}
    </Typography>
  );
}

export function CtaRow({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 10 }}>{children}</Box>
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
    <Box sx={{ ...glassCard, borderColor: `${AEO_TOKENS.ember}22`, mb: 10 }}>
      <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1, fontSize: "1.1rem" }}>
        {title}
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.65)", mb: 3, lineHeight: 1.7 }}>{blurb}</Typography>
      <CtaButton href={href} primary>
        {cta}
      </CtaButton>
    </Box>
  );
}

export function FooterCta({ title, sub }: { title: string; sub: string }) {
  return (
    <Box sx={{ ...glassCard, textAlign: "center", borderColor: `${AEO_TOKENS.ember}22` }}>
      <Typography
        sx={{ fontWeight: 700, color: "#fff", fontSize: { xs: "1.25rem", md: "1.5rem" }, mb: 1 }}
      >
        {title}
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 3 }}>{sub}</Typography>
      <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
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

export function buildBreadcrumbJsonLd({ here, url }: { here: string; url: string }) {
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
