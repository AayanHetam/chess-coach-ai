import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  Divider,
  Avatar,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ProfileDialog({ open, onClose }: ProfileDialogProps) {
  const { user, profile, updateProfile } = useAuth();
  const [chesscomUsername, setChesscomUsername] = useState("");
  const [lichessUsername, setLichessUsername] = useState("");
  const [saving, setSaving] = useState(false);

  // Initialize form values when profile loads
  useEffect(() => {
    if (profile) {
      setChesscomUsername(profile.chesscomUsername || "");
      setLichessUsername(profile.lichessUsername || "");
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      await updateProfile({
        chesscomUsername: chesscomUsername.trim() || undefined,
        lichessUsername: lichessUsername.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error("Failed to update profile:", error);
    } finally {
      setSaving(false);
    }
  };

  if (!user || !profile) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: "hidden",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
          py: 3,
          px: 3,
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

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar
            src={user.photoURL || undefined}
            alt={user.displayName || "User"}
            sx={{
              width: 56,
              height: 56,
              bgcolor: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(10px)",
            }}
          >
            {user.displayName?.[0] || user.email?.[0]?.toUpperCase() || "U"}
          </Avatar>

          <Box>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, color: "#fff", mb: 0.5 }}
            >
              {user.displayName || "Chess Player"}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "rgba(255,255,255,0.85)" }}
            >
              {user.email}
            </Typography>
          </Box>
        </Box>
      </Box>

      <DialogContent sx={{ py: 3, px: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Chess Platform Accounts
        </Typography>

        <Typography
          variant="body2"
          sx={{ mb: 3, color: "#666" }}
        >
          Link your Chess.com and Lichess accounts to import games and sync your
          progress across platforms.
        </Typography>

        {/* Chess.com Username */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <img
              src="https://www.chess.com/favicon.ico"
              width={20}
              height={20}
              alt="Chess.com"
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Chess.com Username
            </Typography>
          </Box>
          <TextField
            fullWidth
            size="small"
            placeholder="e.g., magnuscarlsen"
            value={chesscomUsername}
            onChange={(e) => setChesscomUsername(e.target.value)}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
              },
            }}
          />
        </Box>

        {/* Lichess Username */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <img
              src="https://lichess.org/favicon.ico"
              width={20}
              height={20}
              alt="Lichess"
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Lichess Username
            </Typography>
          </Box>
          <TextField
            fullWidth
            size="small"
            placeholder="e.g., drnykterstein"
            value={lichessUsername}
            onChange={(e) => setLichessUsername(e.target.value)}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
              },
            }}
          />
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Action buttons */}
        <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
          <Button
            onClick={onClose}
            variant="text"
            sx={{
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving}
            sx={{
              px: 3,
              py: 1,
              fontSize: "0.9rem",
              fontWeight: 700,
              borderRadius: 2.5,
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              textTransform: "none",
              "&:hover": {
                background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
              },
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
