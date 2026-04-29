import { useState, FormEvent } from "react";
import { useRouter } from "next/router";
import {
  Alert,
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { PageTitle } from "@/components/pageTitle";

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Reset failed.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/"), 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token && !done) {
    return (
      <>
        <PageTitle title="Reset password" />
        <Box sx={{ display: "flex", justifyContent: "center", py: 8, px: 2 }}>
          <Paper sx={{ p: 4, maxWidth: 440, width: "100%", borderRadius: 4 }}>
            <Alert severity="error">
              No reset token in the URL. Open the link from your reset email.
            </Alert>
          </Paper>
        </Box>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Reset password" />
      <Box sx={{ display: "flex", justifyContent: "center", py: 8, px: 2 }}>
        <Paper
          sx={{
            p: 0,
            maxWidth: 440,
            width: "100%",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              py: 3,
              px: 3,
              textAlign: "center",
            }}
          >
            <Icon icon="mdi:lock-reset" width={40} color="#fff" />
            <Typography variant="h6" sx={{ color: "#fff", fontWeight: 700, mt: 1 }}>
              Choose a new password
            </Typography>
          </Box>

          <Box component="form" onSubmit={handleSubmit} sx={{ p: 3 }}>
            {done ? (
              <Alert severity="success">
                Password updated. Redirecting you to the app…
              </Alert>
            ) : (
              <>
                <TextField
                  fullWidth
                  type="password"
                  label="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  sx={{ mb: 2 }}
                  required
                />
                <TextField
                  fullWidth
                  type="password"
                  label="Confirm password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  sx={{ mb: 2 }}
                  required
                />

                {error && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                  </Alert>
                )}

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={submitting}
                  sx={{
                    py: 1.5,
                    borderRadius: 2.5,
                    fontWeight: 700,
                    textTransform: "none",
                    background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                    "&:hover": {
                      background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                    },
                  }}
                >
                  {submitting ? "Resetting…" : "Reset password"}
                </Button>

                <Typography
                  variant="caption"
                  sx={{ display: "block", mt: 2, color: "#999", textAlign: "center" }}
                >
                  At least 10 characters, with a number or symbol.
                </Typography>
              </>
            )}
          </Box>
        </Paper>
      </Box>
    </>
  );
}
