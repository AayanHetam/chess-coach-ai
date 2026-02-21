import { Avatar, Box, Button, Container, IconButton, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";
import AuthDialog from "@/components/auth/AuthDialog";

export default function LandingNav() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const { user, loading, isFirebaseConfigured } = useAuth();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <Box
      component="nav"
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        py: scrolled ? 1.5 : 2.5,
        backgroundColor: scrolled ? "rgba(255,255,255,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled
          ? "1px solid rgba(255,107,53,0.1)"
          : "1px solid transparent",
        transition: "all 0.3s ease",
      }}
    >
      <Container
        maxWidth="lg"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            cursor: "pointer",
          }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <img
            src="/logo.svg"
            width={32}
            height={32}
            alt="Chess Coach AI"
          />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              background: "linear-gradient(45deg, #FF6B35 30%, #FF8C42 90%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontSize: "1.1rem",
            }}
          >
            Chess Coach AI
          </Typography>
        </Box>

        {/* Nav links (desktop) */}
        <Box
          sx={{
            display: { xs: "none", md: "flex" },
            alignItems: "center",
            gap: 3.5,
          }}
        >
          {[
            { label: "Features", href: "#features" },
            { label: "How It Works", href: "#how-it-works" },
            { label: "Compare", href: "#comparison" },
            { label: "Testimonials", href: "#testimonials" },
          ].map((link) => (
            <Typography
              key={link.label}
              component="a"
              href={link.href}
              sx={{
                color: scrolled ? "#555" : "#444",
                textDecoration: "none",
                fontSize: "0.9rem",
                fontWeight: 500,
                "&:hover": { color: "#FF6B35" },
                transition: "color 0.2s",
              }}
            >
              {link.label}
            </Typography>
          ))}
        </Box>

        {/* CTA buttons */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {isFirebaseConfigured && !loading && !user && (
            <Button
              variant="text"
              size="small"
              onClick={() => setAuthDialogOpen(true)}
              sx={{
                display: { xs: "none", sm: "inline-flex" },
                color: "#555",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.9rem",
                "&:hover": { color: "#FF6B35", backgroundColor: "transparent" },
              }}
            >
              Sign In
            </Button>
          )}
          {user && (
            <IconButton
              onClick={() => router.push("/analysis")}
              sx={{ p: 0.5 }}
            >
              <Avatar
                src={user.photoURL || undefined}
                alt={user.displayName || "User"}
                sx={{ width: 32, height: 32, fontSize: "0.85rem", fontWeight: 700, bgcolor: "#FF6B35" }}
              >
                {user.displayName?.[0] || user.email?.[0]?.toUpperCase() || "U"}
              </Avatar>
            </IconButton>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={() => router.push("/analysis")}
            sx={{
              px: 3,
              py: 1,
              fontSize: "0.85rem",
              fontWeight: 700,
              borderRadius: 2.5,
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              boxShadow: scrolled
                ? "0 4px 16px rgba(255,107,53,0.3)"
                : "0 4px 16px rgba(255,107,53,0.2)",
              textTransform: "none",
              "&:hover": {
                background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                boxShadow: "0 6px 20px rgba(255,107,53,0.4)",
              },
              transition: "all 0.3s ease",
            }}
          >
            Start Analyzing
          </Button>
        </Box>
      </Container>

      <AuthDialog open={authDialogOpen} onClose={() => setAuthDialogOpen(false)} />
    </Box>
  );
}
