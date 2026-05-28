"use client";

import { Command } from "cmdk";
import { Box, Typography } from "@mui/material";
import { useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Flame,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  // Wide enough to accept any lucide-react icon component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>;
  shortcut?: string[];
  onSelect: () => void;
}

export interface CommandGroup {
  heading: string;
  items: CommandItem[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandGroup[];
}

export function CommandPalette({ open, onOpenChange, groups }: CommandPaletteProps) {
  // Global ⌘K / Ctrl+K to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <Box
      onClick={() => onOpenChange(false)}
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        pt: { xs: 8, md: 16 },
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "fadeIn 180ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        "@keyframes fadeIn": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      }}
    >
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          width: "100%",
          maxWidth: 600,
          mx: 2,
          borderRadius: "1.25rem",
          background: "rgba(20,22,28,0.92)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow:
            "0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(249,115,22,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
          animation: "slideIn 240ms cubic-bezier(0.22, 0.61, 0.36, 1)",
          "@keyframes slideIn": {
            "0%": { opacity: 0, transform: "translateY(-8px) scale(0.98)" },
            "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
          },
        }}
      >
        <Command
          label="Command Palette"
          shouldFilter
          style={{ width: "100%" }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 2.5,
              py: 2,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Search size={16} color="#F97316" />
            <Command.Input
              autoFocus
              placeholder="Search moves, actions, or ask the coach…"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "rgba(255,255,255,0.94)",
                fontSize: "0.95rem",
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
              }}
            />
            <Box
              sx={{
                px: 1.25,
                py: 0.4,
                borderRadius: "6px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                fontFamily: "Monaco, Menlo, monospace",
              }}
            >
              ESC
            </Box>
          </Box>

          <Command.List
            style={{
              maxHeight: 420,
              overflowY: "auto",
              padding: "8px",
            }}
          >
            <Command.Empty>
              <Box sx={{ px: 2, py: 4, textAlign: "center" }}>
                <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.88rem" }}>
                  No results. Try a different query.
                </Typography>
              </Box>
            </Command.Empty>

            {groups.map((group) => (
              <Command.Group
                key={group.heading}
                heading={group.heading}
                style={
                  {
                    "--cmdk-group-heading-color":
                      "rgba(255,255,255,0.4)",
                  } as React.CSSProperties
                }
              >
                <Box
                  sx={{
                    px: 1.5,
                    pt: 1.5,
                    pb: 0.5,
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    color: "rgba(255,255,255,0.38)",
                    textTransform: "uppercase",
                  }}
                >
                  {group.heading}
                </Box>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${item.hint ?? ""}`}
                      onSelect={() => {
                        item.onSelect();
                        onOpenChange(false);
                      }}
                      style={
                        {
                          padding: "10px 12px",
                          borderRadius: "10px",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          cursor: "pointer",
                          fontSize: "0.9rem",
                          color: "rgba(255,255,255,0.88)",
                          // cmdk applies [aria-selected="true"]
                          "--selected-bg": "rgba(249,115,22,0.12)",
                        } as React.CSSProperties
                      }
                    >
                      {Icon && (
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: "8px",
                            background: "rgba(249,115,22,0.1)",
                            border: "1px solid rgba(249,115,22,0.25)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={14} color="#F97316" />
                        </Box>
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ fontWeight: 500, color: "rgba(255,255,255,0.92)" }}>
                          {item.label}
                        </Box>
                        {item.hint && (
                          <Box
                            sx={{
                              fontSize: "0.74rem",
                              color: "rgba(255,255,255,0.45)",
                              mt: 0.25,
                            }}
                          >
                            {item.hint}
                          </Box>
                        )}
                      </Box>
                      {item.shortcut && (
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          {item.shortcut.map((k, i) => (
                            <Box
                              key={i}
                              sx={{
                                px: 0.75,
                                py: 0.25,
                                borderRadius: "5px",
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                color: "rgba(255,255,255,0.5)",
                                fontFamily: "Monaco, Menlo, monospace",
                              }}
                            >
                              {k}
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>

          <Box
            sx={{
              px: 2.5,
              py: 1.25,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              gap: 2,
              fontSize: "0.72rem",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Box
                component="span"
                sx={{
                  px: 0.75,
                  py: 0.15,
                  borderRadius: "4px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontFamily: "Monaco, Menlo, monospace",
                  fontWeight: 600,
                }}
              >
                ↑↓
              </Box>
              navigate
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Box
                component="span"
                sx={{
                  px: 0.75,
                  py: 0.15,
                  borderRadius: "4px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontFamily: "Monaco, Menlo, monospace",
                  fontWeight: 600,
                }}
              >
                ↵
              </Box>
              select
            </Box>
            <Box sx={{ flex: 1 }} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Sparkles size={11} color="#F97316" />
              <Box>Chess Masti</Box>
            </Box>
          </Box>
        </Command>
      </Box>

      {/* cmdk's aria-selected style override */}
      <style>{`
        [cmdk-item][aria-selected="true"] {
          background: rgba(249, 115, 22, 0.12) !important;
          color: rgba(255, 255, 255, 0.98) !important;
        }
      `}</style>
    </Box>
  );
}

// Re-export icons commonly used so the page can build groups without
// importing lucide-react directly for these.
export const CommandIcons = {
  Start: ChevronsLeft,
  Prev: ChevronLeft,
  Next: ChevronRight,
  End: ChevronsRight,
  Flip: RotateCw,
  Reset: RefreshCw,
  Moment: Crown,
  Brilliant: Flame,
  Coach: MessageSquare,
  Hint: Lightbulb,
  Target,
  Sparkles,
};
