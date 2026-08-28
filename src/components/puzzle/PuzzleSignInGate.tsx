import type { ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthDialog } from "@/contexts/AuthDialogContext";
import { ACCENTS } from "@/components/ui/accents";

/**
 * Cosmetic sign-in gate for the /puzzles/<rating> landing pages.
 *
 * The wrapped cards stay in the DOM — the puzzles are CC0 Lichess data and
 * the statically generated HTML is what search engines index, so this is a
 * conversion prompt, not access control. Blur + pointer-events: none +
 * aria-hidden neutralise the region for sight and input; the gated cards
 * render static diagrams only, so nothing focusable sits underneath.
 *
 * The PARENT owns the auth decision: mount this only once useViewer()
 * reports { loading: false, user: null }. While auth state is loading,
 * nothing gate-related may render — a signed-in visitor must never see a
 * flash of this card.
 */

interface PuzzleSignInGateProps {
  /** How many puzzles sit behind the gate — read out in the card copy. */
  remainingCount: number;
  children: ReactNode;
}

export function PuzzleSignInGate({
  remainingCount,
  children,
}: PuzzleSignInGateProps) {
  const { signInWithGoogle } = useAuth();
  const { openAuthDialog } = useAuthDialog();

  const handleGoogle = async () => {
    try {
      // Navigates to /api/auth/google/start?returnTo=<current path>, so
      // OAuth lands the visitor back on this band page.
      await signInWithGoogle();
    } catch {
      // Start route unreachable (OAuth unconfigured, offline) — fall back
      // to the email dialog so the button never dead-ends.
      openAuthDialog();
    }
  };

  return (
    <Box sx={{ position: "relative" }}>
      <Box
        aria-hidden
        sx={{
          filter: "blur(6px)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {children}
      </Box>

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          background:
            "linear-gradient(180deg, rgba(8,9,12,0.25) 0%, rgba(8,9,12,0.62) 100%)",
          borderRadius: "1.5rem",
          px: 2,
        }}
      >
        <Box
          sx={{
            // Sticky so the card stays in view while the visitor scrolls
            // the (tall, blurred) gated region on mobile.
            position: "sticky",
            top: { xs: 88, md: 120 },
            mt: { xs: 4, md: 7 },
            maxWidth: 380,
            width: "100%",
            textAlign: "center",
            p: { xs: 3, md: 3.5 },
            borderRadius: "1.5rem",
            background: "rgba(20, 22, 28, 0.88)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${ACCENTS.ember.border}`,
            boxShadow: ACCENTS.ember.glow,
          }}
        >
          <Typography
            component="h2"
            variant="h6"
            sx={{ fontWeight: 800, mb: 0.75 }}
          >
            Sign in to keep solving
          </Typography>
          <Typography
            sx={{
              fontSize: "0.875rem",
              color: "rgba(255,255,255,0.65)",
              mb: 2.5,
            }}
          >
            {remainingCount} more puzzles in this set — free account.
          </Typography>

          <Button
            fullWidth
            variant="contained"
            onClick={handleGoogle}
            startIcon={<Icon icon="flat-color-icons:google" width={18} />}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "12px",
              py: 1.1,
            }}
          >
            Continue with Google
          </Button>
          <Button
            fullWidth
            variant="text"
            onClick={() => openAuthDialog()}
            sx={{
              mt: 1,
              textTransform: "none",
              fontWeight: 600,
              color: "rgba(255,255,255,0.75)",
            }}
          >
            Sign in with email
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default PuzzleSignInGate;
