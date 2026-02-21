import {
  Dialog,
  DialogContent,
  DialogTitle,
  Box,
  Button,
  Typography,
  IconButton,
  Avatar,
  Divider,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AuthDialog({ open, onClose }: AuthDialogProps) {
  const { signInWithGoogle, isFirebaseConfigured } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      onClose();
    } catch (error) {
      console.error("Sign-in failed:", error);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
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
          py: 4,
          px: 3,
          textAlign: "center",
          position: "relative",
        }}
      >
        <IconButton
          onClick={onClose}
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
      </Box>

      <DialogContent sx={{ py: 4, px: 3 }}>
        {!isFirebaseConfigured ? (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
