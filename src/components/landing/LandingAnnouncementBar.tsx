import { Box, Typography } from "@mui/material";
import { Icon } from "@iconify/react";

export const ANNOUNCEMENT_BAR_HEIGHT = 40;

export default function LandingAnnouncementBar() {
  return (
    <Box
      component="a"
      href="/internship"
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        height: ANNOUNCEMENT_BAR_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        textDecoration: "none",
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        borderBottom: "1px solid rgba(255,140,66,0.25)",
        cursor: "pointer",
        transition: "filter 0.2s",
        "&:hover": { filter: "brightness(1.15)" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, whiteSpace: "nowrap" }}>
        <Box
          sx={{
            display: { xs: "none", sm: "inline-flex" },
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
          }}
        >
          <Icon icon="mdi:bullhorn-variant" width={12} color="#FFFFFF" />
          <Typography
            sx={{
              color: "#FFFFFF",
              fontSize: "0.7rem",
              fontWeight: 800,
              letterSpacing: 1,
              lineHeight: 1,
            }}
          >
            NOW HIRING
          </Typography>
        </Box>
        <Typography
          sx={{
            color: "#FFFFFF",
            fontSize: { xs: "0.78rem", sm: "0.85rem" },
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          <Box component="span" sx={{ display: { xs: "inline", sm: "none" }, fontWeight: 800, color: "#FF8C42" }}>
            HIRING ·{" "}
          </Box>
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            Apply to the Chess Masti Internship Program (CMIP)
          </Box>
          <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
            Apply to CMIP
          </Box>
        </Typography>
        <Typography
          sx={{
            color: "#FF8C42",
            fontSize: { xs: "0.78rem", sm: "0.85rem" },
            fontWeight: 700,
          }}
        >
          Apply →
        </Typography>
      </Box>
    </Box>
  );
}
