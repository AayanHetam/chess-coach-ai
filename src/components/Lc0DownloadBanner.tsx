import React, { useState, useEffect } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Collapse,
  IconButton,
  Typography,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface MaiaStatus {
  lc0Available: boolean;
  maiaOptimal: boolean;
  maiaServiceConfigured?: boolean;
  maiaServiceReachable?: boolean;
  maiaModelLoaded?: boolean;
  model?: string;
  message?: string;
}

export const Lc0DownloadBanner: React.FC = () => {
  const theme = useTheme();
  const [status, setStatus] = useState<MaiaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useLocalStorage(
    "maia-banner-dismissed",
    false
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch("/api/maia-status");
        const data = await response.json();
        setStatus(data);
        // Show banner only if Maia is NOT optimal and not dismissed
        setOpen(!data.maiaOptimal && !data.lc0Available && !dismissed);
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

  if (loading || !status || status.maiaOptimal || status.lc0Available || dismissed) {
    return null;
  }

  const isConfigured = status.maiaServiceConfigured;

  return (
    <Collapse in={open}>
      <Alert
          severity={isConfigured ? "warning" : "info"}
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
          }}
        >
          <AlertTitle sx={{ fontWeight: 600, mb: 1 }}>
            {isConfigured
              ? "Maia-2 Service Unavailable"
              : "Maia-2 Not Configured"}
          </AlertTitle>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {isConfigured
              ? "The Maia-2 prediction service is configured but currently unreachable. Human-like move predictions are temporarily unavailable."
              : "Maia-2 provides human-like move predictions trained on millions of games. The service needs to be deployed and configured to enable full functionality."}
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: "block", mt: 1, color: "text.secondary" }}
          >
            {status.message || "Set MAIA_API_URL environment variable to connect to the Maia-2 microservice."}
          </Typography>
        </Alert>
    </Collapse>
  );
};

