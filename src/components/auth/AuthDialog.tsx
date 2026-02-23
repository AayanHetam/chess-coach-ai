import { useState } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  Button,
  TextField,
  Typography,
  IconButton,
  Avatar,
  Divider,
  Alert,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AuthDialog({ open, onClose }: AuthDialogProps) {
  const { signInWithGoogle, updateProfile, user, isFirebaseConfigured } = useAuth();
  const [signInError, setSignInError] = useState<string | null>(null);
  // Step 2: optional username collection after sign-in
  const [step, setStep] = useState<"signin" | "usernames">("signin");
  const [chesscomUsername, setChesscomUsername] = useState("");
  const [lichessUsername, setLichessUsername] = useState("");
  const [savingUsernames, setSavingUsernames] = useState(false);

  const handleGoogleSignIn = async () => {
    setSignInError(null);
    try {
      await signInWithGoogle();
      // After sign-in succeeds, show username collection step
      setStep("usernames");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sign-in failed. Please try again.";
      setSignInError(msg);
    }
  };

  const handleSaveUsernames = async () => {
    setSavingUsernames(true);
    try {
      const updates: { chesscomUsername?: string; lichessUsername?: string } = {};
      if (chesscomUsername.trim()) updates.chesscomUsername = chesscomUsername.trim();
      if (lichessUsername.trim()) updates.lichessUsername = lichessUsername.trim();
      if (Object.keys(updates).length > 0) {
        await updateProfile(updates);
      }
    } catch (error) {
      console.error("Failed to save usernames:", error);
    } finally {
      setSavingUsernames(false);
      handleClose();
    }
  };

  const handleClose = () => {
    setStep("signin");
    setChesscomUsername("");
    setLichessUsername("");
    setSignInError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: "hidden",
        },
      }}
    >
      {/* Header gradient */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
          py: step === "usernames" ? 3 : 4,
          px: 3,
          textAlign: "center",
          position: "relative",
        }}
      >
        <IconButton
          onClick={handleClose}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: "rgba(255,255,255,0.7)",
            "&:hover": { color: "#fff" },
          }}
        >
          <Icon icon="mdi:close" />
        </IconButton>

        {step === "signin" ? (
          <>
            <Avatar
              sx={{
                width: 64,
                height: 64,
                mx: "auto",
                mb: 2,
                backgroundColor: "rgba(255,255,255,0.2)",
                backdropFilter: "blur(10px)",
              }}
            >
              <img
                src="/android-chrome-192x192.png"
                width={40}
                height={40}
                alt="Chess Coach AI"
                style={{ borderRadius: 8 }}
              />
            </Avatar>
            <Typography
              variant="h5"
              sx={{ fontWeight: 800, color: "#fff", mb: 0.5 }}
            >
              Welcome to Chess Coach AI
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "rgba(255,255,255,0.85)" }}
            >
              Sign in to sync your games across devices
            </Typography>
          </>
        ) : (
          <>
            <Avatar
              src={user?.photoURL || undefined}
              sx={{
                width: 56,
                height: 56,
                mx: "auto",
                mb: 1.5,
                bgcolor: "rgba(255,255,255,0.2)",
              }}
            >
              {user?.displayName?.[0] || "U"}
            </Avatar>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, color: "#fff", mb: 0.25 }}
            >
              Welcome, {user?.displayName?.split(" ")[0] || "Chess Player"}!
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "rgba(255,255,255,0.85)" }}
            >
              Link your chess accounts for personalized coaching
            </Typography>
          </>
        )}
      </Box>

      <DialogContent sx={{ py: 3, px: 3 }}>
        {step === "signin" ? (
          !isFirebaseConfigured ? (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <Icon
                icon="mdi:alert-circle-outline"
                width={40}
                color="#FF6B35"
              />
              <Typography
                variant="body2"
                sx={{ mt: 2, color: "#666" }}
              >
                Authentication is not configured yet. Please set up Firebase
                environment variables to enable sign-in.
              </Typography>
            </Box>
          ) : (
            <>
              {/* Benefits list */}
              <Box sx={{ mb: 3 }}>
                {[
                  {
                    icon: "mdi:cloud-sync-outline",
                    text: "Sync games across all your devices",
                  },
                  {
                    icon: "mdi:history",
                    text: "Persistent game history & analysis",
                  },
                  {
                    icon: "mdi:chart-line",
                    text: "Track your improvement over time",
                  },
                ].map((item) => (
                  <Box
                    key={item.text}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 1,
                    }}
                  >
                    <Icon
                      icon={item.icon}
                      width={20}
                      color="#FF6B35"
                    />
                    <Typography variant="body2" sx={{ color: "#555" }}>
                      {item.text}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Divider sx={{ mb: 3 }} />

              {/* Google sign-in button */}
              <Button
                fullWidth
                variant="outlined"
                size="large"
                onClick={handleGoogleSignIn}
                startIcon={<Icon icon="flat-color-icons:google" width={22} />}
                sx={{
                  py: 1.5,
                  borderRadius: 3,
                  textTransform: "none",
                  fontSize: "1rem",
                  fontWeight: 600,
                  borderColor: "#ddd",
                  color: "#333",
                  "&:hover": {
                    borderColor: "#FF6B35",
                    backgroundColor: "rgba(255,107,53,0.04)",
                  },
                }}
              >
                Continue with Google
              </Button>

              {signInError && (
                <Alert severity="warning" sx={{ mt: 2, fontSize: "0.8rem" }}>
                  {signInError}
                </Alert>
              )}

              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  textAlign: "center",
                  mt: 2,
                  color: "#999",
                }}
              >
                Your data is encrypted and never shared with third parties.
              </Typography>
            </>
          )
        ) : (
          /* Step 2: Optional username collection */
          <>
            <Typography variant="body2" sx={{ mb: 2.5, color: "#666" }}>
              Optionally link your chess accounts so our AI coach can assess your
              skill level and import your games. You can always add these later in
              Profile Settings.
            </Typography>

            {/* Chess.com */}
            <Box sx={{ mb: 2.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                <img
                  src="https://www.chess.com/favicon.ico"
                  width={18}
                  height={18}
                  alt="Chess.com"
                />
                <Typography variant="body2" sx={{ fontWeight: 600, color: "#333" }}>
                  Chess.com Username
                </Typography>
                <Typography variant="caption" sx={{ color: "#aaa" }}>
                  (optional)
                </Typography>
              </Box>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g., magnuscarlsen"
                value={chesscomUsername}
                onChange={(e) => setChesscomUsername(e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>

            {/* Lichess */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                <img
                  src="https://lichess.org/favicon.ico"
                  width={18}
                  height={18}
                  alt="Lichess"
                />
                <Typography variant="body2" sx={{ fontWeight: 600, color: "#333" }}>
                  Lichess Username
                </Typography>
                <Typography variant="caption" sx={{ color: "#aaa" }}>
                  (optional)
                </Typography>
              </Box>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g., drnykterstein"
                value={lichessUsername}
                onChange={(e) => setLichessUsername(e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>

            <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
              <Button
                onClick={handleClose}
                variant="text"
                sx={{ textTransform: "none", fontWeight: 600, color: "#888" }}
              >
                Skip for now
              </Button>
              <Button
                onClick={handleSaveUsernames}
                variant="contained"
                disabled={savingUsernames}
                sx={{
                  px: 3,
                  borderRadius: 2.5,
                  fontWeight: 700,
                  textTransform: "none",
                  background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                  },
                }}
              >
                {savingUsernames ? "Saving..." : "Save & Continue"}
              </Button>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
