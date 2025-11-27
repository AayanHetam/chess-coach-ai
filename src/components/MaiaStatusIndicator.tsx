import React, { useState, useEffect } from "react";
import { Box, Tooltip, CircularProgress } from "@mui/material";
import { CheckCircle, Cancel } from "@mui/icons-material";

interface MaiaStatus {
  lc0Available: boolean;
  maiaOptimal: boolean;
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
    // Refresh status every 30 seconds
    const interval = setInterval(checkStatus, 30000);
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

  const isOptimal = status?.lc0Available ?? false;
  const iconSize = size === "small" ? 18 : 24;

  return (
    <Tooltip
      title={
        isOptimal
          ? "MAIA is running optimally with Lc0 (Leela Chess Zero)"
          : "MAIA is using fallback mode. Install Lc0 for optimal performance."
      }
      arrow
    >
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: isOptimal ? "#EC4899" : "#9E9E9E", // Pink (#EC4899) when optimal, gray when not
          transition: "color 0.2s ease",
          "&:hover": {
            opacity: 0.8,
            transform: "scale(1.1)",
          },
        }}
      >
        {isOptimal ? (
          <CheckCircle sx={{ fontSize: iconSize }} />
        ) : (
          <Cancel sx={{ fontSize: iconSize }} />
        )}
      </Box>
    </Tooltip>
  );
};

