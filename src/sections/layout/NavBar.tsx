import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import { useEffect, useState } from "react";
import NavMenu from "./NavMenu";
import { Icon } from "@iconify/react";
import { useRouter } from "next/router";
import NavLink from "@/components/NavLink";
import Image from "next/image";
import { styled } from "@mui/material/styles";
import { MaiaStatusIndicator } from "@/components/MaiaStatusIndicator";
import UserMenu from "@/components/auth/UserMenu";
import { useViewer } from "@/hooks/useViewer";
import { EmployeePill } from "@/components/intern/EmployeePill";
import { InternalNavLinks } from "@/components/intern/InternalNavLinks";
import { INTERN_THEME_COLOR } from "@/constants";

interface Props {
  darkMode: boolean;
  switchDarkMode: () => void;
}

// Styled component to make the link look like a button
const StyledIconButtonLink = styled("a")({
  color: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none", // Remove underline from link
  "&:hover": {
    cursor: "pointer", // Change cursor on hover
  },
});

export default function NavBar({ darkMode, switchDarkMode }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const { isIntern } = useViewer();

  useEffect(() => {
    setDrawerOpen(false);
  }, [router.pathname]);

  // Intern view swaps the brand orange to deep blue across nav chrome.
  // Customer view (default) is unchanged.
  const brandColor = isIntern ? INTERN_THEME_COLOR : "#FF6B35";
  const brandBorder = isIntern ? "#D8E4F4" : "#FFE4D6";
  const brandShadow = isIntern
    ? "0 2px 12px rgba(10, 77, 168, 0.12)"
    : "0 2px 12px rgba(255, 107, 53, 0.1)";
  const titleGradient = darkMode
    ? "linear-gradient(45deg, #FF6B6B 30%, #4ECDC4 90%)"
    : isIntern
      ? "linear-gradient(45deg, #0A4DA8 30%, #3A78D8 90%)"
      : "linear-gradient(45deg, #FF6B35 30%, #FF8C42 90%)";

  return (
    <Box sx={{ flexGrow: 1, display: "flex" }}>
      <AppBar
        position="static"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: darkMode ? "#19191c" : "#FFFFFF",
          color: darkMode ? "white" : "#333333",
          borderBottom: darkMode ? "none" : `2px solid ${brandBorder}`,
          boxShadow: darkMode ? "none" : brandShadow,
        }}
        enableColorOnDark
      >
        <Toolbar variant="dense" sx={{ py: 1 }}>
          <IconButton
            size="large"
            edge="start"
            sx={{
              mr: "min(0.5vw, 0.6rem)",
              padding: 1,
              my: 1,
              color: darkMode ? "white" : brandColor,
            }}
            onClick={() => setDrawerOpen((val) => !val)}
          >
            <Icon icon="mdi:menu" />
          </IconButton>

          <NavLink href="/">
            <img
              src="/logo.svg"
              width={32}
              height={32}
              alt="Chess Coach AI Logo"
              style={{ marginRight: "8px" }}
            />
            <Typography
              variant="h6"
              component="div"
              sx={{
                flexGrow: 1,
                fontWeight: "bold",
                background: titleGradient,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                fontSize: { xs: "1.1rem", sm: "1.25rem" },
              }}
            >
              Chess Coach AI
            </Typography>
          </NavLink>

          {isIntern && (
            <Box sx={{ ml: 1.5, display: { xs: "none", sm: "flex" }, alignItems: "center" }}>
              <EmployeePill />
            </Box>
          )}

          <Box sx={{ flexGrow: 1 }} />

          {isIntern && (
            <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", mr: 1 }}>
              <InternalNavLinks />
            </Box>
          )}

          <StyledIconButtonLink
            href="https://github.com/AayanHetam/chess-coach-ai"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            sx={{ ml: "min(0.6rem, 0.8vw)" }}
          >
            <IconButton
              sx={{ color: darkMode ? "white" : brandColor }}
              component="span"
            >
              <Icon icon="mdi:github" />
            </IconButton>
          </StyledIconButtonLink>

          <Box
            sx={{
              ml: "min(0.6rem, 0.8vw)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <MaiaStatusIndicator size="small" />
          </Box>

          <Box sx={{ ml: "min(0.6rem, 0.8vw)", display: "flex", alignItems: "center" }}>
            <UserMenu />
          </Box>

          <IconButton
            sx={{
              ml: "min(0.6rem, 0.8vw)",
              color: darkMode ? "white" : brandColor,
            }}
            onClick={switchDarkMode}
            edge="end"
          >
            {darkMode ? (
              <Icon icon="mdi:brightness-7" />
            ) : (
              <Icon icon="mdi:brightness-4" />
            )}
          </IconButton>
        </Toolbar>
      </AppBar>
      <NavMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </Box>
  );
}
