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
    maiaModels: string;
    maiaWeights: string;
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
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

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

  const handleInstall = async (method: "homebrew" | "download") => {
    setInstalling(true);
    setInstallMessage("Installing Lc0... This may take a few minutes.");

    try {
      const response = await fetch("/api/install-lc0", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });

      const data = await response.json();

      if (data.success) {
        setInstallMessage(
          `✅ ${data.message}${data.output ? "\n\n" + data.output : ""}`
        );
        // Refresh status after a delay
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        let errorMsg = `❌ ${data.message}`;
        if (data.isServerless) {
          errorMsg +=
            "\n\nFor Vercel/serverless deployments:\n" +
            "1. Add Lc0 to your Dockerfile if using Docker\n" +
            "2. Or include Lc0 binary in your build process\n" +
            "3. Set LC0_PATH environment variable in Vercel settings\n" +
            "See MAIA_SETUP.md for detailed instructions.";
        }
        if (data.output) {
          errorMsg += "\n\n" + data.output;
        }
        setInstallMessage(errorMsg);
      }
    } catch (error) {
      setInstallMessage(
        `❌ Installation error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setInstalling(false);
    }
  };

  const getDownloadLink = () => {
    if (!status?.downloadLinks) return "#";
    
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("win")) {
      return status.downloadLinks.windows;
    } else if (userAgent.includes("mac")) {
      return status.downloadLinks.macos;
    } else {
      return status.downloadLinks.linux;
    }
  };

  const getMaiaModelsLink = () => {
    return status?.downloadLinks?.maiaModels || "https://github.com/CSSLab/maia-chess";
  };

  const getMaiaWeightsLink = () => {
    return status?.downloadLinks?.maiaWeights || "https://github.com/CSSLab/maia-chess/releases";
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
            needs Lc0 to run optimally.
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: "warning.main" }}>
            <strong>⚠️ Important:</strong> Lc0 must be installed on the server
            (where your app is hosted), not on your device. For Vercel
            deployments, Lc0 needs to be included in your Docker image or build
            process.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
            {navigator.userAgent.toLowerCase().includes("mac") && (
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={() => handleInstall("homebrew")}
                disabled={installing}
                sx={{ textTransform: "none" }}
              >
                {installing ? "Installing..." : "Auto-Install via Homebrew"}
              </Button>
            )}
            <Button
              variant="contained"
              color="secondary"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => handleInstall("download")}
              disabled={installing}
              sx={{ textTransform: "none" }}
            >
              {installing ? "Downloading..." : "Auto-Download Lc0"}
            </Button>
            <Button
              variant="outlined"
              size="small"
              href={getDownloadLink()}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: "none" }}
            >
              Manual Download
            </Button>
            <Button
              variant="outlined"
              size="small"
              href={status.downloadLinks.documentation}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: "none" }}
            >
              Documentation
            </Button>
            <Button
              variant="outlined"
              size="small"
              href={getMaiaModelsLink()}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: "none" }}
            >
              Maia Models
            </Button>
            <Button
              variant="outlined"
              size="small"
              href={getMaiaWeightsLink()}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: "none" }}
            >
              Maia Weights
            </Button>
          </Box>
          {installMessage && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                bgcolor: installMessage.includes("✅")
                  ? "success.light"
                  : "error.light",
                borderRadius: 1,
                fontSize: "0.875rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {installMessage}
            </Box>
          )}
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

