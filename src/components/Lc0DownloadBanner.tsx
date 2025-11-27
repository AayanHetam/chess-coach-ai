import React, { useState, useEffect } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Collapse,
  IconButton,
  Link,
  Typography,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface MaiaStatus {
  lc0Available: boolean;
  maiaOptimal: boolean;
  message: string;
  downloadLinks: {
    windows: string;
    macos: string;
    linux: string;
    homebrew: string;
    documentation: string;
  };
}

export const Lc0DownloadBanner: React.FC = () => {
  const theme = useTheme();
  const [status, setStatus] = useState<MaiaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useLocalStorage(
    "lc0-banner-dismissed",
    false
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch("/api/maia-status");
        const data = await response.json();
        setStatus(data);
        // Only show banner if Lc0 is not available and not dismissed
        setOpen(!data.lc0Available && !dismissed);
      } catch (error) {
        console.error("Failed to check MAIA status:", error);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    setOpen(false);
  };

  const getDownloadLink = () => {
    if (!status) return status?.downloadLinks.documentation || "#";
    
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("win")) {
      return status.downloadLinks.windows;
    } else if (userAgent.includes("mac")) {
      return status.downloadLinks.macos;
    } else {
      return status.downloadLinks.linux;
    }
  };

  const getPlatformName = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("win")) return "Windows";
    if (userAgent.includes("mac")) return "macOS";
    if (userAgent.includes("linux")) return "Linux";
    return "your platform";
  };

  if (loading || !status || status.lc0Available || dismissed) {
    return null;
  }

  return (
    <Collapse in={open}>
      <Alert
          severity="info"
          icon={<InfoIcon />}
          action={
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={handleDismiss}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          }
          sx={{
            borderRadius: 2,
            boxShadow: theme.shadows[2],
            "& .MuiAlert-icon": {
              color: theme.palette.info.main,
            },
          }}
        >
          <AlertTitle sx={{ fontWeight: 600, mb: 1 }}>
            🚀 Get the Best MAIA Experience
          </AlertTitle>
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>Lc0</strong> is not installed on the server. Install Lc0 to
            unlock the full power of MAIA chess engine. MAIA provides
            human-like move predictions trained on millions of games, but it
            needs Lc0 to run optimally.{" "}
            <strong>
              (Note: Lc0 must be installed on the server, not your device)
            </strong>
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<DownloadIcon />}
              href={getDownloadLink()}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: "none" }}
            >
              Download for {getPlatformName()}
            </Button>
            <Button
              variant="outlined"
              size="small"
              href={status.downloadLinks.documentation}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: "none" }}
            >
              Installation Guide
            </Button>
            {navigator.userAgent.toLowerCase().includes("mac") && (
              <Button
                variant="outlined"
                size="small"
                href="https://brew.sh"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ textTransform: "none" }}
              >
                Install via Homebrew
              </Button>
            )}
          </Box>
          <Typography
            variant="caption"
            sx={{ display: "block", mt: 1.5, color: "text.secondary" }}
          >
            💡 <strong>Note:</strong> MAIA will still work without Lc0 using a
            fallback mode, but Lc0 provides the most accurate human-like
            predictions. If you're a server administrator, install Lc0 on the
            server to enable optimal MAIA for all users.
          </Typography>
        </Alert>
    </Collapse>
  );
};

