import React, { useState, useEffect } from "react";
import { Box, Tooltip, CircularProgress } from "@mui/material";
import { CheckCircle, Cancel, CloudOff } from "@mui/icons-material";

interface MaiaStatus {
  lc0Available: boolean;
  maiaOptimal: boolean;
  maiaServiceConfigured?: boolean;
  maiaServiceReachable?: boolean;
  maiaModelLoaded?: boolean;
  model?: string;
  message?: string;
}

export const MaiaStatusIndicator: React.FC<{ size?: "small" | "medium" }> = ({
  size = "small",
}) => {
  const [status, setStatus] = useState<MaiaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch("/api/maia-status");
        const data = await response.json();
        setStatus(data);
      } catch (error) {
        console.error("Failed to check MAIA status:", error);
        setStatus({ lc0Available: false, maiaOptimal: false });
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
    // Refresh status every 60 seconds
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress size={size === "small" ? 16 : 20} />
      </Box>
    );
  }

  const isOptimal = status?.maiaOptimal ?? status?.lc0Available ?? false;
  const isConfigured = status?.maiaServiceConfigured ?? false;
  const iconSize = size === "small" ? 18 : 24;

  const tooltipText = isOptimal
    ? "Maia-2 is running and ready for human-like move predictions"
    : !isConfigured
      ? "Maia-2 service not configured. Set MAIA_API_URL."
      : status?.message || "Maia-2 service unavailable";

  return (
    <Tooltip title={tooltipText} arrow>
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: isOptimal ? "#EC4899" : isConfigured ? "#FFA726" : "#9E9E9E",
          transition: "color 0.2s ease",
          "&:hover": {
            opacity: 0.8,
            transform: "scale(1.1)",
          },
        }}
      >
        {isOptimal ? (
          <CheckCircle sx={{ fontSize: iconSize }} />
        ) : !isConfigured ? (
          <CloudOff sx={{ fontSize: iconSize }} />
        ) : (
          <Cancel sx={{ fontSize: iconSize }} />
        )}
      </Box>
    </Tooltip>
  );
};

