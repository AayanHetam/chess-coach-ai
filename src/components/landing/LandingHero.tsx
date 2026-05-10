import { Box, Button, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AuthDialog from "@/components/auth/AuthDialog";

export default function LandingHero() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { user } = useAuth();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Box
      component="section"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, #FFFFFF 0%, #FFF8F5 30%, #FFE4D6 70%, #FFDBC9 100%)",
      }}
    >
      {/* Decorative background elements */}
      <Box
        sx={{
          position: "absolute",
          top: "10%",
          right: "-5%",
          width: { xs: 200, md: 500 },
          height: { xs: 200, md: 500 },
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,107,53,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: "5%",
          left: "-10%",
          width: { xs: 250, md: 600 },
          height: { xs: 250, md: 600 },
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,140,66,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* Grid pattern overlay */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(rgba(255,107,53,0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          pointerEvents: "none",
        }}
      />

      <Container
        maxWidth="lg"
        sx={{ position: "relative", zIndex: 1, py: { xs: 12, md: 0 } }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", lg: "row" },
            alignItems: "center",
            gap: { xs: 6, lg: 8 },
          }}
        >
          {/* Left: Copy */}
          <Box
            sx={{
              flex: { lg: "1 1 55%" },
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(20px)",
              transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                px: 2,
                py: 0.75,
                borderRadius: 10,
                backgroundColor: "rgba(255,107,53,0.08)",
                border: "1px solid rgba(255,107,53,0.15)",
                mb: 3,
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#22c55e",
                  animation: "pulse 2s ease-in-out infinite",
                  "@keyframes pulse": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.4 },
                  },
                }}
              />
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, color: "#FF6B35", letterSpacing: 0.5 }}
              >
                Free · No install · Engine-grounded
              </Typography>
            </Box>

            <Typography
              variant="h1"
              sx={{
                fontWeight: 900,
                color: "#1a1a2e",
                fontSize: { xs: "2.5rem", sm: "3.2rem", md: "3.8rem" },
                lineHeight: 1.1,
                mb: 3,
                letterSpacing: "-0.02em",
              }}
            >
              Your AI Chess Coach
              <br />
              That{" "}
              <Box
                component="span"
                sx={{
                  background:
                    "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Actually Understands
              </Box>{" "}
              Chess
            </Typography>

            <Typography
              variant="h6"
              sx={{
                color: "#666",
                fontWeight: 400,
                lineHeight: 1.7,
                mb: 5,
                maxWidth: 520,
                fontSize: { xs: "1rem", md: "1.15rem" },
              }}
            >
              Stockfish 17 evaluates the position. Claude turns the
              engine&apos;s verdict into plain English. A hallucination
              validator checks every claim against the live board before you
              read it. Then the next 3 puzzles you solve are pulled from a
              100,000+ position Neo4j graph and ranked against your actual
              mistake — not a generic theme bucket.
            </Typography>

            <Box
              sx={{
                display: "flex",
                gap: 2,
                flexWrap: "wrap",
                mb: 5,
              }}
            >
              <Button
                variant="contained"
                size="large"
                onClick={() => user ? router.push("/analysis") : setAuthDialogOpen(true)}
                startIcon={<Icon icon="mdi:magnify" />}
                sx={{
                  px: 4,
                  py: 1.6,
                  fontSize: "1rem",
                  fontWeight: 700,
                  borderRadius: 3,
                  background:
                    "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                  boxShadow: "0 8px 30px rgba(255,107,53,0.35)",
                  textTransform: "none",
                  "&:hover": {
                    background:
                      "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                    boxShadow: "0 12px 40px rgba(255,107,53,0.45)",
                    transform: "translateY(-2px)",
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Start Analyzing
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => router.push("/play")}
                startIcon={<Icon icon="simple-icons:lichess" />}
                sx={{
                  px: 4,
                  py: 1.6,
                  fontSize: "1rem",
                  fontWeight: 700,
                  borderRadius: 3,
                  color: "#1a1a2e",
                  borderColor: "rgba(26,26,46,0.2)",
                  textTransform: "none",
                  "&:hover": {
                    borderColor: "#FF6B35",
                    backgroundColor: "rgba(255,107,53,0.04)",
                    transform: "translateY(-2px)",
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Play on Lichess
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => router.push("/practice")}
                startIcon={<Icon icon="mdi:puzzle" />}
                sx={{
                  px: 4,
                  py: 1.6,
                  fontSize: "1rem",
                  fontWeight: 700,
                  borderRadius: 3,
                  color: "#1a1a2e",
                  borderColor: "rgba(26,26,46,0.2)",
                  textTransform: "none",
                  "&:hover": {
                    borderColor: "#FF6B35",
                    backgroundColor: "rgba(255,107,53,0.04)",
                    transform: "translateY(-2px)",
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Practice Puzzles
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => router.push("/scout")}
                startIcon={<Icon icon="mdi:binoculars" />}
                sx={{
                  px: 4,
                  py: 1.6,
                  fontSize: "1rem",
                  fontWeight: 700,
                  borderRadius: 3,
                  color: "#1a1a2e",
                  borderColor: "rgba(26,26,46,0.2)",
                  textTransform: "none",
                  "&:hover": {
                    borderColor: "#FF6B35",
                    backgroundColor: "rgba(255,107,53,0.04)",
                    transform: "translateY(-2px)",
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Scout Opponents
              </Button>
            </Box>

            {/* Trust indicators */}
            <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {[
                { icon: "mdi:engine-outline", text: "Engine-grounded" },
                { icon: "mdi:shield-check-outline", text: "Validated against chess.js" },
                { icon: "mdi:currency-usd-off", text: "Free, no paid tier" },
              ].map((item) => (
                <Box
                  key={item.text}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                  }}
                >
                  <Icon
                    icon={item.icon}
                    width={18}
                    color="rgba(255,107,53,0.6)"
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#888",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                    }}
                  >
                    {item.text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Right: Visual */}
          <Box
            sx={{
              flex: { lg: "1 1 45%" },
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateX(0)" : "translateX(30px)",
              transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
              transitionDelay: "0.2s",
            }}
          >
            <Box
              sx={{
                position: "relative",
                borderRadius: 5,
                overflow: "hidden",
                boxShadow: "0 25px 80px rgba(0,0,0,0.12)",
                border: "1px solid rgba(255,107,53,0.1)",
                backgroundColor: "#1e1e2e",
                p: 3,
              }}
            >
              {/* Fake window chrome */}
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  mb: 2.5,
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: "#ff5f57",
                  }}
                />
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: "#febc2e",
                  }}
                />
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: "#28c840",
                  }}
                />
              </Box>

              {/* Chat mockup */}
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {/* User message */}
                <Box
                  sx={{
                    alignSelf: "flex-end",
                    maxWidth: "75%",
                    backgroundColor: "#FF6B35",
                    color: "#fff",
                    px: 2.5,
                    py: 1.5,
                    borderRadius: "16px 16px 4px 16px",
                    fontSize: "0.85rem",
                    lineHeight: 1.5,
                  }}
                >
                  Why was 11. Nf3 a mistake? What should I have played?
                </Box>

                {/* AI message */}
                <Box
                  sx={{
                    alignSelf: "flex-start",
                    maxWidth: "85%",
                    backgroundColor: "#2a2a3e",
                    color: "#e0e0e0",
                    px: 2.5,
                    py: 2,
                    borderRadius: "16px 16px 16px 4px",
                    fontSize: "0.85rem",
                    lineHeight: 1.7,
                  }}
                >
                  <Box
                    component="span"
                    sx={{ color: "#FF8C42", fontWeight: 600 }}
                  >
                    11. Nf3
                  </Box>{" "}
                  was passive here because it doesn&apos;t address the tension
                  in the center.
                  <br />
                  <br />
                  The key idea is{" "}
                  <Box
                    component="span"
                    sx={{
                      color: "#4CAF50",
                      fontWeight: 600,
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    11. d5!
                  </Box>{" "}
                  &mdash; seizing space and opening the diagonal for your
                  bishop. After 11...exd5 12. cxd5, you gain a strong passed
                  pawn.
                </Box>

                {/* Typing indicator */}
                <Box
                  sx={{
                    alignSelf: "flex-start",
                    display: "flex",
                    gap: 0.5,
                    px: 2,
                    py: 1.5,
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: "rgba(255,255,255,0.3)",
                        animation: "typing 1.4s ease-in-out infinite",
                        animationDelay: `${i * 0.2}s`,
                        "@keyframes typing": {
                          "0%, 100%": {
                            opacity: 0.3,
                            transform: "translateY(0)",
                          },
                          "50%": {
                            opacity: 1,
                            transform: "translateY(-4px)",
                          },
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Container>
      <AuthDialog open={authDialogOpen} onClose={() => setAuthDialogOpen(false)} />
    </Box>
  );
}
