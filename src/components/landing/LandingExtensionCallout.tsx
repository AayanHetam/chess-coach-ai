import Link from "next/link";
import { Box, Container, Typography } from "@mui/material";
import { Icon } from "@iconify/react";

// Reads from env so we can flip on the real Chrome Web Store URL post-approval
// without a code change — set NEXT_PUBLIC_EXTENSION_STORE_URL in Vercel and
// redeploy. Empty/unset = render a "review pending" disabled state. Same
// pattern used in src/app/extension/page.tsx.
const STORE_URL = process.env.NEXT_PUBLIC_EXTENSION_STORE_URL ?? "";

export default function LandingExtensionCallout() {
  const live = Boolean(STORE_URL);
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        px: { xs: 3, md: 4 },
        background:
          "linear-gradient(135deg, rgba(255, 140, 66, 0.06) 0%, rgba(255, 107, 53, 0.10) 100%)",
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1.1fr" },
            gap: { xs: 5, md: 7 },
            alignItems: "center",
          }}
        >
          <Box>
            <Typography
              variant="overline"
              sx={{
                color: "#FF6B35",
                fontWeight: 800,
                letterSpacing: "0.12em",
                fontSize: "0.78rem",
              }}
            >
              CHROME EXTENSION
            </Typography>
            <Typography
              variant="h2"
              sx={{
                fontSize: { xs: "1.9rem", md: "2.5rem" },
                fontWeight: 800,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
                mt: 1,
                mb: 2,
                color: "#1a1a2e",
              }}
            >
              One-click coaching on every Lichess + Chess.com game.
            </Typography>
            <Typography
              sx={{
                fontSize: { xs: "1.02rem", md: "1.1rem" },
                color: "#3a3a55",
                lineHeight: 1.6,
                mb: 3,
                maxWidth: "44ch",
              }}
            >
              Drop a single orange Analyze button into your usual chess site.
              Click it after any game and your PGN comes here automatically —
              with the AI coach already talking. No copy-paste, no account.
            </Typography>

            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: 1.5,
                alignItems: { xs: "stretch", sm: "center" },
              }}
            >
              {live ? (
                <Box
                  component="a"
                  href={STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    background:
                      "linear-gradient(135deg, #FF8C42 0%, #FF6B35 100%)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "1rem",
                    px: 3.5,
                    py: 1.6,
                    borderRadius: 999,
                    textDecoration: "none",
                    boxShadow: "0 8px 22px rgba(255, 107, 53, 0.32)",
                    transition: "transform 0.12s ease, box-shadow 0.12s ease",
                    "&:hover": {
                      transform: "translateY(-1px)",
                      boxShadow: "0 12px 28px rgba(255, 107, 53, 0.42)",
                    },
                  }}
                >
                  <Icon icon="mdi:google-chrome" width={20} />
                  Install from the Chrome Web Store
                </Box>
              ) : (
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    background:
                      "linear-gradient(135deg, rgba(255, 140, 66, 0.55) 0%, rgba(255, 107, 53, 0.55) 100%)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "1rem",
                    px: 3.5,
                    py: 1.6,
                    borderRadius: 999,
                    cursor: "default",
                  }}
                >
                  <Icon icon="mdi:google-chrome" width={20} />
                  Review pending — coming soon
                </Box>
              )}
              <Box
                component={Link}
                href="/extension"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: "#FF6B35",
                  fontWeight: 700,
                  fontSize: "0.98rem",
                  textDecoration: "none",
                  px: 1,
                  py: 1.6,
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Learn more →
              </Box>
            </Box>
          </Box>

          {/* Right side: framed extension screenshot */}
          <Box
            sx={{
              position: "relative",
              borderRadius: 4,
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.18)",
              border: "1px solid rgba(0, 0, 0, 0.06)",
              aspectRatio: "1280 / 800",
              background: "#1a1a1a",
            }}
          >
            <Box
              component="img"
              src="/extension/2-lichess-button.png"
              alt="Analyze with Chess Masti button visible in the Lichess top navigation bar"
              loading="lazy"
              sx={{ width: "100%", height: "100%", display: "block" }}
            />
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
