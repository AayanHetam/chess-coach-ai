import React, { Component, ErrorInfo, ReactNode } from "react";
import { Box, Button, Typography, Paper } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { logErrorToSentry } from "@/lib/sentry";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Identifies this boundary in Sentry and logs (e.g. "ai-coach", "chessboard") */
  name: string;
  /** Optional custom fallback UI. Receives reset function. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Reusable React Error Boundary.
 *
 * Catches render-time errors in its subtree and displays a recovery UI
 * instead of unmounting the entire component tree.
 *
 * Usage:
 *   <ErrorBoundary name="ai-coach">
 *     <AICoachChat />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name}]`, error, errorInfo);
    logErrorToSentry(error, {
      errorBoundary: this.props.name,
      componentStack: errorInfo.componentStack || "",
    });
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.reset,
        });
      }

      return (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            m: 1,
            textAlign: "center",
            border: "1px solid",
            borderColor: "error.light",
            borderRadius: 2,
            backgroundColor: "background.paper",
          }}
        >
          <ErrorOutlineIcon
            sx={{ fontSize: 40, color: "error.main", mb: 1 }}
          />
          <Typography variant="subtitle1" gutterBottom>
            Something went wrong
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, maxWidth: 400, mx: "auto" }}
          >
            {this.state.error.message || "An unexpected error occurred in this section."}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
            <Button
              variant="outlined"
              size="small"
              onClick={this.reset}
              sx={{ textTransform: "none" }}
            >
              Try Again
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => window.location.reload()}
              sx={{ textTransform: "none" }}
            >
              Reload Page
            </Button>
          </Box>
        </Paper>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
