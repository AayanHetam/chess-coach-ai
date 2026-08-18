"use client";

import React, { useState, useEffect, FormEvent } from "react";

// MUI Modal calls cloneElement(child, { ref }) on its direct child.
// AnimatePresence is fragment-shaped — no DOM node for the ref to land on
// — so React warns "Invalid prop `children` supplied to ForwardRef(Modal).
// Expected an element that can hold a ref." This forwardRef'd div is a
// neutral container Modal can attach to. Same fix in LoadGameDialog.
// tabIndex -1 so MUI's focus trap has something it can actually focus. Without
// it the trap has no anchor when the focused element unmounts.
const ModalChild = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(function ModalChild({ children }, ref) {
  return (
    <div ref={ref} tabIndex={-1} style={{ outline: "none" }}>
      {children}
    </div>
  );
});
import { Box, Modal, Stack, TextField, Typography } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, ArrowLeft, AlertTriangle, Check } from "lucide-react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";
import { checkHandle, HANDLE_MAX } from "@/lib/auth/handle";
import { firstNameOf } from "@/lib/auth/displayIdentity";
import AgeGate from "@/components/consent/AgeGate";
import { isAgeGateBlocked } from "@/lib/tracking/ageGateLock";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "signin" | "signup" | "forgot";
type Step = "auth" | "usernames";

// Dark-glass redesign of the legacy AuthDialog. Same exterior API
// (open / onClose), same auth logic, completely rebuilt visuals to
// match the design OS used by /preview/* surfaces: glass-blurred
// rgba dark fill, 1px white-alpha edge, orange as accent (not fill),
// pill tabs with sliding indicator. Layout uses Modal + flex column
// + body min-height:0 so the submit button stays inside the viewport
// even on short laptop screens (the bug we just fixed in
// LoadGameDialog).
export default function AuthDialog({ open, onClose }: AuthDialogProps) {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUp,
    forgotPassword,
    updateProfile,
    user,
  } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<Step>("auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  // COPPA age gate: signup mode asks for an explicit 13+ affirmation
  // (checkbox) before the form (and its Google button) ever renders.
  // ageBlocked honors the persistent lockout set by the retired DOB gate on
  // devices where a date once resolved under-13.
  const [agePassed, setAgePassed] = useState(false);
  const [ageBlocked, setAgeBlocked] = useState(false);

  useEffect(() => {
    if (open) setAgeBlocked(isAgeGateBlocked());
  }, [open]);

  // The lockout notice replaces the panel outright (e.g. on switching to the
  // signup tab on a locked device), which unmounts whatever
  // was focused (the tab just clicked, or a form field). Focus then falls to
  // <body> — outside the modal — and stays there until MUI's focus trap
  // notices and pulls it back, measured at ~100ms. Escape pressed inside that
  // window never reaches the Modal's keydown handler, so the dialog does not
  // close and the only remaining exit is a mouse click on the backdrop.
  //
  // Moving focus to the notice ourselves closes the window and is what a
  // screen reader needs anyway: the panel is the thing that just changed, so
  // it should be what gets announced.
  const blockedNoticeRef = React.useRef<HTMLDivElement>(null);
  const showingBlockedNotice =
    open && step === "auth" && mode === "signup" && ageBlocked;

  useEffect(() => {
    if (!showingBlockedNotice) return;
    blockedNoticeRef.current?.focus();
  }, [showingBlockedNotice]);

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
    setHandle("");
    setAgePassed(false);
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
    if (mode === "signup" && !agePassed) return; // COPPA 13+ affirmation gate
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        handleClose();
      } else if (mode === "signup") {
        // Checked here as well as on the server so a bad handle costs a
        // keystroke rather than a round trip — and so the reason is specific
        // ("that one's reserved") instead of a generic 400.
        const check = checkHandle(handle);
        if (!check.ok) {
          setError(check.message ?? "Pick a different handle.");
          setSubmitting(false);
          return;
        }
        await signUp({
          email,
          password,
          handle: check.display as string,
          displayName: displayName.trim() || undefined,
          ageAffirmed: true, // only reachable after the 13+ checkbox gate
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
      // In signup mode this button only renders after the 13+ checkbox was
      // confirmed, so the affirmation rides along and the OAuth callback can
      // skip the /auth/age interstitial. From the sign-in tab, brand-new
      // accounts get the interstitial server-side instead.
      await signInWithGoogle({ ageAffirmed: mode === "signup" && agePassed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  };

  const handleSaveUsernames = async () => {
    setSubmitting(true);
    try {
      const updates: { chesscomUsername?: string; lichessUsername?: string } =
        {};
      if (chesscomUsername.trim())
        updates.chesscomUsername = chesscomUsername.trim();
      if (lichessUsername.trim())
        updates.lichessUsername = lichessUsername.trim();
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
      ? `Welcome, ${firstNameOf(user)}!`
      : mode === "signup"
        ? "Create your account"
        : mode === "forgot"
          ? "Reset your password"
          : "Welcome back";

  const headerSubtitle =
    step === "usernames"
      ? "Link your chess accounts for personalised coaching."
      : mode === "signup"
        ? "Sync your games + coaching across devices."
        : mode === "forgot"
          ? "We'll email you a link to choose a new password."
          : "Sign in to keep your games and progress.";

  // Shared input styling — applied to every TextField. Dark glass fill,
  // orange focus, white-92 text.
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      backgroundColor: "rgba(255,255,255,0.03)",
      borderRadius: "12px",
      fontSize: "0.92rem",
      color: "rgba(255,255,255,0.94)",
      "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
      "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
      "&.Mui-focused fieldset": {
        borderColor: "rgba(249,115,22,0.55)",
        borderWidth: "1px",
      },
    },
    "& .MuiInputLabel-root": {
      color: "rgba(255,255,255,0.55)",
      "&.Mui-focused": { color: "#FB923C" },
    },
    "& .MuiFormHelperText-root": {
      color: "rgba(255,255,255,0.42)",
      fontSize: "0.72rem",
    },
    "& .MuiOutlinedInput-input::placeholder": {
      color: "rgba(255,255,255,0.3)",
      opacity: 1,
    },
  } as const;

  const orangeGradient = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
  const orangeHover = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

  const submitDisabled = submitting;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeAfterTransition
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(8,9,12,0.72)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          },
        },
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        outline: "none",
      }}
    >
      <ModalChild>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{
                duration: 0.28,
                ease: [0.22, 0.61, 0.36, 1],
              }}
              // Centering is handled by the parent MUI Modal's flexbox
              // (display:flex; align/justify center). We must NOT also set
              // position:fixed + translate(-50%,-50%) here, because framer-motion
              // animates `y`/`scale` and owns the `transform` property — it would
              // clobber the -50% centering and drop the modal low-and-right,
              // pushing the bottom (Google button) off-screen.
              style={{ outline: "none" }}
            >
              <Box
                role="dialog"
                aria-modal="true"
                aria-label={headerTitle}
                sx={{
                  width: { xs: "92vw", sm: 440 },
                  maxWidth: "92vw",
                  maxHeight: "84vh",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "1.5rem",
                  background:
                    "linear-gradient(180deg, rgba(20,22,28,0.92), rgba(12,14,20,0.92))",
                  backdropFilter: "blur(20px) saturate(150%)",
                  WebkitBackdropFilter: "blur(20px) saturate(150%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow:
                    "0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.94)",
                  overflow: "hidden",
                }}
              >
                {/* Header — glass card with ember-glow Sparkles, NOT a big
                  orange fill. Orange reserved as accent per design OS. */}
                <Box
                  sx={{
                    position: "relative",
                    px: 3,
                    pt: 3,
                    pb: 2.25,
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Box
                    // A div with onClick is not reachable by Tab and does not
                    // fire on Enter/Space, so this was invisible to keyboard and
                    // assistive tech — the dialog had no accessible exit at all
                    // once Escape was swallowed (see blockedNoticeRef above).
                    component="button"
                    type="button"
                    onClick={handleClose}
                    aria-label="Close"
                    sx={{
                      position: "absolute",
                      top: 16,
                      right: 16,
                      cursor: "pointer",
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      font: "inherit",
                      width: 28,
                      height: 28,
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "rgba(255,255,255,0.55)",
                      transition: "all 180ms ease",
                      "&:hover": {
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.92)",
                      },
                    }}
                  >
                    <X size={16} />
                  </Box>

                  {/* Brand mark — small glass disc with ember-glow Sparkles */}
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: "12px",
                      background: orangeGradient,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow:
                        "0 0 24px rgba(249,115,22,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
                      mb: 1.5,
                    }}
                  >
                    <Sparkles size={20} color="#0A0A0A" />
                  </Box>

                  <Typography
                    sx={{
                      fontSize: "1.15rem",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.2,
                      color: "rgba(255,255,255,0.96)",
                    }}
                  >
                    {headerTitle}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.4,
                      fontSize: "0.82rem",
                      color: "rgba(255,255,255,0.55)",
                    }}
                  >
                    {headerSubtitle}
                  </Typography>
                </Box>

                {/* Mode tabs — pill style with sliding indicator. Only shown
                  in the auth step when not in forgot mode. */}
                {step === "auth" && mode !== "forgot" && (
                  <Box
                    sx={{
                      display: "flex",
                      gap: 0.5,
                      p: 0.5,
                      mx: 3,
                      mt: 2,
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {(
                      [
                        { id: "signin", label: "Sign in" },
                        { id: "signup", label: "Sign up" },
                      ] as { id: Mode; label: string }[]
                    ).map(({ id, label }) => {
                      const isActive = mode === id;
                      return (
                        <Box
                          key={id}
                          onClick={() => {
                            setMode(id);
                            setError(null);
                            setInfo(null);
                          }}
                          sx={{
                            position: "relative",
                            flex: 1,
                            textAlign: "center",
                            py: 0.85,
                            borderRadius: "999px",
                            cursor: "pointer",
                            fontSize: "0.86rem",
                            fontWeight: 700,
                            color: isActive
                              ? "#0A0A0A"
                              : "rgba(255,255,255,0.62)",
                            transition: "color 180ms ease",
                            "&:hover": {
                              color: isActive
                                ? "#0A0A0A"
                                : "rgba(255,255,255,0.92)",
                            },
                          }}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="authDialogTabIndicator"
                              transition={{
                                type: "spring",
                                stiffness: 420,
                                damping: 34,
                              }}
                              style={{
                                position: "absolute",
                                inset: 0,
                                borderRadius: "999px",
                                background: orangeGradient,
                                boxShadow: "0 4px 14px rgba(249,115,22,0.32)",
                              }}
                            />
                          )}
                          <Box
                            component="span"
                            sx={{ position: "relative", zIndex: 1 }}
                          >
                            {label}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {/* Scrollable body — min-height:0 + overflowY:auto so the
                  submit button stays in viewport regardless of content
                  length. Same fix as G13. */}
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    px: 3,
                    py: 2.5,
                    "&::-webkit-scrollbar": { width: 6 },
                    "&::-webkit-scrollbar-thumb": {
                      background: "rgba(249,115,22,0.2)",
                      borderRadius: "3px",
                    },
                  }}
                >
                  {step === "auth" && mode === "signup" && ageBlocked ? (
                    /* COPPA: under-13 lockout, set by the retired DOB gate and
                     still honored. No account exists and no personal data was
                     stored — the DOB never left the browser. */
                    <Box
                      ref={blockedNoticeRef}
                      // tabIndex -1: focusable programmatically (see the effect
                      // above) without adding a stop to the tab order.
                      tabIndex={-1}
                      role="alert"
                      sx={{
                        textAlign: "center",
                        py: 3,
                        px: 1,
                        outline: "none",
                      }}
                    >
                      <AlertTriangle
                        size={28}
                        color="rgba(255,255,255,0.45)"
                        style={{ marginBottom: 12 }}
                      />
                      <Typography
                        sx={{
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.92)",
                          mb: 1,
                        }}
                      >
                        We can&apos;t create an account for you right now.
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "0.8rem",
                          lineHeight: 1.5,
                          color: "rgba(255,255,255,0.55)",
                        }}
                      >
                        A parent or guardian can get in touch through the
                        contact details on our{" "}
                        <Box
                          component="a"
                          href="/privacy"
                          sx={{ color: "#FB923C", textDecoration: "none" }}
                        >
                          Privacy page
                        </Box>
                        .
                      </Typography>
                    </Box>
                  ) : step === "auth" && mode === "signup" && !agePassed ? (
                    /* COPPA: 13+ affirmation checkbox — shown before the
                     signup form (and its Google button) ever renders. */
                    <Box sx={{ py: 0.5 }}>
                      <AgeGate
                        onConfirmed={() => setAgePassed(true)}
                        slotSx={{
                          title: {
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.92)",
                          },
                          caption: {
                            color: "rgba(255,255,255,0.55)",
                            fontSize: "0.78rem",
                            lineHeight: 1.45,
                          },
                          label: {
                            "& .MuiFormControlLabel-label": {
                              fontSize: "0.85rem",
                              color: "rgba(255,255,255,0.8)",
                            },
                          },
                          checkbox: {
                            color: "rgba(255,255,255,0.4)",
                            "&.Mui-checked": { color: "#FB923C" },
                          },
                          button: {
                            background: orangeGradient,
                            color: "#0A0A0A",
                            fontWeight: 800,
                            textTransform: "none",
                            borderRadius: "12px",
                            py: 1.1,
                            boxShadow: "0 4px 14px rgba(249,115,22,0.32)",
                            "&:hover": { background: orangeHover },
                            "&.Mui-disabled": {
                              background: "rgba(255,255,255,0.08)",
                              color: "rgba(255,255,255,0.35)",
                            },
                          },
                        }}
                      />
                    </Box>
                  ) : step === "auth" ? (
                    <>
                      <Box component="form" onSubmit={handleEmailSubmit}>
                        <Stack spacing={1.75}>
                          {/* Sign-in accepts a handle OR an email, so the input
                            must NOT be type="email" there — the browser's own
                            validation would reject a handle before submit and
                            the form would simply refuse to send, with no error
                            we control. Signup and password reset still need a
                            real address, and keep the stricter type. */}
                          <TextField
                            fullWidth
                            size="small"
                            label={
                              mode === "signin" ? "Handle or email" : "Email"
                            }
                            type={mode === "signin" ? "text" : "email"}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete={
                              mode === "signin" ? "username" : "email"
                            }
                            required
                            sx={inputSx}
                          />

                          {mode !== "forgot" && (
                            <TextField
                              fullWidth
                              size="small"
                              label="Password"
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete={
                                mode === "signup"
                                  ? "new-password"
                                  : "current-password"
                              }
                              required
                              helperText={
                                mode === "signup"
                                  ? "At least 10 characters with a number or symbol."
                                  : undefined
                              }
                              sx={inputSx}
                            />
                          )}

                          {mode === "signup" && (
                            <TextField
                              fullWidth
                              size="small"
                              label="Handle"
                              value={handle}
                              onChange={(e) => setHandle(e.target.value)}
                              autoComplete="username"
                              required
                              inputProps={{ maxLength: HANDLE_MAX }}
                              helperText="How we'll address you, and how you can sign in. Other players see this — don't use your full name."
                              sx={inputSx}
                            />
                          )}

                          {mode === "signup" && (
                            <TextField
                              fullWidth
                              size="small"
                              label="Display name (optional)"
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              sx={inputSx}
                            />
                          )}

                          {mode === "signin" && (
                            <Box sx={{ textAlign: "right" }}>
                              <Box
                                component="button"
                                type="button"
                                onClick={() => {
                                  setMode("forgot");
                                  setError(null);
                                  setInfo(null);
                                }}
                                sx={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: "0.78rem",
                                  color: "#FB923C",
                                  padding: 0,
                                  "&:hover": { color: "#FDBA74" },
                                }}
                              >
                                Forgot password?
                              </Box>
                            </Box>
                          )}

                          {error && (
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 1,
                                p: 1.25,
                                borderRadius: "10px",
                                background: "rgba(239,68,68,0.08)",
                                border: "1px solid rgba(239,68,68,0.25)",
                              }}
                            >
                              <AlertTriangle
                                size={14}
                                color="#fca5a5"
                                style={{ marginTop: 2, flexShrink: 0 }}
                              />
                              <Typography
                                sx={{
                                  fontSize: "0.82rem",
                                  color: "#fca5a5",
                                  lineHeight: 1.4,
                                }}
                              >
                                {error}
                              </Typography>
                            </Box>
                          )}
                          {info && (
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 1,
                                p: 1.25,
                                borderRadius: "10px",
                                background: "rgba(34,197,94,0.08)",
                                border: "1px solid rgba(34,197,94,0.25)",
                              }}
                            >
                              <Check
                                size={14}
                                color="#86efac"
                                style={{ marginTop: 2, flexShrink: 0 }}
                              />
                              <Typography
                                sx={{
                                  fontSize: "0.82rem",
                                  color: "#86efac",
                                  lineHeight: 1.4,
                                }}
                              >
                                {info}
                              </Typography>
                            </Box>
                          )}

                          <Box
                            component="button"
                            type="submit"
                            disabled={submitDisabled}
                            sx={{
                              width: "100%",
                              cursor: submitDisabled
                                ? "not-allowed"
                                : "pointer",
                              opacity: submitDisabled ? 0.7 : 1,
                              border: "none",
                              outline: "none",
                              py: 1.25,
                              borderRadius: "12px",
                              fontWeight: 700,
                              fontSize: "0.92rem",
                              letterSpacing: "0.01em",
                              color: "#0A0A0A",
                              background: orangeGradient,
                              boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
                              transition: "all 180ms ease",
                              "&:hover": submitDisabled
                                ? {}
                                : {
                                    background: orangeHover,
                                    transform: "translateY(-1px)",
                                    boxShadow:
                                      "0 8px 22px rgba(249,115,22,0.42)",
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
                          </Box>

                          {mode === "forgot" && (
                            <Box
                              component="button"
                              type="button"
                              onClick={() => {
                                setMode("signin");
                                setError(null);
                                setInfo(null);
                              }}
                              sx={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 0.5,
                                py: 0.75,
                                fontSize: "0.84rem",
                                color: "rgba(255,255,255,0.62)",
                                "&:hover": { color: "rgba(255,255,255,0.92)" },
                              }}
                            >
                              <ArrowLeft size={14} />
                              Back to sign in
                            </Box>
                          )}
                        </Stack>
                      </Box>

                      {mode !== "forgot" && (
                        <>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1.5,
                              my: 2.5,
                            }}
                          >
                            <Box
                              sx={{
                                flex: 1,
                                height: 1,
                                background: "rgba(255,255,255,0.08)",
                              }}
                            />
                            <Typography
                              sx={{
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                                color: "rgba(255,255,255,0.4)",
                              }}
                            >
                              or
                            </Typography>
                            <Box
                              sx={{
                                flex: 1,
                                height: 1,
                                background: "rgba(255,255,255,0.08)",
                              }}
                            />
                          </Box>

                          <Box
                            component="button"
                            type="button"
                            onClick={handleGoogle}
                            sx={{
                              width: "100%",
                              cursor: "pointer",
                              border: "1px solid rgba(255,255,255,0.1)",
                              outline: "none",
                              py: 1.1,
                              borderRadius: "12px",
                              fontWeight: 700,
                              fontSize: "0.88rem",
                              color: "rgba(255,255,255,0.92)",
                              background: "rgba(255,255,255,0.04)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 1,
                              transition: "all 180ms ease",
                              "&:hover": {
                                background: "rgba(249,115,22,0.08)",
                                borderColor: "rgba(249,115,22,0.4)",
                              },
                            }}
                          >
                            <Icon icon="flat-color-icons:google" width={18} />
                            Continue with Google
                          </Box>
                        </>
                      )}

                      <Typography
                        sx={{
                          display: "block",
                          textAlign: "center",
                          mt: 2.5,
                          fontSize: "0.7rem",
                          color: "rgba(255,255,255,0.4)",
                          lineHeight: 1.45,
                        }}
                      >
                        Your data is encrypted and never shared with third
                        parties.
                      </Typography>
                    </>
                  ) : (
                    /* Step 2: optional username collection (post-signup) */
                    <>
                      <Typography
                        sx={{
                          mb: 2.5,
                          fontSize: "0.86rem",
                          color: "rgba(255,255,255,0.7)",
                          lineHeight: 1.5,
                        }}
                      >
                        Link your chess accounts so the coach can ground
                        analysis in your actual play history. You can also add
                        these later in Profile Settings.
                      </Typography>

                      <Stack spacing={2}>
                        <Box>
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={0.85}
                            sx={{ mb: 0.7 }}
                          >
                            <img
                              src="https://www.chess.com/favicon.ico"
                              width={16}
                              height={16}
                              alt="Chess.com"
                            />
                            <Typography
                              sx={{
                                fontSize: "0.82rem",
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.88)",
                              }}
                            >
                              Chess.com username
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.72rem",
                                color: "rgba(255,255,255,0.4)",
                              }}
                            >
                              (optional)
                            </Typography>
                          </Stack>
                          <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g., magnuscarlsen"
                            value={chesscomUsername}
                            onChange={(e) =>
                              setChesscomUsername(e.target.value)
                            }
                            sx={inputSx}
                          />
                        </Box>

                        <Box>
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={0.85}
                            sx={{ mb: 0.7 }}
                          >
                            <img
                              src="https://lichess.org/favicon.ico"
                              width={16}
                              height={16}
                              alt="Lichess"
                            />
                            <Typography
                              sx={{
                                fontSize: "0.82rem",
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.88)",
                              }}
                            >
                              Lichess username
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.72rem",
                                color: "rgba(255,255,255,0.4)",
                              }}
                            >
                              (optional)
                            </Typography>
                          </Stack>
                          <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g., drnykterstein"
                            value={lichessUsername}
                            onChange={(e) => setLichessUsername(e.target.value)}
                            sx={inputSx}
                          />
                        </Box>
                      </Stack>

                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          justifyContent: "flex-end",
                          mt: 3,
                        }}
                      >
                        <Box
                          component="button"
                          type="button"
                          onClick={handleClose}
                          sx={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.84rem",
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.55)",
                            px: 2,
                            py: 1,
                            borderRadius: "10px",
                            transition: "all 180ms ease",
                            "&:hover": {
                              color: "rgba(255,255,255,0.92)",
                              background: "rgba(255,255,255,0.04)",
                            },
                          }}
                        >
                          Skip for now
                        </Box>
                        <Box
                          component="button"
                          type="button"
                          onClick={handleSaveUsernames}
                          disabled={submitting}
                          sx={{
                            cursor: submitting ? "not-allowed" : "pointer",
                            opacity: submitting ? 0.7 : 1,
                            border: "none",
                            outline: "none",
                            px: 2.5,
                            py: 1,
                            borderRadius: "10px",
                            fontWeight: 700,
                            fontSize: "0.84rem",
                            color: "#0A0A0A",
                            background: orangeGradient,
                            boxShadow: "0 4px 14px rgba(249,115,22,0.32)",
                            transition: "all 180ms ease",
                            "&:hover": submitting
                              ? {}
                              : {
                                  background: orangeHover,
                                  transform: "translateY(-1px)",
                                },
                          }}
                        >
                          {submitting ? "Saving…" : "Save & continue"}
                        </Box>
                      </Box>
                    </>
                  )}
                </Box>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </ModalChild>
    </Modal>
  );
}
