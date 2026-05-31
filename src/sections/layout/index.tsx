import { CssBaseline, ThemeProvider, createTheme, Box } from "@mui/material";
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

export default function Layout({ children }: PropsWithChildren) {
  // Default to light mode for Chess Masti AI - bright and fun!
  // Coalesce null → false so SSR renders a real tree (light theme) instead of
  // bailing the whole app to client-only render. Dark-mode users see a brief
  // light-theme flash on hydration; trade-off is documented in PR #site-content-ssr.
  const [storedDarkMode, setDarkMode] = useLocalStorage("useDarkMode", false);
  const router = useRouter();
  const isPreviewRoute = router.pathname.startsWith("/preview");
  // Preview routes are dark-mode only — the new design system has no light variant.
  const isDarkMode = isPreviewRoute ? true : (storedDarkMode ?? false);
  const { isIntern } = useViewer();

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
            default: isDarkMode ? "#121212" : "#FFFFFF",
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
    [isDarkMode, isIntern]
  );

  const isLandingPage = router.pathname === "/";
  // Preview routes (the new design system that's replacing the legacy
  // /play, /analysis, etc.) ship their own SharedNavPill chrome. Mounting
  // the legacy NavBar on top of it would double-stack headers AND every
  // legacy link would deep-link the user back into the prod surface,
  // breaking the cutover. Treat preview/* like the landing page —
  // full-bleed, no legacy chrome.

  // Landing page or preview route: skip NavBar and app chrome for a
  // full-bleed look.
  if (isLandingPage || isPreviewRoute) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
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
            <Lc0DownloadBanner />
          </Box>
          {children}
        </main>
      </EmployeeChrome>
    </ThemeProvider>
  );
}
