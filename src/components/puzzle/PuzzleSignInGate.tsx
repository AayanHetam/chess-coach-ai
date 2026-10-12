import type { ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthDialog } from "@/contexts/AuthDialogContext";
import { Masti } from "@/components/masti";
import {
  MATERIAL,
  MATERIAL_FALLBACK_SX,
  RADIUS,
  SHADOW,
  TEXT,
} from "@/theme/tokens";

/**
 * Cosmetic sign-in gate for the /puzzles/<rating> landing pages.
 *
 * The wrapped cards stay in the DOM — the puzzles are CC0 Lichess data and
 * the statically generated HTML is what search engines index, so this is a
 * conversion prompt, not access control. A scrim + pointer-events: none +
 * aria-hidden neutralise the region for sight and input; the gated cards
 * render static diagrams only, so nothing focusable sits underneath.
 *
 * The card itself is the one translucent thing here: it is floating chrome
 * that the gated region scrolls under, so it wears the material (and goes
 * solid under reduced transparency or more contrast).
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
          background: MATERIAL.scrim,
          borderRadius: `${RADIUS.card}px`,
          px: 2,
        }}
      >
        <Box
          sx={{
            // Sticky so the card stays in view while the visitor scrolls
            // the (tall, dimmed) gated region on mobile.
            position: "sticky",
            top: { xs: 88, md: 120 },
            mt: { xs: 4, md: 7 },
            maxWidth: 380,
            width: "100%",
            textAlign: "center",
            p: { xs: 3, md: 3.5 },
            borderRadius: `${RADIUS.sheet}px`,
            background: MATERIAL.background,
            backdropFilter: MATERIAL.backdropFilter,
            WebkitBackdropFilter: MATERIAL.backdropFilter,
            border: `1px solid ${MATERIAL.border}`,
            boxShadow: SHADOW.modal,
            ...MATERIAL_FALLBACK_SX,
          }}
        >
          <Masti mood="wave" size={88} decorative style={{ marginBottom: 8 }} />
          <Typography component="h2" variant="h4" sx={{ mb: 0.75 }}>
            Sign in to keep solving
          </Typography>
          <Typography
            sx={{
              fontSize: "0.875rem",
              color: TEXT.secondary,
              mb: 2.5,
            }}
          >
            {remainingCount} more puzzles in this set, with a free account.
          </Typography>

          <Button
            fullWidth
            variant="contained"
            onClick={handleGoogle}
            startIcon={<Icon icon="flat-color-icons:google" width={18} />}
          >
            Continue with Google
          </Button>
          <Button
            fullWidth
            variant="text"
            onClick={() => openAuthDialog()}
            sx={{ mt: 1 }}
          >
            Sign in with email
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default PuzzleSignInGate;
