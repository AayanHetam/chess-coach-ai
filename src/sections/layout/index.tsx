import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  Box,
  Typography,
} from "@mui/material";
import { PropsWithChildren, useMemo } from "react";
import { red } from "@mui/material/colors";
import {
  MAIN_THEME_COLOR,
  INTERN_THEME_COLOR,
  INTERN_THEME_COLOR_LIGHT,
} from "@/constants";
import { Lc0DownloadBanner } from "@/components/Lc0DownloadBanner";
import { useRouter } from "next/router";
import { useViewer } from "@/hooks/useViewer";
import { EmployeeChrome } from "@/components/intern/EmployeeChrome";
import { GlobalAuthDialog } from "@/contexts/AuthDialogContext";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";

// Routes that mount their own <GradientBackdrop /> + <NavPill /> inside the
// page component. Layout must NOT add a second set, or they double-stack.
// Everything NOT listed here gets its chrome from Layout below.
//
// This used to be the inverse — an allowlist of "glass" routes, with every
// other route falling through to the legacy Chesskit <NavBar> (burger drawer,
// "Chess Coach AI" wordmark, light AppBar, dark-mode toggle). That component
// and its <NavMenu> drawer are deleted as of this change: there is now exactly
// one navigation surface on the site, the glass NavPill, and one theme, dark.
//
// Consequence to keep in mind when adding a page: a NEW route gets the
// Layout-provided pill for free. Only add it here once the page renders its
// own — otherwise the route ships with no navigation at all.
const SELF_CHROMED_ROUTES = new Set([
  "/",
  "/analysis",
  "/courses",
  "/database",
  // The funnel pages paint their own gradient over the full viewport, so they
  // mount the pill inside it — a Layout-level pill would sit on the seam
  // between the backdrop and that gradient.
  "/onboarding",
  "/openings",
  "/placement",
  "/plan",
  "/play",
  "/practice",
  "/profile",
  "/puzzles",
  "/puzzles/sessions",
  "/repetit-training",
  "/scout",
]);

// Deliberately chrome-free. /auth/age is the COPPA interstitial — offering
// nav links there is a way to route AROUND the gate — and /reset-password is a
// one-shot token flow. Both still get the dark theme and the backdrop.
const BARE_ROUTES = new Set([
  "/reset-password",
  "/auth/age",
  // The opening trainer is a full-viewport three-region session: rail, board,
  // panel, no page scroll. A header and a footer above and below it push the
  // board off screen and turn the session into a scrolling document, which is
  // the one thing the layout is designed not to be.
  "/train/opening",
]);

export default function Layout({ children }: PropsWithChildren) {
  const { isIntern } = useViewer();
  const router = useRouter();

  const selfChromed = SELF_CHROMED_ROUTES.has(router.pathname);
  const bare = BARE_ROUTES.has(router.pathname);
  // /preview/* are server-side 308 stubs that never render a tree.
  const isPreviewStub = router.pathname.startsWith("/preview/");

  const theme = useMemo(() => {
    // CMIP intern view swaps the brand primary to deep blue. Customer view
    // (default) keeps the orange theme unchanged.
    const primary = isIntern ? INTERN_THEME_COLOR : MAIN_THEME_COLOR;

    // Obsidian-Glass is dark everywhere, unconditionally. The old
    // light/dark toggle lived in the deleted NavBar and the light palette
    // painted `body { background: #fff }` over the pages' fixed zIndex:-1
    // backdrops (negative-z elements paint before in-flow backgrounds once
    // <html> carries its own background) — the white-landing bug of
    // 2026-08-10. Removing the light mode removes that failure mode.
    return createTheme({
      palette: {
        mode: "dark",
        error: { main: red[400] },
        primary: {
          main: primary,
          light: isIntern ? INTERN_THEME_COLOR_LIGHT : "#FF8C42",
        },
        secondary: { main: "#424242" },
        background: {
          // Matches the GradientBackdrop base tone exactly, so the
          // CssBaseline body layer is invisible behind it.
          default: "#08090C",
          paper: "#14161C",
        },
      },
    });
  }, [isIntern]);

  const shell = (
    <>
      <CssBaseline />
      {/* Single app-wide sign-in / sign-up dialog, themed by this provider. */}
      <GlobalAuthDialog />
    </>
  );

  // Pages that ship their own backdrop + pill (and the redirect stubs, which
  // render nothing at all): hand them the themed tree and get out of the way.
  if (selfChromed || isPreviewStub) {
    return (
      <ThemeProvider theme={theme}>
        {shell}
        <EmployeeChrome>
          <main style={{ overflowX: "hidden", width: "100%" }}>{children}</main>
        </EmployeeChrome>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      {shell}
      <GradientBackdrop />
      <EmployeeChrome>
        <main
          style={{
            minHeight: "100vh",
            overflowX: "hidden",
            maxWidth: "100vw",
            boxSizing: "border-box",
            width: "100%",
            padding: bare ? 0 : "0.75rem 1rem 2rem",
          }}
        >
          {!bare && (
            <>
              <NavPill />
              <Box
                sx={{
                  maxWidth: 1400,
                  margin: "0 auto",
                  px: { xs: 1, sm: 2 },
                  mb: 2,
                }}
              >
                <Lc0DownloadBanner />
              </Box>
            </>
          )}

          {children}

          {!bare && (
            <Box
              component="footer"
              sx={{
                mt: 6,
                pt: 2,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                px: { xs: 1, sm: 2 },
                pb: 2,
                display: "flex",
                gap: 2,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {[
                { href: "/free-ai-chess-coach", label: "Free AI chess coach" },
                { href: "/analysis", label: "Game analysis" },
                { href: "/practice", label: "Puzzle training" },
                { href: "/scout", label: "Opponent scout" },
                { href: "/openings", label: "Openings" },
                { href: "/terms", label: "Terms" },
                { href: "/privacy", label: "Privacy" },
                { href: "/", label: "Home" },
              ].map((link) => (
                <Typography
                  key={link.href}
                  component="a"
                  href={link.href}
                  variant="caption"
                  sx={{
                    color: "rgba(255,255,255,0.5)",
                    textDecoration: "none",
                    "&:hover": { color: "primary.light" },
                    transition: "color 0.2s",
                  }}
                >
                  {link.label}
                </Typography>
              ))}
            </Box>
          )}
        </main>
      </EmployeeChrome>
    </ThemeProvider>
  );
}
