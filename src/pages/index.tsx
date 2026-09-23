"use client";

import { Box, Stack } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import { MastiAvatar, mastiStillSrcSet } from "@/components/masti";
import { Hero } from "@/components/landing/Hero";
import {
  HOME_BG,
  HOME_MUTED,
  HOME_TEXT,
  homeColumnSx,
  homeRootSx,
  launchTheme,
} from "@/components/landing/launchTheme";
import { InternalHomeCard } from "@/components/intern/InternalHomeCard";
import { NavPill } from "@/components/ui/NavPill";
import { homePageJsonLd } from "@/app/_seo/JsonLd";

const HOME_TITLE = "Chess Masti AI: free chess coaching with Masti";
const HOME_DESC =
  "Masti is a free AI chess coach. Play, solve puzzles, learn openings, and get your games explained in plain words.";
const HOME_OG_IMAGE = "https://chessmasti.com/og/home";

/**
 * The home page: one screen. Masti, one sentence, one button, the masters,
 * a one-line footer, and no scrolling on the screens it is sized for.
 *
 * Flat by design. One dark background, big type, solid buttons and a lot
 * of room; nothing moves except a hover. The word budget and the flatness
 * are pinned by src/components/landing/__tests__/home.test.tsx, and
 * landing.spec asserts the page does not scroll, so a new section has to
 * earn both its words and its pixels there.
 */

const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/extension", label: "Chrome extension" },
];

function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        mt: "auto",
        py: { xs: 1.25, md: 2.5 },
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        gap: { xs: 1, sm: 2 },
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "0.85rem",
        color: HOME_MUTED,
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center">
        <MastiAvatar mood="wave" size={22} ring={false} />
        <Box component="span">Chess Masti · built by Aayan Hetamsaria</Box>
      </Stack>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: { xs: 2, md: 3 },
        }}
      >
        {FOOTER_LINKS.map((link) => (
          <Box
            key={link.href}
            component="a"
            href={link.href}
            sx={{
              color: HOME_MUTED,
              textDecoration: "none",
              "&:hover": { color: HOME_TEXT },
            }}
          >
            {link.label}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function LandingPage() {
  return (
    <ThemeProvider theme={launchTheme}>
      <Head>
        <title key="title">{HOME_TITLE}</title>
        <meta key="description" name="description" content={HOME_DESC} />
        <link key="canonical" rel="canonical" href="https://chessmasti.com/" />
        {/* Masti is the first thing on the first screen on every viewport,
            so his still is fetched with the HTML rather than after the JS
            decides on the srcset. */}
        <link
          key="masti-hero-preload"
          rel="preload"
          as="image"
          type="image/webp"
          imageSrcSet={mastiStillSrcSet("wave")}
        />

        <meta key="og:type" property="og:type" content="website" />
        <meta
          key="og:site_name"
          property="og:site_name"
          content="Chess Masti AI"
        />
        <meta key="og:title" property="og:title" content={HOME_TITLE} />
        <meta
          key="og:description"
          property="og:description"
          content={HOME_DESC}
        />
        <meta
          key="og:url"
          property="og:url"
          content="https://chessmasti.com/"
        />
        <meta key="og:image" property="og:image" content={HOME_OG_IMAGE} />
        <meta key="og:image:width" property="og:image:width" content="1200" />
        <meta key="og:image:height" property="og:image:height" content="630" />

        <meta
          key="twitter:card"
          name="twitter:card"
          content="summary_large_image"
        />
        <meta key="twitter:site" name="twitter:site" content="@ChessMastiAI" />
        <meta
          key="twitter:creator"
          name="twitter:creator"
          content="@ChessMastiAI"
        />
        <meta key="twitter:title" name="twitter:title" content={HOME_TITLE} />
        <meta
          key="twitter:description"
          name="twitter:description"
          content={HOME_DESC}
        />
        <meta
          key="twitter:image"
          name="twitter:image"
          content={HOME_OG_IMAGE}
        />

        {homePageJsonLd.map((node) => (
          <script
            key={node["@id"]}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
          />
        ))}

        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content={HOME_BG} />
        {/* The page is dark for every visitor, whatever their system
            preference: the body colour is set here, before hydration, so a
            light-preference visitor never sees a white flash with white text
            on it (the white-landing bug of 2026-08-10). */}
        <style>{`
          html { color-scheme: dark; }
          body { background-color: ${HOME_BG}; color-scheme: dark; margin: 0; }
        `}</style>
      </Head>
      <Box sx={homeRootSx}>
        <NavPill active="launch" />
        <Box sx={homeColumnSx}>
          {/* Renders only for logged-in CMIP interns; renders nothing for customers. */}
          <InternalHomeCard />
          <Hero />
          <Footer />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
