"use client";

import { Box, Container, Typography } from "@mui/material";
import { BrandMark } from "@/components/ui/BrandMark";
import { MOTION, TYPE } from "@/theme/tokens";

const linkSx = {
  color: "text.secondary",
  textDecoration: "none",
  fontSize: TYPE.bodySmall.fontSize,
  transition: `color ${MOTION.hover}`,
  "&:hover": { color: "text.primary" },
} as const;

export default function InternshipFooter() {
  return (
    <Box
      component="footer"
      sx={{
        py: 5,
        px: { xs: 2, md: 4 },
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 3,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <BrandMark size={28} />
            <Typography
              variant="body1"
              sx={{ fontWeight: 600, color: "text.primary" }}
            >
              Chess Masti
            </Typography>
          </Box>

          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <Typography component="a" href="/" sx={linkSx}>
              Home
            </Typography>
            <Typography component="a" href="/internship" sx={linkSx}>
              Internship
            </Typography>
            <Typography component="a" href="/internship/apply" sx={linkSx}>
              Apply
            </Typography>
          </Box>

          <Typography
            variant="caption"
            sx={{ color: "text.secondary", width: { xs: "100%", md: "auto" } }}
          >
            &copy; {new Date().getFullYear()} Chess Masti. Free forever.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
