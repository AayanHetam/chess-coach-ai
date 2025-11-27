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

  useEffect(() => {
    setDrawerOpen(false);
  }, [router.pathname]);

  return (
    <Box sx={{ flexGrow: 1, display: "flex" }}>
      <AppBar
        position="static"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: darkMode ? "#19191c" : "#FFFFFF",
          color: darkMode ? "white" : "#333333",
          borderBottom: darkMode ? "none" : "2px solid #FFE4D6",
          boxShadow: darkMode ? "none" : "0 2px 12px rgba(255, 107, 53, 0.1)",
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
              color: darkMode ? "white" : "#FF6B35", // Orange icon in light mode
            }}
            onClick={() => setDrawerOpen((val) => !val)}
          >
            <Icon icon="mdi:menu" />
          </IconButton>

          <NavLink href="/">
            <img
              src="/android-chrome-192x192.png"
              width={32}
              height={32}
              alt="Chess Masti AI - Orange Rook Logo"
              style={{ marginRight: "8px" }}
            />
            <Typography
              variant="h6"
              component="div"
              sx={{
                flexGrow: 1,
                fontWeight: "bold",
                background: darkMode
                  ? "linear-gradient(45deg, #FF6B6B 30%, #4ECDC4 90%)"
                  : "linear-gradient(45deg, #FF6B35 30%, #FF8C42 90%)", // Orange gradient for light mode
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                fontSize: { xs: "1.1rem", sm: "1.25rem" },
              }}
            >
              Chess Coach AI
            </Typography>
          </NavLink>

          <StyledIconButtonLink
            href="https://discord.gg/Yr99abAcUr"
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconButton
              sx={{ color: darkMode ? "white" : "#FF6B35" }}
              component="span"
            >
              <Icon icon="ri:discord-fill" />
            </IconButton>
          </StyledIconButtonLink>

          <StyledIconButtonLink
            href="https://github.com/your-username/chess-masti-ai"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            sx={{ ml: "min(0.6rem, 0.8vw)" }}
          >
            <IconButton
              sx={{ color: darkMode ? "white" : "#FF6B35" }}
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

          <IconButton
            sx={{
              ml: "min(0.6rem, 0.8vw)",
              color: darkMode ? "white" : "#FF6B35",
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
