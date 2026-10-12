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
import { X, ArrowLeft, AlertTriangle, Check } from "lucide-react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";
import { checkHandle, HANDLE_MAX } from "@/lib/auth/handle";
import { firstNameOf } from "@/lib/auth/displayIdentity";
import AgeGate from "@/components/consent/AgeGate";
import { isAgeGateBlocked } from "@/lib/tracking/ageGateLock";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SHADOW,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "signin" | "signup" | "forgot";
type Step = "auth" | "usernames";

// Same exterior API (open / onClose) and auth logic as the legacy
// AuthDialog; the visuals follow docs/design/DESIGN_RULES.md: a solid
// sheet with a hairline, one ember primary action, a segmented
// sign-in / sign-up control. Layout uses Modal + flex column + body
// min-height:0 so the submit button stays inside the viewport even on
// short laptop screens (the bug we just fixed in LoadGameDialog).
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
  // Optional marketing-email consent, collected on the same AgeGate surface
  // as the required affirmation. False unless the user ticked the box.
  const [emailOptIn, setEmailOptIn] = useState(false);

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
    setEmailOptIn(false);
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
          // An empty field is a SKIP, not an empty address. Sending "" would
          // fail email validation and block a signup the user is entitled to.
          email: email.trim() || undefined,
          password,
          handle: check.display as string,
          displayName: displayName.trim() || undefined,
          ageAffirmed: true, // only reachable after the 13+ checkbox gate
          termsAccepted: true,
          emailOptIn,
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
      await signInWithGoogle({
        ageAffirmed: mode === "signup" && agePassed,
        termsAccepted: mode === "signup" && agePassed,
        emailOptIn: mode === "signup" && agePassed && emailOptIn,
      });
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
      ? `Welcome, ${firstNameOf(user)}`
      : mode === "signup"
        ? "Create your account"
        : mode === "forgot"
          ? "Reset your password"
          : "Welcome back";

  const headerSubtitle =
    step === "usernames"
      ? "Link your chess accounts for personalised coaching."
      : mode === "signup"
        ? "Keep your games and coaching on every device."
        : mode === "forgot"
          ? "We'll email you a link to choose a new password."
          : "Sign in to keep your games and progress.";

  // The theme styles every TextField (6% white fill, hairline, accent
  // border when focused), so the inputs carry no sx of their own.

  // A custom <button> is outside MUI's ButtonBase, so it adds the focus
  // ring and the press feedback the theme gives MUI buttons.
  const focusRing = {
    outline: `2px solid ${TEXT.primary}`,
    outlineOffset: 2,
  } as const;
  const primaryButtonSx = {
    border: "none",
    outline: "none",
    borderRadius: `${RADIUS.pill}px`,
    fontWeight: 600,
    color: TEXT.onAccent,
    background: ACCENT.main,
    transition: `background-color ${MOTION.hover}, transform ${MOTION.press}, opacity ${MOTION.hover}`,
    "&:hover": { background: ACCENT.hover },
    "&:active": { transform: MOTION.pressScale },
    "&:focus-visible": focusRing,
  } as const;

  const submitDisabled = submitting;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeAfterTransition
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
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{
                duration: 0.18,
                ease: [0.2, 0, 0, 1],
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
                  borderRadius: `${RADIUS.sheet}px`,
                  background: SURFACE.overlay,
                  border: `1px solid ${LINE.hairline}`,
                  boxShadow: SHADOW.modal,
                  color: TEXT.primary,
                  overflow: "hidden",
                }}
              >
                {/* Header: title and one line under it. */}
                <Box
                  sx={{
                    position: "relative",
                    px: 3,
                    pt: 3,
                    pb: 2.25,
                    borderBottom: `1px solid ${LINE.hairline}`,
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
                      borderRadius: `${RADIUS.small}px`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: TEXT.secondary,
                      transition: `background-color ${MOTION.hover}, color ${MOTION.hover}, transform ${MOTION.press}`,
                      "&:hover": {
                        background: "rgba(255,255,255,0.06)",
                        color: TEXT.primary,
                      },
                      "&:active": { transform: MOTION.pressScale },
                      "&:focus-visible": focusRing,
                    }}
                  >
                    <X size={16} />
                  </Box>

                  <Typography
                    component="h2"
                    sx={{ ...TYPE.h4, color: TEXT.primary, pr: 4 }}
                  >
                    {headerTitle}
                  </Typography>
                  <Typography
                    sx={{ mt: 0.5, ...TYPE.bodySmall, color: TEXT.secondary }}
                  >
                    {headerSubtitle}
                  </Typography>
                </Box>

                {/* Mode tabs: a segmented control with a sliding indicator.
                  Only shown in the auth step when not in forgot mode. */}
                {step === "auth" && mode !== "forgot" && (
                  <Box
                    sx={{
                      display: "flex",
                      gap: 0.5,
                      p: 0.5,
                      mx: 3,
                      mt: 2,
                      borderRadius: `${RADIUS.control}px`,
                      background: SURFACE.raisedSecondary,
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
                            borderRadius: `${RADIUS.small}px`,
                            cursor: "pointer",
                            fontSize: TYPE.bodySmall.fontSize,
                            fontWeight: 600,
                            color: isActive ? TEXT.primary : TEXT.secondary,
                            transition: `color ${MOTION.hover}`,
                            "&:hover": { color: TEXT.primary },
                          }}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="authDialogTabIndicator"
                              transition={MOTION.springSheet}
                              style={{
                                position: "absolute",
                                inset: 0,
                                borderRadius: RADIUS.small,
                                background: SURFACE.raisedTertiary,
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
                      background: LINE.strong,
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
                        size={20}
                        strokeWidth={1.75}
                        color={TEXT.secondary}
                        style={{ marginBottom: 12 }}
                      />
                      <Typography
                        sx={{ ...TYPE.h5, color: TEXT.primary, mb: 1 }}
                      >
                        We can&apos;t create an account for you right now.
                      </Typography>
                      <Typography
                        sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}
                      >
                        A parent or guardian can get in touch through the
                        contact details on our{" "}
                        <Box
                          component="a"
                          href="/privacy"
                          sx={{ color: ACCENT.hover, textDecoration: "none" }}
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
                        onConfirmed={({ emailOptIn: optIn }) => {
                          setEmailOptIn(optIn);
                          setAgePassed(true);
                        }}
                        slotSx={{
                          title: { ...TYPE.h5, color: TEXT.primary },
                          caption: { ...TYPE.caption, color: TEXT.secondary },
                          label: {
                            "& .MuiFormControlLabel-label": {
                              fontSize: TYPE.bodySmall.fontSize,
                              color: TEXT.primary,
                            },
                          },
                          checkbox: {
                            color: TEXT.secondary,
                            "&.Mui-checked": { color: ACCENT.main },
                          },
                          button: {
                            background: ACCENT.main,
                            color: TEXT.onAccent,
                            fontWeight: 600,
                            textTransform: "none",
                            borderRadius: `${RADIUS.pill}px`,
                            py: 1.1,
                            boxShadow: "none",
                            "&:hover": {
                              background: ACCENT.hover,
                              boxShadow: "none",
                            },
                            "&.Mui-disabled": {
                              background: "rgba(255,255,255,0.08)",
                              color: TEXT.tertiary,
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
                          {mode !== "signup" && (
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
                              helperText="How we'll address you, and how you can sign in. Other players see this, so don't use your full name."
                            />
                          )}

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
                            />
                          )}

                          {mode === "signup" && (
                            <TextField
                              fullWidth
                              size="small"
                              label="Email (optional)"
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              autoComplete="email"
                              helperText="Needed to reset your password or sign in with Google. Without one, a forgotten password means a lost account."
                            />
                          )}

                          {mode === "signup" && (
                            <TextField
                              fullWidth
                              size="small"
                              label="Display name (optional)"
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
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
                              ...primaryButtonSx,
                              width: "100%",
                              cursor: submitDisabled
                                ? "not-allowed"
                                : "pointer",
                              opacity: submitDisabled ? 0.7 : 1,
                              py: 1.25,
                              fontSize: TYPE.bodySmall.fontSize,
                              "&:hover": submitDisabled
                                ? {}
                                : { background: ACCENT.hover },
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
                                fontSize: TYPE.bodySmall.fontSize,
                                color: TEXT.secondary,
                                "&:hover": { color: TEXT.primary },
                                "&:focus-visible": focusRing,
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
                                background: LINE.hairline,
                              }}
                            />
                            <Typography
                              sx={{ ...TYPE.caption, color: TEXT.tertiary }}
                            >
                              or
                            </Typography>
                            <Box
                              sx={{
                                flex: 1,
                                height: 1,
                                background: LINE.hairline,
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
                              border: `1px solid ${LINE.strong}`,
                              outline: "none",
                              py: 1.1,
                              borderRadius: `${RADIUS.pill}px`,
                              fontWeight: 600,
                              fontSize: TYPE.bodySmall.fontSize,
                              color: TEXT.primary,
                              background: "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 1,
                              transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
                              "&:hover": {
                                background: "rgba(255,255,255,0.06)",
                                borderColor: TEXT.secondary,
                              },
                              "&:active": { transform: MOTION.pressScale },
                              "&:focus-visible": focusRing,
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
                          ...TYPE.caption,
                          color: TEXT.tertiary,
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
                        Link your chess accounts so the coach can use your own
                        games. You can also add these later in your profile.
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
                            ...primaryButtonSx,
                            cursor: submitting ? "not-allowed" : "pointer",
                            opacity: submitting ? 0.7 : 1,
                            px: 2.5,
                            py: 1,
                            fontSize: TYPE.bodySmall.fontSize,
                            "&:hover": submitting
                              ? {}
                              : { background: ACCENT.hover },
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
