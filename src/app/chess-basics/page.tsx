// /chess-basics — the things a newcomer to organised chess cannot find in one
// place: how a rated game is run, what the time formats are, how a FIDE or
// national rating is earned, and what the titles actually require.
//
// A reader asked for exactly this: "the information people lack, that is what
// you should be aiming to provide." The page is deliberately NOT a rulebook —
// it points at the free official ones — and every number on it was checked
// against the FIDE Handbook or US Chess on the date in `checkedOn`, with the
// pages listed under "Checked against" so a reader (or a future editor) can
// see for themselves. Regulations move; the date is part of the content.
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import {
  AEO_TOKENS,
  AnswerBlock,
  Breadcrumb,
  CtaButton,
  H1,
  PageShell,
  ProseBlock,
  SectionHeading,
  buildBreadcrumbJsonLd,
  buildWebPageJsonLd,
  glassCard,
} from "@/app/_seo/aeoUi";
import { BASICS, type BasicsSection } from "./content";

const TITLE = "Chess basics: ratings, titles and time controls";
const DESCRIPTION =
  "How organised chess works in plain English: what happens at a rated tournament, the classical, rapid and blitz formats, how to get a FIDE or national rating, and what FM, IM and GM titles require. Checked against the FIDE Handbook and US Chess.";
const URL = "https://chessmasti.com/chess-basics";

export const metadata: Metadata = {
  title: `${TITLE} — Chess Masti AI`,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: URL,
    type: "article",
    siteName: "Chess Masti AI",
    images: [
      {
        url: "https://chessmasti.com/social-networks-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Chess Masti AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ChessMastiAI",
    creator: "@ChessMastiAI",
    title: TITLE,
    description: "Ratings, titles, time controls and tournament basics, checked against the official rules.",
    images: ["https://chessmasti.com/social-networks-1200x630.png"],
  },
};

const ulSx = {
  pl: 3,
  lineHeight: 1.9,
  color: "rgba(255,255,255,0.7)",
  "& li": { mb: 1.5 },
} as const;

const linkSx = {
  color: "#fff",
  textDecorationColor: `${AEO_TOKENS.ember}88`,
  "&:hover": { textDecorationColor: AEO_TOKENS.ember },
} as const;

/** An outbound link. Every one on this page leaves the site, and says so to the browser. */
function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Box component="a" href={href} target="_blank" rel="noopener noreferrer" sx={linkSx}>
      {children}
    </Box>
  );
}

function Section({ section }: { section: BasicsSection }) {
  return (
    <Box component="section" id={section.id} data-testid={`basics-${section.id}`} sx={{ mb: 10 }}>
      <SectionHeading>{section.heading}</SectionHeading>
      <Typography
        sx={{
          fontSize: { xs: "1.05rem", md: "1.15rem" },
          lineHeight: 1.8,
          color: "rgba(255,255,255,0.85)",
          mb: 3,
        }}
      >
        {section.summary}
      </Typography>

      {section.blocks.map((block) => (
        <Box key={block.subheading} sx={{ mb: 4 }}>
          <Typography
            component="h3"
            sx={{ fontSize: "1.15rem", fontWeight: 700, color: "#fff", mb: 1.5 }}
          >
            {block.subheading}
          </Typography>
          {(block.paragraphs ?? []).map((p) => (
            <ProseBlock key={p.slice(0, 40)}>{p}</ProseBlock>
          ))}
          {block.bullets && block.bullets.length > 0 && (
            <Box component="ul" sx={ulSx}>
              {block.bullets.map((b) => (
                <li key={b.slice(0, 40)}>{b}</li>
              ))}
            </Box>
          )}
        </Box>
      ))}

      {section.links.length > 0 && (
        <Box sx={{ ...glassCard, p: { xs: 2.5, md: 3 } }}>
          <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1.5, fontSize: "0.95rem" }}>
            Read the official source
          </Typography>
          <Box component="ul" sx={{ ...ulSx, "& li": { mb: 1 } }}>
            {section.links.map((l) => (
              <li key={l.url}>
                <Out href={l.url}>{l.label}</Out>
                <span style={{ color: "rgba(255,255,255,0.5)" }}> — {l.why}</span>
              </li>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default function ChessBasicsPage() {
  const webPageJsonLd = buildWebPageJsonLd({ name: TITLE, url: URL, description: DESCRIPTION });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd({ here: "Chess basics", url: URL });
  const checked = BASICS.sections.flatMap((s) => s.sources.filter((x) => x.fetched));

  return (
    <PageShell>
      <script
        id="webpage-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <script
        id="breadcrumb-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <Breadcrumb here="Chess basics" />

      <H1>Chess basics</H1>

      <AnswerBlock>{BASICS.intro}</AnswerBlock>

      <Box
        component="nav"
        aria-label="On this page"
        sx={{ ...glassCard, mb: 8, p: { xs: 2.5, md: 3 } }}
      >
        <Typography sx={{ fontWeight: 700, color: "#fff", mb: 1.5, fontSize: "0.95rem" }}>
          On this page
        </Typography>
        <Box component="ol" sx={{ ...ulSx, "& li": { mb: 0.75 } }}>
          {BASICS.sections.map((s) => (
            <li key={s.id}>
              <Link href={`#${s.id}`} style={{ color: "#fff" }}>
                {s.heading}
              </Link>
            </li>
          ))}
        </Box>
      </Box>

      {BASICS.sections.map((s) => (
        <Section key={s.id} section={s} />
      ))}

      <Box component="section" id="checked-against" sx={{ mb: 10 }}>
        <SectionHeading>Checked against</SectionHeading>
        <ProseBlock>
          {BASICS.disclaimer} Last checked on {BASICS.checkedOn}.
        </ProseBlock>
        <Box component="ul" sx={{ ...ulSx, fontSize: "0.9rem", "& li": { mb: 0.75 } }}>
          {checked.map((x) => (
            <li key={x.url}>
              <Out href={x.url}>{x.url.replace(/^https?:\/\//, "")}</Out>
              <span style={{ color: "rgba(255,255,255,0.5)" }}> — {x.confirms}</span>
            </li>
          ))}
        </Box>
      </Box>

      <Box sx={{ ...glassCard, textAlign: "center", borderColor: `${AEO_TOKENS.ember}22` }}>
        <Typography
          sx={{ fontWeight: 700, color: "#fff", fontSize: { xs: "1.25rem", md: "1.5rem" }, mb: 1 }}
        >
          Now go and play
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 3 }}>
          Everything on Chess Masti is free: an opening course to learn, puzzles built from
          the mistakes players at your level actually make, and a coach for your own games.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
          <CtaButton href="/learn">Pick an opening course</CtaButton>
          <CtaButton href="/puzzles">Train tactics</CtaButton>
          <CtaButton href="/free-ai-chess-coach" primary>
            Try the coach
          </CtaButton>
        </Box>
      </Box>
    </PageShell>
  );
}
