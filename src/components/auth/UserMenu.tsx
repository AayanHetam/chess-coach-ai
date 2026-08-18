import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthDialog } from "@/contexts/AuthDialogContext";
import ProfileDialog from "./ProfileDialog";

export default function UserMenu() {
  const { user, profile, loading, signOut, isFirebaseConfigured } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { openAuthDialog } = useAuthDialog();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  if (!isFirebaseConfigured) return null;

  if (loading) {
    return <Skeleton variant="circular" width={34} height={34} />;
  }

  if (!user) {
    return (
      <Button
        variant="text"
        size="small"
        onClick={() => openAuthDialog()}
        startIcon={<Icon icon="mdi:account-circle-outline" width={20} />}
        sx={{
          textTransform: "none",
          fontWeight: 600,
          fontSize: "0.85rem",
          color: "text.primary",
          "&:hover": { color: "primary.main" },
        }}
      >
        Sign In
      </Button>
    );
  }

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    handleMenuClose();
    await signOut();
  };

  return (
    <>
      <Tooltip title={user.displayName || user.email || "Account"}>
        <IconButton onClick={handleMenuOpen} sx={{ p: 0.5 }}>
          <Avatar
            src={user.photoURL || undefined}
            alt={user.displayName || "User"}
            sx={{
              width: 34,
              height: 34,
              fontSize: "0.9rem",
              fontWeight: 700,
              bgcolor: "primary.main",
            }}
          >
            {user.displayName?.[0] || user.email?.[0]?.toUpperCase() || "U"}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        PaperProps={{
          sx: {
            borderRadius: 3,
            minWidth: 220,
            mt: 1,
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
          },
        }}
      >
        {/* User info header */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid #f0f0f0" }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: "#333" }}>
            {user.displayName || "Chess Player"}
          </Typography>
          <Typography variant="caption" sx={{ color: "#888" }}>
            {user.email}
          </Typography>

          {/* Linked accounts */}
          {(profile?.chesscomUsername || profile?.lichessUsername) && (
            <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
              {profile.chesscomUsername && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    bgcolor: "#f5f5f5",
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                  }}
                >
                  <img
                    src="https://www.chess.com/favicon.ico"
                    width={12}
                    height={12}
                    alt="Chess.com"
                  />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: "0.65rem", fontWeight: 600 }}
                  >
                    {profile.chesscomUsername}
                  </Typography>
                </Box>
              )}
              {profile.lichessUsername && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    bgcolor: "#f5f5f5",
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                  }}
                >
                  <img
                    src="https://lichess.org/favicon.ico"
                    width={12}
                    height={12}
                    alt="Lichess"
                  />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: "0.65rem", fontWeight: 600 }}
                  >
                    {profile.lichessUsername}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>

        <MenuItem
          onClick={() => {
            handleMenuClose();
            setProfileDialogOpen(true);
          }}
          sx={{ py: 1.5 }}
        >
          <ListItemIcon>
            <Icon icon="mdi:account-cog-outline" width={20} />
          </ListItemIcon>
          <ListItemText>Profile Settings</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={handleMenuClose}
          component="a"
          href="/database"
          sx={{ py: 1.5 }}
        >
          <ListItemIcon>
            <Icon icon="mdi:database-outline" width={20} />
          </ListItemIcon>
          <ListItemText>My Games</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleSignOut} sx={{ py: 1.5, color: "error.main" }}>
          <ListItemIcon sx={{ color: "error.main" }}>
            <Icon icon="mdi:logout" width={20} />
          </ListItemIcon>
          <ListItemText>Sign Out</ListItemText>
        </MenuItem>
      </Menu>

      <ProfileDialog
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
      />
    </>
  );
}
