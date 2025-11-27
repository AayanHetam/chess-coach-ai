import { CssBaseline, ThemeProvider, createTheme, Box } from "@mui/material";
import { PropsWithChildren, useMemo } from "react";
import NavBar from "./NavBar";
import { red } from "@mui/material/colors";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { MAIN_THEME_COLOR } from "@/constants";
import { Lc0DownloadBanner } from "@/components/Lc0DownloadBanner";

export default function Layout({ children }: PropsWithChildren) {
  // Default to light mode for Chess Masti AI - bright and fun!
  const [isDarkMode, setDarkMode] = useLocalStorage("useDarkMode", false);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDarkMode ? "dark" : "light",
          error: {
            main: red[400],
          },
          primary: {
            main: MAIN_THEME_COLOR, // Orange
          },
          secondary: {
            main: isDarkMode ? "#424242" : "#FFE4D6", // Light orange for light mode
          },
          background: {
            default: isDarkMode ? "#121212" : "#FFFFFF", // Pure white for light mode
            paper: isDarkMode ? "#1e1e1e" : "#FFF8F5", // Very light orange-tinted white
          },
        },
        components: {
          // Custom styling for Chess Masti AI
          MuiAppBar: {
            styleOverrides: {
              root: {
                backgroundColor: isDarkMode ? "#19191c" : "#FFFFFF",
                color: isDarkMode ? "#FFFFFF" : "#333333",
                boxShadow: isDarkMode
                  ? "none"
                  : "0 2px 8px rgba(255, 107, 53, 0.15)",
                borderBottom: isDarkMode ? "none" : "1px solid #FFE4D6",
              },
            },
          },
        },
      }),
    [isDarkMode]
  );

  if (isDarkMode === null) return null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NavBar
        darkMode={isDarkMode}
        switchDarkMode={() => setDarkMode((val) => !val)}
      />
      <main
        style={{
          margin: "2vh 0.5vw",
          backgroundColor: isDarkMode ? undefined : "#FAFAFA", // Very light background
          overflowX: "hidden", // Prevent horizontal scrolling
          maxWidth: "100vw", // Ensure content doesn't exceed viewport width
          boxSizing: "border-box", // Include padding/borders in width calculation
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
    </ThemeProvider>
  );
}
