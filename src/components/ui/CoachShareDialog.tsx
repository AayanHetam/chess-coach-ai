"use client";

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Modal,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Link as LinkIcon,
  Share2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildAnalysisSnippetSvg,
  buildSnippetUrl,
  renderSnippetSvgToPng,
  type AnalysisSnippetData,
} from "@/lib/analysisSnippet";
import { loadPieceAssets } from "@/lib/chessPieceAssets";
import { triggerDownload, copyPngToClipboard } from "@/lib/shareCard";

interface CoachShareDialogProps {
  open: boolean;
  onClose: () => void;
  data: AnalysisSnippetData;
}

type ShareKind = "single" | "transcript";

/**
 * Share dialog for a coach reply — preview an SVG snippet of the position +
 * Claude's explanation, then download / copy as PNG or mint a permalink via
 * /api/insights (auth-gated, gracefully falls back to a ?fen= deep link
 * when sign-in isn't available).
 *
 * Pattern + helpers ported from `src/components/AnalysisSnippetDialog.tsx`
 * but re-themed for the dark-glass design OS.
 */
export function CoachShareDialog({
  open,
  onClose,
  data,
}: CoachShareDialogProps) {
  const transcriptShareable =
    Array.isArray(data.transcript) && data.transcript.length > 1;
  const [shareKind, setShareKind] = useState<ShareKind>("single");
  const [svg, setSvg] = useState<string | null>(null);
  const [insightId, setInsightId] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setShareKind("single");
      setSvg(null);
      setInsightId(null);
      setInsightLoading(false);
      setAuthBlocked(false);
      setToast(null);
    }
  }, [open]);

  // Build the SVG preview once piece assets load
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const assets = await loadPieceAssets();
        if (cancelled) return;
        setSvg(buildAnalysisSnippetSvg(data, assets));
      } catch (err) {
        console.warn("[share] piece assets failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  // Mint an /api/insights record (or fall back to ?fen= link)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setInsightLoading(true);
    setInsightId(null);
    setAuthBlocked(false);
    (async () => {
      try {
        const body: Record<string, unknown> = {
          fen: data.fen,
          coachContent: data.explanation,
          kind: shareKind,
        };
        if (
          shareKind === "transcript" &&
          data.transcript &&
          data.transcript.length > 0
        ) {
          body.transcript = data.transcript;
        }
        const res = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        if (cancelled) return;
        if (res.status === 401) {
          setAuthBlocked(true);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as { id?: string };
        if (json.id) setInsightId(json.id);
      } catch (err) {
        if (!cancelled)
          console.warn("[share] insight mint failed:", err);
      } finally {
        if (!cancelled) setInsightLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shareKind, data]);

  const permalink = useMemo(() => {
    if (typeof window === "undefined") return "";
    // Post-cutover (2026-06-04): /analysis IS the canonical surface (the
    // former /preview/analysis dark-glass implementation). Always share
    // the canonical URL; /preview/analysis 308-redirects to /analysis,
    // but sharing the canonical avoids unfurl-cache churn.
    const path = buildSnippetUrl(data.fen, insightId);
    return `${window.location.origin}${path}`;
  }, [data.fen, insightId]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(permalink);
      showToast("Link copied");
    } catch {
      showToast("Couldn't copy link");
    }
  }, [permalink, showToast]);

  const handleDownloadPng = useCallback(async () => {
    if (!svg) return;
    try {
      const blob = await renderSnippetSvgToPng(svg);
      triggerDownload(blob, `chessmasti-analysis.png`);
      showToast("PNG downloaded");
    } catch {
      showToast("Couldn't download PNG");
    }
  }, [svg, showToast]);

  const handleCopyImage = useCallback(async () => {
    if (!svg) return;
    try {
      const blob = await renderSnippetSvgToPng(svg);
      const ok = await copyPngToClipboard(blob);
      showToast(ok ? "Image copied" : "Browser blocked clipboard");
    } catch {
      showToast("Couldn't copy image");
    }
  }, [svg, showToast]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(8,9,12,0.78)",
            backdropFilter: "blur(8px)",
          },
        },
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              outline: "none",
            }}
          >
            <Box
              sx={{
                width: { xs: "92vw", sm: 620 },
                maxWidth: "92vw",
                maxHeight: "88vh",
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
              <Stack
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{
                  px: 3,
                  py: 2,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "10px",
                    background:
                      "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                    boxShadow: "0 0 16px rgba(249,115,22,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Share2 size={14} color="#0A0A0A" />
                </Box>
                <Typography
                  sx={{
                    flex: 1,
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.94)",
                  }}
                >
                  Share this insight
                </Typography>
                <IconButton
                  onClick={onClose}
                  sx={{
                    color: "rgba(255,255,255,0.6)",
                    "&:hover": {
                      color: "rgba(255,255,255,0.95)",
                      background: "rgba(255,255,255,0.05)",
                    },
                  }}
                >
                  <X size={16} />
                </IconButton>
              </Stack>

              {transcriptShareable && (
                <Box
                  sx={{
                    display: "flex",
                    gap: 0.5,
                    px: 1.5,
                    py: 1,
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  {(
                    [
                      { id: "single", label: "This message" },
                      { id: "transcript", label: "Whole conversation" },
                    ] as { id: ShareKind; label: string }[]
                  ).map(({ id, label }) => {
                    const isActive = shareKind === id;
                    return (
                      <Box
                        key={id}
                        onClick={() => setShareKind(id)}
                        sx={{
                          position: "relative",
                          flex: 1,
                          textAlign: "center",
                          px: 1.5,
                          py: 0.85,
                          borderRadius: "0.55rem",
                          cursor: "pointer",
                          color: isActive
                            ? "#0A0A0A"
                            : "rgba(255,255,255,0.62)",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          transition: "color 180ms ease",
                        }}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="shareKindIndicator"
                            transition={{
                              type: "spring",
                              stiffness: 420,
                              damping: 34,
                            }}
                            style={{
                              position: "absolute",
                              inset: 0,
                              borderRadius: "0.55rem",
                              background:
                                "linear-gradient(135deg, #F97316 0%, #FB923C 100%)",
                              boxShadow:
                                "0 4px 16px rgba(249,115,22,0.32)",
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

              <Box
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  p: 2.5,
                  "&::-webkit-scrollbar": { width: 6 },
                  "&::-webkit-scrollbar-thumb": {
                    background: "rgba(249,115,22,0.2)",
                    borderRadius: "3px",
                  },
                }}
              >
                {/* Preview card */}
                <Box
                  sx={{
                    width: "100%",
                    aspectRatio: "1200 / 675",
                    borderRadius: "12px",
                    overflow: "hidden",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {svg ? (
                    <Box
                      sx={{ width: "100%", height: "100%" }}
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                  ) : (
                    <CircularProgress
                      size={28}
                      sx={{ color: "rgba(249,115,22,0.8)" }}
                    />
                  )}
                </Box>

                {authBlocked && (
                  <Typography
                    sx={{
                      mt: 1.5,
                      fontSize: "0.78rem",
                      color: "rgba(255,255,255,0.6)",
                      fontStyle: "italic",
                    }}
                  >
                    Sign in on chessmasti.com for a stable permalink — for
                    now we'll fall back to a `?fen=` deep link that loads
                    the position but not the chat history.
                  </Typography>
                )}
              </Box>

              <Box
                sx={{
                  px: 3,
                  py: 2,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Tooltip title={permalink || "Generating link…"}>
                  <Button
                    onClick={handleCopyLink}
                    disabled={!permalink}
                    startIcon={
                      insightLoading ? (
                        <CircularProgress
                          size={12}
                          sx={{ color: "rgba(255,255,255,0.6)" }}
                        />
                      ) : (
                        <LinkIcon size={13} />
                      )
                    }
                    sx={secondaryBtn}
                  >
                    Copy link
                  </Button>
                </Tooltip>
                <Button
                  onClick={handleCopyImage}
                  disabled={!svg}
                  startIcon={<Copy size={13} />}
                  sx={secondaryBtn}
                >
                  Copy image
                </Button>
                <Button
                  onClick={handleDownloadPng}
                  disabled={!svg}
                  startIcon={<Download size={13} />}
                  sx={primaryBtn}
                >
                  Download PNG
                </Button>
              </Box>

              <AnimatePresence>
                {toast && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.18 }}
                    style={{
                      position: "absolute",
                      bottom: 16,
                      left: "50%",
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                    }}
                  >
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={0.85}
                      sx={{
                        px: 1.5,
                        py: 0.85,
                        borderRadius: "999px",
                        background: "rgba(34,197,94,0.18)",
                        border: "1px solid rgba(34,197,94,0.4)",
                        color: "#86efac",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                      }}
                    >
                      <Check size={12} />
                      <Box component="span">{toast}</Box>
                    </Stack>
                  </motion.div>
                )}
              </AnimatePresence>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

const secondaryBtn = {
  px: 1.85,
  py: 0.85,
  borderRadius: "0.6rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  textTransform: "none" as const,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.85)",
  "&:hover": {
    background: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.2)",
  },
  "&.Mui-disabled": {
    color: "rgba(255,255,255,0.3)",
    borderColor: "rgba(255,255,255,0.04)",
  },
};

const primaryBtn = {
  ...secondaryBtn,
  fontWeight: 700,
  background: "linear-gradient(135deg, #F97316 0%, #FB923C 100%)",
  border: "1px solid rgba(249,115,22,0.5)",
  color: "#0A0A0A",
  "&:hover": {
    background: "linear-gradient(135deg, #FB923C 0%, #FCD34D 100%)",
  },
  "&.Mui-disabled": {
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.4)",
    borderColor: "rgba(255,255,255,0.06)",
  },
};
