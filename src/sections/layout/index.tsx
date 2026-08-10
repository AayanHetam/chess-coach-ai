import { CssBaseline, ThemeProvider, createTheme, Box, Typography } from "@mui/material";
import { PropsWithChildren, useMemo } from "react";
import NavBar from "./NavBar";
import { red } from "@mui/material/colors";
import { useLocalStorage } from "@/hooks/useLocalStorage";
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
import { GlobalPaywallDialog } from "@/contexts/PaywallDialogContext";
import TrialBanner from "@/components/paywall/TrialBanner";

export default function Layout({ children }: PropsWithChildren) {
  // Default to light mode for Chess Masti AI - bright and fun!
  // Coalesce null → false so SSR renders a real tree (light theme) instead of
  // bailing the whole app to client-only render. Dark-mode users see a brief
  // light-theme flash on hydration; trade-off is documented in PR #site-content-ssr.
  const [storedDarkMode, setDarkMode] = useLocalStorage("useDarkMode", false);
  const { isIntern } = useViewer();

  const router = useRouter();
  const isLandingPage = router.pathname === "/";
  // Post-cutover (2026-08-10): every /preview/* route is a server-side 308
  // redirect stub that never renders, so no preview-specific chrome flag is
  // needed anymore.

  // Cutover surfaces promoted from /preview/* that ship their own
  // Obsidian-Glass chrome (ThemeProvider + GradientBackdrop + SharedNavPill).
  // Mounting the legacy light NavBar on top would double-stack headers, so
  // these get the same full-bleed treatment as the landing/preview routes.
  // Scoped to an explicit allowlist on purpose — do NOT broaden the
  // isLandingPage flag, which would affect every route.
  //
  // /analysis and /plan are included because each already self-hosts its own
  // dark glass chrome (GradientBackdrop + SharedNavPill, plus a dark theme on
  // /analysis); before this they took the else branch and rendered the legacy
  // NavBar ON TOP of their own glass pill (a double-nav left over from the
  // cutover / the learning-engine launch).
  const isGlassRoute =
    router.pathname === "/play" ||
    router.pathname === "/profile" ||
    router.pathname === "/analysis" ||
    router.pathname === "/plan" ||
    router.pathname === "/openings" ||
    router.pathname === "/scout" ||
    router.pathname === "/practice" ||
    router.pathname === "/puzzles" ||
    router.pathname === "/puzzles/sessions" ||
    router.pathname === "/repetit-training" ||
    router.pathname === "/database" ||
    router.pathname === "/courses";

  // Obsidian-Glass surfaces are dark ALWAYS — never subject to the legacy
  // light/dark toggle. Without this, CssBaseline injected `body { background:
  // #fff }` in light mode, which paints OVER the pages' fixed zIndex:-1
  // GradientBackdrops (negative-z elements paint before in-flow backgrounds
  // once <html> carries its own background) — the white-landing bug of
  // 2026-08-10.
  const forceGlassDark = isLandingPage || isGlassRoute;
  const isDarkMode = forceGlassDark || (storedDarkMode ?? false);

  const theme = useMemo(
    () => {
      // CMIP intern view swaps the brand primary to deep blue. Customer view
      // (default) keeps the orange theme unchanged.
      const primary = isIntern ? INTERN_THEME_COLOR : MAIN_THEME_COLOR;
      const secondaryLight = isIntern ? "#D8E4F4" : "#FFE4D6";
      const paperTint = isIntern ? "#F4F7FC" : "#FFF8F5";
      const appBarShadow = isIntern
        ? "0 2px 8px rgba(10, 77, 168, 0.18)"
        : "0 2px 8px rgba(255, 107, 53, 0.15)";
      const appBarBorder = isIntern ? "1px solid #D8E4F4" : "1px solid #FFE4D6";

      return createTheme({
        palette: {
          mode: isDarkMode ? "dark" : "light",
          error: {
            main: red[400],
          },
          primary: {
            main: primary,
            light: isIntern ? INTERN_THEME_COLOR_LIGHT : "#FF8C42",
          },
          secondary: {
            main: isDarkMode ? "#424242" : secondaryLight,
          },
          background: {
            // Obsidian base on glass surfaces so the CssBaseline body layer
            // matches the GradientBackdrop base tone exactly.
            default: forceGlassDark
              ? "#08090C"
              : isDarkMode
              ? "#121212"
              : "#FFFFFF",
            paper: isDarkMode ? "#1e1e1e" : paperTint,
          },
        },
        components: {
          // Custom styling for Chess Masti AI
          MuiAppBar: {
            styleOverrides: {
              root: {
                backgroundColor: isDarkMode ? "#19191c" : "#FFFFFF",
                color: isDarkMode ? "#FFFFFF" : "#333333",
                boxShadow: isDarkMode ? "none" : appBarShadow,
                borderBottom: isDarkMode ? "none" : appBarBorder,
              },
            },
          },
        },
      });
    },
    [isDarkMode, isIntern, forceGlassDark]
  );

  // Landing page or a glass cutover route: skip NavBar and app chrome for
  // a full-bleed look.
  if (isLandingPage || isGlassRoute) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {/* Single app-wide sign-in / sign-up dialog, themed by this provider. */}
        <GlobalAuthDialog />
        <GlobalPaywallDialog />
        <EmployeeChrome>
          <main style={{ overflowX: "hidden", width: "100%" }}>
            {children}
          </main>
        </EmployeeChrome>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* Single app-wide sign-in / sign-up dialog, themed by this provider. */}
      <GlobalAuthDialog />
      <GlobalPaywallDialog />
      <EmployeeChrome>
        <NavBar
          darkMode={isDarkMode}
          switchDarkMode={() => setDarkMode((val) => !val)}
        />
        <main
          style={{
            margin: "2vh 0.5vw",
            backgroundColor: isDarkMode ? undefined : "#FAFAFA",
            overflowX: "hidden",
            maxWidth: "100vw",
            boxSizing: "border-box",
            width: "100%",
          }}
        >
          <Box
            sx={{
              maxWidth: "1400px",
              margin: "0 auto",
              px: { xs: 1, sm: 2 },
              mb: 2,
            }}
          >
            <TrialBanner />
            <Lc0DownloadBanner />
          </Box>
          {children}
          <Box
            component="footer"
            sx={{
              mt: 6,
              pt: 2,
              borderTop: "1px solid",
              borderColor: "divider",
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
              { href: "/pricing", label: "Pricing" },
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
                  color: "text.secondary",
                  textDecoration: "none",
                  "&:hover": { color: "primary.main" },
                  transition: "color 0.2s",
                }}
              >
                {link.label}
              </Typography>
            ))}
          </Box>
        </main>
      </EmployeeChrome>
    </ThemeProvider>
  );
}
