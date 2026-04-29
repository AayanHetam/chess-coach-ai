import { useState, FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  Button,
  TextField,
  Typography,
  IconButton,
  Avatar,
  Divider,
  Alert,
  Tabs,
  Tab,
  Link as MuiLink,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "signin" | "signup" | "forgot";
type Step = "auth" | "usernames";

export default function AuthDialog({ open, onClose }: AuthDialogProps) {
  const { signInWithGoogle, signInWithEmail, signUp, forgotPassword, updateProfile, user } =
    useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<Step>("auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [chesscomUsername, setChesscomUsername] = useState("");
  const [lichessUsername, setLichessUsername] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reset = () => {
    setMode("signin");
    setStep("auth");
    setEmail("");
    setPassword("");
    setDisplayName("");
    setChesscomUsername("");
    setLichessUsername("");
    setError(null);
    setInfo(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        handleClose();
      } else if (mode === "signup") {
        await signUp({
          email,
          password,
          displayName: displayName.trim() || undefined,
        });
        setStep("usernames");
      } else {
        await forgotPassword(email);
        setInfo(
          "If an account exists for that email, a reset link is on its way. Check your inbox."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  };

  const handleSaveUsernames = async () => {
    setSubmitting(true);
    try {
      const updates: { chesscomUsername?: string; lichessUsername?: string } = {};
      if (chesscomUsername.trim()) updates.chesscomUsername = chesscomUsername.trim();
      if (lichessUsername.trim()) updates.lichessUsername = lichessUsername.trim();
      if (Object.keys(updates).length > 0) {
        await updateProfile(updates);
      }
    } catch (err) {
      console.error("Failed to save usernames:", err);
    } finally {
      setSubmitting(false);
      handleClose();
    }
  };

  const headerTitle =
    step === "usernames"
      ? `Welcome, ${user?.displayName?.split(" ")[0] || "Chess Player"}!`
      : mode === "signup"
      ? "Create your account"
      : mode === "forgot"
      ? "Reset your password"
      : "Welcome back";

  const headerSubtitle =
    step === "usernames"
      ? "Link your chess accounts for personalized coaching"
      : mode === "signup"
      ? "Sign up to sync your games across devices"
      : mode === "forgot"
      ? "We'll email you a link to choose a new password"
      : "Sign in to continue";

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 4, overflow: "hidden" } }}
    >
      <Box
        sx={{
          background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
          py: step === "usernames" ? 3 : 4,
          px: 3,
          textAlign: "center",
          position: "relative",
        }}
      >
        <IconButton
          onClick={handleClose}
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
          src={step === "usernames" ? user?.photoURL || undefined : undefined}
          sx={{
            width: step === "usernames" ? 56 : 64,
            height: step === "usernames" ? 56 : 64,
            mx: "auto",
            mb: step === "usernames" ? 1.5 : 2,
            backgroundColor: "rgba(255,255,255,0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          {step === "usernames" ? (
            user?.displayName?.[0] || "U"
          ) : (
            <img
              src="/android-chrome-192x192.png"
              width={40}
              height={40}
              alt="Chess Coach AI"
              style={{ borderRadius: 8 }}
            />
          )}
        </Avatar>
        <Typography variant="h6" sx={{ fontWeight: 800, color: "#fff", mb: 0.5 }}>
          {headerTitle}
        </Typography>
        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.85)" }}>
          {headerSubtitle}
        </Typography>
      </Box>

      <DialogContent sx={{ py: 3, px: 3 }}>
        {step === "auth" ? (
          <>
            {mode !== "forgot" && (
              <Tabs
                value={mode}
                onChange={(_e, v: Mode) => {
                  setMode(v);
                  setError(null);
                  setInfo(null);
                }}
                variant="fullWidth"
                sx={{ mb: 3 }}
              >
                <Tab label="Sign In" value="signin" sx={{ textTransform: "none", fontWeight: 600 }} />
                <Tab label="Sign Up" value="signup" sx={{ textTransform: "none", fontWeight: 600 }} />
              </Tabs>
            )}

            <Box component="form" onSubmit={handleEmailSubmit}>
              <TextField
                fullWidth
                size="small"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                sx={{ mb: 2 }}
              />

              {mode !== "forgot" && (
                <TextField
                  fullWidth
                  size="small"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  sx={{ mb: mode === "signup" ? 2 : 1 }}
                  helperText={mode === "signup" ? "At least 10 characters with a number or symbol." : undefined}
                />
              )}

              {mode === "signup" && (
                <TextField
                  fullWidth
                  size="small"
                  label="Display name (optional)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  sx={{ mb: 2 }}
                />
              )}

              {mode === "signin" && (
                <Box sx={{ textAlign: "right", mb: 2 }}>
                  <MuiLink
                    component="button"
                    type="button"
                    underline="hover"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                      setInfo(null);
                    }}
                    sx={{ fontSize: "0.85rem", color: "#FF6B35" }}
                  >
                    Forgot password?
                  </MuiLink>
                </Box>
              )}

              {error && (
                <Alert severity="error" sx={{ mb: 2, fontSize: "0.85rem" }}>
                  {error}
                </Alert>
              )}
              {info && (
                <Alert severity="success" sx={{ mb: 2, fontSize: "0.85rem" }}>
                  {info}
                </Alert>
              )}

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={submitting}
                sx={{
                  py: 1.25,
                  borderRadius: 2.5,
                  fontWeight: 700,
                  textTransform: "none",
                  background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                  },
                }}
              >
                {submitting
                  ? "Working…"
                  : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
              </Button>

              {mode === "forgot" && (
                <Button
                  fullWidth
                  variant="text"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setInfo(null);
                  }}
                  sx={{ mt: 1, textTransform: "none", fontWeight: 500, color: "#666" }}
                >
                  ← Back to sign in
                </Button>
              )}
            </Box>

            {mode !== "forgot" && (
              <>
                <Divider sx={{ my: 2.5 }}>
                  <Typography variant="caption" sx={{ color: "#999" }}>
                    or
                  </Typography>
                </Divider>

                <Button
                  fullWidth
                  variant="outlined"
                  onClick={handleGoogle}
                  startIcon={<Icon icon="flat-color-icons:google" width={20} />}
                  sx={{
                    py: 1.25,
                    borderRadius: 2.5,
                    textTransform: "none",
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
              </>
            )}

            <Typography
              variant="caption"
              sx={{ display: "block", textAlign: "center", mt: 2, color: "#999" }}
            >
              Your data is encrypted and never shared with third parties.
            </Typography>
          </>
        ) : (
          /* Step 2: optional username collection (post-signup) */
          <>
            <Typography variant="body2" sx={{ mb: 2.5, color: "#666" }}>
              Optionally link your chess accounts so our AI coach can assess your skill
              level and import your games. You can always add these later in Profile
              Settings.
            </Typography>

            <Box sx={{ mb: 2.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                <img
                  src="https://www.chess.com/favicon.ico"
                  width={18}
                  height={18}
                  alt="Chess.com"
                />
                <Typography variant="body2" sx={{ fontWeight: 600, color: "#333" }}>
                  Chess.com Username
                </Typography>
                <Typography variant="caption" sx={{ color: "#aaa" }}>
                  (optional)
                </Typography>
              </Box>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g., magnuscarlsen"
                value={chesscomUsername}
                onChange={(e) => setChesscomUsername(e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>

            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                <img
                  src="https://lichess.org/favicon.ico"
                  width={18}
                  height={18}
                  alt="Lichess"
                />
                <Typography variant="body2" sx={{ fontWeight: 600, color: "#333" }}>
                  Lichess Username
                </Typography>
                <Typography variant="caption" sx={{ color: "#aaa" }}>
                  (optional)
                </Typography>
              </Box>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g., drnykterstein"
                value={lichessUsername}
                onChange={(e) => setLichessUsername(e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>

            <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
              <Button
                onClick={handleClose}
                variant="text"
                sx={{ textTransform: "none", fontWeight: 600, color: "#888" }}
              >
                Skip for now
              </Button>
              <Button
                onClick={handleSaveUsernames}
                variant="contained"
                disabled={submitting}
                sx={{
                  px: 3,
                  borderRadius: 2.5,
                  fontWeight: 700,
                  textTransform: "none",
                  background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                  },
                }}
              >
                {submitting ? "Saving..." : "Save & Continue"}
              </Button>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
